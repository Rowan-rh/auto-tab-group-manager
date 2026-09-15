# Change: 休眠时间列展示 & 一键关闭休眠标签页

## Why

1. `manager.html` 当前只展示 tab.title + 路径首段，无法一眼看出"这条标签页我有多久没碰过"；用户需要一列"休眠时间"辅助判断；
2. 既然能自动折叠、也能显示休眠时间，就应该让用户能进一步"一键关闭"长时间没被唤醒的标签页，把标签条彻底清理出来。

## What Changes

- **新增能力 1 — 休眠时间列**（`dormancy-column`）：在 `manager.html` `.tab-item` 增加一列"休眠"（`.tab-dormancy`），展示"距离最后一次被激活已经多久"的相对时间（如 `12 分钟前`、`3 小时前`、`2 天前`、`未知`），复用现有 `chrome.storage.session.lastActivatedAt` 数据源。列宽与 `tab-host` 一致、与 `tab-title` 同样可省略。
- **新增能力 2 — 一键关闭休眠标签页**（`close-dormant-tabs`）：
  - 弹窗新增独立阈值 `autoCloseAfterMinutes`（默认 `60`，最小 `1`）与总开关 `autoCloseEnabled`（默认 `false`——比自动折叠更激进，默认关闭更稳）。两组配置（自动折叠 / 自动关闭）在弹窗中分两个 toggle-row 呈现。
  - manager 顶部工具栏新增全局按钮 **"关闭休眠"**；每个组卡片操作行也新增同名按钮 **"关闭休眠"**（组级）。两个入口共用 `runCloseDormantTabs(targetGroupId)` 实现，仅作用范围不同。
  - "休眠标签页"判定：标签页的最后激活时间 < `now - autoCloseAfterMinutes * 60_000`，或该标签页的最近激活时间数据完全缺失（`未知`）超过阈值。
  - 总开关 `autoCloseEnabled=false` 时两个按钮**直接禁用并提示**（`disabled` + `title` 解释原因），不发起任何 `chrome.tabs.remove`。
  - 删除标签页后，后台 `lastActivatedByTabId` 中的对应条目由现有 `chrome.tabs.onRemoved` 监听清理（已有能力，本轮不重写）。
  - 不动组结构（不拆组、不改组标题/颜色），与现有"关闭组内标签页"按钮语义一致。

### 假设（已与用户确认）

- 休眠时间口径 = `chrome.tabs.onActivated` 记录时间（与 `inactivity-auto-collapse` 同源；用户已确认）。
- "一段时间没被唤醒"使用独立阈值 `autoCloseAfterMinutes`（用户已确认），不复用自动折叠阈值。
- 按钮两个位置都给：顶部工具栏全局按钮 + 组卡片组级按钮（用户已确认）。
- 关闭动作仅 `chrome.tabs.remove` 标签页，不拆组（用户已确认）。

## Capabilities

### New Capabilities
- `dormancy-column`: manager 页面标签页条目新增"休眠"列，展示与 `inactivity-auto-collapse` 同源的最近激活时间相对展示。
- `close-dormant-tabs`: 弹窗新增"自动关闭休眠"总开关与独立阈值；manager 顶部工具栏与组卡片各加一个"关闭休眠"按钮，按阈值批量 `chrome.tabs.remove` 命中标签页，二次确认后执行。

### Modified Capabilities
（无。休眠时间列与现有 `tab-url-display` / `inactivity-auto-collapse` 的展示字段正交；关闭按钮是新增交互，不改既有批量按钮语义。）

## Impact

- `background.js`：复用现有 `lastActivatedByTabId` + `chrome.storage.session` 通道；`recordActivation` / `getLastActivated` 不动。`runInactivitySweep` 不动。新增 `getAutoCloseConfig()`（与 `getAutoCollapseConfig` 同结构，缺省 `{ enabled:false, minutes:60 }`）。
- `popup.html`：在已有"无活动自动折叠"行后新增一个 toggle-row（"自动关闭休眠" + 数字输入"分钟"）+ 错误提示。
- `popup.js`：新增 `getAutoCloseConfig` / `saveAutoCloseConfig`；事件监听与跨弹窗同步（与 autoCollapse 同模式）。
- `manager.html`：
  - `.tab-item` 改为 `grid-template-columns: 24px 1fr 1fr 1fr`（标题 / 路径 / 休眠三列各占剩余空间的 1/3）。
  - 工具栏新增 `<button data-action="close-dormant">关闭休眠</button>`。
  - 组卡片操作行新增 `<button data-action="close-dormant-group">关闭休眠</button>`。
- `manager.js`：
  - `buildTabItem` 渲染休眠列；列内容用 `relativeActivated(tab)`（与 tooltip 同源），但精度从"未知/刚刚/分钟/小时/天"压缩到单行可读形式：`未知 / 刚刚 / Nm / Nh / Nd`。
  - 新增 `runCloseDormantTabs(targetGroupId)`：读取 `autoCloseAfterMinutes` 与 `autoCloseEnabled`；总开关关闭直接 toast 提示后返回；按"目标范围"过滤 tabIds（`targetGroupId` 为 `null` 表示全部组）；计算 `idleThresholdMs = minutes * 60_000`；按 `lastActivatedByTabId.get(id) ?? tab.lastAccessed` 取最近激活时间；满足 `now - ts >= idleThresholdMs` 或 `ts <= 0` 视为命中；列出"组名 / 标签页标题"预览，要求 `window.confirm` 二次确认；逐组 `chrome.tabs.remove(ids)` 串行调用，失败项累积。
  - 工具栏 / 组级按钮的 `data-action` 走既有 `globalHandlers`（顶部）或 `makeButton`（组级）注册。
- `common.js`：无变更。

## Out of Scope（非目标）

- 不做"按上次访问/最后活跃分组"等更细粒度排序（属展示增强，与关闭动作解耦）。
- 不把休眠时间暴露到 popup 标签组树（只动 manager 页面）。
- 不增加"立即关闭所有"按钮（与现有"全部关闭标签页"职责重叠）。
- 不实现"关闭后撤销"——Chrome 标签页关闭本身有 `Ctrl+Shift+T` 撤销，不重复造轮子。
- 不为不同的组分别配置休眠阈值。
- 不调整现有"无活动自动折叠"的能力边界——本轮只新增"自动关闭休眠"作为更激进的策略。
