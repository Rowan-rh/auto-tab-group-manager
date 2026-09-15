# close-dormant-tabs Delta Spec

## Purpose

让用户能够一键关闭"长时间没被唤醒"的标签页，关闭范围可选择全局或单个组，关闭力度由独立的阈值与总开关控制，且必须经过二次确认以避免误操作。

## ADDED Requirements

### Requirement: 自动关闭休眠总开关与阈值持久化

扩展 SHALL 在 `chrome.storage.sync` 中持久化两个新字段：`autoCloseEnabled`（布尔，默认 `false`——比"自动折叠"更激进，默认关闭更安全）与 `autoCloseAfterMinutes`（正整数分钟数，默认 `60`，最小 `1`）。两个字段 MUST 在弹窗与扩展后台之间保持一致；任何一处变更 MUST 在不重启扩展的前提下对另一处立即生效。

#### Scenario: 首次安装
- **WHEN** 用户首次安装扩展且未做任何配置
- **THEN** `autoCloseEnabled` 取 `false`、`autoCloseAfterMinutes` 取 `60`

#### Scenario: 弹窗修改阈值
- **WHEN** 用户在弹窗将"自动关闭休眠"阈值从 `60` 改为 `30`
- **THEN** 该值写入 `chrome.storage.sync`，下一次关闭操作按 `30` 分钟判定

#### Scenario: 阈值非法值被拒
- **WHEN** 用户输入 `0` 或负数或非数字字符
- **THEN** 输入被拒绝（保持上一次合法值），不写入存储

### Requirement: 弹窗交互

弹窗 SHALL 在"无活动自动折叠"行的下一行提供"自动关闭休眠"开关与一个数字输入（单位为分钟），与"无活动自动折叠"行使用同一视觉样式（`.toggle-row`）。

#### Scenario: 跨页面同步
- **WHEN** 弹窗 A 修改阈值为 `15`、同一扩展的另一弹窗 B 也已打开
- **THEN** 弹窗 B 的数字输入在变更发生后的下一次事件循环内更新为 `15`

### Requirement: "休眠"判定

一个标签页 SHALL 在满足下列任一条件时被判定为"休眠"：
1. 其最近一次被 `chrome.tabs.onActivated` 命中的时间（缺省回落为 `tab.lastAccessed`）早于 `now - autoCloseAfterMinutes * 60_000`；
2. 上述时间完全不可得（即"未知"）且距 `tab.lastAccessed`（若可得）已超过阈值。

#### Scenario: 组内部分标签页休眠
- **WHEN** 组 G 内 3 个标签页中只有 2 个超过 60 分钟未激活、1 个在 10 分钟前被激活
- **THEN** "关闭休眠"操作仅命中 2 个标签页，1 个活跃的标签页 MUST NOT 被关闭

#### Scenario: 时间数据完全缺失
- **WHEN** 标签页 T 没有 `lastActivatedAt` 记录且 `tab.lastAccessed` 为 0
- **THEN** T 仍 MUST NOT 被关闭（数据缺失 ≠ 休眠），仅显示 `未知`

### Requirement: 工具栏全局"关闭休眠"按钮

`manager.html` 顶部工具栏 SHALL 在"全部关闭标签页"之前新增一个按钮 `<button data-action="close-dormant">关闭休眠</button>`，文案固定为"关闭休眠"。

#### Scenario: 总开关关闭时按钮禁用
- **WHEN** `autoCloseEnabled` 为 `false`
- **THEN** 顶部"关闭休眠"按钮处于 `disabled` 态，`title` 提示"自动关闭休眠已关闭，请先在弹窗中开启"

#### Scenario: 总开关开启但无命中目标
- **WHEN** 浏览器中没有标签页满足休眠判定
- **THEN** 点击"关闭休眠"按钮 → 弹窗不展示确认框，仅在结果条提示"没有休眠标签页可关闭"

#### Scenario: 有命中时二次确认
- **WHEN** `autoCloseEnabled` 为 `true` 且有 N 个标签页满足休眠判定
- **THEN** 点击"关闭休眠"→ 弹窗 `window.confirm` 文案形如"确定关闭 N 个休眠标签页（来自 M 个标签组）？此操作不可撤销。\n预览：\n- <组1>：<标签页1标题>\n- …（最多 10 条）"；用户取消则不做任何 `tabs.remove` 调用

#### Scenario: 确认后批量关闭
- **WHEN** 用户在确认框点击确定
- **THEN** 逐组 `chrome.tabs.remove(该组命中 ids)` 串行执行；每组调用包在 `retryAsyncOperation` 内；失败项累积到 `failures[]`，全部执行完成后在结果条统一提示"已关闭 N 个休眠标签页（M 个失败：…）"；不中断其余组、不回滚已成功项

#### Scenario: 全局按钮在空状态被禁用
- **WHEN** 浏览器中没有标签组
- **THEN** 顶部"关闭休眠"按钮随其它批量按钮一起被禁用（沿用 `applyButtonStates` 规则）

### Requirement: 组级"关闭休眠"按钮

每个标签组卡片的操作行 SHALL 在"关闭标签页"按钮之前新增一个按钮 `<button data-action="close-dormant-group">关闭休眠</button>`，作用范围 MUST 限定为该组内标签页；行为语义（总开关禁用、二次确认、批量 remove、失败聚合） MUST 与全局按钮一致，仅"目标组集合"不同。

#### Scenario: 组内无命中
- **WHEN** 目标组内没有标签页满足休眠判定
- **THEN** 点击组级"关闭休眠"→ 弹窗不展示确认框，结果条提示"「<组名>」中没有休眠标签页可关闭"

#### Scenario: 仅关闭目标组
- **WHEN** 用户在组 G 上点击"关闭休眠"并确认
- **THEN** 仅有组 G 内的命中标签页被关闭；其它组不受影响

#### Scenario: 组内无已打开标签页
- **WHEN** 目标组为"已保存但未打开的标签组"（无任何已打开标签页）
- **THEN** 组级"关闭休眠"按钮 MUST 沿用现有 `data-disabled-reason` 结构性禁用模式（与"展开/排序/解散/关闭标签页"一致），不可点击

### Requirement: 与自动折叠、自动分组的隔离

"自动关闭休眠" MUST NOT 修改任何标签组结构、不解散分组、不改变组标题与颜色；只通过 `chrome.tabs.remove` 删除命中标签页。当"自动分组"总开关处于关闭态时，"自动关闭休眠"仍按其自身配置独立运行。当"自动关闭休眠"总开关关闭时，已折叠的组不会被自动展开，已展开的组不会被自动关闭（关闭操作仅由用户主动点击触发）。

#### Scenario: 关闭休眠不拆组
- **WHEN** 一组内全部 3 个标签页被"关闭休眠"命中并删除
- **THEN** `chrome.tabs.ungroup` 不被调用；剩余组结构（若组内还有未命中标签页）原样保留

#### Scenario: 关闭休眠不影响自动分组
- **WHEN** `autoGroupingEnabled` 为 `false`、`autoCloseEnabled` 为 `true`
- **THEN** "关闭休眠"按阈值正常执行；自动分组仍保持关闭
