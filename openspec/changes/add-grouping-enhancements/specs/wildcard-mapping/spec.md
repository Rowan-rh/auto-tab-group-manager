# wildcard-mapping Delta Spec

## Purpose

定义域名映射规则的通配符/后缀匹配语义，使一条 `*.suffix` 规则即可覆盖一个主域下的全部子域，并明确与精确匹配并存时的优先级。

## ADDED Requirements

### Requirement: 通配符规则匹配
映射规则的域名 SHALL 支持 `*.suffix` 形式；该规则 MUST 匹配所有以 `.suffix` 结尾且存在子域前缀的主机名，规则本身的主域（`suffix` 本身）不被该规则匹配。

#### Scenario: 通配符规则覆盖子域
- **WHEN** 已配置 `*.alibaba-inc.com → 内网`，且打开多个 `code.alibaba-inc.com`、`git.alibaba-inc.com` 的标签页
- **THEN** 这些子域标签页均归入标题为"内网"的组

#### Scenario: 通配符不匹配主域本身
- **WHEN** 已配置 `*.alibaba-inc.com → 内网`
- **THEN** 域名恰为 `alibaba-inc.com` 的标签页不被该规则匹配，按无映射处理

### Requirement: 匹配优先级
当多条规则同时命中同一域名时，系统 MUST 按以下优先级取唯一结果：精确匹配优先于通配符匹配；多条通配符均命中时取后缀最长（最具体）的规则。

#### Scenario: 精确匹配优先
- **WHEN** 同时配置 `*.alibaba-inc.com → 内网` 与 `code.alibaba-inc.com → 代码仓库`
- **THEN** `code.alibaba-inc.com` 的标签页归入"代码仓库"组

#### Scenario: 更具体的通配符优先
- **WHEN** 同时配置 `*.alibaba-inc.com → 内网` 与 `*.code.alibaba-inc.com → 代码环境`
- **THEN** `a.code.alibaba-inc.com` 的标签页归入"代码环境"组

### Requirement: 通配符规则的输入校验
添加与导入映射时，系统 SHALL 接受 `*.suffix` 形式的合法域名规则，并拒绝格式非法的通配符（如 `*.` 后为空、`*` 出现在中间）。

#### Scenario: 添加通配符规则
- **WHEN** 用户在弹窗中添加 `*.aliyun-inc.com → 阿里云内网`
- **THEN** 规则保存成功并出现在列表中

#### Scenario: 非法通配符被拒绝
- **WHEN** 用户尝试添加 `*.` 或 `a*b.com` 形式的域名
- **THEN** 系统拒绝保存并提示格式不合法
