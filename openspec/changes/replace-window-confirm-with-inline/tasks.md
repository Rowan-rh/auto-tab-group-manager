# Tasks: 替换 window.confirm 为 in-page 二次确认对话框

## 1. HTML 与样式

- [ ] 1.1 `manager.html` 在 `<body>` 末尾、`#windows-container` 之后新增 `<dialog id="confirm-dialog" class="confirm-dialog">` 容器，结构：title + message + cancel/confirm 两个按钮
- [ ] 1.2 `manager.html` 追加 `.confirm-dialog` 样式（白底圆角、`::backdrop` 半透明遮罩）、`.confirm-dialog .danger` 红色确认按钮样式；消息 `white-space: pre-wrap` 保留换行

## 2. manager.js：API 与接线

- [ ] 2.1 `cacheElements` 增 `els.confirmDialog` / `confirmDialogTitle` / `confirmDialogMessage` / `confirmDialogConfirm` / `confirmDialogCancel`
- [ ] 2.2 新增 `showConfirmDialog({ title, message, confirmText, danger })`：检查若已打开则直接 resolve(false)；否则设文案、确认按钮 danger 类、`showModal()`、绑一次性 click 监听（cancel/confirm/close），resolve 后 `dialog.close()` 并清理监听
- [ ] 2.3 替换 `runCloseDormantTabsWithThreshold` 中的 `window.confirm(confirmMessage)` 为 `await showConfirmDialog({ title, message: confirmMessage, confirmText: '确定关闭', danger: true })`
- [ ] 2.4 替换 `closeGroupTabs` 中的 `window.confirm(...)` 为 `await showConfirmDialog(...)`（同模式）
- [ ] 2.5 替换 `closeAllGroupTabs` 中的 `window.confirm(...)` 为 `await showConfirmDialog(...)`（同模式）

## 3. 验证

- [ ] 3.1 `node --check manager.js` 通过
- [ ] 3.2 `openspec validate replace-window-confirm-with-inline --strict` 通过
- [ ] 3.3 手动验证：手动"关闭 >N 分钟未活动"按钮点击 → 弹出 in-page 模态 → 取消无副作用 → 确认触发 chrome.tabs.remove
- [ ] 3.4 手动验证：组级"关闭标签页"按钮 → 模态弹出 → 取消/确认路径正确
- [ ] 3.5 手动验证：顶部"全部关闭标签页" → 模态弹出 → 文案包含组数 + 标签页数
- [ ] 3.6 手动验证：Esc 键关闭模态等同取消
