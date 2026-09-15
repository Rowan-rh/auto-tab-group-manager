# agent.md — Tab Group Manager 开发规范与约束

> 本文件为 AI Agent 和开发者提供开发行为约束，所有代码变更必须遵守以下规则。

---

## 1. Git 分支规范（🔴 强制）

### 1.1 主分支与长期分支

- **`main` 是远程受保护分支，仅承担对外发布**，**禁止任何开发者直接 `push` 到 `main`**，也不允许在本地直接 `commit`/`merge` 后再强推。所有变更必须以 PR/MR 方式通过评审后才能在远程合入。
- **`develop` 是集成分支**，开发者把完成评审的工作分支合并到这里，再由维护者从 `develop` 提 PR 到 `main`。
- **`main`/`develop` 都是不允许直接 `push` 的远程保护分支**；本地只允许切出工作分支，或在本地通过 PR review flow 准备好改动后推送。

### 1.2 工作分支前缀

不同目的的开发工作必须在对应的分支目录下创建新分支，前缀规定如下：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat/` | 新功能开发 | `feat/add-domain-mapping` |
| `fix/` | Bug 修复 | `fix/tab-drag-group-error` |
| `refactor/` | 代码重构（不改变外部行为） | `refactor/extract-mapping-storage` |
| `chore/` | 工程化/依赖/构建 | `chore/update-openspec` |
| `docs/` | 文档变更 | `docs/add-contributing-guide` |
| `test/` | 测试相关 | `test/add-mapping-parser-coverage` |
| `ci/` | CI/CD 相关 | `ci/add-lint-pr-check` |

**命名规则：**
- 前缀后跟短横线分隔的小写英文描述
- 总长度不超过 80 字符
- 示例：`fix/tab-edit-retry-window` ✅ 、 `fix_bug` ❌

### 1.3 分支创建与合并流程

开发 → 评审 → 合入 `develop` → 维护者从 `develop` 推 `main`：

```text
1. git fetch origin
2. git checkout -b <prefix>/<description> origin/develop
3. 开发 + 提交
4. git push -u origin <prefix>/<description>
5. 创建 PR 到 develop（项目默认 base 分支）
6. 通过 Code Review 后合并到 develop
7. 维护者从 develop 创建/更新 PR 到 main，准备发布
```

**禁止项：**
- 直接 `git push` 到 `main` 或 `develop` —— 都会被远程保护分支拒绝；
- 在 `main` 上直接 `git commit`、`git merge` 后再强推 —— 远程分支是 SSOT，强行改写会与团队协作者冲突；
- 未经评审合并任何分支到 `develop`/`main`。

**提交信息规则：**
- 提交标题使用中文，采用 `<类型>: <简明说明>` 格式，例如：`fix: 修复标签拖动期间的分组报错`、`docs: 增加贡献指南`。
- 标题不超过 80 个字符；必要的技术标识、代码符号和产品名可保留英文。
- 一次提交只表达一个可独立审查的变更意图。

### 1.4 操作速查表

| 操作 | 允许 | 说明 |
|------|------|------|
| 在工作分支上 `git commit` | ✅ 允许 | 工作分支可自由提交 |
| 在工作分支上 `git push` | ✅ 允许 | 推送远程工作分支 |
| 直接 `git push` 到 `develop`/`main` | ❌ 禁止 | 远程保护分支，必须走 PR |
| 本地在 `main` 上直接 `commit`/`merge` 后强推 | ❌ 禁止 | 会与远程 SSOT 冲突并丢失评审记录 |
| `git push --force` 到 `develop`/`main` | ❌ 严格禁止 | |
| 直接 `git merge` 到 `main` | ❌ 禁止 | 必须通过 PR/MR |
| 将功能分支 `merge` 到 `main`（PR 方式） | ✅ 允许 | Review 通过后方可合入 |
| 在 `main` 上直接 `git commit` | ❌ 禁止 | 任何修改必须走分支流程 |

---

## 2. 代码规范

### 2.1 编码风格

- **技术栈:** Chrome 扩展（Manifest V3），原生 JavaScript，无构建工具
- **命名风格:** 函数/变量使用 `camelCase`；模块级常量使用 `UPPER_SNAKE_CASE`（如 `DOMAIN_PATTERN`）
- **注释:** 关键逻辑使用中文注释，与现有代码保持一致
- **异步:** Chrome API 统一使用 Promise 形式（`await`），标签编辑类操作必须包裹 `retryAsyncOperation` 重试

### 2.2 模块职责

| 文件 | 职责 | 禁止 |
|------|------|------|
| `manifest.json` | 权限与扩展元信息 | 不可引入超出功能需要的权限 |
| `background.js` | 后台分组逻辑、事件监听、映射解析 | 不可操作 DOM |
| `popup.html` | 弹窗结构与样式 | 不可内联脚本 |
| `popup.js` | 弹窗交互、配置管理 UI、手动整理 | 不可复制 background 的自动分组逻辑，公共逻辑需保持两处同步 |

### 2.3 错误处理与安全

- `chrome.tabs.group`/`ungroup`/`tabGroups.update` 等可能因用户拖动标签页失败的操作必须走重试，且重试耗尽后降级为 `console.warn`，不向用户抛错
- JSON 解析（如导入映射文件）必须包裹 `try/catch`，失败时给出友好提示且不改变现有数据
- 用户输入（域名、标签名、导入文件）必须校验后才可持久化
- 凭据、Token 等敏感信息禁止写入代码、提交信息或配置文件

---

## 3. 项目资产维护

### 3.1 OpenSpec 同步

- 功能行为变更必须走 OpenSpec 流程：`openspec/changes/<change-name>/` 下维护 proposal、spec delta 与 tasks
- 行为类变更禁止零 delta 提交（除非显式 `skip_specs`）
- 变更完成并验证后执行 `openspec archive <change-name>` 归档为主 spec

### 3.2 版本号管理

- 版本号维护在 `manifest.json` 的 `version` 字段
- 每次对外发布前递增版本号

---

## 4. 禁止事项

| 禁止 | 原因 |
|------|------|
| 在代码或提交信息中存储凭据、密码、Token | 安全红线 |
| 提交包含本地绝对路径的配置 | 影响可移植性 |
| 未经校验直接持久化用户输入或导入文件内容 | 污染 `chrome.storage.sync` 并同步到所有设备 |
| 绕过重试直接调用标签编辑 API | 用户拖动标签页时必然报错 |
| 提交前不验证 JS 语法（`node --check`）与 `openspec validate` | 防止引入语法错误与规范漂移 |

---

## 5. PR 合入检查清单

合入前，逐项确认：

- [ ] 分支命名符合 `前缀/描述` 格式
- [ ] 提交信息符合 `<类型>: <中文简明说明>` 格式
- [ ] OpenSpec 变更产物（proposal/specs/tasks）已同步，`openspec validate` 通过
- [ ] `manifest.json` 权限无多余项，版本号按需递增
- [ ] 新增 JS 文件通过 `node --check` 语法检查
- [ ] 标签编辑类 API 调用已包裹重试逻辑
- [ ] 用户输入与导入文件有校验，JSON 解析有异常处理
- [ ] 无凭据、密码、Token 等敏感信息进入提交
