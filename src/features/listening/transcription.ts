import type { ApiSettings, Language, TranscriptCue } from '../../domain'
import { id } from '../../domain'

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
