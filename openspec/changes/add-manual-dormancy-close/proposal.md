# Change: manager 工具栏手动输入阈值关闭休眠

## Why

现有"关闭休眠"按钮只接受弹窗里固定的 `autoCloseAfterMinutes` 阈值。当用户想临时清一波"超过 2 小时没动"或"超过 3 天没动"的标签页时，必须先去弹窗改阈值、再回 manager 操作；不够直接。需要一个"在 manager 工具栏输入数字 → 一键关闭"的临时入口。

## What Changes

- **新增能力 — 手动输入阈值关闭休眠**（`manual-dormancy-close`）：在 `manager.html` 工具栏下方新增一个独立 `div.toolbar.toolbar-manual` 行，包含：
  - 数字输入 `#manual-close-minutes`（正整数分钟数，最小 `1`）
  - 文字标签"分钟未活动"
  - 按钮 `<button data-action="manual-close-dormant">关闭 >N 分钟未活动</button>`，按钮文案随输入值动态变化（如"关闭 > 120 分钟未活动"）
- 复用现有 `runCloseDormantTabs(targetGroupId)` 的判定逻辑，但绕过 `autoCloseAfterMinutes`、改用本次输入值；按钮**不**受 `autoCloseEnabled` 总开关控制（手动表达意愿的入口，与"自动"行为正交）。
- 输入框的"上次值"持久化到 `chrome.storage.sync`（用户已确认）；持久化字段 `manualCloseAfterMinutes`（默认 `60`，与 `autoCloseAfterMinutes` 同源默认值）。
- 与现有顶部"关闭休眠"按钮的差别：阈值取自输入框、不取自 `autoCloseAfterMinutes`；文案随输入变化；其他行为（组级粒度、二次确认、失败聚合、不动组结构）一致。

### 假设（已与用户确认）

- 受 `autoCloseEnabled` 总开关控制（用户已确认）。
- 输入框值持久化到 `chrome.storage.sync`（用户已确认）。
- 工具栏另起一个独立 row（用户已确认），与现有"全局操作"行错开。
- 不为输入框加"上次使用的值"显示以外的额外提示。

## Capabilities

### New Capabilities
- `manual-dormancy-close`: manager 工具栏新增独立 row，含数字输入 + "关闭 >N 分钟未活动"按钮；点击时按输入值批量关闭休眠标签页，输入值持久化到 `chrome.storage.sync`。

### Modified Capabilities
（无。复用 `runCloseDormantTabs` 内部判定；不修改 `close-dormant-tabs` 的 spec。）

## Impact

- `manager.html`：
  - 工具栏 `<div class="toolbar">` 后新增 `<div class="toolbar toolbar-manual">`，含小标题"手动关闭休眠"、`<input type="number" id="manual-close-minutes" min="1" step="1">`、`<span>分钟未活动</span>`、`<button data-action="manual-close-dormant">关闭 >N 分钟未活动</button>`。
  - 追加 `.toolbar-manual` 样式：与 `.toolbar` 同视觉（白底/边框/圆角），但上下间距略小；可与 `.toolbar` 共用大部分样式。
- `manager.js`：
  - `cacheElements` 增 `els.manualCloseMinutesInput`。
  - `bindToolbar` 中 `globalHandlers` 增 `'manual-close-dormant': () => executeManualClose()`。
  - `init` 末尾 `await refreshManualCloseCache()`：从 `chrome.storage.sync.get('manualCloseAfterMinutes')` 拉值，默认 `60`；写入输入框；输入变化时校验 + 持久化 + 刷新按钮文案。
  - 订阅 `chrome.storage.onChanged` 同步 `manualCloseAfterMinutes`。
  - `applyButtonStates` 中 `manual-close-dormant` 同样受 `autoCloseEnabledCache` 控制。
  - 新增 `executeManualClose()`：拉最新 `manualCloseAfterMinutes` 与 `lastActivatedCache`；直接调用一个接受"自定义阈值"入参的关闭执行函数。
  - 改造 `runCloseDormantTabs`：把"读取 `autoCloseAfterMinutes`"那段改成接受 `idleThresholdMs` 形参。增加一个公开入口 `runCloseDormantTabsWithThreshold(targetGroupId, idleThresholdMs)`，原 `runCloseDormantTabs` 变成它的薄包装（保留总开关检查）。`executeManualClose` 走 `runCloseDormantTabsWithThreshold` 但**仍走总开关检查**（因为 `disabled` 状态只在总开关开启时可点，到这里几乎不会触发，但保留为防御性短路）。
  - 输入框的 `change` 监听：非法值恢复为上次合法值 + 错误提示。
- 弹窗：不变（不把手动阈值搬过去）。
- 后台 / `common.js`：无变更。

## Out of Scope（非目标）

- 不在弹窗加"上次手动输入值"显示（仅 manager 内可见）。
- 不为输入框加上下箭头以外的"快捷档位"（如 1h/1d 一键预设）。
- 不为手动输入阈值加"组级"按钮；只做全局入口——组级粒度仍由现有"关闭休眠"组级按钮负责（用 `autoCloseAfterMinutes`）。
- 不动现有 `close-dormant`（顶部 / 组级）按钮的位置和文案。
