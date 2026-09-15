# dormancy-column Delta Spec

## Purpose

为 `manager.html` 每个标签页条目新增"休眠"列，展示与 `inactivity-auto-collapse` 能力同源的"距离最后激活已经多久"，让用户在批量管理时一眼看出哪些标签页是"沉睡的、可清理的"。

## ADDED Requirements

### Requirement: 休眠列可见内容

`.tab-item` SHALL 在 `tab-title` 与 `tab-host` 之后增加第三个文本列 `.tab-dormancy`，展示该标签页最近一次被激活的相对时间。`相对时间` MUST 按以下规则展示：

- 标签页从未被 `chrome.tabs.onActivated` 命中且 `tab.lastAccessed` 不可得：展示 `未知`。
- 距离最后激活 < 1 分钟：展示 `刚刚`。
- 距离最后激活 ≥ 1 分钟且 < 1 小时：展示 `Nm`（N 为整数分钟数）。
- 距离最后激活 ≥ 1 小时且 < 24 小时：展示 `Nh`。
- 距离最后激活 ≥ 24 小时：展示 `Nd`（N 为整数天数）。

#### Scenario: 刚刚访问过的标签页
- **WHEN** 标签页 T 在 5 秒前被 `chrome.tabs.onActivated` 命中
- **THEN** T 的 `.tab-dormancy` 列展示 `刚刚`

#### Scenario: 半小时前访问过的标签页
- **WHEN** 标签页 T 的最后激活时间距现在 30 分钟
- **THEN** T 的 `.tab-dormancy` 列展示 `30m`

#### Scenario: 沉睡 3 天的标签页
- **WHEN** 标签页 T 的最后激活时间距现在 3 天
- **THEN** T 的 `.tab-dormancy` 列展示 `3d`

#### Scenario: 后台无任何记录
- **WHEN** 标签页 T 从未触发 `chrome.tabs.onActivated` 且 `tab.lastAccessed` 为 0
- **THEN** T 的 `.tab-dormancy` 列展示 `未知`，不抛错

### Requirement: 数据来源

`.tab-dormancy` 列的"最后激活时间" MUST 优先从 `chrome.storage.session.lastActivatedAt`（`inactivity-auto-collapse` 能力维护）读取；该值不可得时回落为 `tab.lastAccessed`；仍不可得时显示 `未知`。数据来源变更 MUST NOT 影响列布局或样式。

#### Scenario: 后台已记录、值变化
- **WHEN** 后台在最近一次 `recordActivation` 写入了标签页 T 的新时间戳
- **THEN** 下一次 `manager.html` 渲染时 T 的 `.tab-dormancy` 文本同步刷新

#### Scenario: storage.session 不可用
- **WHEN** 当前环境 `chrome.storage.session` 抛错
- **THEN** T 的 `.tab-dormancy` 回落为 `tab.lastAccessed` 推导或 `未知`，不向用户暴露错误

### Requirement: 与既有布局的兼容

`.tab-item` MUST 在原有 `24px 1fr 1fr`（序号 / 标题 / 路径）布局基础上扩展为 `24px 1fr 1fr 1fr`（序号 / 标题 / 路径 / 休眠），三列文字各占剩余空间的 1/3。`.tab-dormancy` 列 MUST 使用与 `.tab-host` 一致的浅灰小字（`color:#9aa0a6; font-size:11px`）并保持文本省略规则（`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`）。

#### Scenario: 表格四列等分
- **WHEN** 任意 `.tab-item` 渲染完成
- **THEN** 标题 / 路径 / 休眠三列可用宽度大致相同（去除 24px 序号列后三等分）

#### Scenario: 文本超长被省略
- **WHEN** 路径或休眠列文本超过该列可用宽度
- **THEN** 该列尾部按列宽省略，显示 `…`，不撑破布局

#### Scenario: 既有 24px 序号列不受影响
- **WHEN** 新增休眠列后
- **THEN** 序号列仍为 24px 右对齐，不变
