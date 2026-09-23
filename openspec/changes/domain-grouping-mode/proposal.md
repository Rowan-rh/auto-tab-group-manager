# Change: 按主域名分组并支持旧分组方式

## Why

默认按完整主机名分组会把 `www.bilibili.com` 和 `search.bilibili.com` 拆成两个标签组。用户希望同一可注册域名下的站点归入一组，同时保留旧方式供需要按子域名区分的用户选择。

## What Changes

- 默认按可注册域名分组，例如 `www.bilibili.com` 与 `search.bilibili.com` 都归为 `bilibili.com`。
- 在弹窗设置栏增加分组方式选项，支持在按主域名与按完整主机名之间切换，并将选择同步保存。
- 域名映射继续优先于默认分组方式；自动分组和手动重新整理使用同一解析逻辑。

## Capabilities

### New Capabilities
- `domain-grouping-mode`: 域名分组方式的默认行为、设置持久化与分组标题解析。

## Impact

- `common.js`：提供共享的可注册域名解析与组标题解析。
- `background.js`：自动分组按持久化模式解析标题。
- `popup.html` / `popup.js`：增加分组选项并在手动整理时应用所选模式。
