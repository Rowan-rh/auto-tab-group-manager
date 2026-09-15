# Tasks: 弹窗"无活动自动折叠"加保存/取消按钮

## 1. HTML 与样式

- [ ] 1.1 `popup.html` 在"无活动自动折叠"行的数字输入框后追加一个按钮：`<button type="button" id="auto-collapse-save">保存</button>`
- [ ] 1.2 `popup.html` 复用现有 `.mapping-actions` 样式（弹窗"域名映射"区域已有类似按钮组）；如需新增"未保存"高亮样式（按钮加 `.dirty` 类），在该样式块追加

## 2. popup.js：输入与持久化解耦

- [ ] 2.1 模块顶部新增 `let lastSavedCollapseMinutes = 30;` 持有当前持久化值
- [ ] 2.2 `getAutoCollapseConfig` 加载后把 `cfg.minutes` 同步到 `lastSavedCollapseMinutes`
- [ ] 2.3 移除 `autoCollapseMinutesInput.addEventListener('change', ...)` 这段（不再失焦即存）
- [ ] 2.4 `autoCollapseMinutesInput.addEventListener('input', ...)`：调用新工具 `markAutoCollapseDirty()` 把"保存"按钮加 `.dirty` 类
- [ ] 2.5 新增"保存"按钮 click：校验 `Number.isInteger(value) && value >= 1`；通过则 `saveAutoCollapseConfig({ enabled, minutes: value })` → `lastSavedCollapseMinutes = value` → `clearAutoCollapseDirty()`；不通过则保持 dirty + `showAutoCollapseError('请输入大于等于 1 的整数分钟数')`
- [ ] 2.6 新增 `markAutoCollapseDirty()` / `clearAutoCollapseDirty()` / `refreshAutoCollapseDirty()` 工具：维护"保存"按钮的 `.dirty` 类与文字（`保存 *`）
- [ ] 2.7 blur 事件调整为"输入非法值则回退 + 错误提示"（不写存储）
- [ ] 2.8 `chrome.storage.onChanged` 监听中检测到 `autoCollapseAfterMinutes` 变化时：同步输入框值 + 同步 `lastSavedCollapseMinutes` + `clearAutoCollapseDirty()`

## 3. 验证

- [ ] 3.1 `node --check popup.js` 通过
- [ ] 3.2 `openspec validate add-collapse-save-button --strict` 通过
- [ ] 3.3 接线校验：HTML id / data-action / CSS 与 JS 一致
- [ ] 3.4 手动验证：首次打开弹窗 → 输入框预填 30、保存/取消按钮普通样式
- [ ] 3.5 手动验证：改输入框为 10 → 保存按钮变"保存 *"；点保存 → 按钮恢复 + 写存储；按 Ctrl+Shift+T / 重新打开弹窗仍为 10
- [ ] 3.6 手动验证：改输入框为 10 → 重新输入回 30 → 点保存 → 写存储 30
- [ ] 3.7 手动验证：输入非法值 → 保存按钮变 * 但点击不写 + 红字提示
- [ ] 3.8 手动验证：跨弹窗同步 → A 改保存 → B 同步更新 + B 的保存按钮普通样式
- [ ] 3.9 手动验证：总开关 checkbox 仍 change 即写（不依赖"保存"按钮）
- [ ] 3.10 手动验证："自动关闭休眠"行不受影响，仍按原行为工作
