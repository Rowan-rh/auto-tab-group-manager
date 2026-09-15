# tab-url-display Delta Spec

## Purpose

`manager.html` 标签组卡片右侧域名列（`.tab-host`）当前仅展示 `hostname`，同域名不同路径的标签页在视觉上完全一致，无法在管理页一眼区分。本能力在保持紧凑布局的前提下扩展该列：可见信息新增"路径首段"用于一眼区分同域名，悬浮提示扩展为包含完整 URL 与最后激活时间。

## ADDED Requirements

### Requirement: 域名列可见内容

`.tab-host` 元素 SHALL 仅展示 `tab.url` 的"路径首段"：`pathname + search` 非空时 MUST 展示其前 48 字符（不足则全展示），超过 MUST 以 `…` 截断省略；`pathname + search` 为空或仅为 `/` 时 MUST 留空、不显示占位文本。`hostname` 信息由组标题和 `tab-title` 间接表达，`.tab-host` 不再重复展示。

#### Scenario: 同域名不同路径可区分
- **WHEN** 同属一组的两个标签页分别为 `https://code.alibaba-inc.com/repo/list` 与 `https://code.alibaba-inc.com/settings/profile`
- **THEN** 两行 `.tab-host` 的路径首段分别为 `/repo/list` 与 `/settings/profile`，肉眼可一眼区分

#### Scenario: 根路径或无路径
- **WHEN** 标签页 URL 为 `https://example.com/` 或 `https://example.com`
- **THEN** `.tab-host` 不显示占位文本（留空），避免与 `tab-title` 信息冗余

#### Scenario: 超长路径截断
- **WHEN** 标签页 URL 的 `pathname + search` 长度为 80 字符
- **THEN** `.tab-host` 路径首段展示其前 48 字符加 `…`，省略号作为截断标记

### Requirement: 悬浮提示内容

`.tab-item` 的 `title` 属性 MUST 包含三行文本，依次为：标签页标题（或 `(无标题)`）、完整 URL（`tab.url` 原值）、最后激活时间的本地化展示（例如 `最后激活：3 分钟前`；数据不可用时显示 `最后激活：未知`）。

#### Scenario: 悬浮查看完整 URL
- **WHEN** 用户将光标悬停在任一标签页条目上
- **THEN** 浏览器原生 tooltip 显示完整 URL（含 query string），不再因列宽受限而只能看到 hostname

#### Scenario: 悬浮查看最后激活时间
- **WHEN** 用户将光标悬停在标签页条目上
- **THEN** tooltip 第三行展示该标签页的相对最后激活时间（如"最后激活：12 分钟前"），便于结合"无活动自动折叠"规则人工判断

### Requirement: 数据来源与缺省

路径首段 MUST 来自 `tab.url` 的 `URL` 解析；最后激活时间 MUST 优先来自扩展后台记录的最近激活时间（详见 `inactivity-auto-collapse` 能力），不可用时回落为 `tab.lastAccessed`（转换为相对时间），仍不可用时显示 `未知`。数据来源变更 MUST 不影响列的可见文本布局。

#### Scenario: 后台无最近激活时间记录
- **WHEN** 一个新标签页加入组、后台尚未来得及记录其最近激活时间
- **THEN** 悬浮提示显示 `最后激活：未知`（而非抛出错误或留空），`.tab-host` 仍正常展示

#### Scenario: URL 解析异常
- **WHEN** `tab.url` 不能被 `new URL()` 解析
- **THEN** `.tab-host` 显示空字符串，悬浮提示的 URL 行保留 `tab.url` 原值；不向用户暴露错误

### Requirement: 与既有布局的兼容

`.tab-item` MUST 使用 `display: grid; grid-template-columns: 24px 1fr 1fr` 布局（序号 / 标题 / 路径三列等分剩余空间，路径列与标题列各占 `.tab-item` 内容区宽度的一半）。`.tab-host` 列 MUST 使用与 `tab-title` 区分度足够的浅灰小字（如 `color:#9aa0a6; font-size:11px`）并左对齐（`text-align: left`），保持文本省略规则（`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`）。

#### Scenario: 路径列占整行一半
- **WHEN** 任意 `.tab-item` 渲染完成
- **THEN** `.tab-host` 列的可用宽度约等于 `.tab-title` 列的可用宽度（各占一半）

#### Scenario: 长路径不撑破列宽
- **WHEN** `.tab-host` 路径首段文本长度超过该列可用宽度
- **THEN** 路径首段尾部按列宽省略，显示 `…`
