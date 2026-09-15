# Change: 不活跃自动折叠 & 管理页签 URL 列展示增强

## Why

1. 现有标签组长期占满标签条视野，被访问过的组不会自动让出空间；用户需要一个"无活动 N 分钟后自动折叠"的开关，且阈值要可配；
2. `manager.html` 标签组卡片右侧的域名列 (`tab-host`) 当前只显示 `hostname`（如 `code.alibaba-inc.com`），同域名不同路径的标签页看上去完全一样，无法在管理页一眼区分。

## What Changes

- **不活跃自动折叠**：
  - 新增配置项 `autoCollapseEnabled`（总开关，默认 `true`）与 `autoCollapseAfterMinutes`（无活动阈值，默认 `30`），与现有 `autoGroupingEnabled` 同样使用 `chrome.storage.sync` 持久化。
  - **"无活动"定义**：以"标签组"为单位，记录组内每个标签页的最近一次激活时间戳；当组内**所有**标签页的最近激活时间都已超过阈值，组被判定为不活跃。
  - 折叠动作只对"已展开且无活动"的组触发，跳过已折叠的组；不会解散分组、不会关闭标签页、不影响自动分组链路。
  - 后台 service worker (`background.js`) 监听 `chrome.tabs.onActivated` 更新每个标签页的最近激活时间，并用 `chrome.alarms` 周期性扫描触发折叠（默认周期 1 分钟）。
  - 弹窗 (`popup.html`) 在已有的"自动分组"开关行下新增一行"无活动自动折叠"开关与一个数字输入（最小 1 分钟，上限建议 24 小时 = 1440 分钟），样式与现有 toggle-row 保持一致。
- **管理页签 URL 列展示增强**：
  - `manager.html` 内 `tab-host`（`manager.js` 中 `buildTabItem` 渲染的右侧域名列）从仅展示 `hostname` 改为：仍默认显示 `hostname`（保持紧凑），但同时承载两个新信息：
    - `title` 属性（悬浮提示）从"`标题\nURL`"扩展为"`标题\n完整 URL\n最后激活时间`"——悬浮即可看到完整路径与最近活跃时间，无需展开即可分辨。
    - 视觉上在 `hostname` 之后用浅灰小字追加路径首段（如 `/path/to/page?q=1` 截断到首 24 字符），同域名不同路径即可一眼区分；过长省略。

### 假设（已与用户确认交互项，其余为合理默认）

- "活动"以"激活标签页"（`chrome.tabs.onActivated`）为准，不区分鼠标悬停/焦点/页面加载完成（用户已确认）。
- 自动折叠的配置入口复用弹窗"自动分组"开关所在行（用户已确认），不另开 manager 页面设置入口。
- 阈值单位固定为分钟（用户已确认），数字输入配合下拉单位在后续 change 中再做；本轮先做数字输入。
- 不为不同组分别配置阈值——全局共用一个值（用户已确认范围合理）。

## Capabilities

### New Capabilities
- `inactivity-auto-collapse`: 自动折叠总开关与无活动阈值的存储、弹窗交互，以及后台基于"组内全部标签页最近激活时间"的扫描 + 折叠触发。
- `tab-url-display`: manager 页面右侧域名列在保持紧凑的前提下追加路径首段、并扩展悬浮提示以展示完整 URL 与最后激活时间。

### Modified Capabilities
（无。两个新能力均不改动既有 `group-manager-page` / `group-batch-actions` / `domain-mapping` / `wildcard-mapping` / `auto-grouping-toggle` / `tab-jump` 的需求边界。）

## Impact

- `background.js`：新增最近激活时间表（`chrome.storage.session`，按 tabId 存 `lastActivatedAt` ISO 字符串，service worker 重启后从 `chrome.storage.session` 重建；首次激活缺省记为"组创建时间"）；新增 `chrome.alarms` 注册（`chrome.alarms.create('inactivity-sweep', { periodInMinutes: 1 })`），服务启动时调用 `chrome.alarms.get` 兜底重建；`chrome.alarms.onAlarm` 监听 `inactivity-sweep` 执行扫描；`chrome.tabs.onActivated` 维护时间表；`chrome.tabs.onRemoved` 清理已关闭标签页条目。`groupTab` 不改动（自动分组链路独立）。
- `popup.html`：在 `.toggle-row` 后新增一个 toggle-row（"无活动自动折叠"开关）+ 一个数字输入（阈值，单位分钟，最小值校验）。样式与既有 toggle-row 保持一致。
- `popup.js`：阈值与开关的读取、变更持久化、`chrome.storage.onChanged` 跨页面同步；`getDomainMappings` / `saveDomainMappings` 同理补一对 `getAutoCollapseConfig` / `saveAutoCollapseConfig`（默认值 `enabled=true, minutes=30`）。
- `manager.html`：`tab-host` 的 CSS 仅追加样式（路径首段灰字、悬浮提示可由浏览器原生渲染，不再需要 JS tooltip）；原 `.tab-item title` 行为由浏览器原生支持，扩展在 `manager.js` 中改写 `title` 文本即可。
- `manager.js`：`buildTabItem` 中计算 `hostOf(tab.url)`、`pathPreviewOf(tab.url)`（`pathname + search`，截断到 24 字符加省略号）、读取"最近激活时间"（从 `chrome.storage.session` 取；缺省时回落为 `tab.lastAccessed`）。`title` 拼接三行：标题、完整 URL、本地化时间。
- `manifest.json`：新增 `"alarms"` 权限；其余权限 `tabs` / `tabGroups` / `storage` 已足够。`storage` 当前为 `sync`，新增"最近激活时间"建议放 `session`（per-device、不跨设备同步、service worker 关闭即失效），manifest 加 `"storage"` 已包含 `storage.session`，无需新增。
- `common.js`：本轮不新增（用户已确认）。

## Out of Scope（非目标）

- 不实现"鼠标悬停也算活动"。
- 不按"标签页类型"（如 pinned）豁免折叠。
- 不为不同组分别配置阈值。
- 不修改 manager 页面工具栏（不新增"立即全部折叠"按钮；现有"全部折叠"按钮已能满足该需求）。
- 不把"最后激活时间"同步到 `chrome.storage.sync`（该数据高频且仅用于本次会话决策；放 session 即可，重启后回落到 `tab.lastAccessed`，仍可工作）。
- 不修改 `auto-grouping-toggle` 的现有交互（总开关关闭时连自动分组也关；本轮新增的"自动折叠"是独立总开关，与自动分组互不影响）。
