# Change: 修复 manager 手动"关闭 >N 分钟未活动"按钮点击无反应

## Why

用户反馈：manager 页面工具栏里的手动"关闭 >N 分钟未活动"按钮**是亮的（未禁用），但点击毫无反应**，2 小时阈值也关不掉任何标签页。

定位根因是**事件绑定作用域错误**，与 `manual-dormancy-close` 既有 spec 的"执行关闭动作"需求（"点击按钮 MUST … 二次确认后批量 `chrome.tabs.remove`"）相违背：

- `manager.html` 存在**两个** `.toolbar` 容器：第一个 `<div class="toolbar">`（全局操作，含 `close-dormant`），第二个 `<div class="toolbar toolbar-manual">`（手动关闭，含 `manual-close-dormant` 按钮）。
- `manager.js` 中 `els.toolbar = document.querySelector('.toolbar')` **只取到第一个** toolbar；`bindToolbar()` 用 `els.toolbar.querySelectorAll('button[data-action]')` 绑定点击处理器，因此**够不到第二个 toolbar 里的手动按钮**。
- `globalHandlers` 里虽然登记了 `'manual-close-dormant': () => executeManualClose()`，但该按钮从未被 `addEventListener`，`executeManualClose` 永远不会执行。
- 反观 `applyButtonStates()` 使用**全局** `document.querySelectorAll('button[data-action]')`，所以按钮的启用/禁用状态正常——这正好解释了"按钮是亮的但点了没反应"。

此前的诊断把病因误判为"`window.confirm` 在扩展页内被静默吞掉"，并据此做了 `replace-window-confirm-with-inline`（换成 in-page `<dialog>`）。但真正的根因是**按钮压根没被绑定**，`showConfirmDialog` 从未被调用，因此换 dialog 并未解决问题；commit `41b9d65` 加的 `[debug]` 日志也永远不会打印（函数根本没进入）。

## What Changes

- **修正 `bindToolbar()` 的绑定作用域**：把 `data-action` 按钮的绑定从"仅第一个 `.toolbar`"放宽到"覆盖页面上所有 `.toolbar` 容器"，使 `toolbar-manual` 里的 `manual-close-dormant` 按钮正确挂载 `executeManualClose`。
  - 保持既有语义不变：`retry` / `dismiss-result`（位于提示条 banner、非 `.toolbar`）仍按原方式单独绑定，不会被重复绑定；组级动态按钮在渲染时各自绑定，不受影响。
- **清理调试残留**：移除 commit `41b9d65` 为排查本问题临时加入的 `[debug]` 日志（`showConfirmDialog` 内 4 处、`executeManualClose` 内 3 处，共 7 处），保留原有的 `console.error`/`console.warn` 错误日志。
- 行为兼容：手动按钮"不受 `autoCloseEnabled` 总开关控制""输入非法值时禁用""文案随输入动态刷新"等既有行为全部保持不变。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无 —— 本变更为**纯实现 bugfix**：`manual-dormancy-close` 的"执行关闭动作"需求已规定按钮点击必须触发关闭流程，当前实现只是未符合该契约。修复后行为与既有 spec 一致，**无 spec 级行为变化**，故 `.openspec.yaml` 设 `skip_specs: true`，不产生 delta spec。）

## Impact

- `manager.js`：
  - `bindToolbar()`：将按钮绑定选择器由 `els.toolbar.querySelectorAll('button[data-action]')` 改为覆盖所有 `.toolbar` 容器（如 `document.querySelectorAll('.toolbar button[data-action]')`）。
  - 删除 `showConfirmDialog`（4 处）与 `executeManualClose`（3 处）内的 `[debug]` 日志；`showModal` 的 `catch` 分支保留功能性的 `settle(false); return;`。
- `manager.html` / `popup.*` / `background.js` / `manifest.json`：**不变**。
- 测试：`test/common.test.js` 为纯函数单测，不覆盖 DOM 绑定；本修复通过"手动验收"验证（见 tasks.md）。

## Out of Scope（非目标）

- 不改动"关闭休眠"的命中判定、二次确认文案、预览、失败聚合等逻辑（它们本身正确）。
- 不为关闭流程新增"豁免当前活动标签页"规则（与自动折叠的豁免是不同议题，用户未提出）。
- 不清理 `background.js` 中未被调用的 `getAutoCloseConfig` / `fetchLastActivatedMap` 死代码（可另开清理项，与本 bugfix 无关）。
- 不回滚任何已落地能力：评估确认需求 1/2/3/5/6 均实现正确、可用。
