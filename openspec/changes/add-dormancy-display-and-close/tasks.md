# Tasks: 休眠时间列展示 & 一键关闭休眠标签页

## 1. 后台：自动关闭休眠配置读取

- [ ] 1.1 `background.js` 新增 `AUTO_CLOSE_DEFAULTS = { enabled: false, minutes: 60 }` 与 `getAutoCloseConfig()`，与 `getAutoCollapseConfig` 同源语义（`chrome.storage.sync.get(['autoCloseEnabled', 'autoCloseAfterMinutes'])` + 默认值回退）。`runInactivitySweep` 不动

## 2. 弹窗：自动关闭休眠交互

- [ ] 2.1 `popup.html` 在"无活动自动折叠"行后新增一个 `<label class="toggle-row">` 含 `#auto-close-toggle`（默认未勾选）+ `<input type="number" id="auto-close-minutes" min="1" step="1">` + 文本"分钟"；下方复用 `<div class="mapping-error" id="auto-close-error">` 错误提示
- [ ] 2.2 `popup.js` 新增 `getAutoCloseConfig()` / `saveAutoCloseConfig(cfg)`；与 autoCollapse 同模式：DOMContentLoaded 加载并回填，change 写存储，blur 校验非法值
- [ ] 2.3 `popup.js` `chrome.storage.onChanged` 监听扩展：监测 `autoCloseEnabled` / `autoCloseAfterMinutes` 变化同步刷新控件

## 3. manager 页：休眠列渲染

- [ ] 3.1 `manager.html` `.tab-item` grid 模板改为 `grid-template-columns: 24px 1fr 1fr 1fr`，新增 `.tab-dormancy` 样式（沿用 `.tab-host` 的浅灰小字 + 省略规则）
- [ ] 3.2 `manager.js` `buildTabItem` 末尾新增第三个 `<span class="tab-dormancy">`，文本由新增的 `formatDormancy(tab)` 产生（复用 `lastActivatedCache[tab.id]` → 回落 `tab.lastAccessed` → `未知`），格式与 spec 表格一致：`未知 / 刚刚 / Nm / Nh / Nd`
- [ ] 3.3 `relativeActivated` 内部已实现格式化能力；新增 `formatDormancy(tab)` 仅做"取短格式"映射（与 `relativeActivated` 共用底层时间差值，不重复 IO）

## 4. manager 页：工具栏与组级"关闭休眠"按钮

- [ ] 4.1 `manager.html` 顶部工具栏在"全部关闭标签页"之前新增 `<button type="button" data-action="close-dormant">关闭休眠</button>`
- [ ] 4.2 `manager.html` / `manager.js` 组卡片操作行新增 "关闭休眠" 按钮：`actions.appendChild(makeButton('关闭休眠', 'close-dormant-group', () => runCloseDormantTabs(group.id), false, !hasTabs))`
- [ ] 4.3 `manager.js` `globalHandlers` 增 `'close-dormant': () => runCloseDormantTabs(null)`，与现有 `expand-all` / `collapse-all` / `sort-all` / `ungroup-all` / `close-all` 同级
- [ ] 4.4 `applyButtonStates` 中扩展：新增 `data-action="close-dormant"` 与 `close-dormant-group` 的禁用逻辑——
  - 全局按钮：总开关关闭时 disabled + `title="自动关闭休眠已关闭，请先在弹窗中开启"`
  - 组级按钮：总开关关闭时同上；组内无标签页时沿用现有 `data-disabled-reason` 模式

## 5. manager 页：关闭动作核心

- [ ] 5.1 `manager.js` 新增 `runCloseDormantTabs(targetGroupId)`：先 `getAutoCloseConfig()`，总开关关闭 → 结果条提示后返回；读取 `idleThresholdMs = minutes * 60_000`
- [ ] 5.2 从 `loadSnapshot()` 已有的 `windowModel.groups` 派生目标集合（`targetGroupId` 为 `null` 时取全部组，否则过滤）→ 逐组检查每张标签页的休眠判定
- [ ] 5.3 休眠判定：取 `lastActivatedCache[tab.id]` 数值 → 回落 `tab.lastAccessed`（ms）→ 仍不可得判 `未知` 且 `tab.lastAccessed <= 0` 时直接跳过（数据缺失 ≠ 休眠）
- [ ] 5.4 收集命中后按"全局 / 组级"两种文案走 `window.confirm`：全局文案 `确定关闭 N 个休眠标签页（来自 M 个标签组）？此操作不可撤销。\n预览：\n- <组>：<标题>（最多 10 条）`；组级文案 `确定关闭「<组名>」中 N 个休眠标签页？此操作不可撤销。\n预览：…`
- [ ] 5.5 确认后 `setBusy(true, '正在关闭休眠标签页…')` + 逐组 `retryAsyncOperation(() => chrome.tabs.remove(ids))`；失败累积；完成 `setBusy(false)` + 结果条 `已关闭 N 个休眠标签页（M 个失败：…）` 或 `无失败时仅提示 N`；无命中时直接走结果条 `「<组名>」中没有休眠标签页可关闭` / `没有休眠标签页可关闭`
- [ ] 5.6 由于关闭后会触发 `chrome.tabs.onRemoved` → 现有 `scheduleRender` 自动刷新，无需额外手动 `refresh()`

## 6. 验证

- [ ] 6.1 `node --check` 通过：`background.js`、`popup.js`、`manager.js`、`common.js`
- [ ] 6.2 `openspec validate add-dormancy-display-and-close --strict` 通过
- [ ] 6.3 接线校验：`getElementById` / `data-action` / grid 列与新 CSS 类名一致
- [ ] 6.4 手工验证（弹窗）：首次安装 `autoCloseEnabled=false`；勾选后能关闭；输入 `0` / 负数 / `abc` 被拒；阈值修改 → 跨弹窗同步
- [ ] 6.5 手工验证（manager 休眠列）：3 个不同时间点打开的标签页分别显示 `刚刚` / `30m` / `3d`；新建标签页（未触发过 onActivated、lastAccessed=0）显示 `未知`；grid 三列肉眼等分
- [ ] 6.6 手工验证（关闭休眠）：总开关关闭 → 顶部与组级按钮均 disabled 且 title 正确；开启但无命中 → 结果条提示无命中；开启且有命中 → 二次确认 → 关闭后 refresh 视图同步；点取消无任何副作用
- [ ] 6.7 手工验证（隔离）：组级按钮只关目标组；自动分组关闭时"关闭休眠"仍工作；关闭命中后组结构未变（剩余标签页仍在原组）
- [ ] 6.8 手动回归：现有"全部展开 / 全部折叠 / 全部排序 / 全部解散 / 全部关闭标签页"无回归；自动折叠仍按既有阈值工作
