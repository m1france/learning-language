// Regression: a configured audio model must never fall back to a hidden text model.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename)
const originalLoad = Module._load
Module._load = function (name, parent, ...rest) {
  if (parent?.filename.endsWith('speakingCoachService.ts') && name === '../../lib/audio') return {
    decodeAudio: async () => new Float32Array(160), toSpeechPcm: async (x) => x,
    findPauses: () => [], encodeWav: () => new Blob(), blobToBase64: async () => 'test-audio',
  }
  if (parent?.filename.endsWith('speakingCoachService.ts') && name === './transcriptionService') return { speechStats: () => ({ wordsPerMinute: 100, fillers: 0 }) }
  return originalLoad.call(this, name, parent, ...rest)
}
const { coachSpeakingSession } = require('../src/features/speaking/speakingCoachService.ts')
const model = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
const options = {
  api: { agentProvider: 'openrouter', openRouterKey: 'test-key', agentModel: 'text-model', taskModelSpeakingAnalysis: model },
  transcript: { segments: [{ start: 0, end: 3, text: 'Hello there.' }] },
  durationSeconds: 3, blob: new Blob(['audio']), language: 'en', uiLanguage: 'fr',
}
let requests = []
async function main() {
  global.fetch = async (_, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ model, choices: [{ message: { content: '{"overallFeedback":"Good","items":[]}' } }] }), { status: 200 })
  }
  const result = await coachSpeakingSession(options)
  assert.equal(result.modelUsed, model)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].model, model)
  assert.ok(requests[0].messages[1].content.some((p) => p.type === 'input_audio'))
  requests = []
  global.fetch = async (_, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ error: { message: 'No endpoints available' } }), { status: 404 })
  }
  await assert.rejects(coachSpeakingSession(options))
  assert.equal(requests.length, 1, 'No hidden fallback after the configured model fails')
  assert.equal(requests[0].model, model)
  requests = []
  global.fetch = async (_, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ model: 'text-model', choices: [{ message: { content: '{"items":[]}' } }] }), { status: 200 })
  }
  await coachSpeakingSession({ ...options, api: { ...options.api, taskModelSpeakingAnalysis: 'text-model' } })
  assert.equal(typeof requests[0].messages[1].content, 'string', 'Text models never receive audio')
  console.log('PASS: configured model, audio payload, no hidden fallback, text-only payload')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
