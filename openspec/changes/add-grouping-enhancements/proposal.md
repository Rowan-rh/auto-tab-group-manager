# Change: 分组易用性增强（通配符匹配 / 自动分组总开关 / 弹窗跳转）

## Why

1. 精确域名匹配下，覆盖一个内网域名的所有子域需要配置 N 条规则，维护成本高；
2. 扩展无法临时暂停自动分组，会议、演示等场景下会被动打乱标签条；
3. 弹窗标签组树只能查看和关闭，不能点击跳转，无法作为标签页导航器使用。

## What Changes

- **通配符/后缀匹配**：映射规则的域名支持 `*.suffix` 形式（如 `*.alibaba-inc.com → 内网`），匹配该后缀的所有子域；精确匹配优先于通配符匹配，多个通配符命中时取后缀最长（最具体）的规则；添加与导入入口同步放开通配符格式校验。
- **自动分组总开关**：弹窗提供"自动分组"开关，持久化存储；关闭后后台不再自动分组，手动"重新整理"/"排序"不受影响。
- **弹窗点击跳转**：弹窗标签组树中的标签页条目可点击，激活该标签页并聚焦其所在窗口。

## Capabilities

### New Capabilities
- `wildcard-mapping`: 映射规则的通配符/后缀匹配语义与优先级规则。
- `auto-grouping-toggle`: 自动分组总开关的交互与持久化行为。
- `tab-jump`: 弹窗标签组树中点击标签页跳转激活的行为。

### Modified Capabilities
（无）

## Impact

- `background.js`：`groupTab` 增加总开关检查；`resolveGroupTitleSync` 支持通配符解析。
- `popup.js`：域名校验正则放开通配符；导入解析复用同一校验；`resolveGroupTitleSync` 同步改造；新增开关 UI 逻辑；标签树条目增加点击跳转。
- `popup.html`：新增"自动分组"开关行。
- 两处 `resolveGroupTitleSync` 为平行实现，按 AGENT.md 约束保持同步。
