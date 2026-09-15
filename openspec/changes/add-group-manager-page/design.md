# Design: 标签组管理独立页面

## Context

动机见 `proposal.md - Why`；行为契约见 `specs/group-manager-page/spec.md` 与 `specs/group-batch-actions/spec.md`。本节只记录影响实现路径的现状与约束。

当前代码结构（MV3，原生 JS，无构建流程、无第三方依赖）：

- `background.js`：service worker，`groupTab()` 驱动自动分组。
- `popup.html` / `popup.js`：300px 宽弹窗，含自动分组开关、域名映射管理、标签组树。
- `manifest.json`：权限 `tabs` / `tabGroups` / `storage`。

影响本次设计的既有约束与缺陷：

1. **`retryAsyncOperation` 与 `resolveGroupTitleSync` 在 `background.js` 与 `popup.js` 中各有一份平行实现**，且两份的重试参数已经不一致（background: `maxRetries=10, delay=300, 上限 2s + 抖动`；popup: `maxRetries=5, delay=100`）。新增第三个前端文件会把同步成本再放大一倍。
2. **现有分组逻辑没有按 `windowId` 分片**（`popup.js` 的"重新整理"用 `chrome.tabs.query({})` 全窗口取标签后直接 `chrome.tabs.group`）。`chrome.tabs.group` / `chrome.tabs.move` 要求 tabIds 与目标 groupId 同窗口，跨窗口会抛错。新页面必须自行保证窗口内闭环，不能沿用这条路径。
3. **组颜色仍是 `getRandomColor()` 随机取色**（历史缺陷，已在 memory 中记录但代码未落地修复）。本次不排序/不改色，但新页面需要把 `ColorEnum` 渲染成可视色块，因此需要一张颜色映射表。

## Goals / Non-Goals

**Goals:**

- 新增一个自包含的扩展内部页面承载标签组批量管理，不引入构建步骤与第三方依赖，保持"打开仓库即可加载未打包扩展"的现状。
- 所有涉及标签页移动的操作以**窗口为边界**、以**组为单位一次调用**完成，把 API 调用次数从 O(标签页数) 降到 O(组数)，同时规避跨窗口异常。
- 前端页面之间共享工具函数，避免第三份平行实现。

**Non-Goals:**

- 不修复 `background.js` 的跨窗口分组与随机取色缺陷（另立 change），不改动自动分组链路。
- 不管理未分组的散落标签页（用户已确认管理对象仅限已存在的标签组）。
- **不管理“已保存但未打开”的标签组**：实测确认 `chrome.tabGroups.query()` 不返回这类组（见 Risks），属平台能力边界，页面仅做说明不做绕过。
- 不提供"把组移入新窗口""保存/恢复会话""拖拽手工调序"等能力。
- 不做样式主题化与响应式适配到移动端。

## Decisions

### D1. 页面载体：新增 `manager.html` + `manager.js`，用 `chrome.tabs.create` 打开

从弹窗按钮调用 `chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') })`。扩展打开自己的页面**不需要** `web_accessible_resources`（该字段只约束网页侧的访问），因此 `manifest.json` 零变更。

入口按钮需支持"已打开则复用"：先 `chrome.tabs.query({ url: chrome.runtime.getURL('manager.html') })`，命中则 `chrome.tabs.update(tabId, { active: true })` + `chrome.windows.update(windowId, { focused: true })`，否则新建。`tabs.query` 按 url 过滤依赖 `tabs` 权限，已具备。

**备选**：popup 内二级视图（300px 宽 + 弹窗失焦即关闭，无法承载多窗口分区与批量按钮，且弹窗关闭会中断长批量操作）；`options_page`（入口在 chrome://extensions 深处，日常不可达）。均否决。

### D2. 共享工具：新增 `common.js`，仅前端页面引入，`background.js` 本次不动

`common.js` 承载 `retryAsyncOperation`、标题比较器 `compareTabTitle`、`GROUP_COLOR_CSS` 颜色映射表。`popup.html` 与 `manager.html` 均以 `<script src="common.js">` 先于业务脚本引入；`popup.js` 中重复的 `retryAsyncOperation` 随之删除。

`background.js` 不改为 `importScripts('common.js')`：service worker 的脚本装载改造会直接触碰自动分组主链路，与本次"新增管理页面"的范围不匹配，风险收益不成比例。其重复实现留待修复跨窗口/取色缺陷的 change 一并统一，本文档不掩盖这一取舍。

**备选**：`manager.js` 自带第三份 `retryAsyncOperation`（延续现状风格）——否决，平行实现已经出现参数漂移，再加一份会让缺陷扩散；把 `common.js` 同时接入 service worker——否决，见上。

### D3. 渲染模型：一次全量查询 + 前端分桶，三层 DOM

数据加载只做三次调用：`chrome.windows.getAll()`（窗口顺序与聚焦态）、`chrome.tabGroups.query({})`、`chrome.tabs.query({})`。前端按 `windowId` 分桶，渲染为「窗口区块 → 组卡片 → 组内标签页列表」。

派生规则：

- 组内标签页顺序 = `tab.index` 升序。
- 组在标签条中的位置 = 组内最小 `tab.index`（用于区块内组卡片排序）。
- 窗口显示序号 = `chrome.windows.getAll()` 返回数组的下标 + 1；`chrome.windows.getCurrent()` 的窗口标"当前窗口"。
- 自身排除：`chrome.tabs.getCurrent()` 拿到管理页面 tabId，在所有操作与计数中过滤掉。

渲染采用"全量重建 DOM + 恢复滚动位置"（记录/恢复 `document.scrollingElement.scrollTop`），不做增量 diff：标签组数量级为几十，全量重建成本可忽略，而增量 diff 会显著增加状态一致性缺陷面。

### D4. 排序实现：按组一次 `chrome.tabs.move(ids[], { windowId, index })`

`chrome.tabs.move` 接受数组。Chromium 派生文档明确：**"the first tab in `tabIds` will be moved to `index`, and the other tabs will follow it in the order given in `tabIds`"**——但该句以传入 `windowId` 为前提。因此**每次 move 都显式传 `windowId`**：既让上述顺序语义无条件适用，也从调用层面锁死"操作必须在窗口内执行"的 spec 约束。因此排序不需要逐个标签页移动。

**组内排序**（单个组，`buildGroupSortMove`）：

1. 取组内标签页，按 `tab.index` 升序得到 `currentIds`；
2. 计算 `groupMinIndex = min(tab.index)`；
3. 按 `compareTabTitle` 稳定排序得到 `sortedIds`；
4. 若 `sortedIds` 与 `currentIds` 完全相同则返回 `null`，调用方短路（无副作用）；
5. 单次调用 `chrome.tabs.move(sortedIds, { windowId, index: groupMinIndex })`。

因为标签组在标签条中天然连续、且所有 id 本就属于该组，移动后组保持完整，组标题/颜色由 Chrome 保留；折叠状态由调用方显式临时展开后恢复（见 Risks）。

**组间排序 / 全部排序**（单个窗口，`buildWindowSortPlan`）：

1. 以窗口内**最靠左的分组标签页 index** 作为 `startIndex`；
2. 按 `compareGroupTitle` 排序组序列（标题本地化升序 → 组内标签数降序 → 原位置升序）；
3. 维护游标 `nextIndex`，初值为 `startIndex`；依目标顺序逐组：组内先按 `compareTabTitle` 排序，单次 `chrome.tabs.move(该组 sortedIds, { windowId, index: nextIndex })`，然后 `nextIndex += 该组标签页数`；
4. 从左到右执行，后一组的起始位置紧接前一组，各组因此紧凑排列且天然连续。

这比"先收集全部槽位数组再按下标取值"更简单且等价：游标递增本身就生成了正确的目标区间，无需先物化 `slots`。未分组标签页不进入计划，因此不会被排序、解散或关闭；组块紧凑排列会把夹在中间的未分组标签页挤向右侧，其相互先后顺序不变——这与 spec 中"绝对位置变化属于预期行为"一致。

**全部排序**对每个窗口独立调用一次 `buildWindowSortPlan`，一趟完成组间 + 组内排序，不做"先组间再组内"两趟，避免第二轮 move 打乱第一轮结果。

`buildGroupSortMove` 与 `buildWindowSortPlan` 均为纯函数（不触碰 chrome API），因此可在 Node 下单测——单测中用一个忠实模拟 `chrome.tabs.move` 语义的 `simulateMove`（先移除再按数组顺序插入到 index）跑完整计划，并断言最终布局满足"组连续 + 组间标题序 + 组内标题序 + 未分组标签页相对顺序不变"。

**备选**：逐个标签页 `move` 到目标 index——否决，O(标签页数) 次调用在几十个标签页时明显变慢，且中间态更容易撞上 `Tabs cannot be edited right now`。

### D5. 标题比较器：本地化三级排序

`compareTabTitle(a, b)`：`a.title.localeCompare(b.title, 'zh-Hans-CN')` → 相同则比 `a.url` / `b.url`（普通字典序）→ 仍相同则返回 0，由 `Array.prototype.sort` 的稳定性保证原有相对顺序。

排序键统一放 `common.js`，组间排序的比较器复用同一本地化规则（比较组标题而非标签页标题）。

### D6. 其余操作的 API 选择

| 操作 | 实现 | 说明 |
| --- | --- | --- |
| 展开 / 折叠 | `chrome.tabGroups.update(id, { collapsed })` | 已处于目标状态时短路，不发调用 |
| 解散分组 | `chrome.tabs.ungroup(该组全部 tabIds)` | 单次调用传数组；按窗口分别调用 |
| 关闭组内标签页 | `chrome.tabs.remove(该组全部 tabIds)` | 单次调用传数组 |
| 跳转标签页 | `chrome.tabs.update(active)` + `chrome.windows.update(focused)` | 与弹窗既有跳转行为一致 |

批量操作一律**串行**执行（组间 `for...of await`），不并发：并发写入 `tabGroups` / `tabs` 会显著提高 `Tabs cannot be edited right now` 概率，而串行在几十个组的量级下延迟可接受。

### D7. 二次确认用原生 `window.confirm`

确认文案由调用方拼装，含组标题与数量（全局操作含标签页总数与组数）。管理页面是内部工具页，原生 confirm 无需额外权限、无焦点丢失问题，且阻塞式语义天然避免了用户在确认期间触发其他操作。

**备选**：自定义模态框——否决，需自行处理焦点陷阱与键盘可达性，收益仅为视觉一致性。

### D8. 忙碌锁与事件刷新合并

模块级 `isBusy` 标志。`setBusy(true)` 时禁用所有带 `data-action` 属性的按钮并显示顶部进行中文案；`setBusy(false)` 恢复并强制刷新一次。

事件监听：`chrome.tabGroups.onCreated/onMoved/onRemoved/onUpdated` 与 `chrome.tabs.onCreated/onRemoved/onMoved/onAttached/onDetached/onUpdated`。全部汇入同一个 150ms debounce 的 `scheduleRender()`：

- `isBusy` 期间只置 `pendingRefresh = true`，不渲染；解锁时 flush 一次，避免批量 move 过程中每个事件都重建 DOM 造成抖动与滚动跳动。
- `tabs.onUpdated` 高频（favicon、loading 状态），仅在 `changeInfo.title || changeInfo.url || changeInfo.status === 'complete'` 时才触发刷新。

### D9. 重试参数向 background.js 对齐

`common.js` 中的 `retryAsyncOperation` 采用 `maxRetries=10, delay=300, 上限 2s + 随机抖动`（原 background 参数），而非 popup 的 `5/100`。排序涉及连续多次 move，用户拖动标签页的窗口期可能持续数秒，短重试窗口会频繁失败。

### D10. 样式：沿用内联 `<style>`，颜色映射表驱动

`manager.html` 内联样式，不引外部 CSS/字体。组颜色用 `GROUP_COLOR_CSS`（`grey/blue/red/yellow/green/pink/purple/cyan` → 十六进制色）渲染色块，与 Chrome 标签条观感对齐。布局为单列 + 窗口区块卡片，最小宽度 720px，页面在标签页中全宽展示。

## Risks / Trade-offs

- **已确认的平台限制：“已保存但未打开”的标签组对扩展 API 不可见**（用户实测：重启后浏览器标签栏可见的已保存组，`chrome.tabGroups.query()` 返回数为 2 且全部都有已打开标签页，即 emptyGroups = 0）。原因：这类组由 Chromium 的 `SavedTabGroupModel` 管理，与普通组的 `TabGroupModel` 是两套模型；相关 Chromium issue：323982812（`tabGroups.update()` 对已保存组失败）、40288048（`tabs.update` 无法激活已保存组内的标签页）。→ 缓解：页面顶部常驻统计行 + 说明文案，把“接口能力边界”显式告知用户，避免反复误判为页面缺陷；给用户的可行方案是将 `chrome://settings/onStartup` 设为“继续浏览上次打开的网页”，使重启后组真正恢复到标签条。若以后要做“自建快照/恢复”或 `chrome.sessions` 方案，应另立 change，不混入本次范围。
- **`loadSnapshot()` 曾存在两道会静默丢弃整组的过滤**（已修）：一是组内无已打开标签页时 `continue`，二是组的 `windowId` 不在 `chrome.windows.getAll()` 结果里时整组被丢（已保存未打开的组 `windowId` 可能为 `-1`）。→ 现在 API 返回的组一律渲染，后者归入 `windowId: null` 的独立区块；`全部排序` 跳过该区块（`chrome.tabs.move` 需有效 windowId）。教训：任何“查到了但不展示”的分支都必须有明确理由，不能默认 `continue`。
- **折叠组内标签页可能无法正常 move** → 排序前先读 `collapsed`，若为折叠态则临时 `collapsed:false` → move → 恢复 `collapsed:true`（恢复失败仅记 warn，不影响排序结果）。会有一次视觉闪烁，属可接受代价；实现后需手工验证折叠组排序结果确实生效。
- **~~`chrome.tabs.move(ids[], {index})` 的数组顺序语义若与预期不符~~**（已消除）→ 语义已由 Chromium 派生文档确认，且实现中所有 move 调用均显式传 `windowId`，使文档化的"按 `tabIds` 给定顺序落位"前提成立；`buildWindowSortPlan` 的目标序列另有 Node 单测用 `simulateMove` 端到端验证。
- **并发刷新竞态**：`setBusy(false)` 的强制刷新可能与 debounce 触发的刷新重叠，导致两次 `loadSnapshot` 并发、渲染交错 → `refresh()` 增加 `isRefreshing` 门闩，进行中的刷新会把新请求合并为 `pendingRefresh`，完成后自动补刷一次。
- **批量操作中途某窗口被关闭** → 每组操作独立 try/catch，失败累积到 `failures[]`，全部执行完后统一提示"N 个组操作失败"，不中断其余窗口，不回滚已成功部分（spec 已明确不回滚）。
- **"全部关闭标签页"可能导致某个窗口消失**（Chrome 关闭窗口的最后一个标签页时会关闭窗口）→ 管理页面自身标签页始终被排除且不属于任何组，因此页面不会被自身操作关闭；若用户把管理页面手工拖进了某个组，D3 的自身排除逻辑仍会把它从操作集合中剔除。此行为在 UI 上以确认文案中的数量提示间接告知，不做额外拦截。
- **未修复的 `background.js` 跨窗口分组缺陷会污染管理页面的数据**（可能出现同名组分散在多个窗口）→ 本次按 `windowId` 分区展示，恰好让该缺陷可见但不放大；根因修复不在本次范围。
- **`popup.js` 改用 `common.js` 后弹窗脚本加载顺序出错会导致映射功能整体不可用** → `common.js` 必须在 `popup.js` 之前引入，tasks 中列出对弹窗既有功能（映射增删改、导入导出、自动分组开关、标签树跳转）的回归验证项。

## Migration Plan

纯新增，无数据迁移、无存储 schema 变更（不写 `chrome.storage`）。

- 部署：重新加载未打包扩展即可。
- 回滚：删除 `manager.html` / `manager.js` / `common.js`，还原 `popup.html` 的入口按钮与 `popup.js` 中被移入 `common.js` 的函数。回滚后弹窗与自动分组行为与变更前完全一致。

## Open Questions

- 是否需要记住用户上次使用的排序方式（组名序 / 数量序）并持久化到 `chrome.storage.sync`——不影响本次 spec 与实现结构，可后续增量添加。
- 组卡片是否需要显示"组内域名构成"摘要（依赖映射规则解析）——属展示增强，与批量操作解耦，可后续单独提出。
