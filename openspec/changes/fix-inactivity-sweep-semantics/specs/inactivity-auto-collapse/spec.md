# inactivity-auto-collapse Delta Spec（修正）

## Purpose

为标签组提供"无活动 N 分钟自动折叠"能力：让长期未被访问的组不持续占据标签条视野，阈值与总开关均可由用户在弹窗中配置并持久化。本 delta 修正"组级判定语义"与"豁免当前使用中的组"两条规则。

## ADDED Requirements

### Requirement: 自动折叠总开关与阈值持久化

扩展 SHALL 在 `chrome.storage.sync` 中持久化两个字段：`autoCollapseEnabled`（布尔，默认 `true`）与 `autoCollapseAfterMinutes`（正整数分钟数，默认 `30`，最小 `1`）。两个字段 MUST 在弹窗与扩展后台之间保持一致；任何一处变更 MUST 在不重启扩展的前提下对另一处立即生效。

#### Scenario: 首次安装
- **WHEN** 用户首次安装扩展且未做任何配置
- **THEN** `autoCollapseEnabled` 取 `true`、`autoCollapseAfterMinutes` 取 `30`，弹窗开关处于勾选态、数字输入预填 `30`

#### Scenario: 弹窗修改阈值
- **WHEN** 用户在弹窗将"无活动自动折叠"阈值从 `30` 改为 `10`
- **THEN** 该值写入 `chrome.storage.sync`，后台下一次扫描周期即按 `10` 分钟判定

#### Scenario: 关闭自动折叠总开关
- **WHEN** 用户在弹窗取消勾选"无活动自动折叠"
- **THEN** `autoCollapseEnabled` 写入 `false`，后台不再触发折叠动作；已折叠的组不会被自动展开，已展开的组保持现状

### Requirement: 弹窗交互

弹窗 SHALL 在"自动分组"开关行的下一行提供"无活动自动折叠"开关与一个数字输入（单位为分钟）。开关 MUST 控制总开关；数字输入 MUST 接受正整数、拒绝非数字与小于 `1` 的值。两控件 MUST 与"自动分组"开关使用同一视觉样式（`.toggle-row`）。

#### Scenario: 阈值输入校验
- **WHEN** 用户在数字输入框输入 `0` 或负数或非数字字符
- **THEN** 输入被拒绝（保持上一次合法值），不写入存储

#### Scenario: 跨页面同步
- **WHEN** 弹窗 A 修改阈值为 `15`、同一扩展的另一弹窗 B 也已打开
- **THEN** 弹窗 B 的数字输入在变更发生后的下一次事件循环内更新为 `15`

### Requirement: "无活动"判定

一个标签组 SHALL 在满足下列**全部**条件时被判定为不活跃：

1. 组内**每一个**标签页的最近激活时间（缺省回落为 `tab.lastAccessed`）均早于"现在 − 阈值分钟"；
2. 组内**每一个**标签页都有可靠的激活时间数据（无数据标签页被视为"未知"，阻止整组进入不活跃判定）。

判定 MUST 在"组内全部"层面进行（AND 语义）；任一标签页仍"新鲜"或缺数据，整组 MUST NOT 被判定为不活跃。

#### Scenario: 组内只有一个标签页被访问
- **WHEN** 组 G 内有 3 个标签页，标签页 A 在 5 分钟前被激活过，B、C 均为 40 分钟前
- **THEN** 在阈值为 `30` 时组 G 不被判定为不活跃（A 仍"新鲜"），整组不被折叠

#### Scenario: 组内全部标签页均超阈值
- **WHEN** 组 G 内 2 个标签页的最后激活时间分别为 35 分钟前与 40 分钟前，阈值为 `30`
- **THEN** 组 G 被判定为不活跃，进入待折叠集合

#### Scenario: 从未激活过的标签页
- **WHEN** 一个标签页自打开后从未被 `chrome.tabs.onActivated` 命中
- **THEN** 其最近激活时间回落为 `tab.lastAccessed`（若可用）或组创建时间；保证不会因缺数据而把整个组永久判为不活跃

#### Scenario: 组内任一标签页缺数据
- **WHEN** 组 G 内标签页 A、B 均超阈值，标签页 C 完全无激活时间数据
- **THEN** 组 G 不被判定为不活跃（缺数据 ≠ 不活跃），整组不被折叠

#### Scenario: 标签页关闭后清理
- **WHEN** 标签页被关闭
- **THEN** 该标签页在最近激活时间表中的条目被移除，不再参与所属组的活跃性判定

### Requirement: 豁免当前活动标签页所在组

`runInactivitySweep` 在扫描组时 MUST 先查询当前活动标签页（`chrome.tabs.query({ active: true, lastFocusedWindow: true })`），其 tabId 所属的组 MUST 被跳过本轮扫描；无论该组是否满足"全部标签页超阈值"条件，都不会被自动折叠。

#### Scenario: 活动标签页所在组被豁免
- **WHEN** 用户当前正在访问组 G 内的某个标签页
- **THEN** 本轮扫描中组 G 不被折叠，即便 G 内其他标签页均超阈值

#### Scenario: 切换到另一窗口后
- **WHEN** 用户切换到另一窗口（活动窗口改变）
- **THEN** 下一轮扫描按新的活动标签页重新决定豁免集合；之前被豁免的组可能在本轮被折叠

### Requirement: 自动折叠触发

扩展后台 SHALL 注册一个周期为 1 分钟的 `chrome.alarms` 任务（alarm 名固定 `inactivity-sweep`），并在 alarm 触发时扫描所有标签组；扫描结果为"不活跃 + 已展开 + 不在活动豁免集"的组 SHALL 通过 `chrome.tabGroups.update(id, { collapsed: true })` 折叠，每次 alarm 周期内每个组最多折叠一次（幂等）。

#### Scenario: 周期扫描触发折叠
- **WHEN** alarm 触发且组 G 满足"组内全部标签页均超阈值 + 已展开 + 不在活动豁免集"
- **THEN** 组 G 在该周期内被折叠，标签条上不再展示其标签页

#### Scenario: 跳过已折叠组
- **WHEN** alarm 触发且组 G 处于已折叠态
- **THEN** 组 G 不被再次折叠（`chrome.tabGroups.update` 不被调用）

#### Scenario: 总开关关闭时静默
- **WHEN** `autoCollapseEnabled` 为 `false`
- **THEN** alarm 周期内扫描结果被丢弃，不发起任何折叠调用

#### Scenario: service worker 重启
- **WHEN** service worker 因闲置被回收后再次启动（例如浏览器重启或长时间无事件）
- **THEN** 扩展必须在启动时调用 `chrome.alarms.get('inactivity-sweep')`，若不存在则重新创建，确保扫描任务在 worker 重启后仍然存在

### Requirement: 与自动分组的隔离

"无活动自动折叠" MUST NOT 影响自动分组的开启/关闭、组的新建与解散、组内标签页的添加与移除。当"自动分组"总开关处于关闭态时，"无活动自动折叠"仍按其自身配置独立运行（两个开关互不依赖）。

#### Scenario: 关闭自动分组后自动折叠仍生效
- **WHEN** `autoGroupingEnabled` 为 `false`、`autoCollapseEnabled` 为 `true`
- **THEN** 已有标签组仍按"无活动"规则被折叠，新建标签页不会被自动分组

#### Scenario: 自动折叠不修改组成员
- **WHEN** 一个不活跃组被折叠
- **THEN** 其组内标签页列表、组标题、组颜色保持不变，仅折叠状态改变
