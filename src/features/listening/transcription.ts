import type { ApiSettings, Language, TranscriptCue } from '../../domain'
import { id } from '../../domain'
import { getAgentConfig } from '../speaking/wordAiService'

type WhisperSegment = { start?: number; end?: number; text?: string }

const timestampToSeconds = (value: string) => {
  const parts = value.trim().replace(',', '.').split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

export function parseVtt(text: string): TranscriptCue[] {
  const normalized = text.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n?/i, '')
  const blocks = normalized.split(/\n{2,}/)
  return blocks.flatMap((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) return []
    const [startRaw, endRaw] = lines[timingIndex].split('-->')
    const start = timestampToSeconds(startRaw)
    const end = timestampToSeconds(endRaw.trim().split(/\s+/)[0])
    const cueText = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    return cueText && end > start ? [{ id: id('cue'), start, end, text: cueText }] : []
  })
}

export function cuesFromPlainText(text: string): TranscriptCue[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? []
  let cursor = 0
  return sentences.map((sentence) => {
    const duration = Math.max(2.5, Math.min(10, sentence.trim().split(/\s+/).length * 0.48))
    const cue = { id: id('cue'), start: cursor, end: cursor + duration, text: sentence.trim() }
    cursor += duration
    return cue
  }).filter((cue) => cue.text)
}

export async function transcribeUploadedMedia(file: File, language: Language, api: ApiSettings): Promise<TranscriptCue[]> {
  const key = api.openAiKey?.trim()
  if (!key) throw new Error('Ajoute une clé OpenAI dans Paramètres → Connexions pour transcrire un fichier.')

  const body = new FormData()
  body.append('file', file)
  // whisper-1 is selected because verbose_json returns segment timestamps,
  // which are necessary to drive synchronous subtitles and phrase replay.
  body.append('model', 'whisper-1')
  body.append('response_format', 'verbose_json')
  body.append('language', language)
  body.append('timestamp_granularities[]', 'segment')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Transcription impossible (${response.status})${detail ? ` : ${detail.slice(0, 160)}` : ''}`)
  }
  const payload = await response.json() as { segments?: WhisperSegment[]; text?: string }
  const cues = (payload.segments ?? []).flatMap((segment) => {
    const text = segment.text?.trim() ?? ''
    const start = segment.start ?? 0
    const end = segment.end ?? start + 3
    return text && end > start ? [{ id: id('cue'), start, end, text }] : []
  })
  return cues.length ? cues : cuesFromPlainText(payload.text ?? '')
}

export const isYouTubeUrl = (value: string) => /(?:youtube\.com|youtu\.be)/i.test(value)

type GeminiSegment = { start?: number; end?: number; text?: string }

/**
 * Transcribes media bytes with whichever AI provider the user actually
 * configured in Settings: OpenAI Whisper when an OpenAI key exists, otherwise
 * Google Gemini audio understanding with the agent key. Timestamps come back
 * as segment lists so synchronized subtitles keep working.
 */
export async function transcribeWithAgent(
  audioBase64: string,
  language: Language,
  api: ApiSettings,
): Promise<TranscriptCue[]> {
  const openAiKey = api.openAiKey?.trim()

  if (openAiKey) {
    const binary = atob(audioBase64)
    const buffer = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
    const body = new FormData()
    body.append('file', new Blob([buffer], { type: 'audio/mpeg' }), 'youtube.mp3')
    body.append('model', 'whisper-1')
    body.append('response_format', 'verbose_json')
    body.append('language', language)
    body.append('timestamp_granularities[]', 'segment')
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body,
    })
    if (!response.ok) throw new Error(`Transcription impossible (${response.status}).`)
    const payload = await response.json() as { segments?: WhisperSegment[]; text?: string }
    return cuesFromSegments(payload.segments, payload.text)
  }

  const googleKey = api.googleKey?.trim()
  if (!googleKey) {
    throw new Error('Ajoute une clé OpenAI ou Google dans Paramètres → Connexions pour transcrire cette vidéo.')
  }

  // Fallback: Gemini multimodal transcription over raw inline audio.
  const agentConfig = getAgentConfig(api, api.taskModelWordAnalysis)
  if (!agentConfig || !agentConfig.key) {
    throw new Error('Ajoute une clé OpenAI ou Google dans Paramètres → Connexions pour transcrire cette vidéo.')
  }
  const prompt = `Transcribe this ${language} audio. Return ONLY a JSON object shaped {"segments":[{"start":<seconds>,"end":<seconds>,"text":"..."}]} covering every spoken phrase in order.`
  const model = agentConfig.model.includes('gemini') ? agentConfig.model : 'gemini-2.5-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(googleKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'audio/mpeg', data: audioBase64 } },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Transcription Gemini impossible (${response.status})${detail ? ` : ${detail.slice(0, 140)}` : ''}`)
  }
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('La transcription n’a pas pu être formatée. Réessaie.')
  const parsed = JSON.parse(jsonMatch[0]) as { segments?: GeminiSegment[] }
  return cuesFromSegments(parsed.segments, parsed.segments?.map((segment) => segment.text ?? '').join(' '))
}

const cuesFromSegments = (
  segments?: Array<{ start?: number; end?: number; text?: string }>,
  fullText?: string,
): TranscriptCue[] => {
  const cues = (segments ?? []).flatMap((segment) => {
    const text = segment.text?.trim() ?? ''
    const start = segment.start ?? 0
    const end = segment.end ?? start + 3
    return text && end > start && Number.isFinite(end) ? [{ id: id('cue'), start, end, text }] : []
  })
  return cues.length ? cues : cuesFromPlainText(fullText ?? '')
}
