import { streamChat, type ChatMessage, type ContentPart, type LlmConfig, type ToolDefinition } from '../../lib/llm'
import type { Attachment, BlockState, ChatTurn } from './assistantTypes'
import { BLOCK_TYPES } from './assistantPrompt'

/**
 * Agent loop: stream an answer, run the tools the model asks for, feed the
 * results back, repeat (bounded). Works with models that don't support
 * tools: the request is replayed without them.
 */

const MAX_STEPS = 5
const HISTORY_TURNS = 24

const FENCE = /```([a-z-]+)\s*\n([\s\S]*?)```/g

/** Interactive blocks are heavy JSON: keep a one-line trace (and the learner's score) in the history. */
export function compressForHistory(content: string, blocks?: Record<string, BlockState>): string {
  let index = -1
  return content.replace(FENCE, (whole, lang: string, body: string) => {
    if (!(BLOCK_TYPES as readonly string[]).includes(lang)) return whole
    // Same numbering as the renderer: only interactive blocks count.
    index += 1
    let title = ''
    try { title = JSON.parse(body)?.title ?? '' } catch { /* svg/html */ }
    const state = blocks?.[String(index)]
    const score = state?.total ? ` — learner scored ${state.score}/${state.total}` : state?.done ? ' — completed' : ''
    return `[${lang} block${title ? ` "${title}"` : ''} shown to the learner${score}]`
  })
}

export function attachmentText(attachment: Attachment): string {
  switch (attachment.kind) {
    case 'image': return `[image: ${attachment.label}]`
    default: return `<attached ${attachment.kind} label="${attachment.label}">\n${attachment.content ?? ''}\n</attached>`
  }
}

function userMessage(turn: ChatTurn, full: boolean): ChatMessage {
  const attachments = turn.attachments ?? []
  const textParts = attachments.filter((a) => a.kind !== 'image').map((a) => (full ? attachmentText(a) : `[attached ${a.kind}: ${a.label}]`))
  const text = [...textParts, turn.content].filter(Boolean).join('\n\n')
  const images = full ? attachments.filter((a) => a.kind === 'image' && a.dataUrl) : []
  if (!images.length) return { role: 'user', content: text }
  const parts: ContentPart[] = [{ type: 'text', text }, ...images.map((image) => ({ type: 'image_url' as const, image_url: { url: image.dataUrl! } }))]
  return { role: 'user', content: parts }
}

/** Conversation → chat messages. Attachments are sent in full only for the last few user turns. */
export function buildHistory(turns: ChatTurn[]): ChatMessage[] {
  const recent = turns.filter((turn) => !turn.error || turn.content).slice(-HISTORY_TURNS)
  const userIndexes = recent.map((turn, index) => (turn.role === 'user' ? index : -1)).filter((index) => index >= 0)
  const fullFrom = userIndexes.length > 2 ? userIndexes[userIndexes.length - 2] : 0
  const messages: ChatMessage[] = []
  recent.forEach((turn, index) => {
    if (turn.role === 'user') messages.push(userMessage(turn, index >= fullFrom))
    else if (turn.content.trim()) messages.push({ role: 'assistant', content: compressForHistory(turn.content, turn.blocks) })
  })
  return messages
}

export type AgentCallbacks = {
  onText: (full: string) => void
  onReasoning?: (full: string) => void
  onToolStart?: (id: string, name: string) => void
  onToolEnd?: (id: string, name: string, summary: string, ok: boolean) => void
}

export type AgentResult = { content: string; reasoning: string; model: string; toolsSupported: boolean }

export async function runAgent(options: {
  cfg: LlmConfig
  system: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  executeTool?: (name: string, args: string) => Promise<{ content: string; summary: string }>
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  callbacks: AgentCallbacks
}): Promise<AgentResult> {
  const conversation: ChatMessage[] = [{ role: 'system', content: options.system }, ...options.messages]
  let tools = options.tools
  let prefix = ''
  let reasoning = ''
  let toolsSupported = Boolean(tools?.length)

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const lastStep = step === MAX_STEPS - 1
    const result = await streamChat(options.cfg, {
      messages: conversation,
      tools: lastStep ? undefined : tools,
      temperature: options.temperature ?? 0.6,
      maxTokens: options.maxTokens ?? 6000,
      reasoningEffort: options.reasoningEffort,
      signal: options.signal,
      title: 'Vivre la langue · Assistant',
    }, {
      onText: (_delta, full) => options.callbacks.onText(prefix + full),
      onReasoning: (_delta, full) => options.callbacks.onReasoning?.(reasoning + full),
    })
    reasoning += result.reasoning
    if (result.toolsDropped) { tools = undefined; toolsSupported = false }

    if (!result.toolCalls.length || !options.executeTool) {
      return { content: prefix + result.content, reasoning, model: result.model, toolsSupported }
    }

    // Text written before the tool calls stays visible.
    if (result.content.trim()) prefix += `${result.content.trim()}\n\n`
    conversation.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls })
    for (const call of result.toolCalls) {
      options.callbacks.onToolStart?.(call.id, call.function.name)
      const outcome = await options.executeTool(call.function.name, call.function.arguments)
      const ok = !outcome.content.startsWith('{"error"')
      options.callbacks.onToolEnd?.(call.id, call.function.name, outcome.summary, ok)
      conversation.push({ role: 'tool', tool_call_id: call.id, content: outcome.content })
    }
  }
  return { content: prefix, reasoning, model: options.cfg.model, toolsSupported }
}

/** Splits a voice-mode answer into what is spoken and the on-screen correction. */
export function parseVoiceReply(raw: string): { say: string; fix?: string } {
  const say = raw.match(/<say>([\s\S]*?)(<\/say>|$)/i)?.[1]
  const fix = raw.match(/<fix>([\s\S]*?)(<\/fix>|$)/i)?.[1]
  const clean = (text?: string) => text?.replace(/<\/?[a-z]+>/gi, '').replace(/[*_#`>]/g, '').trim()
  if (say !== undefined) return { say: clean(say) ?? '', fix: clean(fix) || undefined }
  return { say: clean(raw.replace(/<fix>[\s\S]*$/i, '')) ?? '' }
}
