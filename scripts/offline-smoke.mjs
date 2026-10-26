import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
let passed = 0;
const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
function load(file, mocks = {}, extra = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => mocks[name] ?? {}, console: { warn() {}, error() {} }, setTimeout, clearTimeout, AbortController, DOMException, Request, URL, ...extra }, { filename: file });
  return module.exports;
}
const storageMap = new Map();
const localStorage = { getItem: key => storageMap.get(key) ?? null, setItem: (key, value) => storageMap.set(key, value) };
await check('offline database requests fail immediately without touching the network', async () => {
  let calls = 0;
  const { networkFetch } = load('src/backend/networkFetch.ts', {}, { navigator: { onLine: false }, fetch: () => { calls++; } });
  await assert.rejects(networkFetch('https://example.com'), /Offline/);
  assert.equal(calls, 0);
});
await check('Wi-Fi without internet aborts rather than hanging forever', async () => {
  let aborted = false;
  const { networkFetch } = load('src/backend/networkFetch.ts', {}, {
    navigator: { onLine: true }, setTimeout: fn => setTimeout(fn, 15),
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); })),
  });
  await assert.rejects(networkFetch('https://example.com'), /timed out/);
  assert.equal(aborted, true);
});
await check('online requests preserve responses and caller cancellation', async () => {
  const controller = new AbortController();
  const { networkFetch } = load('src/backend/networkFetch.ts', {}, { navigator: { onLine: true }, fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('cancelled')));
    controller.abort();
  }) });
  await assert.rejects(networkFetch('https://example.com', { signal: controller.signal }), /cancelled/);
});
storageMap.set('offlineChildrenCache', JSON.stringify([{ id: 'kid1', parentId: 'p1', childName: 'Test Learner', isActive: false }]));
storageMap.set('offlineLessonsCache', JSON.stringify([{ id: 'lesson1', is_published: 1 }]));
storageMap.set('offlineCategoryProgress', JSON.stringify({ kid1: [{ category_code: 'colors', category_score: 67 }] }));
const sqlite = load('src/backend/offlineSqlite.ts', {
  '@capacitor/core': { Capacitor: { isNativePlatform: () => true } },
  '@capacitor-community/sqlite': { CapacitorSQLite: { createConnection: async () => { throw new Error('SQLite unavailable'); } } },
}, { localStorage });
await check('native SQLite failure retains the local child roster', async () => {
  const rows = await sqlite.getOfflineChildrenFromSqlite();
  assert.equal(rows[0].id, 'kid1'); assert.equal(rows[0].is_active, 0);
});
await check('native SQLite failure retains lessons and progress', async () => {
  assert.equal((await sqlite.getOfflineLessonsFromSqlite())[0].id, 'lesson1');
  assert.equal((await sqlite.getOfflineCategoryProgress('kid1'))[0].category_score, 67);
});
await check('offline profiles stay scoped to their parent and preserve inactive status', async () => {
  const data = load('src/backend/supabaseData.ts', { './offlineSqlite': sqlite }, { navigator: { onLine: false }, localStorage });
  assert.equal((await data.getParentChildren('p1'))[0].id, 'kid1');
  assert.equal((await data.getParentChildren('p2')).length, 0);
  assert.equal((await data.getActiveChild('kid1')).isActive, false);
});
await check('opening a learner page uses the saved session before any network lookup', async () => {
  storageMap.set('activeChildId', 'kid1');
  const child = load('src/backend/childProgress.ts', {}, { navigator: { onLine: true }, localStorage });
  assert.equal(await child.getOrCreateActiveChildId(), 'kid1');
});

const worker = readFileSync('dist/sw.js', 'utf8');
const files = JSON.parse(worker.match(/const FILES = (.*);/)[1]);
const handlers = {};
const cacheData = new Map();
const deleted = [];
const origin = 'https://test.local';
const makeCache = name => ({
  add: async req => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(1));
    assert.ok(existsSync(`dist/${path}`), `missing ${path}`);
    cacheData.set(`${name}:${req.url}`, new Response(path === 'index.html' ? readFileSync('dist/index.html', 'utf8') : `cached:${path}`));
  },
  match: async req => cacheData.get(`${name}:${typeof req === 'string' ? req : req.url ?? req.href}`)?.clone(),
});
vm.runInNewContext(worker, {
  self: { registration: { scope: `${origin}/` }, location: { origin }, clients: { claim: async () => {} }, addEventListener: (name, fn) => { handlers[name] = fn; } },
  caches: { open: async name => makeCache(name), keys: async () => ['learnease-shell-old', 'offline-lesson-videos'], delete: async name => { deleted.push(name); } },
  URL, Request, Promise, fetch: async () => { throw new Error('offline'); },
});
await check('browser install saves every emitted script, style, image and audio file', async () => {
  let done; handlers.install({ waitUntil: p => { done = p; } }); await done;
  assert.ok(files.some(file => file.endsWith('.mp3')));
  assert.ok(files.some(file => file.includes('GameRouter') && file.endsWith('.js')));
  assert.equal(cacheData.size, files.length);
});
await check('nested lesson/game reloads work without internet', async () => {
  for (const path of ['/lesson/letters', '/quest/colors/sort', '/parent-children']) {
    let response; handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: origin + path }, respondWith: p => { response = p; } });
    const html = await (await response).text();
    assert.match(html, /src="\/assets\//);
  }
});
await check('lazy game files load offline; database requests are never cached', async () => {
  const file = files.find(file => file.includes('GameRouter') && file.endsWith('.js'));
  let response; handlers.fetch({ request: new Request(`${origin}/${file}`), respondWith: p => { response = p; } });
  assert.match(await (await response).text(), /cached:assets/);
  handlers.fetch({ request: new Request('https://database.example/rest/v1/children'), respondWith: () => { throw new Error('must not intercept private data'); } });
});
await check('cache updates preserve separately saved lesson videos', async () => {
  let done; handlers.activate({ waitUntil: p => { done = p; } }); await done;
  assert.deepEqual(deleted, ['learnease-shell-old']);
});
console.log(`${passed} offline checks passed.`);
