// common.js
// 前端页面与 service worker 共享的工具函数与常量。
// 浏览器环境挂到全局以保持既有裸函数调用方式；Node 环境额外导出供单测使用。
(function (root, factory) {
  'use strict';
  var api = factory();
  Object.assign(root, api);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 标题本地化排序使用的 locale（中文按拼音序）
  var COLLATOR_LOCALE = 'zh-Hans-CN';

  // 标签组颜色枚举到 CSS 颜色的映射，与 Chrome 标签条观感对齐
  var GROUP_COLOR_CSS = {
    grey: '#5f6368',
    blue: '#1a73e8',
    red: '#d93025',
    yellow: '#f9ab00',
    green: '#188038',
    pink: '#d01884',
    purple: '#a142f4',
    cyan: '#007b83'
  };

  // 兜底色：组颜色不在枚举内时使用
  var FALLBACK_GROUP_COLOR_CSS = '#5f6368';

  // 域名分组模式的持久化值；缺省采用可注册域名（如 bilibili.com）。
  var DOMAIN_GROUPING_MODES = {
    REGISTRABLE_DOMAIN: 'registrable-domain',
    FULL_HOSTNAME: 'full-hostname'
  };

  // 常见双标签公共后缀。常见的一般后缀（如 .com、.org、.cn）无需特殊处理。
  var MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
    'ac.jp', 'ac.nz', 'ac.uk', 'asn.au', 'co.in', 'co.jp', 'co.kr', 'co.nz', 'co.uk',
    'com.ar', 'com.au', 'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.my', 'com.ph',
    'com.sg', 'com.tr', 'com.tw', 'com.vn', 'edu.au', 'edu.cn', 'edu.hk', 'edu.sg',
    'firm.in', 'gen.in', 'go.jp', 'gov.au', 'gov.cn', 'gov.hk', 'gov.in', 'gov.uk',
    'govt.nz', 'id.au', 'idv.hk', 'ind.in', 'net.au', 'net.br', 'net.cn', 'net.hk',
    'net.in', 'net.kr', 'net.my', 'net.nz', 'net.ph', 'net.sg', 'net.uk', 'net.vn',
    'ne.jp', 'ne.kr', 'or.jp', 'or.kr', 'org.au', 'org.br', 'org.cn', 'org.hk',
    'org.in', 'org.kr', 'org.my', 'org.nz', 'org.ph', 'org.sg', 'org.uk', 'org.vn',
    'plc.uk', 're.kr', 'sch.uk', 'school.nz'
  ]);

  // 取组颜色对应的 CSS 色值
  function groupColorCss(color) {
    return GROUP_COLOR_CSS[color] || FALLBACK_GROUP_COLOR_CSS;
  }

  // 返回主机名的可注册域名（例如 www.bilibili.com → bilibili.com）。
  function registrableDomain(domain) {
    var hostname = String(domain || '').toLowerCase().replace(/\.$/, '');
    // IP 地址与单段内网主机名不按点分段截取。
    if (!hostname || hostname.indexOf(':') !== -1 || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return hostname;
    }
    var labels = hostname.split('.').filter(Boolean);
    if (labels.length <= 2) {
      return hostname;
    }
    var publicSuffix = labels.slice(-2).join('.');
    var domainLabelCount = MULTI_LABEL_PUBLIC_SUFFIXES.has(publicSuffix) ? 3 : 2;
    return labels.slice(-domainLabelCount).join('.');
  }

  // 精确映射优先于通配符；无映射时依所选模式回退为主域名或完整主机名。
  function resolveGroupTitleSync(domain, mappings, groupingMode) {
    var hostname = String(domain || '').toLowerCase();
    var rules = Array.isArray(mappings) ? mappings : [];
    var exact = rules.find(function (mapping) { return mapping.domain === hostname; });
    if (exact) {
      return exact.label;
    }
    var best = null;
    for (var i = 0; i < rules.length; i++) {
      var mapping = rules[i];
      if (mapping.domain.startsWith('*.')) {
        var suffix = mapping.domain.slice(1);
        if (hostname.endsWith(suffix) && hostname.length > suffix.length &&
            (!best || mapping.domain.length > best.domain.length)) {
          best = mapping;
        }
      }
    }
    if (best) {
      return best.label;
    }
    return groupingMode === DOMAIN_GROUPING_MODES.FULL_HOSTNAME
      ? hostname
      : registrableDomain(hostname);
  }

  // 重试异步操作，处理"Tabs cannot be edited right now"错误
  // 拖动标签页可能持续数秒，使用带随机抖动的指数退避（上限 2 秒），重试窗口约 10 秒
  async function retryAsyncOperation(operation, maxRetries = 10, delay = 300) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        const isTabBusy = error && typeof error.message === 'string' &&
          error.message.includes('Tabs cannot be edited right now');
        if (isTabBusy && i < maxRetries - 1) {
          const backoff = Math.min(delay * Math.pow(1.6, i), 2000);
          const jitter = Math.random() * 200;
          await new Promise(resolve => setTimeout(resolve, backoff + jitter));
        } else {
          // 非该错误或已是最后一次尝试，抛出交由调用方处理
          throw error;
        }
      }
    }
  }

  // 标签页标题比较器：标题本地化升序 → URL 字典序 → 返回 0（交由 sort 稳定性保持原有相对顺序）
  function compareTabTitle(a, b) {
    const byTitle = String(a.title || '').localeCompare(String(b.title || ''), COLLATOR_LOCALE);
    if (byTitle !== 0) {
      return byTitle;
    }
    const urlA = String(a.url || '');
    const urlB = String(b.url || '');
    if (urlA !== urlB) {
      return urlA < urlB ? -1 : 1;
    }
    return 0;
  }

  // 标签组标题比较器：组标题本地化升序 → 组内标签页数量降序 → 原有相对顺序
  // 入参形如 { title, tabCount, order }
  function compareGroupTitle(a, b) {
    const byTitle = String(a.title || '').localeCompare(String(b.title || ''), COLLATOR_LOCALE);
    if (byTitle !== 0) {
      return byTitle;
    }
    const byCount = (Number(b.tabCount) || 0) - (Number(a.tabCount) || 0);
    if (byCount !== 0) {
      return byCount;
    }
    return (Number(a.order) || 0) - (Number(b.order) || 0);
  }

  // 按标签条位置（index）升序复制标签页数组
  function sortTabsByIndex(tabs) {
    return (tabs || []).slice().sort((a, b) => a.index - b.index);
  }

  // 计算单个标签组的"组内排序"移动计划（纯函数）
  // 返回 null 表示无需移动（标签页不足 2 个，或已处于目标顺序），调用方据此短路
  function buildGroupSortMove(group) {
    const tabs = sortTabsByIndex(group && group.tabs);
    if (tabs.length < 2) {
      return null;
    }
    const currentIds = tabs.map(t => t.id);
    const sortedIds = tabs.slice().sort(compareTabTitle).map(t => t.id);
    if (sortedIds.every((id, i) => id === currentIds[i])) {
      return null;
    }
    return { tabIds: sortedIds, index: tabs[0].index };
  }

  // 计算单个窗口的"全部排序"移动计划（纯函数）
  // 组之间按标题排序、组内按标题排序，从窗口内最靠左的分组标签页位置起依次紧凑排列。
  // 未分组标签页不进入计划，因此不会被排序、解散或关闭，其相互先后顺序保持不变。
  // 返回的移动必须按数组顺序从左到右依次执行。
  function buildWindowSortPlan(groups) {
    const normalized = (groups || [])
      .map((group, order) => ({
        title: group.title || '',
        tabs: sortTabsByIndex(group.tabs),
        order: order
      }))
      .filter(group => group.tabs.length > 0);

    if (normalized.length === 0) {
      return [];
    }

    const startIndex = normalized.reduce((min, group) => Math.min(min, group.tabs[0].index), Infinity);
    if (!Number.isFinite(startIndex)) {
      return [];
    }

    const ordered = normalized.slice().sort((a, b) => compareGroupTitle(
      { title: a.title, tabCount: a.tabs.length, order: a.order },
      { title: b.title, tabCount: b.tabs.length, order: b.order }
    ));

    const moves = [];
    let nextIndex = startIndex;
    for (const group of ordered) {
      const sortedTabs = group.tabs.slice().sort(compareTabTitle);
      moves.push({
        tabIds: sortedTabs.map(t => t.id),
        index: nextIndex
      });
      nextIndex += sortedTabs.length;
    }
    return moves;
  }

  // 合并扩展 session 记录与 Chrome 原生 lastAccessed，始终采用较新的有效值。
  function latestActivationTimestamp(sessionTimestamp, tabLastAccessed) {
    const sessionTs = Number.isFinite(sessionTimestamp) && sessionTimestamp > 0 ? sessionTimestamp : 0;
    const chromeTs = Number.isFinite(tabLastAccessed) && tabLastAccessed > 0 ? tabLastAccessed : 0;
    return Math.max(sessionTs, chromeTs);
  }

  // 确认后重新校验休眠候选项；状态、归属或页面发生变化时均跳过。
  function isDormantCandidateStillValid(originalTab, currentTab, sessionTimestamp, thresholdMs, now) {
    if (!originalTab || !currentTab || currentTab.active ||
        currentTab.groupId !== originalTab.groupId || currentTab.url !== originalTab.url) {
      return false;
    }
    const ts = latestActivationTimestamp(sessionTimestamp, currentTab.lastAccessed);
    return Number.isFinite(thresholdMs) && thresholdMs > 0 && ts > 0 && now - ts >= thresholdMs;
  }

  // Chrome storage.sync 的单项配额按 key 长度 + JSON 序列化后的 value 的 UTF-8 字节数计算。
  function storageItemByteLength(key, value) {
    const serialized = String(key || '') + JSON.stringify(value);
    return new TextEncoder().encode(serialized).length;
  }

  return {
    COLLATOR_LOCALE: COLLATOR_LOCALE,
    GROUP_COLOR_CSS: GROUP_COLOR_CSS,
    DOMAIN_GROUPING_MODES: DOMAIN_GROUPING_MODES,
    groupColorCss: groupColorCss,
    registrableDomain: registrableDomain,
    resolveGroupTitleSync: resolveGroupTitleSync,
    retryAsyncOperation: retryAsyncOperation,
    compareTabTitle: compareTabTitle,
    compareGroupTitle: compareGroupTitle,
    sortTabsByIndex: sortTabsByIndex,
    buildGroupSortMove: buildGroupSortMove,
    buildWindowSortPlan: buildWindowSortPlan,
    latestActivationTimestamp: latestActivationTimestamp,
    isDormantCandidateStillValid: isDormantCandidateStillValid,
    storageItemByteLength: storageItemByteLength
  };
});
