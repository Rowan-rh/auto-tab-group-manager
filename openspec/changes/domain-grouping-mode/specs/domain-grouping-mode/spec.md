# domain-grouping-mode Specification

## Purpose

让标签页默认按可注册域名归组，并允许用户切回按完整主机名分组。

## ADDED Requirements

### Requirement: 按可注册域名分组

系统 SHALL 默认使用可注册域名作为未命中域名映射时的标签组标题。来自同一可注册域名的子域标签页 MUST 归入同一组。

#### Scenario: 同一主域名下的子域归为一组

- **WHEN** 有 `www.bilibili.com` 与 `search.bilibili.com` 两个标签页，且没有命中的域名映射
- **THEN** 两个标签页均以 `bilibili.com` 作为标签组标题

#### Scenario: 双标签公共后缀保留可注册域名

- **WHEN** 标签页域名是 `www.example.co.uk`
- **THEN** 按主域名模式分组时标题为 `example.co.uk`

### Requirement: 可选择旧分组方式

弹窗 SHALL 提供按主域名和按完整主机名两种分组方式。新安装或尚无设置值时 MUST 默认选择按主域名；用户选择 MUST 保存到同步设置。

#### Scenario: 选择完整主机名

- **WHEN** 用户选择按完整域名分组
- **THEN** `www.bilibili.com` 与 `search.bilibili.com` 分别以各自完整主机名作为组标题
- **AND** 设置重新打开或在其他设备同步后仍显示此选项

### Requirement: 所有分组入口使用所选方式

自动分组与手动重新整理 MUST 使用相同的当前分组方式。域名映射命中时 MUST 继续使用映射标签作为组标题，优先级高于分组方式。

#### Scenario: 设置后手动整理现有标签页

- **WHEN** 用户选择按主域名并执行“重新整理所有标签页”
- **THEN** 同一可注册域名的标签页按该设置归入同一组

#### Scenario: 映射规则覆盖默认分组标题

- **WHEN** 子域名命中现有域名映射
- **THEN** 标签组标题使用映射标签
