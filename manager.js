// manager.js
// 标签组管理页面：按窗口分区展示已存在的标签组，提供组级与全局的一键操作。
// 未分组的散落标签页不展示、也不参与任何操作；所有移动类操作严格限制在同一窗口内。
(function () {
  'use strict';

  const RENDER_DEBOUNCE_MS = 150;
  const UNTITLED_GROUP = '(未命名)';
  // 组内没有已打开标签页时（例如浏览器重启后已保存但未恢复的组）的统一提示
  const EMPTY_GROUP_HINT = '该标签组当前没有已打开的标签页，需先在浏览器标签栏中点开它，之后才能在此处操作';

  // 页面自身标签页 id：在所有展示与操作中排除
  let selfTabId = null;
  // 忙碌锁：批量操作期间禁用按钮并挂起事件刷新
  let isBusy = false;
  let pendingRefresh = false;
  let isRefreshing = false;
  let renderTimer = null;
  // 当前是否存在标签组，决定空状态与全局按钮可用性
  let hasGroups = false;
  // "自动关闭休眠"总开关在 manager 中的本地缓存（用于按钮启用/禁用；不持久化）
  let autoCloseEnabledCache = false;
  // 手动关闭休眠的输入框值（持久化在 chrome.storage.sync.manualCloseAfterMinutes）
  let manualCloseMinutesCache = 60;

  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindToolbar();
    registerEventListeners();
    refresh();
    refreshAutoCloseCache();
    refreshManualCloseCache();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }
      if (changes.autoCloseEnabled) {
        const next = changes.autoCloseEnabled.newValue;
        autoCloseEnabledCache = typeof next === 'boolean' ? next : false;
        applyButtonStates();
      }
      if (changes.manualCloseAfterMinutes) {
        const next = changes.manualCloseAfterMinutes.newValue;
        const minutes = Number.isFinite(next) && next >= 1 ? Math.floor(next) : 60;
        manualCloseMinutesCache = minutes;
        if (els.manualCloseMinutesInput) {
          els.manualCloseMinutesInput.value = String(minutes);
        }
        updateManualCloseButtonLabel();
        applyButtonStates();
      }
    });
  }

  // in-page 二次确认对话框：替代 window.confirm，避免扩展页内 confirm 静默失败
  // 返回 Promise<boolean>：用户点确认/取消/按 Esc 时分别 resolve(true/false)
  function showConfirmDialog(options) {
    const opts = options || {};
    const dialog = els.confirmDialog;
    if (!dialog || typeof dialog.showModal !== 'function') {
      // 确认框不可用时安全取消，且明确告知用户，避免危险操作静默失败。
      showConfirmDialogError();
      return Promise.resolve(false);
    }
    if (dialog.open) {
      // 已有对话框打开：拒绝重叠，按取消处理
      return Promise.resolve(false);
    }
    const titleEl = els.confirmDialogTitle;
    const messageEl = els.confirmDialogMessage;
    const confirmBtn = els.confirmDialogConfirm;
    const cancelBtn = els.confirmDialogCancel;
    if (titleEl) {
      titleEl.textContent = String(opts.title || '请确认');
    }
    if (messageEl) {
      messageEl.textContent = String(opts.message || '');
    }
    if (confirmBtn) {
      confirmBtn.textContent = String(opts.confirmText || '确认');
      confirmBtn.classList.toggle('danger', !!opts.danger);
    }
    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        if (confirmBtn) {
          confirmBtn.removeEventListener('click', onConfirm);
        }
        if (cancelBtn) {
          cancelBtn.removeEventListener('click', onCancel);
        }
        dialog.removeEventListener('close', onClose);
        dialog.removeEventListener('cancel', onCancelEvent);
      };
      const settle = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      };
      const onConfirm = () => {
        if (dialog.open) {
          dialog.close('confirm');
        }
        settle(true);
      };
      const onCancel = () => {
        if (dialog.open) {
          dialog.close('cancel');
        }
        settle(false);
      };
      const onClose = () => {
        // dialog.close 触发 close 事件；返回值 'cancel' 时为取消，其他（含 'confirm'）走 settle 路径
        const returnValue = dialog.returnValue;
        if (returnValue === 'confirm') {
          settle(true);
        } else {
          settle(false);
        }
      };
      const onCancelEvent = (event) => {
        // Esc 触发 cancel 事件；默认行为会关闭 dialog，无需 preventDefault
        settle(false);
      };
      if (confirmBtn) {
        confirmBtn.addEventListener('click', onConfirm);
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', onCancel);
      }
      dialog.addEventListener('close', onClose, { once: true });
      dialog.addEventListener('cancel', onCancelEvent, { once: true });
      try {
        dialog.showModal();
      } catch (e) {
        showConfirmDialogError();
        settle(false);
        return;
      }
    });
  }

  function showConfirmDialogError() {
    if (els.errorText && els.errorBanner) {
      showError('确认对话框无法打开，操作已取消');
    }
  }

  // 拉取"自动关闭休眠"总开关到本地缓存；用于按钮启用/禁用判断
  async function refreshAutoCloseCache() {
    try {
      const { autoCloseEnabled } = await chrome.storage.sync.get('autoCloseEnabled');
      autoCloseEnabledCache = typeof autoCloseEnabled === 'boolean' ? autoCloseEnabled : false;
    } catch (error) {
      autoCloseEnabledCache = false;
    }
    applyButtonStates();
  }

  // 拉取"手动关闭休眠"输入框值（持久化在 chrome.storage.sync.manualCloseAfterMinutes）
  async function refreshManualCloseCache() {
    try {
      const { manualCloseAfterMinutes } = await chrome.storage.sync.get('manualCloseAfterMinutes');
      const minutes = Number.isFinite(manualCloseAfterMinutes) && manualCloseAfterMinutes >= 1
        ? Math.floor(manualCloseAfterMinutes)
        : 60;
      manualCloseMinutesCache = minutes;
    } catch (error) {
      manualCloseMinutesCache = 60;
    }
    if (els.manualCloseMinutesInput) {
      els.manualCloseMinutesInput.value = String(manualCloseMinutesCache);
    }
    updateManualCloseButtonLabel();
    bindManualCloseInput();
    applyButtonStates();
  }

  // 输入框只绑一次：避免 storage.onChanged 反复触发表单重建
  function bindManualCloseInput() {
    if (!els.manualCloseMinutesInput || els.manualCloseMinutesInput.dataset.bound === '1') {
      return;
    }
    els.manualCloseMinutesInput.dataset.bound = '1';
    els.manualCloseMinutesInput.addEventListener('input', () => {
      // 实时刷新按钮文案（即使非法也维持缓存值文案，让用户看见自己输入的数字）
      updateManualCloseButtonLabel();
      applyButtonStates();
    });
    els.manualCloseMinutesInput.addEventListener('change', async () => {
      const value = Number(els.manualCloseMinutesInput.value);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        els.manualCloseMinutesInput.value = String(manualCloseMinutesCache);
        showManualCloseError('请输入大于等于 1 的整数分钟数');
        updateManualCloseButtonLabel();
        applyButtonStates();
        return;
      }
      hideManualCloseError();
      manualCloseMinutesCache = value;
      try {
        await chrome.storage.sync.set({ manualCloseAfterMinutes: value });
      } catch (error) {
        console.error('保存手动关闭休眠阈值失败：', error);
      }
      updateManualCloseButtonLabel();
      applyButtonStates();
    });
    els.manualCloseMinutesInput.addEventListener('blur', () => {
      const value = Number(els.manualCloseMinutesInput.value);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
        els.manualCloseMinutesInput.value = String(manualCloseMinutesCache);
        showManualCloseError('请输入大于等于 1 的整数分钟数');
      } else {
        hideManualCloseError();
      }
      updateManualCloseButtonLabel();
      applyButtonStates();
    });
  }

  function updateManualCloseButtonLabel() {
    if (!els.manualCloseButton) {
      return;
    }
    const value = Number(els.manualCloseMinutesInput && els.manualCloseMinutesInput.value);
    const display = Number.isFinite(value) && value >= 1 ? value : manualCloseMinutesCache;
    els.manualCloseButton.textContent = '关闭 >' + display + ' 分钟未活动';
  }

  function showManualCloseError(message) {
    if (!els.manualCloseError) {
      return;
    }
    els.manualCloseError.textContent = message;
    els.manualCloseError.style.display = 'inline';
  }

  function hideManualCloseError() {
    if (!els.manualCloseError) {
      return;
    }
    els.manualCloseError.textContent = '';
    els.manualCloseError.style.display = 'none';
  }

  function cacheElements() {
    els.toolbar = document.querySelector('.toolbar');
    els.windowsContainer = document.getElementById('windows-container');
    els.summary = document.getElementById('summary');
    els.emptyState = document.getElementById('empty-state');
    els.busyBanner = document.getElementById('busy-banner');
    els.busyText = document.getElementById('busy-text');
    els.errorBanner = document.getElementById('error-banner');
    els.errorText = document.getElementById('error-text');
    els.resultBanner = document.getElementById('result-banner');
    els.resultText = document.getElementById('result-text');
    els.manualCloseMinutesInput = document.getElementById('manual-close-minutes');
    els.manualCloseButton = document.querySelector('[data-action="manual-close-dormant"]');
    els.manualCloseError = document.getElementById('manual-close-error');
    els.confirmDialog = document.getElementById('confirm-dialog');
    els.confirmDialogTitle = document.getElementById('confirm-dialog-title');
    els.confirmDialogMessage = document.getElementById('confirm-dialog-message');
    els.confirmDialogConfirm = els.confirmDialog && els.confirmDialog.querySelector('[data-confirm-action="confirm"]');
    els.confirmDialogCancel = els.confirmDialog && els.confirmDialog.querySelector('[data-confirm-action="cancel"]');
  }

  // 顶部工具栏与提示条按钮为静态 DOM，只需绑定一次
  function bindToolbar() {
    const globalHandlers = {
      'expand-all': () => setAllCollapsed(false),
      'collapse-all': () => setAllCollapsed(true),
      'sort-all': () => sortAllWindows(),
      'ungroup-all': () => ungroupAllGroups(),
      'close-dormant': () => runCloseDormantTabs(null),
      'manual-close-dormant': () => executeManualClose(),
      'close-all': () => closeAllGroupTabs(),
      'refresh': () => refresh()
    };

    document.querySelectorAll('.toolbar button[data-action]').forEach((button) => {
      const handler = globalHandlers[button.dataset.action];
      if (handler) {
        button.addEventListener('click', handler);
      }
    });

    document.querySelector('[data-action="retry"]').addEventListener('click', () => {
      hideError();
      refresh();
    });
    document.querySelector('[data-action="dismiss-result"]').addEventListener('click', () => {
      hideResult();
    });
  }

  // ===== 数据加载 =====

  // 加载快照：并发查询后在前端按 windowId 分桶，派生「窗口 → 标签组 → 标签页」三层模型
  async function loadSnapshot() {
    const [windows, groups, tabs, currentTab, currentWindow] = await Promise.all([
      chrome.windows.getAll(),
      chrome.tabGroups.query({}),
      chrome.tabs.query({}),
      chrome.tabs.getCurrent(),
      chrome.windows.getCurrent()
    ]);

    selfTabId = currentTab ? currentTab.id : null;
    const currentWindowId = currentWindow ? currentWindow.id : null;

    // 按 groupId 归集标签页；管理页面自身标签页不参与展示与任何操作
    const tabsByGroupId = new Map();
    for (const tab of tabs) {
      if (tab.id === selfTabId) {
        continue;
      }
      if (typeof tab.groupId !== 'number' || tab.groupId === -1) {
        continue;
      }
      if (!tabsByGroupId.has(tab.groupId)) {
        tabsByGroupId.set(tab.groupId, []);
      }
      tabsByGroupId.get(tab.groupId).push(tab);
    }

    // 组装组模型并按 windowId 归集；组内标签页顺序即标签条位置顺序
    const groupsByWindowId = new Map();
    let emptyGroupCount = 0;
    for (const group of groups) {
      const groupTabs = sortTabsByIndex(tabsByGroupId.get(group.id) || []);
      if (groupTabs.length === 0) {
        emptyGroupCount++;
      }
      if (!groupsByWindowId.has(group.windowId)) {
        groupsByWindowId.set(group.windowId, []);
      }
      // 即使组内没有任何已打开的标签页也必须展示（例如已保存但尚未恢复的组），
      // 静默丢弃会让用户在页面上完全看不到这些组
      groupsByWindowId.get(group.windowId).push({
        id: group.id,
        title: group.title || UNTITLED_GROUP,
        color: group.color,
        collapsed: !!group.collapsed,
        saved: !!group.saved,
        windowId: group.windowId,
        tabs: groupTabs,
        // 无已打开标签页的组没有标签条位置，排在有标签页的组之后
        minIndex: groupTabs.length > 0 ? groupTabs[0].index : Number.MAX_SAFE_INTEGER
      });
    }

    // 含标签组的窗口按 windows.getAll() 的顺序编号；已关闭的窗口自然不出现
    const windowModels = [];
    const matchedWindowIds = new Set();
    for (const win of windows) {
      const winGroups = groupsByWindowId.get(win.id);
      if (!winGroups || winGroups.length === 0) {
        continue;
      }
      matchedWindowIds.add(win.id);
      // 区块内组卡片按其在标签条中的实际位置排序
      winGroups.sort((a, b) => a.minIndex - b.minIndex);
      windowModels.push({
        windowId: win.id,
        label: '窗口 ' + (windowModels.length + 1),
        isCurrent: win.id === currentWindowId,
        groups: winGroups,
        tabCount: winGroups.reduce((sum, group) => sum + group.tabs.length, 0)
      });
    }

    // 兜底：windowId 不在 windows.getAll() 里的组（已保存但未打开的组不挂在任何
    // 活动窗口的标签条上，其 windowId 可能为 -1）同样不能被静默丢弃，归入独立区块
    const detachedGroups = [];
    for (const [windowId, list] of groupsByWindowId) {
      if (matchedWindowIds.has(windowId)) {
        continue;
      }
      detachedGroups.push(...list);
    }
    if (detachedGroups.length > 0) {
      detachedGroups.sort((a, b) => a.minIndex - b.minIndex);
      windowModels.push({
        windowId: null,
        label: detachedGroups.every((g) => g.tabs.length === 0)
          ? '已保存但未打开的标签组'
          : '未关联窗口的标签组',
        isCurrent: false,
        isDetached: true,
        groups: detachedGroups,
        tabCount: detachedGroups.reduce((sum, group) => sum + group.tabs.length, 0)
      });
    }

    return {
      windows: windowModels,
      // 原始统计：用于在页面上直接暴露 chrome.tabGroups.query() 到底返回了多少组
      stats: { totalGroups: groups.length, emptyGroups: emptyGroupCount }
    };
  }

  async function refresh() {
    if (isRefreshing) {
      // 已有一次加载在进行中：合并为一次待刷新，避免并发查询与渲染交错
      pendingRefresh = true;
      return;
    }
    isRefreshing = true;
    try {
      const snapshot = await loadSnapshot();
      // 先刷新最近激活时间缓存，再 render，确保 tab-item tooltip 一次就拿到正确时间
      await refreshLastActivatedCache();
      render(snapshot);
      hideError();
    } catch (error) {
      console.error('Error loading tab groups:', error);
      hasGroups = false;
      els.summary.textContent = '读取标签组失败';
      els.windowsContainer.replaceChildren();
      els.emptyState.hidden = true;
      applyButtonStates();
      showError('加载标签组失败：' + messageOf(error));
    } finally {
      isRefreshing = false;
    }
    // flush 加载期间新到达的变更
    if (pendingRefresh) {
      pendingRefresh = false;
      refresh();
    }
  }

  // ===== 渲染 =====

  // 全量重建三层 DOM；渲染前后保持滚动位置
  function render(snapshot) {
    const scrollElement = document.scrollingElement || document.documentElement;
    const scrollTop = scrollElement.scrollTop;

    hasGroups = snapshot.windows.length > 0;
    els.emptyState.hidden = hasGroups;
    // 把原始统计直接显示出来：如果这里报的组数比你在浏览器里看到的少，
    // 就说明 chrome.tabGroups.query() 根本没返回那些组，属平台限制而非页面 bug
    const stats = snapshot.stats || { totalGroups: 0, emptyGroups: 0 };
    els.summary.textContent = 'chrome.tabGroups.query() 共返回 ' + stats.totalGroups + ' 个标签组' +
      (stats.emptyGroups > 0 ? '，其中 ' + stats.emptyGroups + ' 个没有已打开的标签页' : '，全部都有已打开的标签页');
    els.windowsContainer.replaceChildren();
    for (const windowModel of snapshot.windows) {
      els.windowsContainer.appendChild(buildWindowBlock(windowModel));
    }

    scrollElement.scrollTop = scrollTop;
    applyButtonStates();
  }

  function buildWindowBlock(windowModel) {
    const block = document.createElement('section');
    block.className = 'window-block';

    const header = document.createElement('header');
    header.className = 'window-header';

    const title = document.createElement('h2');
    title.textContent = windowModel.label;
    header.appendChild(title);

    if (windowModel.isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '当前窗口';
      header.appendChild(badge);
    }

    const stat = document.createElement('span');
    stat.className = 'window-stat';
    stat.textContent = windowModel.groups.length + ' 个标签组 · ' + windowModel.tabCount + ' 个标签页';
    header.appendChild(stat);

    block.appendChild(header);

    const list = document.createElement('div');
    list.className = 'group-list';
    for (const group of windowModel.groups) {
      list.appendChild(buildGroupCard(group));
    }
    block.appendChild(list);

    return block;
  }

  // 组状态文案：区分"已展开/已折叠"与"已保存但标签页未打开"
  function stateTextOf(group, hasTabs) {
    const collapseText = group.collapsed ? '已折叠' : '已展开';
    if (!hasTabs) {
      return group.saved ? '已保存 · 标签页未打开' : '无打开的标签页';
    }
    return group.saved ? collapseText + ' · 已保存' : collapseText;
  }

  function buildGroupCard(group) {
    const hasTabs = group.tabs.length > 0;
    const card = document.createElement('article');
    card.className = 'group-card';
    // 左侧色条与色点使用组颜色，与浏览器标签条观感对齐
    card.style.borderLeftColor = groupColorCss(group.color);

    const header = document.createElement('div');
    header.className = 'group-card-header';

    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.backgroundColor = groupColorCss(group.color);
    header.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = group.title;
    header.appendChild(name);

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = hasTabs ? group.tabs.length + ' 个标签页' : '未打开';
    header.appendChild(count);

    const state = document.createElement('span');
    state.className = 'group-state' + (hasTabs && group.collapsed ? ' group-state-collapsed' : '');
    if (!hasTabs) {
      state.className += ' group-state-empty';
    }
    state.textContent = stateTextOf(group, hasTabs);
    header.appendChild(state);

    const actions = document.createElement('div');
    actions.className = 'group-actions';
    actions.appendChild(makeButton(group.collapsed ? '展开' : '折叠', 'toggle-collapse',
      () => toggleGroupCollapsed(group.id, group.collapsed), false, !hasTabs));
    actions.appendChild(makeButton('排序', 'sort-group', () => sortGroup(group.id), false, !hasTabs));
    actions.appendChild(makeButton('解散', 'ungroup-group', () => ungroupGroup(group.id), false, !hasTabs));
    actions.appendChild(makeButton('关闭休眠', 'close-dormant-group',
      () => runCloseDormantTabs(group.id), false, !hasTabs));
    actions.appendChild(makeButton('关闭标签页', 'close-group-tabs',
      () => closeGroupTabs(group.id, group.title), true, !hasTabs));
    header.appendChild(actions);

    card.appendChild(header);

    // 无已打开标签页的组：所有操作均不可用，明确告知需先在浏览器标签栏里点开
    if (!hasTabs) {
      const hint = document.createElement('p');
      hint.className = 'group-hint';
      hint.textContent = EMPTY_GROUP_HINT;
      card.appendChild(hint);
    }

    // 折叠组与无标签页的组，其标签页列表以收起形式呈现，不占用视觉空间
    const tabList = buildTabList(group.tabs);
    tabList.hidden = group.collapsed || !hasTabs;
    card.appendChild(tabList);

    return card;
  }

  function makeButton(text, action, onClick, isDanger, unavailable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = text;
    if (isDanger) {
      button.className = 'danger';
    }
    if (unavailable) {
      // 用 data-disabled-reason 标记结构性禁用，避免 applyButtonStates 把它恢复成可用
      button.dataset.disabledReason = EMPTY_GROUP_HINT;
      button.title = EMPTY_GROUP_HINT;
    }
    button.addEventListener('click', onClick);
    return button;
  }

  function buildTabList(groupTabs) {
    const list = document.createElement('ul');
    list.className = 'tab-list';
    if (groupTabs.length > 0) {
      const header = document.createElement('li');
      header.className = 'tab-item tab-head';
      ['', '页面', '路径', '休眠'].forEach((label) => {
        const cell = document.createElement('span');
        cell.textContent = label;
        header.appendChild(cell);
      });
      list.appendChild(header);
    }
    groupTabs.forEach((tab, position) => {
      list.appendChild(buildTabItem(tab, position + 1));
    });
    return list;
  }

  function buildTabItem(tab, position) {
    const item = document.createElement('li');
    item.className = 'tab-item';
    // 悬浮显示完整标题、URL、最后激活时间（由 buildTabItem 末尾再补时间行）
    item.title = (tab.title || '(无标题)') + '\n' + (tab.url || '') + '\n最后激活：' + relativeActivated(tab);

    const index = document.createElement('span');
    index.className = 'tab-index';
    index.textContent = String(position);
    item.appendChild(index);

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || '(无标题)';
    item.appendChild(title);

    const host = document.createElement('span');
    host.className = 'tab-host';
    const pathPreview = pathPreviewOf(tab.url);
    if (pathPreview) {
      const pathEl = document.createElement('span');
      pathEl.className = 'tab-host-path';
      pathEl.textContent = pathPreview;
      host.appendChild(pathEl);
    }
    item.appendChild(host);

    const dormancy = document.createElement('span');
    dormancy.className = 'tab-dormancy';
    dormancy.textContent = formatDormancy(tab);
    item.appendChild(dormancy);

    // 点击条目跳转：激活该标签页并聚焦其所在窗口（管理页面自身保持打开）
    item.addEventListener('click', () => jumpToTab(tab));

    return item;
  }

  // ===== 忙碌锁与提示条 =====

  function setBusy(busy, label) {
    isBusy = busy;
    els.busyText.textContent = busy ? (label || '正在处理…') : '';
    els.busyBanner.hidden = !busy;
    if (!busy) {
      // 解锁时统一刷新一次：既反映本次操作结果，也 flush 忙碌期间挂起的事件
      if (renderTimer !== null) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      pendingRefresh = false;
      refresh();
    }
    applyButtonStates();
  }

  function applyButtonStates() {
    document.querySelectorAll('button[data-action]').forEach((button) => {
      // 结构性禁用（如无已打开标签页的组）优先，不能被忙碌状态解除后误恢复
      if (button.dataset.disabledReason) {
        button.disabled = true;
        return;
      }
      if (isBusy) {
        // 批量操作期间禁用全部操作按钮，避免重复触发
        button.disabled = true;
        return;
      }
      const action = button.dataset.action;
      if (action === 'retry' || action === 'dismiss-result') {
        button.disabled = false;
        return;
      }
      // 关闭休眠：总开关关闭时禁用（仅全局与组级按钮受影响；手动入口与"自动"正交）
      if (action === 'close-dormant' || action === 'close-dormant-group') {
        if (!autoCloseEnabledCache) {
          button.disabled = true;
          button.title = '自动关闭休眠已关闭，请先在弹窗中开启';
          return;
        }
        button.title = '';
      } else if (action === 'manual-close-dormant') {
        // 手动入口不受总开关控制；仅输入框为空或非法值时 disabled
        const raw = els.manualCloseMinutesInput && els.manualCloseMinutesInput.value;
        const value = Number(raw);
        if (!raw || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
          button.disabled = true;
          button.title = '请输入大于等于 1 的整数分钟数';
          return;
        }
        button.title = '';
      }
      // 空状态下禁用全局批量操作，仅保留"刷新"
      const isToolbarBatch = action !== 'refresh' && els.toolbar.contains(button);
      button.disabled = isToolbarBatch && !hasGroups;
    });
  }

  // 在忙碌锁保护下执行一次操作；失败项累积后统一提示，不中断其余项、不回滚已成功项
  async function runExclusive(label, operation) {
    if (isBusy) {
      // 操作进行中的重复点击直接忽略
      return;
    }
    hideResult();
    setBusy(true, label);
    const failures = [];
    try {
      await operation(failures);
    } catch (error) {
      console.error('Operation failed:', error);
      failures.push(messageOf(error));
    }
    setBusy(false);
    if (failures.length > 0) {
      showResult(failures.length + ' 项操作未完成：' + failures.join('；'));
    }
  }

  function showError(message) {
    els.errorText.textContent = message;
    els.errorBanner.hidden = false;
  }

  function hideError() {
    els.errorBanner.hidden = true;
  }

  function showResult(message) {
    els.resultText.textContent = message;
    els.resultBanner.hidden = false;
  }

  function hideResult() {
    els.resultBanner.hidden = true;
  }

  // ===== 组级操作 =====

  // 展开 / 折叠：仅改变折叠状态；目标状态与当前一致时短路，不发调用
  async function toggleGroupCollapsed(groupId, currentlyCollapsed) {
    const target = !currentlyCollapsed;
    await runExclusive(target ? '正在展开标签组…' : '正在折叠标签组…', async () => {
      const group = await chrome.tabGroups.get(groupId);
      if (!!group.collapsed === target) {
        return;
      }
      await retryAsyncOperation(() => chrome.tabGroups.update(groupId, { collapsed: target }));
    });
  }

  // 组内排序：单次 move 完成重排；折叠组先临时展开、完成后恢复折叠
  async function sortGroup(groupId) {
    await runExclusive('正在排序标签组…', async () => {
      const group = await chrome.tabGroups.get(groupId);
      const tabs = await chrome.tabs.query({ groupId: groupId });
      const move = buildGroupSortMove({
        tabs: tabs.filter((tab) => tab.id !== selfTabId)
      });
      // 已处于目标顺序（或组内不足 2 个标签页）时无副作用短路
      if (!move) {
        return;
      }

      const wasCollapsed = !!group.collapsed;
      if (wasCollapsed) {
        await retryAsyncOperation(() => chrome.tabGroups.update(groupId, { collapsed: false }));
      }
      try {
        // 显式传 windowId：既保证移动不跨窗口，也让"数组内标签页按给定顺序落位"的语义生效
        await retryAsyncOperation(() =>
          chrome.tabs.move(move.tabIds, { windowId: group.windowId, index: move.index }));
      } finally {
        if (wasCollapsed) {
          try {
            await retryAsyncOperation(() => chrome.tabGroups.update(groupId, { collapsed: true }));
          } catch (restoreError) {
            console.warn('恢复折叠状态失败:', restoreError);
          }
        }
      }
    });
  }

  // 解散分组：取消分组但保留全部标签页
  async function ungroupGroup(groupId) {
    await runExclusive('正在解散分组…', async (failures) => {
      const tabs = await chrome.tabs.query({ groupId: groupId });
      const ids = tabs.filter((tab) => tab.id !== selfTabId).map((tab) => tab.id);
      if (ids.length === 0) {
        failures.push('该标签组中没有可解散的标签页（仅剩本管理页面）');
        return;
      }
      await retryAsyncOperation(() => chrome.tabs.ungroup(ids));
    });
  }

  // 关闭组内标签页：二次确认，取消则不产生任何副作用
  async function closeGroupTabs(groupId, groupTitle) {
    await runExclusive('正在关闭标签页…', async (failures) => {
      const tabs = await chrome.tabs.query({ groupId: groupId });
      const ids = tabs.filter((tab) => tab.id !== selfTabId).map((tab) => tab.id);
      if (ids.length === 0) {
        failures.push('「' + groupTitle + '」中没有可关闭的标签页（仅剩本管理页面）');
        return;
      }
      const confirmed = await showConfirmDialog({
        title: '关闭组内标签页',
        message: '确定关闭「' + groupTitle + '」中的 ' + ids.length + ' 个标签页？此操作不可撤销。',
        confirmText: '关闭',
        danger: true
      });
      if (!confirmed) {
        return;
      }
      await retryAsyncOperation(() => chrome.tabs.remove(ids));
    });
  }

  // 点击组内标签页条目：激活该标签页并聚焦其所在窗口
  async function jumpToTab(tab) {
    if (isBusy) {
      // 批量操作（尤其是连续 move）进行中不跳转，避免标签页不可编辑报错
      return;
    }
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      console.error('Error activating tab:', error);
      showResult('跳转失败：' + messageOf(error));
    }
  }

  // ===== 全局操作 =====

  // 全部展开 / 全部折叠：串行遍历所有组，已处于目标状态的组跳过
  async function setAllCollapsed(collapsed) {
    const label = collapsed ? '正在折叠全部标签组…' : '正在展开全部标签组…';
    await runExclusive(label, async (failures) => {
      const groups = await chrome.tabGroups.query({});
      for (const group of groups) {
        if (!!group.collapsed === collapsed) {
          continue;
        }
        try {
          await retryAsyncOperation(() => chrome.tabGroups.update(group.id, { collapsed: collapsed }));
        } catch (error) {
          failures.push('「' + (group.title || UNTITLED_GROUP) + '」' +
            (collapsed ? '折叠' : '展开') + '失败：' + messageOf(error));
        }
      }
    });
  }

  // 全部排序：逐窗口独立执行，一趟完成"组间按标题排序 + 组内按标题排序"
  async function sortAllWindows() {
    await runExclusive('正在排序全部标签组…', async (failures) => {
      const snapshot = await loadSnapshot();
      for (const windowModel of snapshot.windows) {
        // 不挂在活动窗口上的组无法参与移动排序（chrome.tabs.move 需要有效 windowId）
        if (windowModel.windowId === null) {
          continue;
        }
        const plan = buildWindowSortPlan(windowModel.groups);
        for (const move of plan) {
          try {
            await retryAsyncOperation(() =>
              chrome.tabs.move(move.tabIds, { windowId: windowModel.windowId, index: move.index }));
          } catch (error) {
            // 同一窗口内后续移动依赖前序结果，中断该窗口但继续处理其他窗口
            failures.push(windowModel.label + '排序失败：' + messageOf(error));
            break;
          }
        }
      }
    });
  }

  // 全部解散：逐窗口逐组取消分组，保留全部标签页
  async function ungroupAllGroups() {
    await runExclusive('正在解散全部分组…', async (failures) => {
      const snapshot = await loadSnapshot();
      for (const windowModel of snapshot.windows) {
        for (const group of windowModel.groups) {
          const ids = group.tabs.map((tab) => tab.id);
          // 无已打开标签页的组无可解散对象，跳过（传空数组给 ungroup 会报错）
          if (ids.length === 0) {
            continue;
          }
          try {
            await retryAsyncOperation(() => chrome.tabs.ungroup(ids));
          } catch (error) {
            failures.push(windowModel.label + '「' + group.title + '」解散失败：' + messageOf(error));
          }
        }
      }
    });
  }

  // 全部关闭标签页：确认文案包含标签页总数与标签组数量
  async function closeAllGroupTabs() {
    await runExclusive('正在关闭标签页…', async (failures) => {
      const snapshot = await loadSnapshot();
      let groupCount = 0;
      let tabCount = 0;
      for (const windowModel of snapshot.windows) {
        for (const group of windowModel.groups) {
          // 只统计有已打开标签页的组，否则确认文案里的组数会虚高
          if (group.tabs.length === 0) {
            continue;
          }
          groupCount++;
          tabCount += group.tabs.length;
        }
      }
      if (tabCount === 0) {
        return;
      }
      const confirmed = await showConfirmDialog({
        title: '关闭全部标签页',
        message: '确定关闭 ' + groupCount + ' 个标签组中的 ' + tabCount + ' 个标签页？\n' +
          '未分组的标签页与本管理页面不会被关闭。',
        confirmText: '全部关闭',
        danger: true
      });
      if (!confirmed) {
        return;
      }
      for (const windowModel of snapshot.windows) {
        for (const group of windowModel.groups) {
          const ids = group.tabs.map((tab) => tab.id);
          // 无已打开标签页的组无可关闭对象，跳过
          if (ids.length === 0) {
            continue;
          }
          try {
            await retryAsyncOperation(() => chrome.tabs.remove(ids));
          } catch (error) {
            failures.push(windowModel.label + '「' + group.title + '」关闭失败：' + messageOf(error));
          }
        }
      }
    });
  }

  // ===== 关闭休眠标签页 =====

  // 客户端副本：避免每次关闭都去 sync 读；与 popup.js / background.js 共享语义
  const AUTO_CLOSE_DEFAULTS = { enabled: false, minutes: 60 };

  async function getAutoCloseConfigClient() {
    try {
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
    } catch (error) {
      return { ...AUTO_CLOSE_DEFAULTS };
    }
  }

  // 取标签页最近激活时间：session 缓存 → tab.lastAccessed → 0（数据完全缺失）
  function lastActivatedFor(tab) {
    const fromSession = lastActivatedCache[tab.id];
    const fromTab = tab && tab.lastAccessed;
    return latestActivationTimestamp(fromSession, fromTab);
  }

  // 把命中标签页格式化为确认框预览行：'组标题：标签页标题'，过长截断
  function previewLineOf(groupTitle, tab) {
    const group = (groupTitle || UNTITLED_GROUP).slice(0, 24);
    const title = (tab.title || tab.url || '(无标题)').slice(0, 48);
    return group + '：' + title;
  }

  // 关闭休眠标签页（按弹窗 autoCloseAfterMinutes 阈值）：targetGroupId 为 null 表示作用于全部组
  async function runCloseDormantTabs(targetGroupId) {
    if (isBusy) {
      return;
    }
    await refreshAutoCloseCache();
    if (!autoCloseEnabledCache) {
      showResult('自动关闭休眠已关闭，请先在弹窗中开启');
      return;
    }
    const cfg = await getAutoCloseConfigClient();
    return runCloseDormantTabsWithThreshold(targetGroupId, cfg.minutes * 60 * 1000);
  }

  // 关闭休眠标签页（按调用方提供的阈值 ms）：targetGroupId 为 null 表示作用于全部组
  async function runCloseDormantTabsWithThreshold(targetGroupId, idleThresholdMs) {
    if (isBusy) {
      return;
    }
    hideResult();
    await refreshLastActivatedCache();

    if (!Number.isFinite(idleThresholdMs) || idleThresholdMs <= 0) {
      showResult('阈值不合法，请输入大于等于 1 的整数分钟数');
      return;
    }

    const snapshot = await loadSnapshot();
    const groups = [];
    for (const winModel of snapshot.windows) {
      for (const group of winModel.groups) {
        if (targetGroupId !== null && group.id !== targetGroupId) {
          continue;
        }
        if (group.tabs.length === 0) {
          // 跳过无已打开标签页的组（与既有"关闭组内标签页"逻辑一致）
          continue;
        }
        groups.push(group);
      }
    }

    const now = Date.now();
    // 命中集合：[{ groupId, groupTitle, tab }]，同时记录预览
    const hits = [];
    for (const group of groups) {
      for (const tab of group.tabs) {
        if (tab.id === selfTabId) {
          // 永远不关掉管理页面自身
          continue;
        }
        const ts = lastActivatedFor(tab);
        if (ts <= 0) {
          // 数据完全缺失 ≠ 休眠
          continue;
        }
        if (now - ts >= idleThresholdMs) {
          hits.push({ groupId: group.id, groupTitle: group.title, tab });
        }
      }
    }

    if (hits.length === 0) {
      if (targetGroupId !== null) {
        const group = groups.find((g) => g.id === targetGroupId);
        const label = group ? (group.title || UNTITLED_GROUP) : UNTITLED_GROUP;
        showResult('「' + label + '」中没有休眠标签页可关闭');
      } else {
        showResult('没有休眠标签页可关闭');
      }
      return;
    }

    // 二次确认文案
    const groupsAffected = new Set(hits.map((h) => h.groupId)).size;
    const PREVIEW_MAX = 10;
    const previewLines = hits.slice(0, PREVIEW_MAX).map((h) => previewLineOf(h.groupTitle, h.tab));
    let confirmMessage;
    if (targetGroupId !== null) {
      const group = groups.find((g) => g.id === targetGroupId);
      const label = group ? (group.title || UNTITLED_GROUP) : UNTITLED_GROUP;
      confirmMessage = '确定关闭「' + label + '」中 ' + hits.length + ' 个休眠标签页？此操作不可撤销。';
    } else {
      confirmMessage = '确定关闭 ' + hits.length + ' 个休眠标签页（来自 ' + groupsAffected +
        ' 个标签组）？此操作不可撤销。';
    }
    if (previewLines.length > 0) {
      confirmMessage += '\n预览：\n- ' + previewLines.join('\n- ') +
        (hits.length > PREVIEW_MAX ? '\n… 还有 ' + (hits.length - PREVIEW_MAX) + ' 个' : '');
    }
    const confirmed = await showConfirmDialog({
      title: '关闭休眠标签页',
      message: confirmMessage,
      confirmText: '关闭',
      danger: true
    });
    if (!confirmed) {
      return;
    }

    // 确认框打开期间标签状态可能已变化。删除前刷新缓存并逐项读取当前状态。
    await refreshLastActivatedCache();
    const revalidatedHits = [];
    const revalidateNow = Date.now();
    for (const hit of hits) {
      try {
        const currentTab = await chrome.tabs.get(hit.tab.id);
        const sessionTimestamp = lastActivatedCache[currentTab.id];
        if (isDormantCandidateStillValid(hit.tab, currentTab, sessionTimestamp, idleThresholdMs, revalidateNow)) {
          revalidatedHits.push({ groupId: hit.groupId, groupTitle: hit.groupTitle, tab: currentTab });
        }
      } catch (error) {
        // 标签已关闭或不可访问时视为状态变化，不再处理。
      }
    }
    if (revalidatedHits.length === 0) {
      showResult('候选标签状态已变化，没有标签页被关闭');
      return;
    }

    // 串行 remove：失败累积、不中断其余、不回滚
    const failures = [];
    let closed = 0;
    await runExclusive('正在关闭休眠标签页…', async () => {
      const byGroup = new Map();
      for (const h of revalidatedHits) {
        if (!byGroup.has(h.groupId)) {
          byGroup.set(h.groupId, { title: h.groupTitle, ids: [] });
        }
        byGroup.get(h.groupId).ids.push(h.tab.id);
      }
      for (const [, info] of byGroup) {
        try {
          await retryAsyncOperation(() => chrome.tabs.remove(info.ids));
          closed += info.ids.length;
        } catch (error) {
          failures.push('「' + (info.title || UNTITLED_GROUP) + '」关闭失败：' + messageOf(error));
        }
      }
    });

    if (failures.length > 0) {
      showResult('已关闭 ' + closed + ' 个休眠标签页（' + failures.length + ' 个失败：' + failures.join('；') + '）');
    } else {
      showResult('已关闭 ' + closed + ' 个休眠标签页');
    }
  }

  // 手动入口：工具栏独立 row 的"关闭 >N 分钟未活动"按钮
  // 注意：手动入口不受 autoCloseEnabled 总开关控制——它是用户在 manager 页面
  // 主动、明确的一次性操作，已通过输入框表达具体意愿
  async function executeManualClose() {
    if (isBusy) {
      return;
    }
    const minutes = Number(els.manualCloseMinutesInput && els.manualCloseMinutesInput.value);
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1) {
      showResult('请输入大于等于 1 的整数分钟数');
      return;
    }
    return runCloseDormantTabsWithThreshold(null, minutes * 60 * 1000);
  }

  // ===== 实时刷新 =====

  function registerEventListeners() {
    // 标签组事件：创建、移动、移除、属性变更（标题/颜色/折叠状态/所属窗口）
    chrome.tabGroups.onCreated.addListener(scheduleRender);
    chrome.tabGroups.onMoved.addListener(scheduleRender);
    chrome.tabGroups.onRemoved.addListener(scheduleRender);
    chrome.tabGroups.onUpdated.addListener(scheduleRender);

    // 标签页事件：创建、关闭、移动、附加/脱离分组
    chrome.tabs.onCreated.addListener(scheduleRender);
    chrome.tabs.onRemoved.addListener(scheduleRender);
    chrome.tabs.onMoved.addListener(scheduleRender);
    chrome.tabs.onAttached.addListener(scheduleRender);
    chrome.tabs.onDetached.addListener(scheduleRender);
    // onUpdated 高频触发（favicon、加载状态等），仅在影响展示的字段变化时刷新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.title || changeInfo.url || changeInfo.status === 'complete') {
        scheduleRender();
      }
    });

    // 窗口事件：窗口开关影响区块列表，焦点变化影响"当前窗口"标识
    chrome.windows.onCreated.addListener(scheduleRender);
    chrome.windows.onRemoved.addListener(scheduleRender);
    chrome.windows.onFocusChanged.addListener(scheduleRender);
  }

  // 合并高频事件：debounce 后统一刷新；忙碌期间只挂起标记，解锁时由 setBusy 统一 flush
  function scheduleRender() {
    if (isBusy) {
      pendingRefresh = true;
      return;
    }
    if (renderTimer !== null) {
      clearTimeout(renderTimer);
    }
    renderTimer = setTimeout(() => {
      renderTimer = null;
      refresh();
    }, RENDER_DEBOUNCE_MS);
  }

  // ===== 工具 =====

  function hostOf(url) {
    if (!url) {
      return '';
    }
    try {
      return new URL(url).hostname;
    } catch (error) {
      return '';
    }
  }

  // 路径首段：`pathname + search` 截断到 48 字符，根路径/解析异常返回空
  function pathPreviewOf(url) {
    if (!url) {
      return '';
    }
    try {
      const parsed = new URL(url);
      const raw = (parsed.pathname || '') + (parsed.search || '');
      if (!raw || raw === '/') {
        return '';
      }
      const MAX = 48;
      if (raw.length <= MAX) {
        return raw;
      }
      return raw.slice(0, MAX) + '…';
    } catch (error) {
      return '';
    }
  }

  // 缓存：tabId → 相对时间文本。render() 开始时刷新；render 期间命中缓存走
  let lastActivatedCache = Object.create(null);

  async function refreshLastActivatedCache() {
    try {
      const stored = await chrome.storage.session.get('lastActivatedAt');
      const raw = stored && stored.lastActivatedAt;
      const next = Object.create(null);
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw)) {
          const tabId = Number(key);
          const ts = Date.parse(value);
          if (Number.isFinite(tabId) && Number.isFinite(ts)) {
            next[tabId] = ts;
          }
        }
      }
      lastActivatedCache = next;
    } catch (error) {
      // session 不可用时保留旧缓存，不影响渲染
      lastActivatedCache = Object.create(null);
    }
  }

  // 标签页最近激活时间的相对文案（中文）：优先 session 缓存 → tab.lastAccessed → 未知
  function relativeActivated(tab) {
    const fromSession = lastActivatedCache[tab.id];
    const fromTab = tab && Number.isFinite(tab.lastAccessed) && tab.lastAccessed > 0 ? tab.lastAccessed : 0;
    const ts = latestActivationTimestamp(fromSession, fromTab);
    if (!ts) {
      return '未知';
    }
    const diff = Date.now() - ts;
    if (diff < 0) {
      return '刚刚';
    }
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) {
      return '刚刚';
    }
    if (minutes < 60) {
      return minutes + ' 分钟前';
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + ' 小时前';
    }
    const days = Math.floor(hours / 24);
    return days + ' 天前';
  }

  // 休眠列紧凑格式：未知 / 刚刚 / Nm / Nh / Nd；与 tooltip 解耦，列宽紧张时仍可读
  function formatDormancy(tab) {
    const fromSession = lastActivatedCache[tab.id];
    const fromTab = tab && Number.isFinite(tab.lastAccessed) && tab.lastAccessed > 0 ? tab.lastAccessed : 0;
    const ts = latestActivationTimestamp(fromSession, fromTab);
    if (!ts) {
      return '未知';
    }
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) {
      return '刚刚';
    }
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
      return minutes + 'm';
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + 'h';
    }
    const days = Math.floor(hours / 24);
    return days + 'd';
  }

  function messageOf(error) {
    if (!error) {
      return '未知错误';
    }
    return typeof error.message === 'string' && error.message ? error.message : String(error);
  }
})();
