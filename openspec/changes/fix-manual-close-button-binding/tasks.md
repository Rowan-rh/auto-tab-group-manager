## 1. 修复手动关闭按钮的绑定作用域

- [x] 1.1 在 `manager.js` 的 `bindToolbar()` 中，将按钮绑定选择器由 `els.toolbar.querySelectorAll('button[data-action]')` 改为 `document.querySelectorAll('.toolbar button[data-action]')`，使第二个 `.toolbar.toolbar-manual` 容器内的 `manual-close-dormant` 按钮也进入 `globalHandlers` 绑定循环
- [x] 1.2 核对 `globalHandlers` 已含 `'manual-close-dormant': () => executeManualClose()`，绑定后点击可进入 `executeManualClose`（不再是"亮着但无响应"）
- [x] 1.3 核对 `retry` / `dismiss-result` 位于提示条 banner（不在任何 `.toolbar` 内），仍由 `bindToolbar()` 末尾单独绑定，改动后不会被新选择器重复绑定
- [x] 1.4 核对组级动态按钮（如 `close-dormant-group`）仍在 `buildGroupCard` 渲染时各自绑定，不受本次选择器改动影响

## 2. 清理调试残留

- [x] 2.1 删除 `showConfirmDialog` 内 4 处 `[debug]` 日志（start、about to showModal、showModal done、showModal threw）；`showModal` 的 `catch` 分支保留功能性的 `settle(false); return;`
- [x] 2.2 删除 `executeManualClose` 内 3 处 `[debug]` 日志（called、minutes、done）
- [x] 2.3 全局检索 `manager.js` 确认无残留 `[debug]` 字样，且保留原有非调试用途的 `console.error` / `console.warn`

## 3. 验证

- [x] 3.1 `node --check manager.js` 通过（语法无误）
- [x] 3.2 `node test/common.test.js` 全部断言通过（回归纯函数，确保未破坏既有排序/比较能力）
- [ ] 3.3 手动验收：加载扩展 → 打开 manager → 输入 `120` → 点击"关闭 > 120 分钟未活动" → 弹出 in-page 确认对话框（含命中数量与预览）→ 确认后仅关闭最近激活时间早于 `now - 120min` 的分组标签页，结果条给出关闭数量
- [ ] 3.4 手动验收：`autoCloseEnabled` 总开关处于关闭态时，手动按钮仍可点击并执行（手动入口不受总开关控制）
- [ ] 3.5 手动验收：无命中标签页时不弹确认框，结果条提示"没有休眠标签页可关闭"
- [x] 3.6 `openspec validate fix-manual-close-button-binding` 通过
