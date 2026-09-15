# auto-collapse-save-button Delta Spec

## Purpose

为弹窗"无活动自动折叠"行的分钟数输入框加"保存 / 取消"按钮，将"输入即持久化"改为"显式保存才持久化"，避免失焦时把"输入中的中间值"误写存储。

## ADDED Requirements

### Requirement: 弹窗"无活动自动折叠"行加保存按钮

弹窗"无活动自动折叠"行的数字输入框右侧 MUST 紧邻出现一个按钮：

- `<button type="button" id="auto-collapse-save">保存</button>`：点击后校验值合法 → 写入 `chrome.storage.sync.autoCollapseAfterMinutes` → 更新 UI 反馈。

不需要"取消"按钮——"保存"按钮是唯一确认入口；如需回退，由"再修改为新值并点保存"承担，避免冗余控件。

总开关 checkbox 行为不变：`change` 即写存储；与"保存"按钮不冲突。

#### Scenario: 初次打开弹窗
- **WHEN** 用户首次打开弹窗
- **THEN** 数字输入框预填当前持久化值（或默认 30），"保存"按钮处于普通样式（不强调）

#### Scenario: 修改后未保存
- **WHEN** 用户在输入框输入 `10`
- **THEN** "保存"按钮文字变 `保存 *`（加视觉强调）

#### Scenario: 点保存
- **WHEN** 用户点击"保存"按钮，输入框值为合法正整数
- **THEN** 值写入 `chrome.storage.sync.autoCollapseAfterMinutes`；"保存"按钮回到普通"保存"样式（无 `*`）；错误提示清空

#### Scenario: 输入非法值
- **WHEN** 用户输入 `0` / 负数 / 非数字
- **THEN** "保存"按钮保持"未保存"高亮但点击**不**写入存储；输入框下方红字提示"请输入大于等于 1 的整数分钟数"

### Requirement: 跨弹窗同步仍生效

`chrome.storage.onChanged` 监听 MUST 仍生效：当另一弹窗（或其他来源）改写 `autoCollapseAfterMinutes` 时，当前弹窗的输入框 MUST 同步为新值，且"保存"按钮回到普通样式（因为新值已持久化）。

#### Scenario: 另一弹窗修改
- **WHEN** 弹窗 A 改阈值为 `15` 并点保存、弹窗 B 已打开
- **THEN** 弹窗 B 的输入框在 `storage.onChanged` 触发后更新为 `15`，"保存"按钮回到普通样式

#### Scenario: 同步后当前弹窗又修改
- **WHEN** 弹窗 B 在同步后输入 `20` 但未保存
- **THEN** "保存"按钮变 `保存 *`；与持久化值（`15`）的偏离由后续手动保存或重新输入回退承担

### Requirement: 与其它行的隔离

"自动关闭休眠"行的输入框 MUST NOT 受本次改动影响（仍按"change 写存储"行为）；仅"无活动自动折叠"行加保存/取消。

#### Scenario: 关闭休眠输入框不加按钮
- **WHEN** 用户查看弹窗
- **THEN** "自动关闭休眠"行的数字输入框**不**出现"保存"或"取消"按钮

### Requirement: 总开关行为不变

"无活动自动折叠"行的 checkbox 总开关 MUST 仍按 `change` 即写存储的旧行为——开关是离散二值，无中间态，不需"保存"按钮介入。

#### Scenario: 切换总开关
- **WHEN** 用户勾选 / 取消勾选总开关
- **THEN** `autoCollapseEnabled` 立即写入存储；不依赖"保存"按钮
