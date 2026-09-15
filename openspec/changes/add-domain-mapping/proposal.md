# Change: 增加域名映射功能

## Why

当前扩展直接使用域名作为标签组标题（如 `code.alibaba-inc.com`），组名冗长且缺乏语义。用户希望能够自定义"域名 → 标签名"的映射（例如把 `code.alibaba-inc.com` 映射为"代码仓库"），让标签组以更有意义的名称呈现，并支持多个域名归入同一个标签。

## What Changes

- 新增域名映射配置能力：用户可在扩展弹窗（popup）中以表单方式增删"域名 → 标签名"映射规则。
- 分组逻辑变更：`background.js` 与 `popup.js` 中的分组逻辑在确定组标题时，优先查询映射配置；命中映射的域名使用映射的标签名作为组标题，未命中的域名保持现状（直接用域名）。
- 多个域名可映射到同一个标签名，这些域名的标签页归入同一个组。
- 新增策略导出/导入能力：用户可将全部映射规则导出为 JSON 文件，也可从 JSON 文件导入规则（合并覆盖同名域名），便于备份与跨设备迁移。
- 分组限定在标签页所在窗口内进行，多窗口各自独立成组，避免跨窗口归组报错。
- 组颜色由标题确定性派生，同名组重建后颜色保持稳定。
- `manifest.json` 增加 `storage` 权限，映射配置持久化到 `chrome.storage.sync`。
- "重新整理所有标签页"按钮同样遵循映射规则。

## Capabilities

### New Capabilities
- `domain-mapping`: 域名到标签组名称的映射配置管理（增删、持久化、JSON 导出/导入）及分组时的映射解析逻辑。

### Modified Capabilities
（无 —— 项目当前尚无已归档的 spec，分组行为首次以 spec 形式随本变更沉淀在 `domain-mapping` 能力中。）

## Impact

- `manifest.json`：permissions 增加 `storage`。
- `popup.html` / `popup.js`：新增映射配置 UI（列表展示 + 添加/删除表单），以及导出/导入按钮与文件选择器。
- `background.js`：`groupTab` 中组标题解析逻辑改为"映射优先，域名兜底"。
- `popup.js`：`organize` 整理逻辑同步改造。
- 不涉及新增依赖，无 breaking change（无映射配置时行为与现状完全一致）。
