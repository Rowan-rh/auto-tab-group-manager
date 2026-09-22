// test/common.test.js
// common.js 中纯函数的单测：标题比较器与排序计划算法。
// 运行：node test/common.test.js
'use strict';

const {
  compareTabTitle,
  compareGroupTitle,
  buildGroupSortMove,
  buildWindowSortPlan,
  latestActivationTimestamp,
  isDormantCandidateStillValid,
  storageItemByteLength
} = require('../common.js');

let passed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failures.push(message);
  }
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    message + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
}

// 构造标签页
function tab(id, title, index, url) {
  return { id: id, title: title, index: index, url: url || 'https://example.com/' + id };
}

// ===== reliability helpers =====

(function testLatestActivationTimestampUsesNewestSource() {
  assert(latestActivationTimestamp(1000, 2000) === 2000, 'Chrome lastAccessed 更新时采用较新时间');
  assert(latestActivationTimestamp(3000, 2000) === 3000, 'session 记录更新时采用较新时间');
  assert(latestActivationTimestamp(NaN, 0) === 0, '无有效活动时间时返回 0');
})();

(function testDormantCandidateRevalidation() {
  const now = 10_000;
  const original = { id: 1, groupId: 2, url: 'https://example.com/a' };
  const dormant = { ...original, active: false, lastAccessed: 1_000 };
  assert(isDormantCandidateStillValid(original, dormant, 2_000, 5_000, now), '状态未变且超过阈值时保留候选');
  assert(!isDormantCandidateStillValid(original, { ...dormant, active: true }, 2_000, 5_000, now), '确认期间激活后跳过候选');
  assert(!isDormantCandidateStillValid(original, { ...dormant, lastAccessed: 9_000 }, 2_000, 5_000, now), '较新的 lastAccessed 阻止误关');
  assert(!isDormantCandidateStillValid(original, { ...dormant, url: 'https://example.com/b' }, 2_000, 5_000, now), '确认期间导航后跳过候选');
})();

(function testStorageItemByteLengthUsesUtf8() {
  const ascii = storageItemByteLength('k', ['a']);
  const chinese = storageItemByteLength('k', ['中']);
  assert(chinese > ascii, '存储容量按 UTF-8 字节而非字符数计算');
})();

// ===== compareTabTitle =====

(function testCompareTabTitleByTitle() {
  const sorted = [tab(1, 'C 页面', 0), tab(2, 'A 页面', 1), tab(3, 'B 页面', 2)]
    .sort(compareTabTitle)
    .map(t => t.title);
  assertDeepEqual(sorted, ['A 页面', 'B 页面', 'C 页面'], '标题升序排序');
})();

(function testCompareTabTitleChineseLocale() {
  // zh-Hans-CN 下中文按拼音序：北京(bei) < 上海(shang) < 天津(tian)
  const sorted = [tab(1, '天津', 0), tab(2, '北京', 1), tab(3, '上海', 2)]
    .sort(compareTabTitle)
    .map(t => t.title);
  assertDeepEqual(sorted, ['北京', '上海', '天津'], '中文标题按本地化（拼音）升序');
})();

(function testCompareTabTitleTieBreakByUrl() {
  const sorted = [
    tab(1, '同名', 0, 'https://b.example.com'),
    tab(2, '同名', 1, 'https://a.example.com')
  ].sort(compareTabTitle).map(t => t.url);
  assertDeepEqual(sorted, ['https://a.example.com', 'https://b.example.com'], '标题相同时按 URL 升序');
})();

(function testCompareTabTitleStability() {
  // 标题与 URL 均相同时返回 0，交由 sort 稳定性保持原有相对顺序
  const sorted = [
    tab(11, '同名', 0, 'https://x.example.com'),
    tab(12, '同名', 1, 'https://x.example.com'),
    tab(13, '同名', 2, 'https://x.example.com')
  ].sort(compareTabTitle).map(t => t.id);
  assertDeepEqual(sorted, [11, 12, 13], '完全相同的标签页保持原有相对顺序（稳定排序）');
})();

(function testCompareTabTitleEmptyTitle() {
  const sorted = [tab(1, 'B', 0), tab(2, '', 1), tab(3, 'A', 2)]
    .sort(compareTabTitle)
    .map(t => t.id);
  assertDeepEqual(sorted, [2, 3, 1], '空标题排在最前且不抛错');
})();

// ===== compareGroupTitle =====

(function testCompareGroupTitleByTitle() {
  const sorted = [
    { title: '文档', tabCount: 1, order: 0 },
    { title: '代码仓库', tabCount: 5, order: 1 },
    { title: '内网', tabCount: 2, order: 2 }
  ].sort(compareGroupTitle).map(g => g.title);
  // zh-Hans-CN 拼音序：代码仓库(dai) < 内网(nei) < 文档(wen)
  assertDeepEqual(sorted, ['代码仓库', '内网', '文档'], '组标题按本地化升序');
})();

(function testCompareGroupTitleTieBreakByCountDesc() {
  const sorted = [
    { title: '同名组', tabCount: 2, order: 0 },
    { title: '同名组', tabCount: 7, order: 1 },
    { title: '同名组', tabCount: 4, order: 2 }
  ].sort(compareGroupTitle).map(g => g.tabCount);
  assertDeepEqual(sorted, [7, 4, 2], '组标题相同时按组内标签页数量降序');
})();

(function testCompareGroupTitleTieBreakByOriginalOrder() {
  const sorted = [
    { title: '同名组', tabCount: 3, order: 2 },
    { title: '同名组', tabCount: 3, order: 0 },
    { title: '同名组', tabCount: 3, order: 1 }
  ].sort(compareGroupTitle).map(g => g.order);
  assertDeepEqual(sorted, [0, 1, 2], '标题与数量均相同时保持原有相对顺序');
})();

// ===== buildGroupSortMove =====

(function testBuildGroupSortMoveReturnsNullWhenOrdered() {
  const move = buildGroupSortMove({ tabs: [tab(1, 'A', 3), tab(2, 'B', 4)] });
  assert(move === null, '组内已有序时返回 null（短路，不产生副作用）');
})();

(function testBuildGroupSortMoveReturnsNullForSingleTab() {
  assert(buildGroupSortMove({ tabs: [tab(1, 'A', 3)] }) === null, '组内只有 1 个标签页时返回 null');
  assert(buildGroupSortMove({ tabs: [] }) === null, '组内无标签页时返回 null');
})();

(function testBuildGroupSortMoveProducesSortedIdsAtMinIndex() {
  // 组内标签页在标签条中占据连续位置 5、6、7，当前顺序为 C、A、B
  const move = buildGroupSortMove({
    tabs: [tab(1, 'C 页面', 5), tab(2, 'A 页面', 6), tab(3, 'B 页面', 7)]
  });
  assertDeepEqual(move.tabIds, [2, 3, 1], '组内排序输出按标题升序的 tabId 序列');
  assert(move.index === 5, '组内排序的目标 index 为组内最小 index');
})();

(function testBuildGroupSortMoveIgnoresInputOrder() {
  // 入参 tabs 顺序被打乱，算法内部应先按 index 归位
  const move = buildGroupSortMove({
    tabs: [tab(3, 'B 页面', 7), tab(1, 'C 页面', 5), tab(2, 'A 页面', 6)]
  });
  assertDeepEqual(move.tabIds, [2, 3, 1], '入参顺序不影响结果（内部按 index 归位）');
  assert(move.index === 5, '目标 index 仍为组内最小 index');
})();

// ===== buildWindowSortPlan =====

(function testBuildWindowSortPlanEmpty() {
  assertDeepEqual(buildWindowSortPlan([]), [], '无标签组时返回空计划');
  assertDeepEqual(buildWindowSortPlan([{ title: '空组', tabs: [] }]), [], '组内无标签页时返回空计划');
})();

// 模拟 chrome.tabs.move(ids[], { index })：先移除这些标签页，再按数组给定顺序插入到 index
function simulateMove(tabs, ids, index) {
  const moving = ids.map(id => tabs.find(t => t.id === id)).filter(Boolean);
  const rest = tabs.filter(t => ids.indexOf(t.id) === -1);
  const result = rest.slice();
  result.splice(Math.min(index, result.length), 0, ...moving);
  return result;
}

// 执行计划并返回最终标签条布局
function applyPlan(tabs, plan) {
  let current = tabs.slice();
  for (const move of plan) {
    current = simulateMove(current, move.tabIds, move.index);
  }
  return current;
}

// 断言：每个组的标签页在最终布局中连续、组之间按标题升序、未分组标签页相对顺序不变
function assertLayoutValid(finalTabs, initialTabs, message) {
  const groupIdsInOrder = [];
  let previousGroupId = null;
  for (const item of finalTabs) {
    if (item.groupId == null) {
      previousGroupId = null;
      continue;
    }
    if (item.groupId !== previousGroupId) {
      groupIdsInOrder.push(item.groupId);
      previousGroupId = item.groupId;
    }
  }
  // 组连续 <=> 出现的组片段数 === 不同组的数量
  const distinctGroups = new Set(finalTabs.filter(t => t.groupId != null).map(t => t.groupId));
  assert(groupIdsInOrder.length === distinctGroups.size, message + '：每个标签组在标签条中保持连续');

  // 组之间按标题本地化升序
  const titlesByGroupId = new Map();
  initialTabs.forEach(t => { if (t.groupId != null) titlesByGroupId.set(t.groupId, t.groupTitle); });
  const finalTitles = groupIdsInOrder.map(id => titlesByGroupId.get(id));
  const expectedTitles = finalTitles.slice().sort((a, b) =>
    String(a).localeCompare(String(b), 'zh-Hans-CN'));
  assertDeepEqual(finalTitles, expectedTitles, message + '：标签组之间按标题升序排列');

  // 组内按标题升序
  for (const groupId of distinctGroups) {
    const titles = finalTabs.filter(t => t.groupId === groupId).map(t => t.title);
    const expected = titles.slice().sort((a, b) => compareTabTitle(
      { title: a, url: '' }, { title: b, url: '' }));
    assertDeepEqual(titles, expected, message + '：组 ' + groupId + ' 内部按标题升序');
  }

  // 未分组标签页相对顺序不变
  const ungroupedBefore = initialTabs.filter(t => t.groupId == null).map(t => t.id);
  const ungroupedAfter = finalTabs.filter(t => t.groupId == null).map(t => t.id);
  assertDeepEqual(ungroupedAfter, ungroupedBefore, message + '：未分组标签页相对顺序保持不变');
}

// 场景：未分组标签页与标签组交错，且组的当前顺序与标题序相反
(function testBuildWindowSortPlanWithInterleavedUngroupedTabs() {
  const initial = [
    { id: 100, groupId: null, index: 0, title: 'U1' },
    { id: 1, groupId: 'A', groupTitle: '文档', index: 1, title: '文档 C' },
    { id: 2, groupId: 'A', groupTitle: '文档', index: 2, title: '文档 A' },
    { id: 3, groupId: 'A', groupTitle: '文档', index: 3, title: '文档 B' },
    { id: 101, groupId: null, index: 4, title: 'U2' },
    { id: 4, groupId: 'B', groupTitle: '代码仓库', index: 5, title: 'repo Z' },
    { id: 5, groupId: 'B', groupTitle: '代码仓库', index: 6, title: 'repo A' }
  ];

  const groups = [
    { title: '文档', tabs: initial.filter(t => t.groupId === 'A') },
    { title: '代码仓库', tabs: initial.filter(t => t.groupId === 'B') }
  ];

  const plan = buildWindowSortPlan(groups);

  // 起始位置为窗口内最靠左的分组标签页 index（1）
  assert(plan[0].index === 1, '计划从最靠左的分组标签页位置开始');
  // "代码仓库"(dai) 在 "文档"(wen) 之前，占据 index 1-2；"文档" 紧随其后占据 index 3
  assertDeepEqual(plan[0].tabIds, [5, 4], '第一个移动为标题序最前的组，且组内已按标题排序');
  assertDeepEqual(plan[1].tabIds, [2, 3, 1], '第二个移动为下一个组，且组内已按标题排序');
  assert(plan[1].index === plan[0].index + plan[0].tabIds.length,
    '各组按目标顺序紧凑排列（后一组起始 index = 前一组起始 index + 前一组标签页数）');

  // 未分组标签页不进入计划
  const plannedIds = plan.reduce((all, move) => all.concat(move.tabIds), []);
  assert(plannedIds.indexOf(100) === -1 && plannedIds.indexOf(101) === -1,
    '未分组标签页不出现在任何移动中');

  const finalTabs = applyPlan(initial, plan);
  assertLayoutValid(finalTabs, initial, '交错场景');
})();

// 场景：三个组，组间顺序与标题序完全不同，且组内也是乱序
(function testBuildWindowSortPlanThreeGroups() {
  const initial = [
    { id: 1, groupId: 'G1', groupTitle: '内网', index: 0, title: '内网 C' },
    { id: 2, groupId: 'G1', groupTitle: '内网', index: 1, title: '内网 A' },
    { id: 100, groupId: null, index: 2, title: 'U1' },
    { id: 3, groupId: 'G2', groupTitle: '代码仓库', index: 3, title: 'repo B' },
    { id: 4, groupId: 'G2', groupTitle: '代码仓库', index: 4, title: 'repo A' },
    { id: 5, groupId: 'G2', groupTitle: '代码仓库', index: 5, title: 'repo C' },
    { id: 101, groupId: null, index: 6, title: 'U2' },
    { id: 6, groupId: 'G3', groupTitle: '文档', index: 7, title: '文档 B' },
    { id: 7, groupId: 'G3', groupTitle: '文档', index: 8, title: '文档 A' }
  ];

  const groups = [
    { title: '内网', tabs: initial.filter(t => t.groupId === 'G1') },
    { title: '代码仓库', tabs: initial.filter(t => t.groupId === 'G2') },
    { title: '文档', tabs: initial.filter(t => t.groupId === 'G3') }
  ];

  const plan = buildWindowSortPlan(groups);
  // 拼音序：代码仓库(dai) < 内网(nei) < 文档(wen)
  assertDeepEqual(plan.map(m => m.tabIds), [[4, 3, 5], [2, 1], [7, 6]],
    '三组按标题序输出，各组内部按标题序');
  assertDeepEqual(plan.map(m => m.index), [0, 3, 5], '各组起始 index 依次紧凑递增');

  const finalTabs = applyPlan(initial, plan);
  assertLayoutValid(finalTabs, initial, '三组场景');
})();

// 场景：已完全有序时，计划执行后布局不变
(function testBuildWindowSortPlanAlreadySorted() {
  const initial = [
    { id: 1, groupId: 'A', groupTitle: 'A组', index: 0, title: 'a1' },
    { id: 2, groupId: 'A', groupTitle: 'A组', index: 1, title: 'a2' },
    { id: 3, groupId: 'B', groupTitle: 'B组', index: 2, title: 'b1' }
  ];
  const groups = [
    { title: 'A组', tabs: initial.filter(t => t.groupId === 'A') },
    { title: 'B组', tabs: initial.filter(t => t.groupId === 'B') }
  ];
  const finalTabs = applyPlan(initial, buildWindowSortPlan(groups));
  assertDeepEqual(finalTabs.map(t => t.id), [1, 2, 3], '已有序时执行计划后布局不变（幂等）');
})();

// ===== 结果 =====

console.log('通过 ' + passed + ' 项断言');
if (failures.length > 0) {
  console.error('\n失败 ' + failures.length + ' 项：');
  failures.forEach((message, i) => console.error('  ' + (i + 1) + '. ' + message));
  process.exit(1);
}
console.log('全部单测通过');
