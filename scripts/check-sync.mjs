import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the real sync and account-storage modules with deterministic network,
// browser events and timers. IndexedDB I/O is deferred at its module boundary so
// account switches and edits can be reproduced while restoration is in flight.
const storageSource = readFileSync(new URL('../src/features/auth/storageScope.ts', import.meta.url), 'utf8')
const syncSource = readFileSync(new URL('../src/features/sync/syncService.ts', import.meta.url), 'utf8')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const clone = value => JSON.parse(JSON.stringify(value))
const state = (name = 'Alice') => ({
  version: 3,
  settings: { name, learningLanguage: 'en', uiLanguage: 'fr', theme: 'light', api: { openAiKey: 'private-openai', googleKey: 'private-google', youtubeTranscriptApiKey: 'private-transcript', openRouterModel: 'model/example', ttsVoice: 'alloy' } },
  resources: [], words: [], progress: {}, sessions: [], writings: [],
})

function setup() {
  class MemoryStorage {
    values = new Map()
    get length() { return this.values.size }
    key(index) { return [...this.values.keys()][index] ?? null }
    getItem(key) { return this.values.get(String(key)) ?? null }
    setItem(key, value) { this.values.set(String(key), String(value)) }
    removeItem(key) { this.values.delete(String(key)) }
    clear() { this.values.clear() }
  }
  class DetailEvent extends Event { constructor(type, init) { super(type); this.detail = init?.detail } }
  const window = new EventTarget()
  window.location = { reload() {} }
  const document = new EventTarget()
  document.visibilityState = 'visible'
  document.createElement = () => ({ click() {} })
  const timers = new Map()
  let timerId = 0
  let fetchHandler = () => response({ payload: null, revision: 0 })
  const aux = {
    getAuxiliarySnapshot: async () => ({}),
    restoreAuxiliarySnapshot: async () => {},
  }
  const context = vm.createContext({
    window, document, navigator: { onLine: true }, localStorage: new MemoryStorage(),
    Event, CustomEvent: DetailEvent, DOMException, Blob, URL, Date, console,
    fetch: (...args) => fetchHandler(...args),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
  })
  function load(source, imports = {}) {
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    const factory = vm.runInContext(`(function(require, module, exports) { ${javascript}\n})`, context)
    factory(name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name] }, module, module.exports)
    return module.exports
  }
  const scope = load(storageSource)
  scope.setStorageScope('accountA')
  const store = {
    createState: (settings = {}) => { const next = state(settings.name || ''); next.settings.api = { openAiKey: '', googleKey: '', youtubeTranscriptApiKey: '', openRouterModel: '', ttsVoice: 'alloy' }; return next },
    loadState: () => { const raw = scope.appStorage.getItem('vivre-la-langue:state:v2'); return raw ? JSON.parse(raw) : null },
    saveState: value => scope.appStorage.setItem('vivre-la-langue:state:v2', JSON.stringify(value)),
  }
  store.saveState(state())
  const exports = load(syncSource, { '../../store': store, '../auth/storageScope': scope, './auxiliaryStorage': aux })
  const service = exports.syncService
  const env = {
    service, scope, store, aux, window, document, timers, exports,
    setFetch: handler => { fetchHandler = handler },
    clean: () => { scope.appStorage.setItem('vivre:sync:dirty', '0') },
    dirty: () => scope.appStorage.getItem('vivre:sync:dirty'),
    ready: async () => { await service.connect('accountA', 'Alice'); env.clean() },
  }
  return env
}

let failures = 0
async function test(name, run) {
  const env = setup()
  try { await run(env); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
  finally { env.service.stop() }
}

await test('browser caches and database names are isolated across account and guest scopes', async ({ scope, store }) => {
  const alice = store.loadState()
  scope.setStorageScope('accountB')
  assert.equal(store.loadState(), null)
  assert.equal(scope.getScopedDatabaseName('history'), 'history:accountB')
  store.saveState(state('Bob'))
  scope.setStorageScope('guest')
  assert.equal(store.loadState(), null)
  scope.appStorage.setItem('vivre-page-book', 'guest-page')
  assert.equal(scope.getScopedDatabaseName('history'), 'history')
  scope.setStorageScope('accountA')
  assert.deepEqual(store.loadState(), alice)
  scope.appStorage.clear()
  scope.setStorageScope('accountB')
  assert.equal(store.loadState().settings.name, 'Bob')
  scope.setStorageScope('guest')
  assert.equal(scope.appStorage.getItem('vivre-page-book'), 'guest-page')
})

await test('cloud snapshots strip API keys and exclude auth or sync metadata', async env => {
  await env.ready()
  env.scope.appStorage.setItem('vivre-page-book', 'page-9')
  env.scope.appStorage.setItem('vivre-session-token', 'do-not-upload')
  let uploaded
  env.setFetch((_url, init) => { uploaded = JSON.parse(init.body); return response({ revision: 1 }) })
  assert.equal(await env.service.push(), true)
  assert.equal(uploaded.payload.state.settings.api.openAiKey, '')
  assert.equal(uploaded.payload.state.settings.api.googleKey, '')
  assert.equal(uploaded.payload.state.settings.api.youtubeTranscriptApiKey, '')
  assert.equal(uploaded.payload.state.settings.api.openRouterModel, 'model/example')
  assert.equal(env.store.loadState().settings.api.openAiKey, 'private-openai')
  assert.deepEqual(uploaded.payload.extraStorage, { 'vivre-page-book': 'page-9' })
})

await test('successful upload advances revision and clears exactly the saved dirty state', async env => {
  await env.ready()
  env.service.schedulePush(env.store.loadState())
  env.setFetch((_url, init) => { assert.equal(JSON.parse(init.body).expectedRevision, 0); return response({ revision: 1 }) })
  assert.equal(await env.service.push(), true)
  assert.equal(env.scope.appStorage.getItem('vivre:sync:revision'), '1')
  assert.equal(env.dirty(), '0')
  assert.equal(env.service.getInfo().status, 'synced')
  assert.ok(env.service.getInfo().lastSyncedAt)
})

await test('revision conflicts preserve local edits and never report successful upload', async env => {
  await env.ready()
  env.store.saveState(state('Alice local edit'))
  env.setFetch((_url, init) => init?.method === 'PUT' ? response({ error: 'Revision conflict' }, 409) : response({ payload: { state: state('Remote'), extraStorage: {} }, revision: 2 }))
  assert.equal(await env.service.push(), false)
  assert.equal(env.dirty(), '1')
  assert.equal(env.service.getInfo().status, 'conflict')
  assert.equal(env.store.loadState().settings.name, 'Alice local edit')
  assert.equal(env.service.getInfo().lastSyncedAt, null)
})

await test('dirty pull uploads local edits instead of replacing them with remote state', async env => {
  await env.ready()
  env.store.saveState(state('Unsaved local'))
  env.setFetch((_url, init) => { assert.equal(init?.method, 'PUT'); return response({ revision: 1 }) })
  await env.service.pull()
  assert.equal(env.store.loadState().settings.name, 'Unsaved local')
  assert.equal(env.dirty(), '0')
})

await test('edits made during an in-flight upload remain dirty for another upload', async env => {
  await env.ready()
  const sent = deferred(), pending = deferred()
  env.setFetch((_url, init) => { sent.resolve(JSON.parse(init.body)); return pending.promise })
  const saving = env.service.push()
  const uploaded = await sent.promise
  env.store.saveState(state('New edit during upload'))
  pending.resolve(response({ revision: 1 }))
  assert.equal(await saving, true)
  assert.equal(uploaded.payload.state.settings.name, 'Alice')
  assert.equal(env.store.loadState().settings.name, 'New edit during upload')
  assert.equal(env.dirty(), '1')
  assert.ok(env.timers.size > 0, 'a later upload must remain scheduled')
})

await test('network failures retain dirty data and expose an error', async env => {
  await env.ready()
  env.store.saveState(state('Offline edit'))
  env.setFetch(() => { throw new TypeError('Network unavailable') })
  assert.equal(await env.service.push(), false)
  assert.equal(env.dirty(), '1')
  assert.equal(env.store.loadState().settings.name, 'Offline edit')
  assert.equal(env.service.getInfo().status, 'error')
  assert.equal(env.service.getInfo().lastSyncedAt, null)
})

await test('late storage events from a previous account cannot dirty the active account', async env => {
  await env.ready()
  env.scope.notifyStorageChange('previousAccount', 'vivre-assistant')
  assert.equal(env.dirty(), '0')
})

await test('logout during asynchronous restoration cannot overwrite the next account cache', async env => {
  await env.ready()
  const restoring = deferred(), finish = deferred()
  env.aux.restoreAuxiliarySnapshot = async () => { restoring.resolve(); await finish.promise }
  env.setFetch(() => response({ payload: { state: state('Remote Alice'), extraStorage: {}, auxiliary: {} }, revision: 4 }))
  const pulling = env.service.pull()
  await restoring.promise
  env.service.stop()
  env.scope.setStorageScope('accountB')
  env.store.saveState(state('Bob must remain'))
  env.clean()
  finish.resolve()
  await pulling
  assert.equal(env.store.loadState().settings.name, 'Bob must remain')
  assert.equal(env.scope.appStorage.getItem('vivre:sync:revision'), null)
  assert.equal(env.service.getInfo().status, 'idle')
})

await test('edits made while remote histories restore are retained and remain dirty', async env => {
  await env.ready()
  const restoring = deferred(), finish = deferred()
  env.aux.restoreAuxiliarySnapshot = async () => { restoring.resolve(); await finish.promise }
  env.setFetch(() => response({ payload: { state: state('Older remote Alice'), extraStorage: {}, auxiliary: {} }, revision: 4 }))
  const pulling = env.service.pull()
  await restoring.promise
  env.store.saveState(state('New edit during restore'))
  finish.resolve()
  await pulling
  assert.equal(env.store.loadState().settings.name, 'New edit during restore')
  assert.equal(env.dirty(), '1')
})

await test('failed requests from a stopped session cannot change the next session status', async env => {
  await env.ready()
  const pending = deferred()
  env.setFetch(() => pending.promise)
  const pulling = env.service.pull()
  env.service.stop()
  env.scope.setStorageScope('accountB')
  pending.reject(new TypeError('Old account request failed'))
  await pulling
  assert.equal(env.service.getInfo().status, 'idle')
})

await test('conflict lookup completing after logout cannot block the next account', async env => {
  await env.ready()
  const requested = deferred(), pending = deferred()
  env.setFetch((_url, init) => {
    if (init?.method === 'PUT') return response({}, 409)
    requested.resolve()
    return pending.promise
  })
  const saving = env.service.push()
  await requested.promise
  env.service.stop()
  env.scope.setStorageScope('accountB')
  env.store.saveState(state('Bob'))
  pending.resolve(response({ payload: { state: state('Alice'), extraStorage: {} }, revision: 9 }))
  assert.equal(await saving, false)
  assert.equal(env.service.getInfo().status, 'idle')
  assert.equal(env.store.loadState().settings.name, 'Bob')
})


await test('remote updates never unmount active learning activities or replace unsaved drafts', async env => {
  await env.ready()
  let restored = false
  env.aux.restoreAuxiliarySnapshot = async () => { restored = true }
  env.service.init(() => { throw new Error('Active UI must not be replaced automatically') })
  env.setFetch(() => response({ payload: { state: state('Remote'), extraStorage: {}, auxiliary: {} }, revision: 4 }))
  await env.service.pull()
  assert.equal(restored, false)
  assert.equal(env.store.loadState().settings.name, 'Alice')
  assert.equal(env.service.getInfo().status, 'conflict')
})

if (failures) { console.error(`${failures} synchronization checks failed`); process.exitCode = 1 }
else console.log('PASS: all synchronization and account-cache isolation checks')
