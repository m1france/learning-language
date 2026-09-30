import type { ApiSettings, Language } from '../../domain'
import { getLanguageName } from '../../languages'
import { blobToBase64, chunkSpeech, decodeAudio, toSpeechPcm, type AudioChunk } from '../../lib/audio'
import { chatWithFallback, llmFor, parseJsonLoose, type LlmConfig } from '../../lib/llm'
import type { SessionTranscript, TranscriptEngine, TranscriptSegment, TranscriptWord } from './speakingStorage'

/**
 * Speech-to-text for recorded sessions.
 *
 * Engines, best first when "auto":
 *  - Groq Whisper large-v3-turbo (free tier, real timestamps)
 *  - OpenAI Whisper (timestamps)
 *  - Google Gemini (audio understanding, free tier on AI Studio)
 *  - OpenRouter audio models (Gemini Flash Lite, then free audio models)
 * The browser engine only works live, while recording (see CameraContext).
 */

export type TranscriptionPlan = {
  engine: Exclude<TranscriptEngine, 'browser'>
  model: string
  label: string
}

const WHISPER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
} as const

const DEFAULT_MODEL: Record<TranscriptionPlan['engine'], string> = {
  groq: 'whisper-large-v3-turbo',
  openai: 'whisper-1',
  google: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash-lite',
}

/** Audio models tried in order on OpenRouter when the previous one fails (credits, outage…). */
const OPENROUTER_AUDIO_FALLBACKS = [
  'google/gemini-2.5-flash-lite',
  'google/gemini-3.1-flash-lite',
  'thinkingmachines/inkling-small:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
]

const ENGINE_LABEL: Record<TranscriptionPlan['engine'], string> = {
  groq: 'Groq Whisper',
  openai: 'OpenAI Whisper',
  google: 'Google Gemini',
  openrouter: 'OpenRouter',
}

const hasKey = (value?: string) => Boolean(value?.trim())

function available(api: ApiSettings, engine: TranscriptionPlan['engine']): boolean {
  switch (engine) {
    case 'groq': return hasKey(api.groqKey)
    case 'openai': return hasKey(api.openAiKey)
    case 'google': return hasKey(api.googleKey)
    case 'openrouter': return hasKey(api.openRouterKey)
  }
}

/** Which engine would transcribe a recording right now (null → no key configured). */
export function planTranscription(api: ApiSettings): TranscriptionPlan | null {
  const chosen = api.transcriptionProvider || 'auto'
  const order: TranscriptionPlan['engine'][] =
    chosen === 'auto' || chosen === 'browser'
      ? ['groq', 'openai', 'google', 'openrouter']
      : [chosen, ...(['groq', 'openai', 'google', 'openrouter'] as const).filter((e) => e !== chosen)]
  const engine = order.find((candidate) => available(api, candidate))
  if (!engine) return null
  const custom = chosen === engine ? api.transcriptionModel?.trim() : ''
  const model = custom || DEFAULT_MODEL[engine]
  return { engine, model, label: `${ENGINE_LABEL[engine]} · ${model}` }
}

/** Live captions in the browser are used unless the learner picked a cloud engine explicitly. */
export const wantsLiveCaptions = (api: ApiSettings) => {
  const chosen = api.transcriptionProvider || 'auto'
  return chosen === 'auto' || chosen === 'browser'
}

export type TranscribeOptions = {
  blob: Blob
  api: ApiSettings
  language: Language
  onProgress?: (ratio: number) => void
  signal?: AbortSignal
}

export async function transcribeRecording(options: TranscribeOptions): Promise<SessionTranscript> {
  const plan = planTranscription(options.api)
  if (!plan) {
    throw new Error('Aucune clé pour transcrire : ajoute une clé Groq (gratuite), OpenAI, Google Gemini ou OpenRouter dans Paramètres › Connexions.')
  }
  const buffer = await decodeAudio(options.blob)
  const samples = await toSpeechPcm(buffer)
  const whisper = plan.engine === 'groq' || plan.engine === 'openai'
  // Whisper accepts ~25 MB (≈ 13 min of 16 kHz WAV); LLMs keep timestamps sharper on short clips.
  const chunks = chunkSpeech(samples, whisper ? 600 : 90)

  const segments: TranscriptSegment[] = []
  let usedModel = plan.model
  options.onProgress?.(0)
  for (let index = 0; index < chunks.length; index += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const chunk = chunks[index]
    const part = whisper
      ? await transcribeWithWhisper(plan, options, chunk)
      : await transcribeWithLlm(plan, options, chunk).then((result) => { usedModel = result.model; return result.segments })
    segments.push(...part)
    options.onProgress?.((index + 1) / chunks.length)
  }

  return {
    segments: tidySegments(segments),
    engine: plan.engine,
    model: usedModel,
    language: options.language,
    createdAt: new Date().toISOString(),
  }
}

type WhisperSegment = { start: number; end: number; text: string }
type WhisperWord = { word: string; start: number; end: number }

async function transcribeWithWhisper(plan: TranscriptionPlan, options: TranscribeOptions, chunk: AudioChunk): Promise<TranscriptSegment[]> {
  const endpoint = WHISPER_ENDPOINTS[plan.engine as 'groq' | 'openai']
  const key = (plan.engine === 'groq' ? options.api.groqKey : options.api.openAiKey)!.trim()
  // gpt-4o-transcribe & co. only return plain JSON (no timestamps).
  const verbose = /whisper/i.test(plan.model)
  const form = new FormData()
  form.append('file', chunk.wav, 'speech.wav')
  form.append('model', plan.model)
  form.append('response_format', verbose ? 'verbose_json' : 'json')
  form.append('language', options.language.slice(0, 2))
  form.append('temperature', '0')
  if (verbose) {
    form.append('timestamp_granularities[]', 'segment')
    form.append('timestamp_granularities[]', 'word')
  }
  // Priming with hesitations keeps "um", "euh"… in the text: learners need to see them.
  if (options.language.startsWith('en')) form.append('prompt', 'Umm, let me think like, hmm... Okay, here is what I am, like, thinking.')

  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: options.signal })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let detail = text
    try { detail = JSON.parse(text)?.error?.message || text } catch { /* raw */ }
    if (response.status === 401) throw new Error(`Clé ${ENGINE_LABEL[plan.engine]} refusée. Vérifie-la dans Paramètres › Connexions.`)
    if (response.status === 429) throw new Error(`${ENGINE_LABEL[plan.engine]} : limite de requêtes atteinte, réessaie dans une minute.`)
    throw new Error(`${ENGINE_LABEL[plan.engine]} (${response.status}) : ${String(detail).slice(0, 200)}`)
  }
  const data = await response.json() as { text?: string; segments?: WhisperSegment[]; words?: WhisperWord[] }
  const offset = chunk.start
  const words: TranscriptWord[] = (data.words ?? []).map((word) => ({ text: word.word.trim(), start: word.start + offset, end: word.end + offset }))
  if (data.segments?.length) {
    return data.segments
      .filter((segment) => segment.text?.trim())
      .map((segment) => {
        const start = segment.start + offset
        const end = segment.end + offset
        return {
          id: '',
          start,
          end,
          text: segment.text.trim(),
          words: words.filter((word) => word.start >= start - 0.05 && word.end <= end + 0.05),
        }
      })
  }
  return spreadText(data.text ?? '', chunk.start, chunk.end)
}

async function transcribeWithLlm(plan: TranscriptionPlan, options: TranscribeOptions, chunk: AudioChunk): Promise<{ segments: TranscriptSegment[]; model: string }> {
  const duration = chunk.end - chunk.start
  const languageName = getLanguageName(options.language)
  const audio = await blobToBase64(chunk.wav)

  const configs: LlmConfig[] = []
  if (plan.engine === 'google') {
    const cfg = llmFor(options.api, 'google', plan.model)
    if (cfg) configs.push(cfg)
  } else {
    for (const model of [plan.model, ...OPENROUTER_AUDIO_FALLBACKS.filter((m) => m !== plan.model)]) {
      const cfg = llmFor(options.api, 'openrouter', model)
      if (cfg) configs.push(cfg)
    }
  }

  const result = await chatWithFallback(configs, {
    title: 'Vivre la langue · Transcription',
    temperature: 0,
    maxTokens: 4096,
    signal: options.signal,
    messages: [
      {
        role: 'system',
        content: `You are a verbatim speech-to-text engine. The speaker is a learner practising ${languageName}.
Transcribe exactly what is said, in the language actually spoken. Keep hesitations (um, uh, euh…), repetitions, false starts and grammar mistakes — never correct, never translate, never summarise.
Split into segments of one sentence or at most ~12 seconds. Times are seconds from the start of THIS clip, which lasts ${duration.toFixed(1)} s.
Answer with JSON only: {"segments":[{"start":0.0,"end":2.4,"text":"..."}]}. No speech → {"segments":[]}.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this recording.' },
          { type: 'input_audio', input_audio: { data: audio, format: 'wav' } },
        ],
      },
    ],
  })

  return { segments: parseLlmSegments(result.content, chunk), model: result.model }
}

function parseLlmSegments(raw: string, chunk: AudioChunk): TranscriptSegment[] {
  const duration = chunk.end - chunk.start
  const clamp = (value: number) => Math.max(0, Math.min(duration, value))
  try {
    const parsed = parseJsonLoose<{ segments?: { start?: number | string; end?: number | string; text?: string }[] } | { start?: number; text?: string }[]>(raw)
    const list = Array.isArray(parsed) ? parsed : parsed.segments ?? []
    const segments = list
      .filter((item) => item && typeof item.text === 'string' && item.text.trim())
      .map((item) => {
        const start = clamp(toSeconds(item.start))
        const end = clamp(Math.max(start + 0.3, toSeconds((item as { end?: number | string }).end ?? start + 3)))
        return { id: '', start: start + chunk.start, end: end + chunk.start, text: String(item.text).trim() }
      })
    const timed = segments.some((segment) => segment.start > chunk.start || segment.end < chunk.end - 0.5)
    if (segments.length && (timed || segments.length === 1)) return segments
    if (segments.length) return spreadText(segments.map((segment) => segment.text).join(' '), chunk.start, chunk.end)
  } catch { /* not JSON: fall through */ }

  // "[00:12] text" lines, or plain text.
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const stamped = lines
    .map((line) => line.match(/^\[?(\d{1,2}):(\d{2})(?:\.\d+)?\]?\s*[-–:]?\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
  if (stamped.length) {
    return stamped.map((match, index) => {
      const start = clamp(Number(match[1]) * 60 + Number(match[2]))
      const next = stamped[index + 1]
      const end = next ? clamp(Number(next[1]) * 60 + Number(next[2])) : duration
      return { id: '', start: start + chunk.start, end: Math.max(start + 0.5, end) + chunk.start, text: match[3].trim() }
    })
  }
  return spreadText(raw.replace(/```[a-z]*|```/g, ''), chunk.start, chunk.end)
}

function toSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const clock = value.match(/^(\d+):(\d{1,2})(?:[.,](\d+))?$/)
    if (clock) return Number(clock[1]) * 60 + Number(clock[2]) + (clock[3] ? Number(`0.${clock[3]}`) : 0)
    const number = parseFloat(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

/** No timestamps: split into sentences and spread them by length over the clip. */
function spreadText(text: string, start: number, end: number): TranscriptSegment[] {
  const sentences = (text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean)
  if (!sentences.length) return []
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0)
  let cursor = start
  return sentences.map((sentence) => {
    const length = ((end - start) * sentence.length) / total
    const segment = { id: '', start: cursor, end: cursor + length, text: sentence }
    cursor += length
    return segment
  })
}

/** Sorted, non-overlapping, with stable ids. */
export function tidySegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const sorted = segments.filter((segment) => segment.text.trim()).sort((a, b) => a.start - b.start)
  return sorted.map((segment, index) => {
    const next = sorted[index + 1]
    const end = next ? Math.min(segment.end, Math.max(segment.start + 0.3, next.start)) : segment.end
    return { ...segment, id: `seg-${index + 1}`, start: Math.max(0, segment.start), end }
  })
}

export const transcriptText = (transcript?: SessionTranscript) => transcript?.segments.map((segment) => segment.text).join(' ') ?? ''

/** Pure hesitation sounds only: words like "like" or "genre" are too often real words. */
const FILLERS = /(?<![\p{L}])(u+h+m*|u+m+|e+r+m+|e+u+h+|h+m+|ehm|äh+m*|eh+m)(?![\p{L}])/giu

export type SpeechStats = {
  words: number
  uniqueWords: number
  wordsPerMinute: number
  fillers: number
  speakingSeconds: number
}

export function speechStats(transcript: SessionTranscript | undefined, durationSeconds: number): SpeechStats | null {
  if (!transcript?.segments.length) return null
  const text = transcriptText(transcript)
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  const speakingSeconds = transcript.segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0)
  const minutes = Math.max(speakingSeconds, Math.min(durationSeconds, speakingSeconds * 1.4)) / 60
  return {
    words: tokens.length,
    uniqueWords: new Set(tokens).size,
    wordsPerMinute: minutes > 0 ? Math.round(tokens.length / minutes) : 0,
    fillers: (text.match(FILLERS) ?? []).length,
    speakingSeconds,
  }
}
