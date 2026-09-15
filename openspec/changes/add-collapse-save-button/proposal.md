# Change: 弹窗"无活动自动折叠"阈值加"保存"按钮

## Why

当前弹窗的"无活动自动折叠"分钟数输入框在 `change` 事件触发时立即写 `chrome.storage.sync.autoCollapseAfterMinutes`，并由 `chrome.storage.onChanged` 同步到 manager 页面"关闭 >N 分钟未活动"输入框的"上次值"。问题：

- 用户在输入过程中每次失焦都会立即写入存储，体感是"我还在打字就已经生效"，反馈不直观；
- 输入中"刚刚输错的中间值"也会被持久化（`change` 事件触发时 `value` 可能不是最终值）；
- 想"改回原值"必须真的把数字改回去，不点"取消"或"重置"按钮——而 UI 上也没这种回退入口。

## What Changes

- 弹窗"无活动自动折叠"行的输入框右侧新增一个 **"保存"** 按钮（`id="auto-collapse-save"`）。
- 输入行为改造：
  - 输入框 `input` 事件：仅更新"未保存"标记（如按钮高亮 / 文字变"保存 *"），不写存储；
  - "保存"按钮：校验 + 写存储 + 重置"未保存"标记；
  - 总开关（checkbox）的行为保持不变：仍 `change` 即写存储。
- "未保存"视觉反馈：保存按钮在输入框值与持久化值不一致时显示"保存 *"（加 `.dirty` 高亮），一致时回到"保存"普通样式。
- 不影响 manager 手动输入框的"`chrome.storage.onChanged` 同步"路径——只是触发源变成"点保存"而非"失焦"。

### 假设（已与用户确认）

- 仅改"无活动自动折叠"一行；"自动关闭休眠"行不受影响（用户已确认）。
- 总开关 checkbox 仍 `change` 即写（与加"保存"按钮不冲突：开关是离散二值，无中间态）。
- 弹窗关掉时如果有未保存值**不**自动保存（用户已隐含确认：必须显式点保存才生效）。
- **不需要"取消"按钮**（用户已确认）："保存"按钮本身是确认入口，撤回由"再点一次保存到新值"或"重新输入后保存"承担，避免多一个冗余控件。

## Capabilities

### New Capabilities
- `auto-collapse-save-button`: 弹窗"无活动自动折叠"行的分钟数输入框 + "保存" / "取消" 按钮，输入与持久化解耦。

### Modified Capabilities
（无。`inactivity-auto-collapse` 的 spec 不变——只是弹窗交互细节从"失焦即存"换成"显式保存"。）

## Impact

- `popup.html`：
  - "无活动自动折叠"行的数字输入框后追加一个"保存"按钮；
  - 复用现有 `.mapping-actions` 样式（弹窗"域名映射"区域已有类似按钮组）或新增 `.config-save-row` 样式。
- `popup.js`：
  - 新增模块级变量 `lastSavedCollapseMinutes` 持有当前持久化值；
  - `getAutoCollapseConfig` 加载后写入 `lastSavedCollapseMinutes`；
  - 移除 `autoCollapseMinutesInput.addEventListener('change', ...)`（不再失焦即存）；
  - 新增 `input` 事件：标记"未保存"；
  - 新增"保存"按钮 click：校验 + `saveAutoCollapseConfig` + 重置标记 + 错误提示；
  - 跨弹窗同步 (`chrome.storage.onChanged`) 仍生效：另一弹窗改完 → 当前弹窗输入框同步更新 + 重置标记。
- 弹窗其它逻辑：不变。
- manager / 后台：不变。
- manifest：不变。

## Out of Scope（非目标）

- 不为"自动关闭休眠"行加保存按钮（用户已确认）。
- 不实现"未保存值"全局警告（如离开弹窗时弹"你有未保存的修改"）。
- 不为开关 checkbox 加保存按钮（总开关是离散二值，无中间态）。
- 不修改跨弹窗同步逻辑。
