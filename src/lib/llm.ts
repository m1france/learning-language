import type { AgentProvider, ApiSettings } from '../domain'

/**
 * One client for every OpenAI-compatible chat endpoint the app talks to
 * (OpenRouter, Google Gemini, OpenAI, NVIDIA NIM, Moonshot).
 * Handles streaming (SSE), tool calls, reasoning tokens and readable errors.
 */

export type LlmConfig = {
  provider: AgentProvider
  endpoint: string
  key: string
  model: string
}

const ENDPOINTS: Record<AgentProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  kimi: 'https://api.moonshot.cn/v1/chat/completions',
}

export const DEFAULT_MODELS: Record<AgentProvider, string> = {
  openrouter: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  nvidia: 'meta/llama-3.3-70b-instruct',
  kimi: 'moonshot-v1-8k',
}

const KEY_FIELDS: Record<AgentProvider, keyof ApiSettings> = {
  openrouter: 'openRouterKey',
  google: 'googleKey',
  openai: 'openAiKey',
  nvidia: 'nvidiaKey',
  kimi: 'kimiKey',
}

const FALLBACK_ORDER: AgentProvider[] = ['openrouter', 'google', 'openai', 'nvidia', 'kimi']

const keyFor = (api: ApiSettings, provider: AgentProvider) => String(api[KEY_FIELDS[provider]] ?? '').trim()

/**
 * Picks the provider chosen in Settings, or the first one with a key.
 * `overrideModel` (a per-task model from Settings) wins over the main model.
 */
export function resolveLlm(api: ApiSettings, overrideModel?: string): LlmConfig | null {
  const preferred = api.agentProvider || 'openrouter'
  const order = [preferred, ...FALLBACK_ORDER.filter((p) => p !== preferred)]
  for (const provider of order) {
    const key = keyFor(api, provider)
    if (!key) continue
    // The main model belongs to the preferred provider: don't send it to another one.
    const mainModel = provider === preferred ? api.agentModel?.trim() : ''
    const model = overrideModel?.trim() || mainModel || DEFAULT_MODELS[provider]
    return { provider, endpoint: ENDPOINTS[provider], key, model }
  }
  return null
}

/** Same as resolveLlm but for an explicit provider (used for model fallbacks). */
export function llmFor(api: ApiSettings, provider: AgentProvider, model: string): LlmConfig | null {
  const key = keyFor(api, provider)
  return key ? { provider, endpoint: ENDPOINTS[provider], key, model } : null
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' } }

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

export type ToolDefinition = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ChatOptions = {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  json?: boolean
  /** OpenRouter reasoning effort for thinking models. */
  reasoningEffort?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
  title?: string
}

export type StreamHandlers = {
  onText?: (delta: string, full: string) => void
  onReasoning?: (delta: string, full: string) => void
}

export type ChatResult = {
  content: string
  reasoning: string
  toolCalls: ToolCall[]
  finishReason?: string
  model: string
  /** True when the model refused tools and the call was replayed without them. */
  toolsDropped?: boolean
}

export class LlmError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** Turns an HTTP failure into a sentence the learner can act on. */
export function describeHttpError(status: number, body: string, cfg: LlmConfig): string {
  let detail = body
  try {
    const parsed = JSON.parse(body)
    detail = parsed?.error?.message || parsed?.message || body
  } catch { /* raw text */ }
  detail = String(detail).slice(0, 220)
  const where = `${cfg.provider} · ${cfg.model}`
  if (status === 401 || status === 403) return `Clé API refusée (${where}). Vérifie-la dans Paramètres › Connexions.`
  if (status === 402) return `Crédits insuffisants sur ${cfg.provider} pour ${cfg.model}. Choisis un modèle gratuit (« :free ») ou recharge ton compte.`
  if (status === 404) return `Modèle introuvable ou indisponible : ${cfg.model}. ${detail}`
  if (status === 429) return `Trop de requêtes pour ${cfg.model} (limite des modèles gratuits). Réessaie dans un instant.`
  return `Erreur ${status} (${where}) : ${detail || 'réponse vide'}`
}

const toolsRejected = (status: number, body: string) =>
  (status === 400 || status === 404 || status === 422) && /tool|function/i.test(body)

const jsonRejected = (status: number, body: string) =>
  status === 400 && /response_format|json/i.test(body)

function buildBody(cfg: LlmConfig, options: ChatOptions, stream: boolean, withTools: boolean, withJson: boolean) {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: options.messages,
    stream,
  }
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens) body.max_tokens = options.maxTokens
  if (withTools && options.tools?.length) body.tools = options.tools
  if (withJson) body.response_format = { type: 'json_object' }
  if (cfg.provider === 'openrouter' && options.reasoningEffort) body.reasoning = { effort: options.reasoningEffort }
  return body
}

function headers(cfg: LlmConfig, title?: string): Record<string, string> {
  const base: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }
  if (cfg.provider === 'openrouter') {
    base['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://vivre-la-langue.app'
    base['X-Title'] = title || 'Vivre la langue'
  }
  return base
}

/** Reads whatever text a non-streaming completion carries (content parts, reasoning fallbacks). */
function contentOf(data: any): { content: string; reasoning: string; toolCalls: ToolCall[]; finishReason?: string } {
  const choice = data?.choices?.[0]
  const message = choice?.message ?? {}
  let content = ''
  if (typeof message.content === 'string') content = message.content
  else if (Array.isArray(message.content)) content = message.content.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('')
  const reasoning = String(message.reasoning || message.reasoning_content || '')
  const toolCalls: ToolCall[] = Array.isArray(message.tool_calls) ? message.tool_calls : []
  return { content: content.trim(), reasoning, toolCalls, finishReason: choice?.finish_reason }
}

async function post(cfg: LlmConfig, body: Record<string, unknown>, options: ChatOptions) {
  return fetch(cfg.endpoint, {
    method: 'POST',
    headers: headers(cfg, options.title),
    body: JSON.stringify(body),
    signal: options.signal,
  })
}

/**
 * Sends the request, replaying it without tools / JSON mode when the model
 * rejects them. Returns the successful response.
 */
async function send(cfg: LlmConfig, options: ChatOptions, stream: boolean): Promise<{ response: Response; toolsDropped: boolean }> {
  let withTools = Boolean(options.tools?.length)
  let withJson = Boolean(options.json)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await post(cfg, buildBody(cfg, options, stream, withTools, withJson), options)
    if (response.ok) return { response, toolsDropped: Boolean(options.tools?.length) && !withTools }
    const text = await response.text().catch(() => '')
    if (withTools && toolsRejected(response.status, text)) { withTools = false; continue }
    if (withJson && jsonRejected(response.status, text)) { withJson = false; continue }
    throw new LlmError(describeHttpError(response.status, text, cfg), response.status)
  }
  throw new LlmError(`Requête refusée par ${cfg.model}.`)
}

/** Non-streaming completion. */
export async function chat(cfg: LlmConfig, options: ChatOptions): Promise<ChatResult> {
  const { response, toolsDropped } = await send(cfg, options, false)
  const data = await response.json()
  if (data?.error) throw new LlmError(String(data.error.message || 'Erreur du fournisseur IA'))
  const parsed = contentOf(data)
  // Some reasoning models leave `content` empty and put everything in `reasoning`.
  const content = parsed.content || (!parsed.toolCalls.length ? parsed.reasoning.trim() : '')
  return { ...parsed, content, model: cfg.model, toolsDropped }
}

/** Streaming completion (SSE). Falls back to a plain request if the body can't be streamed. */
export async function streamChat(cfg: LlmConfig, options: ChatOptions, handlers: StreamHandlers = {}): Promise<ChatResult> {
  const { response, toolsDropped } = await send(cfg, options, true)
  if (!response.body || !(response.headers.get('content-type') || '').includes('event-stream')) {
    const data = await response.json()
    const parsed = contentOf(data)
    const content = parsed.content || (!parsed.toolCalls.length ? parsed.reasoning.trim() : '')
    if (content) handlers.onText?.(content, content)
    return { ...parsed, content, model: cfg.model, toolsDropped }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''
  let finishReason: string | undefined
  const calls: { id: string; name: string; args: string }[] = []

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let chunk: any
    try { chunk = JSON.parse(payload) } catch { return }
    if (chunk.error) throw new LlmError(String(chunk.error.message || 'Erreur du fournisseur IA'), chunk.error.code)
    const choice = chunk.choices?.[0]
    if (!choice) return
    const delta = choice.delta ?? {}
    const think = delta.reasoning ?? delta.reasoning_content
    if (typeof think === 'string' && think) {
      reasoning += think
      handlers.onReasoning?.(think, reasoning)
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content
      handlers.onText?.(delta.content, content)
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = typeof part.index === 'number' ? part.index : calls.length
        calls[index] ??= { id: '', name: '', args: '' }
        if (part.id) calls[index].id = part.id
        if (part.function?.name) calls[index].name += part.function.name
        if (part.function?.arguments) calls[index].args += part.function.arguments
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline).trim())
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }
  if (buffer.trim()) handleLine(buffer.trim())

  const toolCalls: ToolCall[] = calls
    .filter((call) => call?.name)
    .map((call, index) => ({ id: call.id || `call_${index}_${Date.now()}`, type: 'function', function: { name: call.name, arguments: call.args || '{}' } }))

  // Reasoning models occasionally answer only inside the reasoning channel.
  if (!content.trim() && !toolCalls.length && reasoning.trim()) {
    content = reasoning.trim()
    handlers.onText?.(content, content)
  }
  return { content, reasoning, toolCalls, finishReason, model: cfg.model, toolsDropped }
}

/**
 * Tries each config in turn and returns the first success — used where a
 * dead or paid-only model must not break the feature (transcription, analysis).
 */
export async function chatWithFallback(configs: LlmConfig[], options: ChatOptions): Promise<ChatResult> {
  let lastError: unknown = null
  for (const cfg of configs) {
    try {
      return await chat(cfg, options)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error
      lastError = error
      const status = (error as LlmError)?.status
      // Only move on for errors a different model can fix.
      if (status && ![400, 402, 404, 408, 422, 429, 500, 502, 503].includes(status)) break
    }
  }
  throw lastError instanceof Error ? lastError : new LlmError('Aucun modèle disponible.')
}

/** Parses the first JSON object/array found in a model answer (fences, <think>, chatter tolerated). */
export function parseJsonLoose<T = unknown>(raw: string): T {
  let text = (raw || '').trim()
  if (text.includes('</think>')) text = text.slice(text.lastIndexOf('</think>') + 8).trim() || text
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    return JSON.parse(text) as T
  } catch {
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0)
    const start = starts.length ? Math.min(...starts) : -1
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T
    throw new LlmError('Réponse illisible (JSON attendu).')
  }
}

/** Models known to accept audio input (used to decide whether to attach the recording). */
export function acceptsAudio(model: string): boolean {
  return /gemini|omni|inkling|voxtral|gpt-audio|audio/i.test(model)
}
