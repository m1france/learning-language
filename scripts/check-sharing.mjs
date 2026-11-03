import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Run the actual sharing service and scoped browser storage. Network responses
// are controlled so failures and account switches can be reproduced exactly.
const sources = {
  scope: readFileSync(new URL('../src/features/auth/storageScope.ts', import.meta.url), 'utf8'),
  sharing: readFileSync(new URL('../src/features/teacherExport/teacherExportService.ts', import.meta.url), 'utf8'),
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const clone = value => JSON.parse(JSON.stringify(value))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const lesson = (title = 'Alice lesson', id = 'lesson-1') => ({
  id, username: 'alice', resourceId: 'resource-1', resourceTitle: title,
  resourceAuthor: 'Author', chapterIndex: 0, chapterTitle: 'Chapter', pageIndex: 0,
  totalPages: 1, paragraphs: [], annotations: { strokes: [], liaisons: [], texts: [], grayed: [] },
  fontSize: 19, tooltips: [], wordComments: [], createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-03T10:00:00.000Z',
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
  window.location = { origin: 'https://example.test', hostname: 'example.test', pathname: '/', search: '', hash: '' }
  const requests = []
  let handler = () => jsonResponse({ ok: true })
  const context = vm.createContext({
    window, localStorage: new MemoryStorage(), Event, CustomEvent: DetailEvent, DOMException,
    URLSearchParams, console, Date,
    fetch: (url, init) => {
      requests.push({ url, init })
      try { return Promise.resolve(handler(url, init)) } catch (error) { return Promise.reject(error) }
    },
  })
  function load(source, imports = {}) {
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }
    const factory = vm.runInContext(`(function(require, module, exports) { ${javascript}\n})`, context)
    factory(name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name] }, module, module.exports)
    return module.exports
  }
  const scope = load(sources.scope)
  scope.setStorageScope('accountA')
  const service = load(sources.sharing, { '../auth/storageScope': scope })
  const seed = item => {
    scope.appStorage.setItem(`vivre_shared_lesson_${item.id}`, JSON.stringify(item))
    scope.appStorage.setItem('vivre_exported_lessons', JSON.stringify([item]))
  }
  return { scope, service, requests, seed, setFetch: next => { handler = next } }
}

let failures = 0
async function test(name, run) {
  try { await run(setup()); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`) }
}

await test('guests cannot publish or delete and make no private API call', async ({ scope, service, requests }) => {
  scope.setStorageScope('guest')
  await assert.rejects(service.saveExportedLesson(lesson()), /Connectez-vous/)
  await assert.rejects(service.deleteExportedLesson('lesson-1'), /Connectez-vous/)
  assert.equal(requests.length, 0)
  assert.equal(service.getExportedLesson('lesson-1'), null)
})

await test('HTTP publication failures never mark the lesson as published in local storage', async ({ service, setFetch, requests }) => {
  setFetch(() => jsonResponse({ error: 'Publication unavailable' }, 503))
  await assert.rejects(service.saveExportedLesson(lesson()), /Publication unavailable/)
  assert.equal(requests.length, 1)
  assert.equal(service.getExportedLesson('lesson-1'), null)
  assert.equal(service.getAllExportedLessons().length, 0)
})

await test('network publication failures retain the previous published version', async ({ service, setFetch, seed }) => {
  seed(lesson('Published original'))
  setFetch(() => { throw new TypeError('Offline') })
  await assert.rejects(service.saveExportedLesson(lesson('New unconfirmed version')), /Offline/)
  assert.equal(service.getExportedLesson('lesson-1').resourceTitle, 'Published original')
})

await test('confirmed publication authenticates the account and updates both local caches', async ({ service, requests }) => {
  const item = lesson()
  await service.saveExportedLesson(item)
  const request = requests[0]
  assert.equal(request.url, '/api/share/lessons')
  assert.equal(request.init.method, 'POST')
  assert.equal(request.init.credentials, 'same-origin')
  assert.equal(request.init.headers['X-Account-ID'], 'accountA')
  assert.deepEqual(JSON.parse(request.init.body), { lesson: item })
  assert.deepEqual(clone(service.getExportedLesson(item.id)), item)
  assert.deepEqual(clone(service.getAllExportedLessons()), [item])
})

await test('failed deletion leaves the published lesson and listing intact', async ({ service, setFetch, seed }) => {
  const item = lesson()
  seed(item)
  setFetch(() => jsonResponse({ error: 'Forbidden' }, 403))
  await assert.rejects(service.deleteExportedLesson(item.id), /Forbidden/)
  assert.deepEqual(clone(service.getExportedLesson(item.id)), item)
  assert.deepEqual(clone(service.getAllExportedLessons()), [item])
})

await test('confirmed deletion removes both local caches', async ({ service, seed, requests }) => {
  seed(lesson())
  await service.deleteExportedLesson('lesson-1')
  assert.equal(requests[0].init.method, 'DELETE')
  assert.equal(requests[0].init.headers['X-Account-ID'], 'accountA')
  assert.equal(service.getExportedLesson('lesson-1'), null)
  assert.equal(service.getAllExportedLessons().length, 0)
})

await test('account switches while publishing cannot cache the old lesson in the next account', async ({ scope, service, setFetch, seed }) => {
  const pending = deferred()
  setFetch(() => pending.promise)
  const publishing = service.saveExportedLesson(lesson('Alice update'))
  scope.setStorageScope('accountB')
  seed(lesson('Bob original'))
  pending.resolve(jsonResponse({ ok: true }))
  await assert.rejects(publishing, /compte a changé/)
  assert.equal(service.getExportedLesson('lesson-1').resourceTitle, 'Bob original')
})

await test('account switches while deleting cannot remove the next account lesson', async ({ scope, service, setFetch, seed }) => {
  seed(lesson('Alice original'))
  const pending = deferred()
  setFetch(() => pending.promise)
  const deleting = service.deleteExportedLesson('lesson-1')
  scope.setStorageScope('accountB')
  seed(lesson('Bob original'))
  pending.resolve(jsonResponse({ ok: true }))
  await assert.rejects(deleting, /compte a changé/)
  assert.equal(service.getExportedLesson('lesson-1').resourceTitle, 'Bob original')
})

await test('account switch between confirmation and the outer publish continuation cannot cache across accounts', async ({ scope, service, setFetch, seed }) => {
  const pending = deferred()
  setFetch(() => pending.promise)
  const publishing = service.saveExportedLesson(lesson('Alice update'))
  pending.resolve(jsonResponse({ ok: true }))
  queueMicrotask(() => { scope.setStorageScope('accountB'); seed(lesson('Bob original')) })
  await assert.rejects(publishing, /compte a changé/)
  assert.equal(service.getExportedLesson('lesson-1').resourceTitle, 'Bob original')
})

await test('account switch between confirmation and the outer delete continuation cannot delete across accounts', async ({ scope, service, setFetch, seed }) => {
  seed(lesson('Alice original'))
  const pending = deferred()
  setFetch(() => pending.promise)
  const deleting = service.deleteExportedLesson('lesson-1')
  pending.resolve(jsonResponse({ ok: true }))
  queueMicrotask(() => { scope.setStorageScope('accountB'); seed(lesson('Bob original')) })
  await assert.rejects(deleting, /compte a changé/)
  assert.equal(service.getExportedLesson('lesson-1').resourceTitle, 'Bob original')
})

await test('public reactions, comments and annotations call only their public action endpoints', async ({ scope, service, seed, requests }) => {
  scope.setStorageScope('guest')
  seed(lesson())
  const reactions = service.addLessonReaction('lesson-1', '👍')
  const comment = service.addLessonComment('lesson-1', 'Student', 'Thank you')
  service.addStudentFigmaComment('lesson-1', { pageIndex: 0, xPercent: 10, yPercent: 20, authorName: 'Student', text: 'A note' })
  service.addStudentSticker('lesson-1', { pageIndex: 0, xPercent: 10, yPercent: 20, emoji: '⭐' })
  assert.equal(reactions['👍'], 1)
  assert.equal(comment.text, 'Thank you')
  assert.deepEqual(requests.map(item => item.url), [
    '/api/share/lessons/lesson-1/reactions', '/api/share/lessons/lesson-1/comments',
    '/api/share/lessons/lesson-1/figma-comments', '/api/share/lessons/lesson-1/stickers',
  ])
  assert.ok(requests.every(item => item.init.method === 'POST'))
  assert.ok(requests.every(item => item.url !== '/api/share/lessons'))
})

await test('public fetch finishing in another account does not populate its cache', async ({ scope, service, setFetch }) => {
  const pending = deferred()
  setFetch(() => pending.promise)
  const loading = service.fetchSharedLesson('lesson-1')
  scope.setStorageScope('accountB')
  pending.resolve(jsonResponse({ lesson: lesson() }))
  assert.equal((await loading).id, 'lesson-1')
  assert.equal(service.getExportedLesson('lesson-1'), null)
})

if (failures) { console.error(`${failures} sharing checks failed`); process.exitCode = 1 }
else console.log('PASS: sharing confirmation, permissions, cache isolation and public interactions')
