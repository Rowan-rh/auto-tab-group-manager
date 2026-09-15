# Tasks: 修复"无活动自动折叠"误折叠正在使用的组

## 1. 后台：重写 `runInactivitySweep` 判定

- [ ] 1.1 `background.js` 删除（不再需要）或保留为内部工具的 `computeGroupInactivityEpoch`
- [ ] 1.2 `background.js` 在 `runInactivitySweep` 顶部增加：`const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });` 收集活动 tabId 集合 `activeTabIds = new Set(activeTabs.map(t => t.id))`
- [ ] 1.3 改造组遍历逻辑：若 `groupTabs` 中任一 tabId 出现在 `activeTabIds`，整组 `continue` 跳过本轮
- [ ] 1.4 改造"组级不活跃判定"为严格 AND：对 `groupTabs` 任意标签页，若 `getLastActivated(id, fallback) <= 0` 或 `now - ts < thresholdMs`，整组 `continue` 跳过；全部满足才进入 `chrome.tabGroups.update`

## 2. spec 同步

- [x] 2.1 已在 `openspec/changes/fix-inactivity-sweep-semantics/specs/inactivity-auto-collapse/spec.md` 中重写"无活动判定"段，明确 AND 语义并新增"组内任一标签页缺数据""豁免活动标签页所在组"两个 Scenario

## 3. 验证

- [ ] 3.1 `node --check background.js` 通过
- [ ] 3.2 `openspec validate fix-inactivity-sweep-semantics --strict` 通过
- [ ] 3.3 手动验证：3 个标签页同组，A 是当前活动，B/C 是 2 小时前打开的 → 阈值 30 分钟时本组不被折叠（A 在 active 集合内）
- [ ] 3.4 手动验证：组内所有标签页都是 1 小时前打开但当前没在看任何页 → 阈值 30 分钟时被折叠
- [ ] 3.5 手动验证：组内一个 1 小时前打开 + 一个刚打开的 → 不折叠（AND 语义）
- [ ] 3.6 手动验证：组内全是 1 小时前打开的，但当前在看其中之一 → 不折叠（活动豁免）
