# Change: 标签组管理独立页面（一键展开 / 排序 / 关闭）

## Why

弹窗只有 300px 宽，标签组树仅支持"点击跳转"和"关闭分组"两种操作，无法承载批量管理：折叠的组要逐个点开、组内标签页顺序混乱无法整理、想批量解散或关闭某个组也没有入口。用户需要一个空间更大的独立界面来集中处理已存在的标签组。

## What Changes

- **新增独立管理页面**：新增 `manager.html` + `manager.js`，从弹窗顶部按钮"标签组管理"在新标签页打开（`chrome.tabs.create` + `chrome.runtime.getURL`）。
- **管理对象限定为已存在的标签组**：页面只列出 `chrome.tabGroups.query()` 的结果，未分组的散落标签页不出现在界面中。
- **按窗口分区展示**：标签组按 `windowId` 分组展示为多个区块，区块标题标明窗口序号与当前窗口标识。所有操作严格在窗口内执行，禁止跨窗口移动标签页。
- **组级一键操作**（每个组一行操作按钮）：
  - 一键展开 / 一键折叠：`chrome.tabGroups.update(id, { collapsed })`，不改变标签页激活状态。
  - 一键排序（组内）：组内标签页按标题升序重排（`chrome.tabs.move`，窗口内）。
  - 一键关闭（解散）：`chrome.tabs.ungroup`，保留标签页——与现有弹窗"×"语义一致。
  - 一键关闭（标签页）：`chrome.tabs.remove` 关闭组内全部标签页，需二次确认。
- **全局一键操作**（页面顶部工具栏）：全部展开、全部折叠、全部排序（先按组名排序组之间的顺序，再对每个组内部按标题排序）、全部解散、全部关闭标签页（需二次确认）。
- **实时刷新**：页面监听 `chrome.tabGroups` 与 `chrome.tabs` 的相关事件自动重渲染；操作按钮在执行期间禁用，避免重复触发导致 `Tabs cannot be edited right now`。

### 假设（已与用户确认交互项，其余为合理默认）

- "一键打开"= 展开折叠的组（用户已确认），不含激活标签页、不含移入新窗口。
- "一键排序"= 组内标签页排序 + 组之间顺序排序，两者都要（用户已确认）。
- "一键关闭"= 同时提供"解散分组"（默认主操作，不丢标签页）与"关闭组内标签页"（危险操作，二次确认）两种语义。

## Capabilities

### New Capabilities
- `group-manager-page`: 独立管理页面的入口、布局、按窗口分区的数据加载与实时刷新行为。
- `group-batch-actions`: 组级与全局一键操作（展开/折叠、组内排序、组顺序排序、解散分组、关闭组内标签页）的语义、窗口内约束与危险操作确认。

### Modified Capabilities
（无。`openspec/specs/` 当前为空，已归档能力尚未同步为主 spec；本次不改动 `domain-mapping` / `wildcard-mapping` / `auto-grouping-toggle` / `tab-jump` 的既有需求。）

## Impact

- 新增文件：`manager.html`、`manager.js`、`common.js`（前端共享工具：重试包装、标题比较器、组颜色映射表）。
- `popup.html` / `popup.js`：新增"标签组管理"按钮，点击后在新标签页打开管理页面并关闭弹窗（已打开则复用该标签页）；`popup.html` 先于 `popup.js` 引入 `common.js`，`popup.js` 删除重复的 `retryAsyncOperation`。
- `manifest.json`：**无需变更**。扩展自身通过 `chrome.tabs.create` 打开自己的页面不需要 `web_accessible_resources`；`tabs` / `tabGroups` / `storage` 权限已足够。
- `background.js`：**不改动**。自动分组逻辑、既有 `getRandomColor()` 与跨窗口分组的历史问题不在本次范围内（另立 change 处理）。
- 复用点：`retryAsyncOperation`（处理 `Tabs cannot be edited right now`）从 `popup.js` 提取到 `common.js` 供两个页面共享；`background.js` 中的平行实现本次保留不动——见 design.md D2。
