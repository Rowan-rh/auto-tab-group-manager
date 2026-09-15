# Tasks: 标签组管理独立页面

## 1. 共享工具 common.js

- [x] 1.1 新建 `common.js`：导出 `retryAsyncOperation`（`maxRetries=10, delay=300`，指数退避上限 2s + 随机抖动，仅对 `Tabs cannot be edited right now` 重试）、`compareTabTitle(a, b)`（`localeCompare(..., 'zh-Hans-CN')` → URL 字典序 → 返回 0 交由 sort 稳定性）、`compareGroupTitle(a, b)`（本地化升序 → 组内标签数降序 → 原位置升序）、`GROUP_COLOR_CSS`（8 色 ColorEnum → 十六进制）
- [x] 1.2 `popup.html` 在 `popup.js` 之前引入 `<script src="common.js">`；`popup.js` 删除本地 `retryAsyncOperation` 定义
- [ ] 1.3 弹窗回归自测：映射增/删/改、导出、导入、自动分组开关、重新整理、关闭所有分组、标签树跳转与单条关闭均正常，控制台无 `retryAsyncOperation is not defined`

## 2. 弹窗入口

- [x] 2.1 `popup.html` 顶部操作区新增"标签组管理"按钮（`id="open-manager-btn"`）
- [x] 2.2 `popup.js` 实现 `openManagerPage()`：先 `chrome.tabs.query({ url: chrome.runtime.getURL('manager.html') })`，命中则 `tabs.update(active:true)` + `windows.update(focused:true)`，未命中则 `tabs.create`；完成后 `window.close()` 关闭弹窗

## 3. 管理页面骨架

- [x] 3.1 新建 `manager.html`：内联 `<style>`（最小宽度 720px、窗口区块卡片、组卡片、色块、忙碌提示条），顶部全局工具栏（全部展开/全部折叠/全部排序/全部解散/全部关闭标签页，均带 `data-action`），主容器、空状态容器、错误提示容器；按顺序引入 `common.js`、`manager.js`
- [x] 3.2 `manager.js` 实现 `loadSnapshot()`：并发 `chrome.windows.getAll()`、`chrome.tabGroups.query({})`、`chrome.tabs.query({})`、`chrome.tabs.getCurrent()`、`chrome.windows.getCurrent()`；按 `windowId` 分桶，组内标签页按 `tab.index` 升序，组卡片按组内最小 `index` 排序，窗口序号仅对含标签组的窗口按 `getAll()` 顺序编号，自身 tabId 从全部集合中过滤
- [x] 3.3 `manager.js` 实现 `render()`：全量重建三层 DOM，渲染前记录 / 渲染后恢复 `document.scrollingElement.scrollTop`；无标签组时展示空状态并禁用全部全局按钮；加载异常时展示错误文案与"重试"入口
- [x] 3.4 组卡片渲染字段：色块与左侧色条、组标题、标签页数量、折叠/展开状态标识、组级操作按钮行（展开或折叠、排序、解散、关闭标签页）；折叠组的标签页列表以收起形式呈现
- [x] 3.5 组内标签页条目：序号 + 标题超长省略 + `title` 悬浮显示完整标题与 URL + 域名；点击条目跳转（`tabs.update(active)` + `windows.update(focused)`，管理页面自身保持打开）

## 4. 组级一键操作

- [x] 4.1 展开/折叠：`chrome.tabGroups.update(groupId, { collapsed })`，目标状态与当前一致时短路不发调用
- [x] 4.2 组内排序：`buildGroupSortMove` 计算 `groupMinIndex` 与 `sortedIds`（用 `compareTabTitle`），返回 `null` 时短路；单次 `chrome.tabs.move(sortedIds, { windowId, index: groupMinIndex })`
- [x] 4.3 折叠组排序兜底：排序前读 `collapsed`，若为折叠态则临时展开 → move → `finally` 中恢复折叠（恢复失败仅记 warn）
- [x] 4.4 解散分组：`chrome.tabs.ungroup(该组全部 tabIds)` 单次调用；刷新后组卡片消失、标签页保留
- [x] 4.5 关闭组内标签页：`window.confirm('确定关闭「<组标题>」中的 N 个标签页？此操作不可撤销。')` → 确认后 `chrome.tabs.remove(tabIds)`，取消则不做任何调用
- [x] 4.6 所有组级操作统一经 `retryAsyncOperation` 包装，并纳入 `runExclusive`（内部 `setBusy` 忙碌锁 + 失败聚合）

## 5. 全局一键操作

- [x] 5.1 全部展开 / 全部折叠：`chrome.tabGroups.query({})` 后串行遍历调用 `tabGroups.update`，已处于目标状态的组跳过
- [x] 5.2 全部排序：每个窗口一趟完成——`buildWindowSortPlan` 以窗口内最靠左的分组标签页 index 为 `startIndex`，按 `compareGroupTitle` 排组序、组内按 `compareTabTitle` 排序，用游标 `nextIndex` 依序为每组分配连续区间并单次 `tabs.move(ids, { windowId, index })`，从左到右执行；未分组标签页不进入计划
- [x] 5.3 全部解散：逐窗口逐组 `chrome.tabs.ungroup(该组 tabIds)`
- [x] 5.4 全部关闭标签页：`window.confirm('确定关闭 N 个标签组中的 M 个标签页？…')` → 逐窗口逐组 `chrome.tabs.remove(ids)`，取消则不做任何调用
- [x] 5.5 失败聚合：每个组 / 每个窗口的操作独立 `try/catch`，失败项累积到 `failures[]`，全部执行完毕后统一提示"N 项操作未完成：…"，不中断其余项、不回滚已成功项；同一窗口内排序失败时中断该窗口剩余 move（后续移动依赖前序结果）但继续其他窗口

## 6. 忙碌锁与实时刷新

- [x] 6.1 实现 `setBusy(bool, label)`：置位模块级 `isBusy`，禁用/恢复所有 `[data-action]` 按钮，显示/隐藏顶部进行中文案；解锁时清掉 debounce 定时器并强制 `refresh()` 一次
- [x] 6.2 注册事件监听：`chrome.tabGroups.onCreated/onMoved/onRemoved/onUpdated`、`chrome.tabs.onCreated/onRemoved/onMoved/onAttached/onDetached/onUpdated`，以及 `chrome.windows.onCreated/onRemoved/onFocusChanged`（窗口开关影响区块列表、焦点影响"当前窗口"标识），统一汇入 150ms debounce 的 `scheduleRender()`
- [x] 6.3 `tabs.onUpdated` 过滤：仅当 `changeInfo.title || changeInfo.url || changeInfo.status === 'complete'` 时才触发刷新
- [x] 6.4 `isBusy` 期间挂起渲染：只置 `pendingRefresh = true`，解锁时 flush 一次；`refresh()` 另加 `isRefreshing` 门闩，避免强制刷新与 debounce 刷新并发导致渲染交错

## 7. 验证

- [x] 7.1 `node --check` 通过：`common.js`、`popup.js`、`manager.js`、`background.js`（另含 `test/common.test.js`）
- [x] 7.2 `openspec validate add-group-manager-page --strict` 通过
- [x] 7.3 纯函数单测 `test/common.test.js`（36 项断言全部通过）：`compareTabTitle` 三级排序、中文拼音序与稳定性；`compareGroupTitle` 三级 tie-break；`buildGroupSortMove` 短路条件与目标 index；`buildWindowSortPlan` 在"多组 + 未分组标签页交错"场景下的移动序列，并用 `simulateMove` 端到端断言最终布局（组连续 / 组间标题序 / 组内标题序 / 未分组相对顺序不变 / 已有序时幂等）
- [x] 7.4 `chrome.tabs.move(ids[], { index })` 数组顺序语义已确认：Chromium 派生文档明确"the first tab in `tabIds` will be moved to `index`, and the other tabs will follow it in the order given in `tabIds`"，且该语义以传入 `windowId` 为前提 → 实现中所有 move 调用均显式传 `windowId`（见 design D4），无需回退方案
- [ ] 7.5 手工验证（单窗口）：5 个组级操作与 5 个全局操作逐项符合预期，空状态下全局按钮禁用，错误提示可重试
- [ ] 7.6 手工验证（双窗口）：全部排序无跨窗口报错；当前窗口标识正确；关闭其中一个窗口后对应区块自动消失
- [ ] 7.7 手工验证（边界）：折叠组排序后顺序生效且仍折叠；两个确认框点"取消"无任何副作用；操作进行中重复点击被忽略；手动在标签条上折叠组时页面状态自动同步且滚动位置不丢
- [ ] 7.8 手工验证（自身排除）：管理页面所在标签页在全部解散 / 全部关闭标签页后仍然存在；把管理页面手工拖入某个组后再执行关闭操作，该页面标签页不被关闭

## 8. 缺陷修正：无已打开标签页的组被静默丢弃

背景：用户反馈浏览器重启后“已保存但未点开”的标签组在管理页上完全看不到。定位到 `loadSnapshot()` 中存在两道会静默丢弃整组的过滤。

- [x] 8.1 移除过滤一：`if (groupTabs.length === 0) continue;` —— `chrome.tabGroups.query()` 返回的组一律进入模型，新增 `saved` 字段，`minIndex` 无标签页时取 `Number.MAX_SAFE_INTEGER` 以排在末尾
- [x] 8.2 移除过滤二（真正的根因）：组的 `windowId` 不在 `chrome.windows.getAll()` 结果里时整组被丢 —— 已保存未打开的组不挂在活动窗口标签条上，`windowId` 可能为 `-1`；现归入独立区块，标题根据内容取“已保存但未打开的标签组”或“未关联窗口的标签组”
- [x] 8.3 无已打开标签页的组卡片：数量显示“未打开”、状态徽标区分 `已保存 · 标签页未打开` / `无打开的标签页`，额外一行灰字提示；4 个操作按钮用 `data-disabled-reason` 结构性禁用，`applyButtonStates()` 优先识别该标记，避免忙碌解除后误恢复为可用
- [x] 8.4 全局操作防护：`全部排序` 跳过 `windowId === null` 的区块（`chrome.tabs.move` 需有效 windowId）；`全部解散` / `全部关闭标签页` 跳过空 ids（原会对空数组调用 `ungroup`/`remove` 而报错）；确认文案的组数只统计有已打开标签页的组
- [x] 8.5 新增接口可见性统计行：页面顶部显示 `chrome.tabGroups.query()` 本次返回的组总数与其中无已打开标签页的组数；同时常驻一段说明文案，告知“已保存但未点开”的组不在扩展接口可见范围内，并给出 `chrome://settings/onStartup` 选“继续浏览上次打开的网页”的建议
- [x] 8.6 回归：`node --check` 通过、`test/common.test.js` 36 项断言全通过、接线校验（id / data-action / CSS 类）通过、`openspec validate --strict` 通过
- [x] 8.7 手工验证结论（已得到）：重载扩展后页面顶部统计行报 `chrome.tabGroups.query() 共返回 2 个标签组，全部都有已打开的标签页`，即 `emptyGroups = 0`。而浏览器重启后标签栏中确实存在需手动点开的已保存组 → **证实 `chrome.tabGroups.query()` 不返回“已保存但未打开”的组，属平台能力边界而非页面缺陷**（根因：这类组由 `SavedTabGroupModel` 管理，与普通组的 `TabGroupModel` 是两套模型）。结论已记入 design.md 的 Non-Goals 与 Risks
- [x] 8.8 方向决策（用户已选）：采用**方向 A——修改浏览器启动设置**（`chrome://settings/onStartup` 选“继续浏览上次打开的网页”），使重启后标签页与组真正恢复到标签条，现有管理页即可正常管理。本次**不**另立 change 做“自建快照/恢复”（方向 B）或 `chrome.sessions` spike（方向 C）；两者均未验证能否覆盖已保存组，如后续需要应先做可行性验证再写 spec
- [x] 8.9 回归（本轮变更后）：`node --check` × 3 通过、`test/common.test.js` 36 项断言全通过、接线校验通过、`openspec validate --strict` 通过
