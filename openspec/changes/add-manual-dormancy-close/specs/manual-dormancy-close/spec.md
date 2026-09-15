# manual-dormancy-close Delta Spec

## Purpose

为 `manager.html` 工具栏新增一个"输入 N 分钟 → 一键关闭超过 N 分钟没被唤醒的标签页"的临时入口，复用现有 `runCloseDormantTabs` 判定逻辑，但阈值由用户当场输入，受 `autoCloseEnabled` 总开关控制，输入值持久化。

## ADDED Requirements

### Requirement: 工具栏独立 row

`manager.html` SHALL 在现有工具栏 `<div class="toolbar">` 之后新增一个独立 `<div class="toolbar toolbar-manual">`，包含小标题"手动关闭休眠"、`<input type="number" id="manual-close-minutes" min="1" step="1">`、`<span>分钟未活动</span>`、`<button data-action="manual-close-dormant">关闭 >N 分钟未活动</button>`，且按钮文案 MUST 随输入值动态变化（如输入 `120` 时显示"关闭 > 120 分钟未活动"）。

#### Scenario: 页面首次打开
- **WHEN** 用户打开 manager 页面
- **THEN** 工具栏下方出现一行"手动关闭休眠" + 输入框（预填上次使用值或默认 `60`）+ "分钟未活动" + 按钮"关闭 > 60 分钟未活动"

#### Scenario: 按钮文案跟随输入变化
- **WHEN** 用户在输入框输入 `30`
- **THEN** 按钮文案立刻变为"关闭 > 30 分钟未活动"

#### Scenario: 输入非法值被拒
- **WHEN** 用户在输入框输入 `0` / 负数 / 非数字
- **THEN** 输入被拒绝（恢复为上次合法值），按钮文案维持原值；输入框旁红字提示"请输入大于等于 1 的整数分钟数"

### Requirement: 输入值持久化

`manager.js` SHALL 在 `chrome.storage.sync` 中持久化 `manualCloseAfterMinutes`（正整数分钟数，默认 `60`，最小 `1`）。当该值变更时 MUST 在不重启扩展的前提下对所有已打开的 manager 标签页同步。

#### Scenario: 首次安装
- **WHEN** 用户首次打开 manager 页面
- **THEN** `manualCloseAfterMinutes` 取 `60`，输入框预填 `60`

#### Scenario: 跨页面同步
- **WHEN** manager A 修改输入值为 `120`、manager B 也已打开
- **THEN** manager B 的输入框与按钮文案在 `storage.onChanged` 触发后同步为 `120`

### Requirement: 启用条件（不受总开关控制）

按钮 MUST 仅在输入框值为合法正整数（≥ 1）时可点击；输入框为空、非法值时被 `disabled`。该按钮 MUST NOT 受 `autoCloseEnabled` 总开关控制——"总开关"管的是后台"自动"行为（顶部 / 组级"关闭休眠"按钮、未来的自动扫描），而"关闭 >N 分钟未活动"是用户在 manager 页面**主动、明确**的一次性操作，已通过输入框表达了具体意愿，与总开关正交。

#### Scenario: 总开关关闭时按钮仍可用
- **WHEN** `autoCloseEnabled` 为 `false`
- **THEN** 工具栏独立 row 的"关闭 >N 分钟未活动"按钮 MUST NOT 被 `disabled`（前提是输入框值为合法正整数）

#### Scenario: 输入框为空或非法值时禁用
- **WHEN** 输入框为空、`0`、负数或非数字
- **THEN** 按钮 `disabled`，`title` 提示"请输入大于等于 1 的整数分钟数"

### Requirement: 执行关闭动作

点击按钮 MUST 按"输入框值 × 60_000 毫秒"为阈值，复用 `runCloseDormantTabs` 内部判定逻辑（最近激活时间 < `now - threshold` 视为命中），二次确认后批量 `chrome.tabs.remove`，失败项累积到结果条，不动组结构、不拆组。

#### Scenario: 输入 120 → 关闭超过 2 小时未活动
- **WHEN** 输入框值 `120`，组内有 2 个标签页最后激活时间分别为 90 分钟前与 150 分钟前
- **THEN** 二次确认文案展示 `N=2`，确认后仅删除 150 分钟前那 1 个，90 分钟前的 MUST NOT 被关闭

#### Scenario: 无命中时直接提示
- **WHEN** 输入框值 `120`，没有标签页超过 2 小时未活动
- **THEN** 点击按钮 → 不展示确认框，结果条提示"没有休眠标签页可关闭"

#### Scenario: 输入框为空
- **WHEN** 输入框为空字符串或被清空
- **THEN** 按钮 MUST 处于 `disabled` 态，避免以 NaN 阈值误判

### Requirement: 与既有"关闭休眠"按钮的差异

新按钮的阈值 MUST 取自输入框 `manualCloseAfterMinutes`，不取自弹窗的 `autoCloseAfterMinutes`；其他行为（命中判定、二次确认、预览、失败聚合、不动组结构）与现有"关闭休眠"按钮 MUST 保持一致。

#### Scenario: 弹窗阈值与输入框不同步
- **WHEN** 弹窗 `autoCloseAfterMinutes` 为 `60`、输入框为 `180`
- **THEN** 点击新按钮按 `180` 分钟执行；点击现有"关闭休眠"按钮按 `60` 分钟执行；两者独立
