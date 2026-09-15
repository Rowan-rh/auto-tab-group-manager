# Change: 替换 `window.confirm` 为 in-page 二次确认对话框

## Why

`runCloseDormantTabs` / `runCloseDormantTabsWithThreshold` 的二次确认依赖 `window.confirm(confirmMessage)`。在 Chrome 扩展的 `chrome-extension://` 内部页（manager.html）中：

- 某些 Chromium 版本 / 嵌入式环境（DevTools 焦点、其他扩展干扰、用户偏好）下 `window.confirm` 会**静默不弹窗并立即返回 `false`**；
- 即便弹出，原生 confirm 样式与 manager 页面脱节，且阻塞模式下用户可能误点关闭；
- 用户反馈："关闭 >N 分钟未活动"按钮点击后**完全无反应**（无确认框、无结果条、无 console 错误），最可能根因就是 `window.confirm` 被静默吞掉。

## What Changes

- **新增能力 — in-page 二次确认对话框**（`confirm-dialog`）：在 `manager.html` 引入一个 `dialog#confirm-dialog`（使用原生 `<dialog>` 元素 + 模态背景），由 `manager.js` 暴露 `showConfirmDialog({ title, message, confirmText, danger })` Promise 化 API，返回 `boolean`。
- **替换所有 `window.confirm` 调用**：目前只有 `runCloseDormantTabsWithThreshold` 一处使用（`closeGroupTabs` / `closeAllGroupTabs` 的二次确认也用了 `window.confirm`，本轮一并替换以避免同类问题）。
- `<dialog>` 元素 HTML/CSS 自闭合：默认 `hidden`，打开时 `dialog.showModal()`、关闭时 `dialog.close()`。Enter 键确认、Esc 键取消（HTMLDialogElement 原生行为）。
- API 行为契约：与 `window.confirm` 同步阻塞的语义不同 → 返回 Promise；调用方需 `await`。
- 视觉风格：复用 manager 现有色彩与字号；按钮危险操作时 `.danger` 类。

### 假设（已与用户确认）

- 仅在 manager 页面引入；弹窗 / 后台不引入。
- 用原生 `<dialog>` + `showModal()`，不引入第三方库。
- 不暴露给 popup.html（popup 没有需要二次确认的批量操作）。

## Capabilities

### New Capabilities
- `confirm-dialog`: manager 页面 in-page 二次确认对话框，Promise 化 API，替换 `window.confirm` 在 manager 内的所有用法。

### Modified Capabilities
（无。`close-dormant-tabs` 与 `manual-dormancy-close` 的 spec 行为不变，仅是实现细节从 `window.confirm` 换成 `showConfirmDialog`。）

## Impact

- `manager.html`：在 `<body>` 末尾新增 `<dialog id="confirm-dialog" class="confirm-dialog">` 含 `<h3 id="confirm-dialog-title">`、`<p id="confirm-dialog-message">`、两个按钮（取消 + 确认），按顺序引入 `common.js`、`manager.js`（顺序不变）。
- `manager.html` 追加 `.confirm-dialog` 样式：白底卡片、圆角、`::backdrop` 半透明遮罩；预格式化 `message`（保留换行）。
- `manager.js`：
  - 缓存 `els.confirmDialog` / `els.confirmDialogTitle` / `els.confirmDialogMessage` / `els.confirmDialogConfirm` / `els.confirmDialogCancel`。
  - 新增 `showConfirmDialog({ title, message, confirmText, danger })` 返回 `Promise<boolean>`：调用 `dialog.showModal()`，监听取消/确认按钮 click，结束后 `dialog.close()` 并 resolve。
  - `runCloseDormantTabsWithThreshold`、`closeGroupTabs`、`closeAllGroupTabs` 内的 `window.confirm(...)` 替换为 `await showConfirmDialog({...})`。
- 弹窗：不变。
- 后台：不变。

## Out of Scope（非目标）

- 不为弹窗（popup.html）引入 in-page 弹窗。
- 不动 `window.alert`（如果还有使用）。
- 不实现键盘焦点陷阱 / ARIA（`<dialog>` 元素自带焦点管理）。
- 不做多对话框排队（同时只允许一个）。
