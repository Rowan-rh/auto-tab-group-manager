# Tasks: 分组易用性增强

## 1. 通配符/后缀匹配

- [x] 1.1 `popup.js` / `background.js`：`resolveGroupTitleSync` 改造——精确匹配优先，其次通配符按后缀长度取最具体
- [x] 1.2 `popup.js`：添加映射与导入解析的域名校验放通 `*.suffix` 形式（`DOMAIN_PATTERN` 调整）

## 2. 自动分组总开关

- [x] 2.1 `popup.html` 新增"自动分组"开关行
- [x] 2.2 `popup.js`：加载开关状态、变更时持久化到 `chrome.storage.sync`
- [x] 2.3 `background.js`：`groupTab` 入口检查开关，关闭时直接返回

## 3. 弹窗点击跳转

- [x] 3.1 `popup.js`：标签页条目可点击——激活标签页 + 聚焦所在窗口 + 关闭弹窗；关闭按钮阻止冒泡不触发跳转

## 4. 验证

- [x] 4.1 `node --check` 三个 JS 文件通过；`openspec validate add-grouping-enhancements --strict` 通过
- [x] 4.2 单测：通配符匹配优先级（精确 > 最长后缀；主域本身不匹配）
- [ ] 4.3 手工验证：三个特性的实际浏览器行为
