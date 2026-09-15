# Tasks: 增加标签页排序功能

## 1. 弹窗 UI

- [x] 1.1 `popup.html` 在操作按钮区新增"排序标签页"按钮

## 2. 排序逻辑

- [x] 2.1 `popup.js` 实现排序：查询每个窗口的非固定标签页与组，计算目标顺序（组按标题、组内按页面标题、无组标签保持原相对顺序在后）
- [x] 2.2 按目标顺序逐个 `chrome.tabs.move`（包裹 `retryAsyncOperation`），单个失败不中断整体流程
- [x] 2.3 排序完成后按钮反馈并刷新标签组列表

## 3. 验证

- [x] 3.1 `node --check popup.js` 与 `openspec validate add-tab-sorting --strict` 通过
- [ ] 3.2 手工验证：多组窗口点击排序后组按标题有序、组内有序、无组标签相对顺序不变、pinned 标签不动
