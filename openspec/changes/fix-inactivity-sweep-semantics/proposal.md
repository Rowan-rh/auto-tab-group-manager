# Change: 修复"无活动自动折叠"误折叠正在使用的标签组

## Why

用户反馈：标签组即使里面有一个"刚刚还在看"的标签页，也会被自动折叠。定位 `runInactivitySweep` 的判定逻辑发现两处问题：

1. **实现与 spec 漂移**：spec 描述"组内**全部**标签页的最后激活时间都已超过阈值才折叠"（AND 语义），但代码 `computeGroupInactivityEpoch` 取的是"组内**最早**一次激活时间"——只要组里有一个老古董标签页，组就被折叠（实际是 OR 语义）。
2. **没有豁免"当前正在使用"的标签页**：`chrome.tabs.onActivated` 只在用户**切换**标签页时触发；用户停留在某个标签页上长时间不动（看文档、看视频）时，该标签页的最近激活时间不会刷新。即使改成 AND 语义，一个"正在使用但 2 小时前才切过来"的标签页仍可能被算作"超过 30 分钟"。

## What Changes

- **修正 `runInactivitySweep` 的组级判定**为**严格 AND 语义**：组内**每**一个标签页的最后激活时间都已超过阈值才折叠。
- **豁免"当前活动标签页所在组"**：用 `chrome.tabs.query({ active: true, lastFocusedWindow: true })` 拿到当前活动标签页 tabId；该 tabId 所属的组**不参与本轮扫描**（无论其激活时间是否超阈值）。
- 行为兼容：现有"豁免已折叠组"和"豁免无已打开标签页的组"保留不变；与自动分组、自动关闭休眠完全独立。

### 假设（已与用户确认）

- 豁免范围 = 当前活动标签页所在组（用户已确认）。
- 组级判定 = 严格 AND 语义（用户已确认）。

## Capabilities

### Modified Capabilities
- `inactivity-auto-collapse`: 修正"组内全部标签页的最后激活时间都已超过阈值才折叠"的实现语义，并新增"当前活动标签页所在组不参与扫描"的豁免规则。

## Impact

- `background.js`：
  - `runInactivitySweep` 改造：先把"当前活动 tabId 集合"查询出来（`chrome.tabs.query({ active: true, lastFocusedWindow: true })`）；遍历组时如果 `group.tabs` 包含活动 tabId 则跳过该组。
  - 组级判定改为 AND：遍历 `groupTabs` 时收集每个标签页的"最近激活时间"，要求**所有**标签页的 `now - ts >= thresholdMs` 才折叠；任何标签页缺数据 / 不超阈值 → 整组不折叠。
  - 删除（或保留为内部工具）`computeGroupInactivityEpoch`：新实现不再需要"取最早"语义。
- spec：`inactivity-auto-collapse/spec.md` 的"无活动判定"Requirement 增加新的 Scenario（"组内任一标签页仍在阈值内则不折叠"、"活动标签页所在组跳过扫描"），并对"Scenario: 组内全部标签页均超阈值"明确"AND 语义"。
- 弹窗 / manager：不变。
- manifest：不变。

## Out of Scope（非目标）

- 不变更"自动折叠总开关 / 阈值"配置项。
- 不变更"自动关闭休眠"的判定（它本来就要求"每个标签页自身超阈值"才被命中，不会误伤"正在使用"组）。
- 不修复 `tab.lastAccessed` 的语义模糊（仍是回退源，注释里说明它不可靠）。
