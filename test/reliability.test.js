// test/reliability.test.js
// 针对后台初始化、并发分组、批量失败传播和映射容量保护的回归测试。
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { storageItemByteLength } = require('../common.js');

function eventSource() {
  return { addListener() {} };
}

function baseChrome() {
  return {
    tabs: {
      onUpdated: eventSource(),
      onCreated: eventSource(),
      onMoved: eventSource(),
      onActivated: eventSource(),
      onRemoved: eventSource()
    },
    tabGroups: {},
    alarms: { onAlarm: eventSource(), get: async () => ({}) },
    storage: {
      session: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}) }
    }
  };
}

function loadBackground(chrome) {
  const context = vm.createContext({ chrome, console, URL, setTimeout });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  return context;
}

async function testInitializationBarrier() {
  const chrome = baseChrome();
  const initial = { lastActivatedAt: { 1: new Date(1_000).toISOString() } };
  let releaseLoad;
  let stored = initial;
  chrome.storage.session.get = () => new Promise((resolve) => {
    releaseLoad = () => resolve(initial);
  });
  chrome.storage.session.set = async (value) => { stored = value; };
  chrome.tabs.get = async (id) => ({ id, lastAccessed: 2_000 });

  const context = loadBackground(chrome);
  const activation = context.recordActivation(2);
  releaseLoad();
  await activation;

  assert.deepStrictEqual(Object.keys(stored.lastActivatedAt).sort(), ['1', '2']);
}

async function testConcurrentGroupingIsSerialized() {
  const chrome = baseChrome();
  const tabs = [1, 2].map((id) => ({
    id,
    windowId: 1,
    groupId: -1,
    url: `https://example.com/${id}`
  }));
  const groups = [];
  let createCalls = 0;

  chrome.tabs.get = async (id) => ({ ...tabs.find((tab) => tab.id === id) });
  chrome.tabs.query = async () => tabs.map((tab) => ({ ...tab }));
  chrome.tabs.group = async ({ tabIds, groupId }) => {
    let targetId = groupId;
    if (targetId === undefined) {
      createCalls++;
      targetId = 10;
      groups.push({ id: targetId, windowId: 1, title: '' });
    }
    for (const id of Array.isArray(tabIds) ? tabIds : [tabIds]) {
      tabs.find((tab) => tab.id === id).groupId = targetId;
    }
    return targetId;
  };
  chrome.tabGroups.query = async () => groups.map((group) => ({ ...group }));
  chrome.tabGroups.get = async (id) => ({ ...groups.find((group) => group.id === id) });
  chrome.tabGroups.update = async (id, update) => Object.assign(groups.find((group) => group.id === id), update);
  chrome.tabs.ungroup = async () => {};

  const context = loadBackground(chrome);
  await Promise.all(tabs.map((tab) => context.groupTab({ ...tab })));

  assert.strictEqual(createCalls, 1);
  assert.strictEqual(groups[0].title, 'example.com');
}

async function testSortFailuresAreReported() {
  const chrome = {
    windows: { getAll: async () => [{ id: 1 }] },
    tabs: { query: async () => { throw new Error('query failed'); } },
    tabGroups: { query: async () => [] },
    storage: { sync: {} }
  };
  const context = vm.createContext({
    chrome,
    console: { error() {} },
    document: { addEventListener() {} },
    storageItemByteLength,
    URL,
    TextEncoder
  });
  vm.runInContext(fs.readFileSync(require.resolve('../popup.js'), 'utf8'), context);
  const result = await context.sortAllTabs();
  assert.deepStrictEqual({ ...result }, { attempted: 1, succeeded: 0, failed: 1 });
}

async function testMappingQuotaPreventsWrite() {
  let writes = 0;
  const chrome = {
    storage: {
      sync: {
        QUOTA_BYTES_PER_ITEM: 32,
        set: async () => { writes++; }
      }
    }
  };
  const context = vm.createContext({
    chrome,
    console,
    document: { addEventListener() {} },
    storageItemByteLength,
    URL,
    TextEncoder
  });
  vm.runInContext(fs.readFileSync(require.resolve('../popup.js'), 'utf8'), context);
  await assert.rejects(
    () => context.saveDomainMappings([{ domain: 'example.com', label: '一个很长的标签名称' }]),
    /超过 Chrome 同步存储单项上限/
  );
  assert.strictEqual(writes, 0);

  chrome.storage.sync.QUOTA_BYTES_PER_ITEM = 512;
  await context.saveDomainMappings([{ domain: 'example.com', label: '工作' }]);
  assert.strictEqual(writes, 1);
  assert.throws(
    () => context.parseMappingsFile(JSON.stringify([{ domain: 'example.com', label: 'a'.repeat(101) }])),
    /标签名不能超过 100 个字符/
  );
}

(async () => {
  await testInitializationBarrier();
  await testConcurrentGroupingIsSerialized();
  await testSortFailuresAreReported();
  await testMappingQuotaPreventsWrite();
  console.log('可靠性回归测试通过');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
