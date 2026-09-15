# Tab Group Manager — 需求与交付说明

> 本文档整理本次开发迭代中用户提出的所有需求、对应方案、落地情况。
> 涉及分支：`feat/add-inactivity-features`（基于 `develop`）

## 一、产品背景

Tab Group Manager 是一个 Chrome MV3 扩展（`manifest.json` v3），核心能力：

- **自动分组**：根据域名（含通配符映射）将新打开的标签页归入同名标签组
- **标签组管理页**：独立 `manager.html`，提供按窗口分区的批量管理（展开/折叠/排序/解散/关闭）
- **弹窗 `popup.html`**：300px 宽，提供自动分组开关、域名映射管理、标签组树查看与跳转

本次迭代在已有能力上扩展"不活跃感知"与"管理页展示增强"两大主题。

## 二、本次迭代的需求清单

按提需求顺序列出，附问题背景、最终方案、落地 commit。

### 需求 1：不活跃自动折叠标签组

- **用户原话**："增加自动折叠标签，可配置多长时间没活动自动折叠。"
- **背景**：用户希望长期没访问的标签组不再持续占据标签条视野；阈值可配。
- **方案**（`openspec/changes/add-inactivity-features`）：
  - 后台（`background.js`）监听 `chrome.tabs.onActivated` 维护"最近激活时间"表，存于 `chrome.storage.session`（per-session、跨设备不同步）
  - 注册 `chrome.alarms` 周期任务 `inactivity-sweep`（1 分钟），扫描"组内**全部**标签页都超阈值"的组并折叠
  - 弹窗新增"无活动自动折叠"开关 + 阈值（默认 30 分钟，存 `chrome.storage.sync`）
- **落地 commit**：`b5e7071`（spec） + `b0f4364`（实现）
- **后续修复**（commit `4d1657c`）：用户反馈"误折正在用的组"。根因有两处：
  - 实现用"组内最早一次激活时间"判定（实际是 OR 语义），与 spec 的 AND 语义漂移
  - `chrome.tabs.onActivated` 只在切换时触发，长时间停留的标签页不会刷新其最近激活时间
  - **修复**：改为严格 AND 语义 + 豁免当前活动标签页所在组（`chrome.tabs.query({active:true, lastFocusedWindow:true})`）

### 需求 2：manager 页签 URL 列展示增强

- **用户原话**："`chrome-extension://mhfhnbgnpccklngmkohdpkdoocbfilbj/manager.html` 里面右边不要仅展示域名，可以多展示点或者光标悬浮展示整个地址。"
- **背景**：原 `tab-host` 列只显示 hostname，同域名不同路径的标签页在视觉上完全一样。
- **方案**（`openspec/changes/add-inactivity-features/specs/tab-url-display`）：
  - 默认可见文本：仍展示 hostname + 路径首段（前 N 字符 + … 省略）
  - 悬浮 tooltip：标题、完整 URL、最后激活时间
  - 数据源复用"最近激活时间"表（与需求 1 共享）
- **落地 commit**：`b0f4364`（首版）
- **后续迭代**（用户多次调整布局）：
  - `159c59f`：放宽 `.tab-host` 列宽（原 220px 在窄屏下被压扁到 0，路径整段被裁）
  - `e7f536f`：去 hostname，只显示路径首段（hostname 已隐含在组标题）
  - `3bc1fb7`：路径上限与列宽同步翻倍（24→48 字符 / 240→420px）
  - `2dc1c99`：`.tab-item` 改用 `display:grid; grid-template-columns: 24px 1fr 1fr`，让路径列与标题列各占一半内容区

### 需求 3：休眠时间列 + 一键关闭休眠标签页

- **用户原话**："走 openspec 增加一列用于展示休眠时间（多长时间没被唤醒）增加一键关闭一段时间没唤醒界面的按钮。"
- **背景**：用户希望能在 manager 页面一眼看出"哪些标签页是沉睡的"，并能批量关闭它们。
- **方案**（`openspec/changes/add-dormancy-display-and-close`）：
  - **休眠列**：`.tab-item` 改 `grid-template-columns: 24px 1fr 1fr 1fr`，新增 `.tab-dormancy` 列，紧凑格式 `未知 / 刚刚 / Nm / Nh / Nd`
  - **配置**：弹窗新增"自动关闭休眠"独立总开关（默认 `false`，激进操作默认关闭）+ 阈值（默认 60 分钟）
  - **按钮两个位置都给**：顶部工具栏全局"关闭休眠" + 每个组卡片组级"关闭休眠"
  - **判定**：标签页的最近激活时间 < `now - autoCloseAfterMinutes × 60_000` 视为命中；数据完全缺失 ≠ 休眠
  - **二次确认**：原生 `window.confirm`（后续被替换为 in-page dialog，见需求 6）
- **落地 commit**：`b0711b2`（spec） + `722a666`（实现）

### 需求 4：manager 工具栏手动输入阈值关闭休眠

- **用户原话**："我期望增加一个按钮，在 html 界面上，手动输入填写关闭多长时间没活跃的界面。"
- **背景**：现有"关闭休眠"按钮只接受弹窗里固定的 `autoCloseAfterMinutes` 阈值；用户想临时清一波"超过 2 小时没动"的标签页时，必须先改弹窗设置。
- **方案**（`openspec/changes/add-manual-dormancy-close`）：
  - manager 工具栏新增独立 row：数字输入 + 按钮"关闭 >N 分钟未活动"
  - 输入值持久化到 `chrome.storage.sync.manualCloseAfterMinutes`（默认 60）
  - 按钮文案随输入值动态刷新（`关闭 > 120 分钟未活动`）
  - 复用 `runCloseDormantTabs` 内部判定逻辑，但接受外部 `idleThresholdMs` 形参
- **落地 commit**：`58df20f`（spec） + `e4e6fef`（实现）
- **后续调整**（用户决策）：
  - `e699338`：手动按钮**不**受 `autoCloseEnabled` 总开关控制——手动表达意愿的入口与"自动"行为正交
- **已知问题**（commit `41b9d65`）：用户报告"按钮是亮的但点了没反应"。已加 console.log 等用户贴日志后定位根因（怀疑 `window.confirm` 在扩展页内静默吞掉 → 见需求 6 的修复）。

### 需求 5：弹窗"无活动自动折叠"阈值加"保存"按钮

- **用户原话**："还有个问题就是配置的这个休眠时间好像有问题，改下更改确认方式把。" → "就一个报错按钮就行了吧。还要取消干嘛？"
- **背景**：原弹窗输入框在 `change` 事件触发时立即写存储（"输入中的中间值"也会被持久化）。用户希望输入与持久化解耦，加显式确认。
- **方案**（`openspec/changes/add-collapse-save-button`）：
  - 输入框右侧加"保存"按钮；输入框 `input` 事件仅刷新"未保存"标记（按钮文字变 `保存 *` + `.dirty` 高亮）
  - "保存"按钮：校验 → 写存储 → 重置标记
  - **不要"取消"按钮**（用户决定）：撤回由"再修改为新值 + 点保存"承担，避免冗余控件
  - 总开关 checkbox 行为不变（`change` 即写，与"保存"按钮正交）
  - 跨弹窗同步（`storage.onChanged`）仍生效：另一弹窗改保存 → 当前弹窗输入框同步 + dirty 自动清除
- **落地 commit**：`780980b`（spec） + `d7c5154`（实现） + `a4fc4c4`（去掉取消按钮）

### 需求 6：替换 `window.confirm` 为 in-page 二次确认对话框

- **用户原话**："关闭>30 分钟未活动 按钮怎么是灰色的？" → "点了好像没反应呀，时间 2h 的点击关闭没关掉。"
- **背景**：用户报告手动按钮点击无反应。诊断发现 `window.confirm` 在 `chrome-extension://` 内部页里**可能被静默吞掉**——既不弹窗，callback 也不触发。
- **方案**（`openspec/changes/replace-window-confirm-with-inline`）：
  - manager 页面引入原生 `<dialog id="confirm-dialog">` 元素
  - `showConfirmDialog({ title, message, confirmText, danger })` Promise 化 API：返回 `Promise<boolean>`
  - `dialog.showModal()` 模态显示；按钮 click / Esc 关闭分别 resolve true/false
  - 替换 manager 内**所有三处** `window.confirm`：
    - `runCloseDormantTabsWithThreshold`（关闭休眠）
    - `closeGroupTabs`（组级关闭标签页）
    - `closeAllGroupTabs`（全部关闭标签页）
  - 视觉风格：白底圆角卡片 + `::backdrop` 半透明遮罩，与 manager 页面配色统一；危险操作确认按钮加 `.danger` 红色样式
- **落地 commit**：`7743989`（spec） + `6171436`（实现）

## 三、OpenSpec 流程产物

本次迭代所有能力均通过 OpenSpec 评估，每个 change 目录包含：

- `proposal.md`：问题背景、能力边界、影响范围
- `specs/<capability>/spec.md`：场景化规格（Requirement + Scenario）
- `tasks.md`：实现任务拆分

| Change 目录 | 主题 | 状态 |
|---|---|---|
| `add-inactivity-features` | 不活跃自动折叠 + URL 列展示 | 已落地 |
| `fix-inactivity-sweep-semantics` | 修正自动折叠 AND 语义 + 活动豁免 | 已落地（spec 修正了 AND 实现） |
| `add-dormancy-display-and-close` | 休眠时间列 + 一键关闭休眠 | 已落地 |
| `add-manual-dormancy-close` | 工具栏手动输入关闭 | 已落地（按钮不受总开关） |
| `add-collapse-save-button` | 弹窗折叠阈值加保存按钮 | 已落地（仅保存，去掉取消） |
| `replace-window-confirm-with-inline` | 替换 `window.confirm` 为 in-page dialog | 已落地 |

## 四、文件改动总览

| 文件 | 关键改动 |
|---|---|
| `background.js` | `AUTO_COLLAPSE_DEFAULTS` / `AUTO_CLOSE_DEFAULTS` 配置、`lastActivatedByTabId` 时间表（`chrome.storage.session`）、`chrome.alarms` 周期扫描、AND 语义 + 活动豁免 |
| `popup.html` | "无活动自动折叠" + "自动关闭休眠" 两行 toggle-row；后者仅一个"保存"按钮 |
| `popup.js` | `getAutoCollapseConfig` / `saveAutoCollapseConfig` / `getAutoCloseConfig` / `saveAutoCloseConfig` + 跨弹窗同步；"保存"按钮的 dirty 标记 |
| `manager.html` | `<div class="toolbar toolbar-manual">` 独立 row；`.tab-item` grid 四列；`.tab-dormancy` / `.tab-host` / `.tab-host-path` 样式；`<dialog id="confirm-dialog">` 模态 |
| `manager.js` | `lastActivatedCache` 刷新 + `formatDormancy` 紧凑格式；`runCloseDormantTabs` / `runCloseDormantTabsWithThreshold` 拆函数；`executeManualClose` + 手动按钮接线；`showConfirmDialog` 模态 API；`applyButtonStates` 总开关 / dirty 判定 |
| `manifest.json` | 新增 `"alarms"` 权限 |

## 五、已知问题 / 待跟进

### 5.1 手动按钮"点击无反应"（待定位）

- **状态**：commit `41b9d65` 加了 console.log 调试输出，等用户在 DevTools 里跑一次并贴回日志
- **怀疑方向**：
  - `<dialog>` 元素在某些环境被遮住
  - `showModal` 抛错但被 try/catch 静默吞掉
  - 命中集合 `hits` 为空走 `showResult` 但 `result-banner` 被其他元素遮住
  - 用户浏览器加载的还是旧 manager.js（缓存）

### 5.2 自动分组与 `tab.lastAccessed` 的语义歧义

- `tab.lastAccessed` 在 Chrome 不同版本 / 不同标签页类型上取值不一致
- 目前作为"最近激活时间"的回退源（session 表没数据时使用）
- 暂未修复 —— `getLastActivated` 的回退路径在 spec 中已说明"不可靠"

## 六、后续建议

1. **跑手工验收**：按 `tasks.md` 的"验证"小节逐条跑（重点：自动折叠不再误折正用组、in-page dialog 弹出并生效、手动按钮点完真的有反应）
2. **如果调试日志定位到根因**：清理 `41b9d65` 加的 console.log，合并最终修复
3. **考虑 archive 已完成 change**：当前 `add-inactivity-features` 等仍处于"已落地但未 archive"状态；`openspec archive <change>` 可同步主 spec
4. **OpenSpec 主 spec 同步**：当前所有新能力都还在 change 目录里，没合并到 `openspec/specs/` 主目录；后续可一次性 archive 一批
