# confirm-dialog Delta Spec

## Purpose

为 `manager.html` 提供一个不依赖 `window.confirm` 的二次确认对话框，Promise 化 API，替换 manager 内所有 `window.confirm` 调用，避免扩展页中 `window.confirm` 静默失败导致的"点击无反应"。

## ADDED Requirements

### Requirement: in-page 二次确认对话框

`manager.html` MUST 在 `<body>` 末尾引入一个 `<dialog id="confirm-dialog">` 元素，结构包含：

- `<h3 id="confirm-dialog-title">` —— 标题（如"关闭休眠标签页"）
- `<p id="confirm-dialog-message">` —— 主体消息，支持换行
- `<button type="button" data-action="cancel">` —— 取消按钮
- `<button type="button" data-action="confirm">` —— 确认按钮

`<dialog>` 默认关闭；通过 `manager.js` 的 `showConfirmDialog()` API 打开并 `showModal()`。

#### Scenario: 打开模态
- **WHEN** 调用 `showConfirmDialog({ title, message, confirmText })`
- **THEN** `<dialog>` 元素以模态方式居中显示，半透明背景遮罩；标题、消息、确认按钮文案按入参渲染

#### Scenario: 关闭模态
- **WHEN** 用户点击"取消"或"确认"按钮，或按 Esc 键
- **THEN** `<dialog>` 元素关闭；按钮文案、标题、消息在下次打开时被覆盖（不留上次内容）

### Requirement: Promise 化 API

`manager.js` MUST 暴露 `async function showConfirmDialog({ title, message, confirmText, danger })`：

- 返回 `Promise<boolean>`：用户点确认 → `resolve(true)`；用户点取消 / Esc / 关闭 → `resolve(false)`。
- `danger: true` 时确认按钮加 `.danger` 类（红色，提示危险操作）。
- 同一时刻只允许一个对话框打开（重复调用后者排队或 reject；MUST NOT 出现叠层）。
- 调用期间 manager 页面其他按钮 MUST 仍可被 `disabled`（沿用现有 `applyButtonStates` + `isBusy` 模式）；本轮不实现额外禁用。

#### Scenario: 用户点击确认
- **WHEN** 用户在弹出的对话框中点击确认按钮
- **THEN** 对应 Promise resolve 为 `true`；`await` 调用方继续执行

#### Scenario: 用户点击取消
- **WHEN** 用户在弹出的对话框中点击取消按钮
- **THEN** 对应 Promise resolve 为 `false`；`await` 调用方走取消分支

#### Scenario: 用户按 Esc
- **WHEN** 对话框打开时用户按 Esc 键
- **THEN** 行为等同点击取消：`Promise resolve(false)`

### Requirement: 替换 `window.confirm`

`manager.js` 内的 `window.confirm(...)` 调用 MUST 全部替换为 `await showConfirmDialog({...})`，至少包括：

- `runCloseDormantTabsWithThreshold`（关闭休眠标签页）
- `closeGroupTabs`（关闭组内标签页）
- `closeAllGroupTabs`（全部关闭标签页）

每个调用点 MUST 显式 `await`；调用方对 `false` 的处理与原 `window.confirm` 行为一致（不发起 `chrome.tabs.remove` / 任何破坏性调用）。

#### Scenario: 关闭休眠命中但用户取消
- **WHEN** 命中标签页后弹出 in-page 对话框
- **AND** 用户点击取消
- **THEN** 不发起任何 `chrome.tabs.remove`；顶部结果条 / 忙碌条不变化

#### Scenario: 关闭休眠命中且用户确认
- **WHEN** 命中标签页后弹出 in-page 对话框
- **AND** 用户点击确认
- **THEN** 沿用原逻辑：串行 `chrome.tabs.remove`，失败累积，结果条提示

### Requirement: 视觉风格

对话框 MUST 视觉上与 manager 页面风格一致：白底圆角卡片、按钮沿用 `button` 基础样式（蓝字白底）、危险确认时按钮加 `.danger` 类（红字）；半透明遮罩（与现有 `.banner-error` 风格类似的浅色 backdrop）。

#### Scenario: 危险操作视觉
- **WHEN** 调用 `showConfirmDialog({ danger: true })`
- **THEN** 确认按钮展示红字（`.danger` 样式），与现有"全部关闭标签页"按钮风格一致
