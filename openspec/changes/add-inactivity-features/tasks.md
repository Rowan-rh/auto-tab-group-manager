# Tasks: 不活跃自动折叠 & 管理页签 URL 列展示增强

## 1. 自动折叠配置持久化

- [ ] 1.1 在 `popup.js` 顶部新增默认值与读写工具：`AUTO_COLLAPSE_DEFAULTS = { enabled: true, minutes: 30 }`、`getAutoCollapseConfig()`、`saveAutoCollapseConfig(cfg)`（写入 `chrome.storage.sync.set({ autoCollapseEnabled, autoCollapseAfterMinutes })`）
- [ ] 1.2 在 `popup.js` 中订阅 `chrome.storage.onChanged`，当 `autoCollapseEnabled` 或 `autoCollapseAfterMinutes` 变化时同步刷新弹窗对应控件（避免多弹窗场景下不同步）

## 2. 弹窗交互

- [ ] 2.1 `popup.html` 在既有 `.toggle-row`（自动分组）后新增一行 `<label class="toggle-row">` 含 checkbox `#auto-collapse-toggle` 与文本"无活动自动折叠"；同一行末尾新增 `<input type="number" id="auto-collapse-minutes" min="1" step="1" style="width:60px;margin-left:8px">` 加文本"分钟"
- [ ] 2.2 `popup.js` 在 DOMContentLoaded 中：`getAutoCollapseConfig()` 读取后回填 checkbox 与数字输入；checkbox change → `saveAutoCollapseConfig({ enabled, minutes })`；数字输入 change 时校验 `Number.isFinite(value) && value >= 1`，校验通过才写存储，否则恢复显示原值
- [ ] 2.3 数字输入 blur 时若被改成非正整数，弹窗沿用已有错误提示样式（参考 `mapping-error`）给一行红字提示并恢复原值

## 3. 后台：最近激活时间表

- [ ] 3.1 `background.js` 新增模块级常量 `LAST_ACTIVATED_KEY = 'lastActivatedAt'`（存于 `chrome.storage.session`，结构 `{ [tabId]: ISOString }`）
- [ ] 3.2 新增 `loadLastActivated()` 与 `persistLastActivated()` 工具函数；初始化时调用 `loadLastActivated()` 加载到模块级 `Map<tabId, number>`（值为 epoch ms）
- [ ] 3.3 注册 `chrome.tabs.onActivated` 监听：写入 `lastActivatedAt[tabId] = new Date().toISOString()` 并持久化；同步检查该标签页所属组，若该组的其他标签页全部"新鲜"且组不活跃时长变化，则不立即折叠（折叠统一交给 alarm 周期扫描）
- [ ] 3.4 注册 `chrome.tabs.onRemoved`：从时间表与持久存储中清理该 tabId
- [ ] 3.5 注册 `chrome.tabGroups.onRemoved`：清理该组内所有标签页的时间表条目（防御性，避免长时间泄漏）
- [ ] 3.6 时间回退规则：首次激活记录缺失时（如 service worker 重启后新建标签页尚未触发 onActivated），使用 `chrome.tabs.get(tabId)` 拿到的 `lastAccessed`（ms）作为回退值；仍不可得则记 `0`（代表"非常久远"，自然判为不活跃）

## 4. 后台：周期扫描与折叠

- [ ] 4.1 `background.js` 在初始化时调用 `chrome.alarms.get('inactivity-sweep')`，若不存在则 `chrome.alarms.create('inactivity-sweep', { periodInMinutes: 1 })`；保证 service worker 重启后 alarm 仍然存在
- [ ] 4.2 注册 `chrome.alarms.onAlarm`，过滤 `alarm.name === 'inactivity-sweep'` 后调用 `runInactivitySweep()`
- [ ] 4.3 `runInactivitySweep()` 流程：先 `chrome.storage.sync.get('autoCollapseEnabled')`；若 `false` 直接返回；否则 `chrome.tabGroups.query({})` 与 `chrome.tabs.query({})` 并发读，按 `groupId` 分桶；逐组计算"组内所有标签页的最近激活时间" → 取最早者，与 `now - thresholdMs` 比较；若该组 `!collapsed && 最早时间 < 截止时间` 则 `chrome.tabGroups.update(id, { collapsed: true })` 串行折叠；折叠失败仅记 `console.warn`，不中断其他组
- [ ] 4.4 `runInactivitySweep()` 的折叠调用全部用 `retryAsyncOperation`（背景脚本本地副本，与现有重试参数一致）包装；阈值在调用时实时从 `chrome.storage.sync` 取（`autoCollapseAfterMinutes`）
- [ ] 4.5 防御性：服务启动时立即跑一次扫描（可选，仅在 alarm 不存在路径下触发，避免重复空跑）

## 5. manager 页：域名列增强

- [ ] 5.1 `manager.js` 在 `buildTabItem(tab, position)` 中：将原 `host.textContent = hostOf(tab.url)` 改为同时设置可见文本与拼接路径首段：定义 `pathPreviewOf(url)` 返回 `url.pathname + url.search` 的前 24 字符加 `…`，根路径返回 `''`
- [ ] 5.2 渲染结构改为：`tab-host` 内放两个 `<span>` —— `.tab-host-name`（hostname）+ `.tab-host-path`（路径首段），CSS 让 `tab-host-path` 用浅灰小字（参考 `color:#9aa0a6; font-size:11px`）
- [ ] 5.3 `manager.js` 在 `buildTabItem` 末尾拼接 `item.title`：第一行 `tab.title || '(无标题)'`，第二行 `tab.url || ''`，第三行 `'最后激活：' + formatRelativeActivated(tab)`；`formatRelativeActivated` 优先从 `chrome.storage.session.get(LAST_ACTIVATED_KEY)` 读取，回退到 `tab.lastAccessed`（ms）转换为"X 分钟前"，再回退 `'未知'`
- [ ] 5.4 `manager.html` 追加 `.tab-host-path` 样式（color、font-size、不允许换行），保持 `.tab-host` 原 `max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` 不变；保证 hostname 不被截断、路径首段可被省略

## 6. manifest 与依赖

- [ ] 6.1 `manifest.json` 权限列表新增 `"alarms"`；其余权限不动
- [ ] 6.2 `manifest.json` 不新增 `web_accessible_resources`（manager 页面扩展自访问本就 OK）

## 7. 验证

- [ ] 7.1 `node --check` 通过：`background.js`、`popup.js`、`manager.js`、`common.js`
- [ ] 7.2 `openspec validate add-inactivity-features --strict` 通过
- [ ] 7.3 手动验证（弹窗）：勾选/取消勾选"无活动自动折叠"、修改阈值为 `10`、重载扩展后回填正确；非法值（`0`、`-5`、`abc`）被拒绝且不写入存储
- [ ] 7.4 手动验证（后台折叠）：阈值设为 `1` 分钟；打开 2 个相同域名标签页让其自动分组；等待 1 分钟以上不访问该窗口 → 标签条上该组自动折叠；手动点击组内任一标签页后该标签页被记为最近激活，等下一周期该组应不再折叠
- [ ] 7.5 手动验证（总开关）：关闭"无活动自动折叠"总开关 → 已折叠的组不会被自动展开，已展开的组也不会被自动折叠；重新打开 → 下一周期扫描重新生效
- [ ] 7.6 手动验证（service worker 重启）：在 `chrome://serviceworker-internals` 终止当前扩展的 worker → 等待下一次 alarm 触发 → 自动折叠功能继续工作（验证 alarm 重建）
- [ ] 7.7 手动验证（manager URL 列）：同域名不同路径的标签页在管理页面上肉眼可一眼区分；hover 任一条目 → tooltip 三行齐全；URL 解析异常或时间数据缺失时不报错、显示 `未知`
- [ ] 7.8 手动验证（回归）：现有"自动分组"总开关、域名映射增删改、导入导出、标签树跳转、manager 全局/组级一键操作、滚动位置保持均无回归；控制台无 `retryAsyncOperation is not defined`、`LAST_ACTIVATED_KEY is not defined` 类错误
