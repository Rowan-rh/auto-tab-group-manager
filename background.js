importScripts('common.js');

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在标签页完全加载时处理
  if (changeInfo.status === 'complete') {
    groupTab(tab);
  }
});

// 监听标签页创建事件
chrome.tabs.onCreated.addListener((tab) => {
  groupTab(tab);
});

// 监听标签页移动事件
chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  chrome.tabs.get(tabId).then((tab) => {
    groupTab(tab);
  }).catch((error) => {
    console.error('Error getting tab:', error);
  });
});

// ===== 不活跃自动折叠 =====

// 最近激活时间表：存于 chrome.storage.session，per-session、不跨设备同步
// 键为 tabId（数字），值为 ISO 字符串
const LAST_ACTIVATED_KEY = 'lastActivatedAt';
// 模块级 Map<number, number>：tabId → epoch ms
const lastActivatedByTabId = new Map();
// 串行化 session 写入，避免并发 set 以旧快照覆盖新状态
let persistLastActivatedQueue = Promise.resolve();
// 初始化屏障：事件处理必须先合并已有 session 记录，避免用不完整快照覆盖存储。
let lastActivatedReady;

// 从 chrome.storage.session 加载时间表到内存
async function loadLastActivated() {
  try {
    const stored = await chrome.storage.session.get(LAST_ACTIVATED_KEY);
    const raw = stored && stored[LAST_ACTIVATED_KEY];
    if (!raw || typeof raw !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(raw)) {
      const tabId = Number(key);
      const ts = Date.parse(value);
      if (Number.isFinite(tabId) && Number.isFinite(ts)) {
        // 启动加载可能与 onActivated 并发，保留更新的内存值。
        const existing = lastActivatedByTabId.get(tabId) || 0;
        lastActivatedByTabId.set(tabId, Math.max(existing, ts));
      }
    }
  } catch (error) {
    // session 存储在某些环境不可用时静默降级到内存（仅本次 service worker 生命周期内有效）
    console.warn('loadLastActivated 失败，仅使用内存表：', error);
  }
}

// 将内存中的时间表落盘到 chrome.storage.session
function persistLastActivated() {
  persistLastActivatedQueue = persistLastActivatedQueue
    .catch(() => {})
    .then(async () => {
      const raw = {};
      for (const [tabId, ts] of lastActivatedByTabId.entries()) {
        raw[tabId] = new Date(ts).toISOString();
      }
      try {
        await chrome.storage.session.set({ [LAST_ACTIVATED_KEY]: raw });
      } catch (error) {
        console.warn('persistLastActivated 失败：', error);
      }
    });
  return persistLastActivatedQueue;
}

// 记录标签页的最近激活时间；缺值时按 lastAccessed / 0 回退
async function recordActivation(tabId) {
  await lastActivatedReady;
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    // 激活事件与关闭事件并发时，标签页可能已不存在；不要重新写回幽灵记录。
    return;
  }

  let ts = Date.now();
  if (tab && Number.isFinite(tab.lastAccessed) && tab.lastAccessed > 0) {
    // 优先使用 tab 自带的 lastAccessed（毫秒），但若本调用本身就来自 onActivated，
    // 该值可能略陈旧；二者择新保留
    const existing = lastActivatedByTabId.get(tabId) || 0;
    ts = Math.max(ts, tab.lastAccessed, existing);
  }
  lastActivatedByTabId.set(tabId, ts);
  await persistLastActivated();
}

// 清理已关闭标签页的条目
async function forgetTab(tabId) {
  await lastActivatedReady;
  if (lastActivatedByTabId.delete(tabId)) {
    await persistLastActivated();
  }
}

// 获取标签页的最近激活时间（epoch ms），缺数据返回 0
function getLastActivated(tabId, fallback) {
  const v = lastActivatedByTabId.get(tabId);
  if (Number.isFinite(v)) {
    return v;
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

// 暴露给前端读取（manager 页 tooltip 使用）
async function fetchLastActivatedMap() {
  try {
    const stored = await chrome.storage.session.get(LAST_ACTIVATED_KEY);
    const raw = stored && stored[LAST_ACTIVATED_KEY];
    const out = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw)) {
        const tabId = Number(key);
        const ts = Date.parse(value);
        if (Number.isFinite(tabId) && Number.isFinite(ts)) {
          out[tabId] = ts;
        }
      }
    }
    return out;
  } catch (error) {
    // session 不可用时回退到内存表
    const out = {};
    for (const [tabId, ts] of lastActivatedByTabId.entries()) {
      out[tabId] = ts;
    }
    return out;
  }
}

// 注册激活事件监听
chrome.tabs.onActivated.addListener((activeInfo) => {
  recordActivation(activeInfo.tabId);
});

// 标签页关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => {
  forgetTab(tabId);
});

// ===== 不活跃自动折叠：周期扫描 =====

const INACTIVITY_ALARM = 'inactivity-sweep';
const AUTO_COLLAPSE_DEFAULTS = { enabled: true, minutes: 30 };
const AUTO_CLOSE_DEFAULTS = { enabled: false, minutes: 60 };

// 读取"无活动自动折叠"配置（与 popup.js 同源语义）
async function getAutoCollapseConfig() {
  const { autoCollapseEnabled, autoCollapseAfterMinutes } = await chrome.storage.sync.get([
    'autoCollapseEnabled',
    'autoCollapseAfterMinutes'
  ]);
  return {
    enabled: typeof autoCollapseEnabled === 'boolean' ? autoCollapseEnabled : AUTO_COLLAPSE_DEFAULTS.enabled,
    minutes: Number.isFinite(autoCollapseAfterMinutes) && autoCollapseAfterMinutes >= 1
      ? Math.floor(autoCollapseAfterMinutes)
      : AUTO_COLLAPSE_DEFAULTS.minutes
  };
}

// 读取"自动关闭休眠"配置（与 popup.js 同源语义）；总开关默认 false 以避免误清空
async function getAutoCloseConfig() {
  const { autoCloseEnabled, autoCloseAfterMinutes } = await chrome.storage.sync.get([
    'autoCloseEnabled',
    'autoCloseAfterMinutes'
  ]);
  return {
    enabled: typeof autoCloseEnabled === 'boolean' ? autoCloseEnabled : AUTO_CLOSE_DEFAULTS.enabled,
    minutes: Number.isFinite(autoCloseAfterMinutes) && autoCloseAfterMinutes >= 1
      ? Math.floor(autoCloseAfterMinutes)
      : AUTO_CLOSE_DEFAULTS.minutes
  };
}

// 确保 alarm 存在（service worker 重启后兜底重建）
async function ensureInactivityAlarm() {
  try {
    const existing = await chrome.alarms.get(INACTIVITY_ALARM);
    if (!existing) {
      await chrome.alarms.create(INACTIVITY_ALARM, { periodInMinutes: 1 });
    }
  } catch (error) {
    console.error('ensureInactivityAlarm 失败：', error);
  }
}

// 执行一次扫描
async function runInactivitySweep() {
  const cfg = await getAutoCollapseConfig();
  if (!cfg.enabled) {
    return;
  }
  const thresholdMs = cfg.minutes * 60 * 1000;
  const now = Date.now();

  let groups;
  let tabs;
  let activeTabs;
  try {
    [groups, tabs, activeTabs] = await Promise.all([
      chrome.tabGroups.query({}),
      chrome.tabs.query({}),
      // 当前活动标签页所在组本轮整体豁免（用户正在看的东西不自动隐藏）
      chrome.tabs.query({ active: true, lastFocusedWindow: true })
    ]);
  } catch (error) {
    console.error('runInactivitySweep 查询失败：', error);
    return;
  }

  // 当前活动 tabId 集合：组内任一标签页出现在此集合中则整组本轮跳过
  const activeTabIds = new Set();
  for (const t of activeTabs) {
    if (Number.isFinite(t.id)) {
      activeTabIds.add(t.id);
    }
  }

  const tabsByGroupId = new Map();
  for (const tab of tabs) {
    if (typeof tab.groupId !== 'number' || tab.groupId === -1) {
      continue;
    }
    if (!tabsByGroupId.has(tab.groupId)) {
      tabsByGroupId.set(tab.groupId, []);
    }
    tabsByGroupId.get(tab.groupId).push(tab);
  }

  for (const group of groups) {
    if (group.collapsed) {
      // 已是折叠态：跳过
      continue;
    }
    const groupTabs = tabsByGroupId.get(group.id) || [];
    if (groupTabs.length === 0) {
      // 组内无已打开标签页：跳过（不影响已保存未打开的组）
      continue;
    }
    // 豁免：组内有标签页是当前活动标签页（用户正在看）→ 本轮不折叠
    if (groupTabs.some((tab) => activeTabIds.has(tab.id))) {
      continue;
    }
    // AND 语义：组内**每一个**标签页的最近激活时间都已超阈值才折叠
    // 任一标签页缺数据 / 未超阈值 → 整组不折叠
    let allIdle = true;
    for (const tab of groupTabs) {
      const ts = getLastActivated(tab.id, tab.lastAccessed);
      if (ts <= 0 || now - ts < thresholdMs) {
        allIdle = false;
        break;
      }
    }
    if (!allIdle) {
      continue;
    }
    try {
      await retryAsyncOperation(() => chrome.tabGroups.update(group.id, { collapsed: true }));
    } catch (error) {
      console.warn('自动折叠标签组失败：', group.id, error);
    }
  }
}

// alarm 周期回调
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === INACTIVITY_ALARM) {
    runInactivitySweep();
  }
});

// 启动时：加载时间表 + 重建 alarm
lastActivatedReady = loadLastActivated();
ensureInactivityAlarm();

// 同一窗口内的自动分组串行执行，避免多个事件同时完成“查无目标组 → 新建组”。
const groupTabQueuesByWindow = new Map();

// 将标签页按域名分组的主要函数
function groupTab(tab) {
  if (!tab || !Number.isFinite(tab.windowId)) {
    return Promise.resolve();
  }
  const windowId = tab.windowId;
  const previous = groupTabQueuesByWindow.get(windowId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => groupTabOnce(tab))
    .finally(() => {
      if (groupTabQueuesByWindow.get(windowId) === current) {
        groupTabQueuesByWindow.delete(windowId);
      }
    });
  groupTabQueuesByWindow.set(windowId, current);
  return current;
}

async function groupTabOnce(tab) {
  // 排队期间标签可能已关闭、导航或移到其他窗口；以执行时状态为准。
  try {
    tab = await chrome.tabs.get(tab.id);
  } catch (error) {
    return;
  }
  // 忽略特殊页面（如chrome://, about:, 等）
  if (!tab.url || !tab.url.startsWith('http')) {
    return;
  }

  // 自动分组总开关关闭时不执行自动分组（手动整理不受影响）
  const {
    autoGroupingEnabled = true,
    domainGroupingMode = DOMAIN_GROUPING_MODES.REGISTRABLE_DOMAIN
  } = await chrome.storage.sync.get(['autoGroupingEnabled', 'domainGroupingMode']);
  if (!autoGroupingEnabled) {
    return;
  }

  try {
    // 提取域名，并根据映射规则与用户选项解析组标题。
    const url = new URL(tab.url);
    const domain = url.hostname;
    const mappings = await getDomainMappings();
    const groupTitle = resolveGroupTitleSync(domain, mappings, domainGroupingMode);
    
    // 获取当前标签页所属的组（如果有）
    let currentGroup = null;
    try {
      currentGroup = await chrome.tabs.get(tab.id).then(async (updatedTab) => {
        if (updatedTab.groupId && updatedTab.groupId !== -1) {
          try {
            return await chrome.tabGroups.get(updatedTab.groupId);
          } catch (e) {
            return null;
          }
        }
        return null;
      });
    } catch (e) {
      currentGroup = null;
    }
    
    // 如果标签页已在组中，检查它是否仍属于该组
    if (currentGroup && currentGroup.title !== groupTitle) {
      // 标签页已更改域名，需要将其移出当前组
      await retryAsyncOperation(() => chrome.tabs.ungroup(tab.id));
    }
    
    // 获取当前所有的标签页组
    const groups = await chrome.tabGroups.query({});
    
    // 查找是否已有对应标题的组（限定在标签页所在窗口内，避免跨窗口归组报错）
    let targetGroupId = null;
    for (const group of groups) {
      if (group.windowId === tab.windowId && group.title === groupTitle) {
        targetGroupId = group.id;
        break;
      }
    }
    
    // 如果没有找到对应的组，则创建新组
    if (targetGroupId === null) {
      // 只有当目标标题在同一窗口内有多个标签页时才创建组（同标签名可能覆盖多个域名）
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const titleTabs = tabs.filter(t => {
        try {
          const tabUrl = new URL(t.url);
          return resolveGroupTitleSync(tabUrl.hostname, mappings, domainGroupingMode) === groupTitle;
        } catch (e) {
          return false;
        }
      });
      
      // 如果目标标题只有一个标签页，不创建组
      if (titleTabs.length <= 1) {
        return;
      }
      
      // 创建新的标签页组
      const groupId = await retryAsyncOperation(() => chrome.tabs.group({ tabIds: titleTabs.map(t => t.id) }));
      
      // 设置组标题（映射标签名或域名），颜色由标题确定性派生
      await retryAsyncOperation(() => chrome.tabGroups.update(groupId, {
        title: groupTitle,
        color: getColorForTitle(groupTitle)
      }));
    } else {
      // 将标签页移动到现有组
      await retryAsyncOperation(() => chrome.tabs.group({ tabIds: tab.id, groupId: targetGroupId }));
    }
  } catch (error) {
    if (error && typeof error.message === 'string' && error.message.includes('Tabs cannot be edited right now')) {
      // 用户长时间拖动标签页导致重试窗口耗尽，属于预期内的临时状态，仅记录警告
      console.warn('跳过本次分组：标签页暂时不可编辑（用户可能正在拖动标签页）');
    } else {
      console.error('Error grouping tab:', error);
    }
  }
}

// 根据标题确定性地派生组颜色，保证同名组重建后颜色一致
function getColorForTitle(title) {
  const colors = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return colors[hash % colors.length];
}

// 读取用户配置的域名映射规则（[{ domain, label }]）
async function getDomainMappings() {
  const { domainMappings = [] } = await chrome.storage.sync.get('domainMappings');
  return domainMappings;
}

// 重试异步操作，处理"Tabs cannot be edited right now"错误
async function retryAsyncOperation(operation, maxRetries = 10, delay = 300) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      const isTabBusy = error && typeof error.message === 'string' && error.message.includes('Tabs cannot be edited right now');
      if (isTabBusy && i < maxRetries - 1) {
        // 拖动标签页可能持续数秒，使用带随机抖动的指数退避（上限 2 秒），重试窗口约 10 秒
        const backoff = Math.min(delay * Math.pow(1.6, i), 2000);
        const jitter = Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, backoff + jitter));
      } else {
        // 如果不是特定错误或者已经是最后一次尝试，则抛出错误
        throw error;
      }
    }
  }
}
