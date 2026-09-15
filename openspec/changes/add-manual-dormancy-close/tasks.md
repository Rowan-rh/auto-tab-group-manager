# Tasks: manager 工具栏手动输入阈值关闭休眠

## 1. 工具栏独立 row

- [ ] 1.1 `manager.html` 在现有 `<div class="toolbar">` 之后新增 `<div class="toolbar toolbar-manual">`，内容：小标题"手动关闭休眠"、`<input type="number" id="manual-close-minutes" min="1" step="1" style="width:60px;margin-left:8px">`、`<span>分钟未活动</span>`、`<button type="button" data-action="manual-close-dormant">关闭 >N 分钟未活动</button>`
- [ ] 1.2 `manager.html` 追加 `.toolbar-manual` 样式：复用 `.toolbar` 的卡片外观（白底/边框/圆角），上方间距 `8px`，按钮不重复 `margin-bottom`

## 2. manager.js：输入框 + 按钮接线

- [ ] 2.1 `cacheElements` 增 `els.manualCloseMinutesInput = document.getElementById('manual-close-minutes')` 与 `els.manualCloseButton = document.querySelector('[data-action="manual-close-dormant"]')`
- [ ] 2.2 模块顶部加 `let manualCloseMinutesCache = 60;`
- [ ] 2.3 `init` 末尾 `await refreshManualCloseCache()`：从 `chrome.storage.sync.get('manualCloseAfterMinutes')` 拉值（默认 60，最小 1），写入输入框与按钮文案
- [ ] 2.4 输入框 `input` 事件：实时更新按钮文案（`关闭 > ${value} 分钟未活动`），非法值时按钮文案维持原样 + 按钮 disabled
- [ ] 2.5 输入框 `change` 事件：校验 `Number.isInteger(value) && value >= 1`；通过则 `chrome.storage.sync.set({ manualCloseAfterMinutes: value })` 并清空错误提示；不通过则恢复显示缓存值 + 红字提示
- [ ] 2.6 输入框 `blur` 事件：再校验一次非法值并回退
- [ ] 2.7 订阅 `chrome.storage.onChanged`：当 `manualCloseAfterMinutes` 变化时刷新输入框与按钮文案

## 3. manager.js：执行入口

- [ ] 3.1 把 `runCloseDormantTabs(targetGroupId)` 内部读取 `cfg.minutes` 那一段抽成"接受 `idleThresholdMs` 形参"；函数签名变为 `runCloseDormantTabsWithThreshold(targetGroupId, idleThresholdMs, options)`，`options.ignoreAutoEnabled` 供手动入口使用（默认 `false`）
- [ ] 3.2 保留 `runCloseDormantTabs(targetGroupId)` 作为"按总开关 + autoCloseAfterMinutes"的薄包装，行为不变
- [ ] 3.3 新增 `executeManualClose()`：拉 `manualCloseAfterMinutes` → 计算 `idleThresholdMs` → 走 `runCloseDormantTabsWithThreshold(null, idleThresholdMs)`，**仍**做总开关检查（`autoCloseEnabledCache`）作为防御性短路：总开关关闭时直接结果条提示
- [ ] 3.4 `bindToolbar` `globalHandlers` 增 `'manual-close-dormant': executeManualClose`

## 4. 按钮启用/禁用

- [ ] 4.1 `applyButtonStates` 增分支：当 `action === 'manual-close-dormant'` 时**不**走 `autoCloseEnabledCache`；仅当输入框为空或非法值时 disabled + title 提示
- [ ] 4.2 `executeManualClose` 移除 `autoCloseEnabledCache` 防御性短路（手动入口不再受总开关控制）

## 5. 验证

- [ ] 5.1 `node --check` 通过：`manager.js`、`common.js`、`background.js`、`popup.js`
- [ ] 5.2 `openspec validate add-manual-dormancy-close --strict` 通过
- [ ] 5.3 接线校验：HTML id / data-action / 新 CSS 类与 JS 一致
- [ ] 5.4 手动验证：输入合法值（30/60/120）→ 按钮文案同步刷新；输入 0/负数/abc → 拒绝 + 红字提示 + 按钮文案回退
- [ ] 5.5 手动验证：总开关关闭时按钮 disabled 且 title 正确；开启后启用
- [ ] 5.6 手动验证：跨 manager 标签页同步输入值（storage.onChanged 生效）
- [ ] 5.7 手动验证：执行关闭 → 二次确认 → 关闭后视图刷新；输入 0/空 → 按钮 disabled 无法点击
- [ ] 5.8 回归：现有"关闭休眠"全局/组级按钮、`runCloseDormantTabs` 行为不变
