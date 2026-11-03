import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import net from 'node:net'
import { request as httpRequest } from 'node:http'

// This suite checks the public onboarding boundary. Account identity, OAuth and
// synchronization isolation receive their own integration coverage below.
const temp = await mkdtemp(path.join(tmpdir(), 'll-security-'))
const dist = path.join(temp, 'dist'), data = path.join(temp, 'data'), capture = path.join(temp, 'email.json')
await mkdir(dist); await mkdir(data)
await writeFile(path.join(dist, 'index.html'), '<!doctype html><head></head><body>fixture</body>')
await writeFile(path.join(dist, 'worker.mjs'), 'export default 1')
await writeFile(capture, '{}')
const socket = net.createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const base = `http://127.0.0.1:${port}`
const origin = 'https://langues.example.com'
const upstreamMock = path.join(temp, 'upstream.mjs')
await writeFile(upstreamMock, `
import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, init) => {
  if (url === 'https://api.resend.com/emails') {
    if (init.headers.Authorization !== 'Bearer fake-resend-key') throw new Error('Wrong email auth');
    writeFileSync(process.env.SECURITY_EMAIL_CAPTURE, init.body);
    return Response.json({ id: 'test-only-email' });
  }
  if (!['https://api-free.deepl.com/v2/translate', 'https://api.deepl.com/v2/translate'].includes(url)) throw new Error('Unexpected upstream');
  if (init.headers.Authorization !== 'DeepL-Auth-Key fake-key') throw new Error('Wrong upstream auth');
  return Response.json({ translations: [{ text: 'Bonjour' }] });
};`)
let child, logs = '', cookie, accountId
const start = async () => {
  child = spawn(process.execPath, ['--import', upstreamMock, 'server/dist/index.js'], { env: { ...process.env,
    DATABASE_URL: '', NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), APP_ORIGIN: origin,
    DATA_DIR: data, DIST_DIR: dist, RESEND_API_KEY: 'fake-resend-key', AUTH_EMAIL_FROM: 'test@example.com',
    SECURITY_EMAIL_CAPTURE: capture, GOOGLE_CLIENT_SECRET: '', TWILIO_AUTH_TOKEN: '', TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', b => { logs += b }); child.stderr.on('data', b => { logs += b })
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`)
    try { await fetch(`${base}/api/health`); return } catch { await new Promise(resolve => setTimeout(resolve, 50)) }
  }
  throw new Error(`Server not ready: ${logs}`)
}
const stop = async () => { if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited } }
const request = (url, init = {}, authenticated = false) => fetch(base + url, { ...init, headers: {
  ...(!['GET', 'HEAD', 'OPTIONS'].includes(init.method || 'GET') ? { Origin: origin } : {}),
  ...(authenticated ? { Cookie: cookie, 'X-Account-ID': accountId } : {}), ...init.headers } })
const post = (url, body, headers = {}, authenticated = true) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, authenticated)
// Send oversized Content-Length headers without streaming megabytes after the
// rejection. Node/Undici can otherwise surface EPIPE while still writing an
// upload whose HTTP 413 response has already closed the connection.
const rejectedUpload = (url, method, size) => new Promise((resolve, reject) => {
  const upload = httpRequest(base + url, { method, headers: {
    Origin: origin, Cookie: cookie, 'X-Account-ID': accountId,
    'Content-Type': 'application/json', 'Content-Length': size,
  } }, response => {
    response.resume()
    response.on('end', () => { upload.destroy(); resolve({ status: response.statusCode, headers: new Headers(response.headers) }) })
    response.on('error', reject)
  })
  upload.on('error', reject)
  upload.setTimeout(5000, () => { upload.destroy(new Error('Oversized request was not rejected from its headers')) })
  upload.flushHeaders()
})

try {
  const noOrigin = spawn(process.execPath, ['server/dist/index.js'], { env: { ...process.env, DATABASE_URL: '', NODE_ENV: 'production', APP_ORIGIN: '', DATA_DIR: data }, stdio: 'ignore' })
  const [code] = await once(noOrigin, 'exit')
  assert.notEqual(code, 0, 'production must fail closed without the configured application origin')
  await start()
  for (const url of ['/', '/api/health']) assert.equal((await request(url)).status, 200, 'onboarding and health must be publicly reachable')
  for (const [url, method] of [['/api/account/progress', 'GET'], ['/api/share/lessons', 'GET'], ['/api/share/lessons/demo', 'DELETE']]) {
    assert.equal((await request(url, { method })).status, 401, `${method} ${url} requires an account`)
  }
  assert.equal((await post('/api/share/lessons', { id: 'demo', username: 'mathis' }, {}, false)).status, 401)
  assert.equal((await request('/api/share/lessons', { headers: { 'x-deployment-token': 'legacy-gate-is-not-an-account' } })).status, 401)
  assert.equal((await post('/api/auth/code/request', { identifier: 'test@example.com' }, { Origin: 'https://evil.example' }, false)).status, 403)
  assert.equal((await post('/api/auth/code/request', { identifier: 'test@example.com' }, { Origin: '' }, false)).status, 403)
  const challengeResponse = await post('/api/auth/code/request', { identifier: 'test@example.com' }, {}, false)
  assert.equal(challengeResponse.status, 200)
  const { challengeId } = await challengeResponse.json()
  const email = JSON.parse(await readFile(capture, 'utf8'))
  const loginResponse = await post('/api/auth/code/verify', { challengeId, code: email.text.match(/\b\d{6}\b/)[0] }, {}, false)
  assert.equal(loginResponse.status, 200)
  cookie = loginResponse.headers.getSetCookie().find(value => value.startsWith('vivre_session=')).split(';')[0]
  accountId = (await loginResponse.json()).user.id
  assert.equal((await request('/api/share/lessons', { headers: { Cookie: cookie } })).status, 403, 'cookie alone cannot select a tab account')
  assert.equal((await post('/api/share/lessons', { id: 'demo', username: 'mathis' }, { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await post('/api/share/lessons', { id: '__proto__', username: 'mathis' })).status, 400)
  assert.equal((await post('/api/share/lessons', { id: {}, username: 'mathis' })).status, 400)
  assert.equal((await post('/api/share/lessons', null)).status, 400)
  assert.equal((await request('/api/share/lessons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, true)).status, 400)
  assert.equal((await request('/api/share/lessons', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }, true)).status, 415)
  const oversizedLesson = await rejectedUpload('/api/share/lessons', 'POST', 2 * 1024 * 1024 + 100)
  assert.equal(oversizedLesson.status, 413)
  assert.equal(oversizedLesson.headers.get('connection'), 'close', 'oversized uploads must not leave unread data on a reusable socket')
  const oversizedProgress = await rejectedUpload('/api/account/progress', 'PUT', 10 * 1024 * 1024 + 100)
  assert.equal(oversizedProgress.status, 413)
  assert.equal(oversizedProgress.headers.get('connection'), 'close')
  assert.equal((await post('/api/share/lessons', { lesson: { id: 'demo', username: 'mathis', title: 'test' } })).status, 200)
  assert.equal((await request('/api/share/lessons/demo')).status, 200)
  assert.equal((await post('/api/share/lessons/demo/comments', { text: 3 })).status, 400)
  assert.equal((await post('/api/share/lessons/demo/comments', { text: 'Hello', authorName: 'Élève' })).status, 200)
  assert.equal((await post('/api/share/lessons/demo/reactions', { emoji: '👍' })).status, 200)
  assert.equal((await post('/api/share/lessons/demo/reactions', { emoji: '__proto__' })).status, 400)
  assert.equal((await post('/api/share/lessons/demo/figma-comments', { text: 'Note', pageIndex: 0, xPercent: 10, yPercent: 20 })).status, 200)
  assert.equal((await post('/api/share/lessons/demo/stickers', { emoji: '👍', pageIndex: -1, xPercent: 10, yPercent: 20 })).status, 400)
  assert.equal((await post('/api/share/lessons/demo/stickers', { emoji: '👍', pageIndex: 0, xPercent: 10, yPercent: 20 })).status, 200)
  assert.equal((await request('/api/not-a-route')).status, 404)
  assert.equal((await request('/worker.mjs')).headers.get('content-type'), 'application/javascript')
  const html = await request('/?owner=mathis')
  assert.equal(html.headers.get('set-cookie'), null)
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(html.headers.get('cache-control'), 'no-store')
  assert.equal(html.headers.get('access-control-allow-origin'), null)
  assert.ok(!(await html.text()).includes('__IS_MATHIS_MAC__'))
  assert.equal((await post('/api/deepl/other/translate', { text: ['Hello'], target_lang: 'FR' }, {}, false)).status, 400)
  for (const plan of ['free', 'pro']) {
    const response = await post(`/api/deepl/${plan}/translate`, { text: ['Hello'], target_lang: 'FR' }, { 'X-DeepL-Key': 'fake-key' }, false)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).translations[0].text, 'Bonjour')
  }
  await stop(); await start()
  assert.equal((await (await request('/api/share/lessons/demo')).json()).lesson.studentComments[0].text, 'Hello', 'persist across restart')
  assert.equal((await request('/api/share/lessons/demo', { method: 'DELETE' }, true)).status, 200)
  assert.equal((await request('/api/share/lessons/demo')).status, 404)
  await writeFile(path.join(data, 'shared_lessons.json'), JSON.stringify({ legacy: { id: 'legacy', username: 'mathis' } }))
  assert.equal((await request('/api/share/lessons/legacy')).status, 200)
  assert.equal((await post('/api/share/lessons', { id: 'legacy', username: 'mathis' })).status, 403, 'legacy records cannot be claimed by guessing IDs')
  assert.equal((await request('/api/share/lessons/legacy', { method: 'DELETE' }, true)).status, 404)
  const corrupt = '{corrupt'
  await writeFile(path.join(data, 'shared_lessons.json'), corrupt)
  assert.equal((await post('/api/share/lessons', { id: 'new', username: 'mathis' })).status, 500)
  assert.equal(await readFile(path.join(data, 'shared_lessons.json'), 'utf8'), corrupt, 'corrupt storage must never be overwritten')
  console.log('PASS: public onboarding, account gate, origin, MIME, JSON/size limits, validation, interactions, fixed guest DeepL proxy, persistence, legacy ownership, corruption guard')
} finally { await stop(); await rm(temp, { recursive: true, force: true }) }
await import('./check-auth.mjs')
