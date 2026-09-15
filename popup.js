// 无活动自动折叠：默认总开关 true、阈值 30 分钟
const AUTO_COLLAPSE_DEFAULTS = { enabled: true, minutes: 30 };
// 当前持久化的"无活动自动折叠"阈值；与输入框值对比，判断是否处于"未保存"状态
let lastSavedCollapseMinutes = AUTO_COLLAPSE_DEFAULTS.minutes;
// 自动关闭休眠：默认总开关 false（更激进，默认关闭更安全）、阈值 60 分钟
const AUTO_CLOSE_DEFAULTS = { enabled: false, minutes: 60 };

document.addEventListener('DOMContentLoaded', function() {
  const organizeButton = document.getElementById('organize');
  const closeGroupButton = document.getElementById('close-group-btn');
  const addMappingButton = document.getElementById('add-mapping-btn');
  const exportMappingsButton = document.getElementById('export-mappings-btn');
  const importMappingsButton = document.getElementById('import-mappings-btn');
  const importFileInput = document.getElementById('import-file-input');
  const autoGroupingToggle = document.getElementById('auto-grouping-toggle');
  const openManagerButton = document.getElementById('open-manager-btn');
  const autoCollapseToggle = document.getElementById('auto-collapse-toggle');
  const autoCollapseMinutesInput = document.getElementById('auto-collapse-minutes');
  const autoCollapseSaveBtn = document.getElementById('auto-collapse-save');
  // 注：故意不引入"取消"按钮。撤回由"重新输入到期望值 + 点保存"承担，详见 spec。
  const autoCloseToggle = document.getElementById('auto-close-toggle');
  const autoCloseMinutesInput = document.getElementById('auto-close-minutes');

  // 打开标签组管理页面（已打开则复用该标签页）
  openManagerButton.addEventListener('click', () => {
    openManagerPage();
  });

  // 自动分组总开关：加载状态并在变更时持久化
  chrome.storage.sync.get('autoGroupingEnabled').then(({ autoGroupingEnabled = true }) => {
    autoGroupingToggle.checked = autoGroupingEnabled;
  });
  autoGroupingToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoGroupingEnabled: autoGroupingToggle.checked });
  });

  // 无活动自动折叠：回填总开关与阈值；输入与持久化解耦，"保存"按钮才写存储
  getAutoCollapseConfig().then((cfg) => {
    autoCollapseToggle.checked = cfg.enabled;
    lastSavedCollapseMinutes = cfg.minutes;
    autoCollapseMinutesInput.value = String(cfg.minutes);
    refreshAutoCollapseDirty();
  });
  autoCollapseToggle.addEventListener('change', async () => {
    // 总开关是离散二值，change 即写存储（与"保存/取消"机制正交）
    const current = await getAutoCollapseConfig();
    await saveAutoCollapseConfig({ enabled: autoCollapseToggle.checked, minutes: current.minutes });
  });
  autoCollapseMinutesInput.addEventListener('input', () => {
    // 每次输入实时刷新"未保存"标记；不写存储
    refreshAutoCollapseDirty();
  });
  autoCollapseMinutesInput.addEventListener('blur', () => {
    // 失焦时只校验：非法值回退 + 错误提示；合法值不写存储（由"保存"按钮触发）
    const value = Number(autoCollapseMinutesInput.value);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      autoCollapseMinutesInput.value = String(lastSavedCollapseMinutes);
      showAutoCollapseError('请输入大于等于 1 的整数分钟数');
      refreshAutoCollapseDirty();
    } else {
      hideAutoCollapseError();
    }
  });
  if (autoCollapseSaveBtn) {
    autoCollapseSaveBtn.addEventListener('click', async () => {
      const raw = autoCollapseMinutesInput.value;
      const value = Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        showAutoCollapseError('请输入大于等于 1 的整数分钟数');
        return;
      }
      hideAutoCollapseError();
      const current = await getAutoCollapseConfig();
      await saveAutoCollapseConfig({ enabled: current.enabled, minutes: value });
      lastSavedCollapseMinutes = value;
      refreshAutoCollapseDirty();
    });
  }

  // 自动关闭休眠：回填总开关与阈值
  getAutoCloseConfig().then((cfg) => {
    autoCloseToggle.checked = cfg.enabled;
    autoCloseMinutesInput.value = String(cfg.minutes);
  });
  autoCloseToggle.addEventListener('change', async () => {
    const current = await getAutoCloseConfig();
    await saveAutoCloseConfig({ enabled: autoCloseToggle.checked, minutes: current.minutes });
  });
  autoCloseMinutesInput.addEventListener('change', async () => {
    const value = Number(autoCloseMinutesInput.value);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      const current = await getAutoCloseConfig();
      autoCloseMinutesInput.value = String(current.minutes);
      showAutoCloseError('请输入大于等于 1 的整数分钟数');
      return;
    }
    hideAutoCloseError();
    const current = await getAutoCloseConfig();
    await saveAutoCloseConfig({ enabled: current.enabled, minutes: value });
  });
  autoCloseMinutesInput.addEventListener('blur', async () => {
    const value = Number(autoCloseMinutesInput.value);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      const current = await getAutoCloseConfig();
      autoCloseMinutesInput.value = String(current.minutes);
      showAutoCloseError('请输入大于等于 1 的整数分钟数');
    } else {
      hideAutoCloseError();
    }
  });

  // 跨弹窗同步：另一个弹窗修改 autoCollapse* / autoClose* 时刷新当前控件
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
      return;
    }
    if (changes.autoCollapseEnabled) {
      const next = changes.autoCollapseEnabled.newValue;
      autoCollapseToggle.checked = typeof next === 'boolean' ? next : AUTO_COLLAPSE_DEFAULTS.enabled;
    }
    if (changes.autoCollapseAfterMinutes) {
      const next = changes.autoCollapseAfterMinutes.newValue;
      const minutes = Number.isFinite(next) && next >= 1 ? next : AUTO_COLLAPSE_DEFAULTS.minutes;
      lastSavedCollapseMinutes = minutes;
      autoCollapseMinutesInput.value = String(minutes);
      hideAutoCollapseError();
      refreshAutoCollapseDirty();
    }
    if (changes.autoCloseEnabled) {
      const next = changes.autoCloseEnabled.newValue;
      autoCloseToggle.checked = typeof next === 'boolean' ? next : AUTO_CLOSE_DEFAULTS.enabled;
    }
    if (changes.autoCloseAfterMinutes) {
      const next = changes.autoCloseAfterMinutes.newValue;
      const minutes = Number.isFinite(next) && next >= 1 ? next : AUTO_CLOSE_DEFAULTS.minutes;
      autoCloseMinutesInput.value = String(minutes);
    }
  });

  const sortTabsButton = document.getElementById('sort-tabs-btn');
  
  // 排序标签页按钮事件监听器
  sortTabsButton.addEventListener('click', async () => {
    try {
      await sortAllTabs();
      sortTabsButton.textContent = '排序完成!';
      setTimeout(() => {
        sortTabsButton.textContent = '排序标签页';
      }, 2000);
      loadTabGroups();
    } catch (error) {
      console.error('Error sorting tabs:', error);
      sortTabsButton.textContent = '排序失败';
      setTimeout(() => {
        sortTabsButton.textContent = '排序标签页';
      }, 2000);
    }
  });
  
  organizeButton.addEventListener('click', async () => {
    try {
      // 获取所有标签页
      const tabs = await chrome.tabs.query({});
      
      // 读取映射规则，按窗口 + 解析后的组标题（映射标签名或域名）分组
      const mappings = await getDomainMappings();
      // 使用 Map 保存用户可配置的组标题，避免 __proto__/constructor 等标题
      // 与 Object.prototype 冲突，导致合法标签页无法参与整理。
      const windowTitleMap = new Map();
      
      for (const tab of tabs) {
        // 忽略特殊页面
        if (!tab.url || !tab.url.startsWith('http')) {
          continue;
        }
        
        try {
          const url = new URL(tab.url);
          const title = resolveGroupTitleSync(url.hostname, mappings);
          
          let titles = windowTitleMap.get(tab.windowId);
          if (!titles) {
            titles = new Map();
            windowTitleMap.set(tab.windowId, titles);
          }
          if (!titles.has(title)) {
            titles.set(title, []);
          }

          titles.get(title).push(tab.id);
        } catch (e) {
          console.error('Error parsing URL:', tab.url);
        }
      }
      
      // 每个窗口内独立建组/归组，避免跨窗口归组报错
      for (const [windowId, titles] of windowTitleMap) {
        for (const [title, tabIds] of titles) {
          if (tabIds.length > 1) { // 只有当同标题有多个标签页时才创建组
            try {
              // 检查当前窗口内是否已经存在该标题的组
              const groups = await chrome.tabGroups.query({ windowId: Number(windowId) });
              let existingGroup = null;
              
              for (const group of groups) {
                if (group.title === title) {
                  existingGroup = group;
                  break;
                }
              }
              
              if (existingGroup) {
                // 更新现有组
                await retryAsyncOperation(() => chrome.tabs.group({ tabIds: tabIds, groupId: existingGroup.id }));
              } else {
                // 创建新组，颜色由标题确定性派生
                const groupId = await retryAsyncOperation(() => chrome.tabs.group({ tabIds: tabIds }));
                await retryAsyncOperation(() => chrome.tabGroups.update(groupId, {
                  title: title,
                  color: getColorForTitle(title)
                }));
              }
            } catch (e) {
              console.error('Error grouping tabs for title:', title, e);
            }
          }
        }
      }
      
      // 显示操作成功的消息
      organizeButton.textContent = '整理完成!';
      setTimeout(() => {
        organizeButton.textContent = '重新整理所有标签页';
      }, 2000);
      
      // 重新加载标签组信息
      loadTabGroups();
    } catch (error) {
      console.error('Error organizing tabs:', error);
      organizeButton.textContent = '整理失败';
      setTimeout(() => {
        organizeButton.textContent = '重新整理所有标签页';
      }, 2000);
    }
  });
  
  // 关闭所有标签页分组按钮事件监听器
  closeGroupButton.addEventListener('click', async () => {
    try {
      // 获取所有标签组
      const groups = await chrome.tabGroups.query({});
      
      // 解散所有组
      for (const group of groups) {
        try {
          // 获取组中的所有标签页
          const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
          
          // 将组中的标签页取消分组
          if (tabsInGroup.length > 0) {
            await retryAsyncOperation(() => chrome.tabs.ungroup(tabsInGroup.map(tab => tab.id)));
          }
        } catch (e) {
          console.error('Error ungrouping tabs for group:', group, e);
        }
      }
      
      // 显示操作成功的消息
      closeGroupButton.textContent = '关闭完成!';
      setTimeout(() => {
        closeGroupButton.textContent = '关闭所有标签页分组';
      }, 2000);
      
      // 重新加载标签组信息
      loadTabGroups();
    } catch (error) {
      console.error('Error closing tab groups:', error);
      closeGroupButton.textContent = '关闭失败';
      setTimeout(() => {
        closeGroupButton.textContent = '关闭所有标签页分组';
      }, 2000);
    }
  });
  
  // 添加域名映射规则
  addMappingButton.addEventListener('click', async () => {
    const domainInput = document.getElementById('mapping-domain');
    const labelInput = document.getElementById('mapping-label');
    const domain = domainInput.value.trim().toLowerCase();
    const label = labelInput.value.trim();
    
    // 校验输入：非空且域名为合法主机名格式
    if (!domain || !label || !DOMAIN_PATTERN.test(domain)) {
      showMappingError(!domain || !label ? '域名和标签名均不能为空' : '域名格式不合法，如 code.alibaba-inc.com');
      return;
    }
    
    try {
      const mappings = await getDomainMappings();
      const existingIndex = mappings.findIndex(m => m.domain === domain);
      if (existingIndex >= 0) {
        // 重复域名：覆盖旧规则的标签名
        mappings[existingIndex].label = label;
      } else {
        mappings.push({ domain, label });
      }
      await saveDomainMappings(mappings);
      
      domainInput.value = '';
      labelInput.value = '';
      hideMappingError();
      loadDomainMappings();
    } catch (error) {
      console.error('Error adding mapping:', error);
      showMappingError('保存映射失败');
    }
  });
  
  // 导出全部映射规则为 JSON 文件
  exportMappingsButton.addEventListener('click', async () => {
    try {
      const mappings = await getDomainMappings();
      const payload = {
        version: 1,
        domainMappings: mappings
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `domain-mappings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting mappings:', error);
      showMappingError('导出映射失败');
    }
  });
  
  // 导入：点击按钮触发文件选择器
  importMappingsButton.addEventListener('click', () => {
    importFileInput.click();
  });
  
  // 导入：读取并校验 JSON 文件，合法条目与现有规则合并（同名域名覆盖）
  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files && importFileInput.files[0];
    if (!file) {
      return;
    }
    
    try {
      const text = await file.text();
      const imported = parseMappingsFile(text);
      
      const existing = await getDomainMappings();
      const merged = existing.slice();
      let importedCount = 0;
      
      for (const entry of imported) {
        const index = merged.findIndex(m => m.domain === entry.domain);
        if (index >= 0) {
          merged[index].label = entry.label;
        } else {
          merged.push(entry);
        }
        importedCount++;
      }
      
      await saveDomainMappings(merged);
      hideMappingError();
      loadDomainMappings();
      alert(importedCount > 0 ? `成功导入 ${importedCount} 条映射规则` : '文件中没有可导入的合法规则');
    } catch (error) {
      console.error('Error importing mappings:', error);
      showMappingError(error.message || '导入失败：文件格式不合法');
    } finally {
      // 重置文件选择器，保证连续选择同一文件也能触发 change
      importFileInput.value = '';
    }
  });
  
  // 加载并显示标签组信息
  loadTabGroups();
  
  // 加载并显示域名映射规则
  loadDomainMappings();
});

// 对所有窗口独立执行标签页排序
async function sortAllTabs() {
  const windows = await chrome.windows.getAll();
  for (const win of windows) {
    try {
      await sortTabsInWindow(win.id);
    } catch (error) {
      console.error('Error sorting tabs in window:', win.id, error);
    }
  }
}

// 单个窗口内排序：有组标签在前（组按标题、组内按页面标题），无组标签保持原相对顺序在后，pinned 不动
async function sortTabsInWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const groups = await chrome.tabGroups.query({ windowId });
  
  const groupById = {};
  for (const group of groups) {
    groupById[group.id] = group;
  }
  
  const movable = tabs.filter(t => !t.pinned);
  const isGrouped = t => t.groupId && t.groupId !== -1 && groupById[t.groupId];
  const grouped = movable.filter(isGrouped);
  const ungrouped = movable.filter(t => !isGrouped(t));
  
  // 按组归集标签页
  const byGroup = {};
  for (const tab of grouped) {
    if (!byGroup[tab.groupId]) {
      byGroup[tab.groupId] = [];
    }
    byGroup[tab.groupId].push(tab);
  }
  
  // 组按标题排序，组内按页面标题排序
  const groupIds = Object.keys(byGroup).sort((a, b) => {
    return (groupById[a].title || '').localeCompare(groupById[b].title || '', 'zh');
  });
  
  const ordered = [];
  for (const groupId of groupIds) {
    byGroup[groupId]
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'))
      .forEach(t => ordered.push(t));
  }
  // 无组标签保持原有相对顺序排在最后
  ungrouped.forEach(t => ordered.push(t));
  
  // 起始位置 = 固定标签数量，按目标顺序逐个移动；单个失败不中断整体流程
  const startIndex = tabs.filter(t => t.pinned).length;
  for (let i = 0; i < ordered.length; i++) {
    try {
      await retryAsyncOperation(() => chrome.tabs.move(ordered[i].id, { index: startIndex + i }));
    } catch (error) {
      console.error('Error moving tab:', ordered[i].id, error);
    }
  }
}

// 加载标签组信息并以树状结构展示
async function loadTabGroups() {
  const groupsList = document.getElementById('groups-list');
  
  try {
    // 获取所有标签组
    const groups = await chrome.tabGroups.query({});
    
    // 获取所有标签页
    const tabs = await chrome.tabs.query({});
    
    if (groups.length === 0) {
      groupsList.innerHTML = '<div class="empty-groups">暂无标签组</div>';
      return;
    }
    
    // 构建组和标签页的映射关系
    const groupTabsMap = {};
    
    // 初始化映射
    for (const group of groups) {
      groupTabsMap[group.id] = {
        group: group,
        tabs: []
      };
    }
    
    // 分配标签页到对应的组
    for (const tab of tabs) {
      if (tab.groupId && tab.groupId !== -1) {
        if (groupTabsMap[tab.groupId]) {
          groupTabsMap[tab.groupId].tabs.push(tab);
        }
      }
    }
    
    // 创建树状展示
    const treeHtml = document.createElement('ul');
    treeHtml.className = 'group-tree';
    
    for (const groupId in groupTabsMap) {
      const groupData = groupTabsMap[groupId];
      const group = groupData.group;
      const groupTabs = groupData.tabs;
      
      // 创建组节点
      const groupItem = document.createElement('li');
      groupItem.className = 'group-item';
      
      // 组标题容器
      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header';
      
      // 组标题
      const groupTitle = document.createElement('div');
      groupTitle.className = 'group-title';
      groupTitle.textContent = `${group.title} (${groupTabs.length})`;
      groupHeader.appendChild(groupTitle);
      
      // 组关闭按钮
      const groupCloseBtn = document.createElement('button');
      groupCloseBtn.className = 'close-btn';
      groupCloseBtn.textContent = '×';
      groupCloseBtn.onclick = async () => {
        try {
          // 获取组中的所有标签页
          const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
          
          // 将组中的标签页取消分组
          if (tabsInGroup.length > 0) {
            await retryAsyncOperation(() => chrome.tabs.ungroup(tabsInGroup.map(tab => tab.id)));
          }
          
          // 重新加载标签组信息
          loadTabGroups();
        } catch (e) {
          console.error('Error closing group:', e);
        }
      };
      groupHeader.appendChild(groupCloseBtn);
      
      groupItem.appendChild(groupHeader);
      
      // 标签页列表
      if (groupTabs.length > 0) {
        const tabsList = document.createElement('ul');
        tabsList.className = 'group-tabs';
        
        for (const tab of groupTabs) {
          const tabItem = document.createElement('li');
          tabItem.className = 'tab-item';
          tabItem.style.cursor = 'pointer';
          tabItem.title = tab.title || tab.url;
          
          // 点击条目：激活该标签页并聚焦所在窗口，随后关闭弹窗
          tabItem.onclick = async () => {
            try {
              await chrome.tabs.update(tab.id, { active: true });
              await chrome.windows.update(tab.windowId, { focused: true });
              window.close();
            } catch (error) {
              console.error('Error activating tab:', error);
            }
          };
          
          // 标签页标题
          const tabTitle = document.createElement('div');
          tabTitle.className = 'tab-title';
          tabTitle.textContent = tab.title || tab.url;
          tabItem.appendChild(tabTitle);
          
          // 标签页关闭按钮
          const tabCloseBtn = document.createElement('button');
          tabCloseBtn.className = 'close-btn';
          tabCloseBtn.textContent = '×';
          tabCloseBtn.onclick = async (e) => {
            // 阻止事件冒泡到父元素
            e.stopPropagation();
            
            try {
              // 关闭标签页
              await retryAsyncOperation(() => chrome.tabs.remove(tab.id));
              
              // 重新加载标签组信息
              loadTabGroups();
            } catch (error) {
              console.error('Error closing tab:', error);
            }
          };
          tabItem.appendChild(tabCloseBtn);
          
          tabsList.appendChild(tabItem);
        }
        
        groupItem.appendChild(tabsList);
      }
      
      treeHtml.appendChild(groupItem);
    }
    
    groupsList.innerHTML = '';
    groupsList.appendChild(treeHtml);
  } catch (error) {
    console.error('Error loading tab groups:', error);
    groupsList.innerHTML = '<div class="empty-groups">加载标签组失败</div>';
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

// 域名格式校验正则（合法主机名或 *.suffix 通配符，如 code.alibaba-inc.com / *.alibaba-inc.com）
const DOMAIN_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

// 解析导入的 JSON 文本：整体结构非法时抛错（不改变现有规则），非法条目被过滤
function parseMappingsFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('导入失败：文件不是合法 JSON');
  }
  
  // 兼容 { version, domainMappings: [...] } 与纯数组两种结构
  const entries = Array.isArray(parsed) ? parsed : parsed.domainMappings;
  if (!Array.isArray(entries)) {
    throw new Error('导入失败：文件缺少 domainMappings 规则列表');
  }
  
  const valid = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const domain = typeof entry.domain === 'string' ? entry.domain.trim().toLowerCase() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!domain || !label || !DOMAIN_PATTERN.test(domain)) {
      continue;
    }
    // 文件内重复域名：后出现的覆盖先出现的
    const index = valid.findIndex(m => m.domain === domain);
    if (index >= 0) {
      valid[index].label = label;
    } else {
      valid.push({ domain, label });
    }
  }
  return valid;
}

// 读取用户配置的域名映射规则（[{ domain, label }]）
async function getDomainMappings() {
  const { domainMappings = [] } = await chrome.storage.sync.get('domainMappings');
  return domainMappings;
}

// 保存域名映射规则
async function saveDomainMappings(mappings) {
  await chrome.storage.sync.set({ domainMappings: mappings });
}

// 同步解析域名对应的组标题（精确匹配优先；通配符命中时取后缀最长即最具体的规则；未命中回退为域名本身）
function resolveGroupTitleSync(domain, mappings) {
  const exact = mappings.find(m => m.domain === domain);
  if (exact) {
    return exact.label;
  }
  let best = null;
  for (const m of mappings) {
    if (m.domain.startsWith('*.')) {
      const suffix = m.domain.slice(1); // 如 '.alibaba-inc.com'
      // 仅匹配子域（需存在子域前缀），主域本身不被通配符规则覆盖
      if (domain.endsWith(suffix) && domain.length > suffix.length) {
        if (!best || m.domain.length > best.domain.length) {
          best = m;
        }
      }
    }
  }
  return best ? best.label : domain;
}

// 加载并展示域名映射规则列表
async function loadDomainMappings() {
  const mappingList = document.getElementById('mapping-list');
  
  try {
    const mappings = await getDomainMappings();
    
    if (mappings.length === 0) {
      mappingList.innerHTML = '<div class="empty-mappings">暂无映射规则，默认按域名分组</div>';
      return;
    }
    
    const listEl = document.createElement('ul');
    listEl.className = 'mapping-list';
    
    for (const mapping of mappings) {
      const item = document.createElement('li');
      item.className = 'mapping-item';
      
      const text = document.createElement('div');
      text.className = 'mapping-text';
      text.textContent = `${mapping.domain} → ${mapping.label}`;
      item.appendChild(text);
      
      // 删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'close-btn';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = async () => {
        try {
          const updated = await getDomainMappings();
          await saveDomainMappings(updated.filter(m => m.domain !== mapping.domain));
          loadDomainMappings();
        } catch (error) {
          console.error('Error deleting mapping:', error);
        }
      };
      item.appendChild(deleteBtn);
      
      listEl.appendChild(item);
    }
    
    mappingList.innerHTML = '';
    mappingList.appendChild(listEl);
  } catch (error) {
    console.error('Error loading mappings:', error);
    mappingList.innerHTML = '<div class="empty-mappings">加载映射规则失败</div>';
  }
}

// 显示映射表单的错误提示
function showMappingError(message) {
  const errorEl = document.getElementById('mapping-error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// 隐藏映射表单的错误提示
function hideMappingError() {
  document.getElementById('mapping-error').style.display = 'none';
}

// 读取"无活动自动折叠"配置；缺字段时回退到默认值
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

// 写入"无活动自动折叠"配置
async function saveAutoCollapseConfig(config) {
  await chrome.storage.sync.set({
    autoCollapseEnabled: !!config.enabled,
    autoCollapseAfterMinutes: Math.max(1, Math.floor(Number(config.minutes) || AUTO_COLLAPSE_DEFAULTS.minutes))
  });
}

// 显示自动折叠阈值的错误提示
function showAutoCollapseError(message) {
  const errorEl = document.getElementById('auto-collapse-error');
  if (!errorEl) {
    return;
  }
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// 隐藏自动折叠阈值的错误提示
function hideAutoCollapseError() {
  const errorEl = document.getElementById('auto-collapse-error');
  if (!errorEl) {
    return;
  }
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

// 刷新"无活动自动折叠"输入框的"未保存"标记：
// 输入框值与 lastSavedCollapseMinutes 不一致时，"保存"按钮加 .dirty 类
function refreshAutoCollapseDirty() {
  const saveBtn = document.getElementById('auto-collapse-save');
  const minutesInput = document.getElementById('auto-collapse-minutes');
  if (!saveBtn || !minutesInput) {
    return;
  }
  const value = Number(minutesInput.value);
  const dirty = Number.isFinite(value) && Number.isInteger(value) && value >= 1 && value !== lastSavedCollapseMinutes;
  saveBtn.classList.toggle('dirty', dirty);
  saveBtn.textContent = dirty ? '保存 *' : '保存';
}

// 读取"自动关闭休眠"配置
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

// 写入"自动关闭休眠"配置
async function saveAutoCloseConfig(config) {
  await chrome.storage.sync.set({
    autoCloseEnabled: !!config.enabled,
    autoCloseAfterMinutes: Math.max(1, Math.floor(Number(config.minutes) || AUTO_CLOSE_DEFAULTS.minutes))
  });
}

// 显示自动关闭休眠阈值的错误提示
function showAutoCloseError(message) {
  const errorEl = document.getElementById('auto-close-error');
  if (!errorEl) {
    return;
  }
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// 隐藏自动关闭休眠阈值的错误提示
function hideAutoCloseError() {
  const errorEl = document.getElementById('auto-close-error');
  if (!errorEl) {
    return;
  }
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

// 打开标签组管理页面：已存在则激活并聚焦其所在窗口，否则新建标签页；随后关闭弹窗
async function openManagerPage() {
  const managerUrl = chrome.runtime.getURL('manager.html');
  try {
    const existing = await chrome.tabs.query({ url: managerUrl });
    if (existing.length > 0) {
      await chrome.tabs.update(existing[0].id, { active: true });
      await chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: managerUrl });
    }
  } catch (error) {
    console.error('Error opening manager page:', error);
  } finally {
    window.close();
  }
}

// 重试异步操作、标题比较器等工具由 common.js 提供（popup.html 中先于本文件引入）
