# Change: 增加标签页排序功能

## Why

分组功能解决了"同类标签归类"的问题，但组与组之间、组内标签的顺序仍然杂乱，且每次整理后顺序不确定。用户需要一个确定性的标签条布局：组按标题有序排列、组内标签有序、无组标签不强行打乱。

## What Changes

- 弹窗新增"排序标签页"按钮，**手动触发**排序（不做自动排序，避免破坏用户手动排列）。
- 排序规则：每个窗口独立排序；有组标签在前，组按组标题排序，组内按页面标题排序；无组标签保持在最后且维持原相对顺序；固定（pinned）标签不参与排序。
- 排序过程复用 `retryAsyncOperation`，遇到用户拖动标签页的临时锁自动重试。

## Capabilities

### New Capabilities
- `tab-sorting`: 手动触发的标签页排序能力，定义排序规则、触发方式与健壮性要求。

### Modified Capabilities
（无）

## Impact

- `popup.html`：新增"排序标签页"按钮。
- `popup.js`：新增排序逻辑（按窗口计算目标顺序并逐个 `chrome.tabs.move`）。
- 不新增权限（`tabs` 权限已包含 `move` 能力），无 breaking change。
