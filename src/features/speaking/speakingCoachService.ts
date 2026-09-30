import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { getLanguageName, getUiLanguageName } from '../../languages'
import { blobToBase64, decodeAudio, encodeWav, findPauses, toSpeechPcm } from '../../lib/audio'
import { acceptsAudio, chat, parseJsonLoose, resolveLlm, type ContentPart } from '../../lib/llm'
import type { SessionTranscript, SpeakingVideoAdviceCategory, SpeakingVideoAdviceItem, SpeakingVideoAnalysis } from './speakingStorage'
import { speechStats } from './transcriptionService'

/**
 * Oral coaching grounded on the transcript: works with any text model.
 * When the model accepts audio and the take is short, the recording is
 * attached too so pronunciation feedback comes from the actual sound.
 */

const CATEGORIES: SpeakingVideoAdviceCategory[] = ['pronunciation', 'rhythm', 'grammar_structure', 'vocabulary', 'fluency']
const MAX_AUDIO_SECONDS = 300

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export type CoachOptions = {
  transcript: SessionTranscript
  durationSeconds: number
  blob?: Blob
  api: ApiSettings
  language: Language
  uiLanguage: UiLanguage
  topicTitle?: string
  referenceText?: string
  signal?: AbortSignal
}

export async function coachSpeakingSession(options: CoachOptions): Promise<SpeakingVideoAnalysis> {
  const primary = resolveLlm(options.api, options.api.taskModelSpeakingAnalysis || options.api.taskModelAssistant)
  if (!primary) throw new Error('Aucune clé IA configurée : renseigne une clé dans Paramètres › Connexions.')
  if (!options.transcript.segments.length) throw new Error('La transcription est vide : rien à analyser.')

  const target = getLanguageName(options.language)
  const explainIn = getUiLanguageName(options.uiLanguage)
  const stats = speechStats(options.transcript, options.durationSeconds)
  const lines = options.transcript.segments.map((segment) => `[${clock(segment.start)} | ${segment.start.toFixed(1)}s] ${segment.text}`).join('\n')

  let pauses: { start: number; end: number }[] = []
  let audioPart: ContentPart | null = null
  if (options.blob) {
    try {
      const samples = await toSpeechPcm(await decodeAudio(options.blob))
      pauses = findPauses(samples).slice(0, 12)
      if (acceptsAudio(primary.model) && options.durationSeconds <= MAX_AUDIO_SECONDS) {
        audioPart = { type: 'input_audio', input_audio: { data: await blobToBase64(encodeWav(samples)), format: 'wav' } }
      }
    } catch { /* analysis still works from the transcript */ }
  }

  const system = `You are an expert ${target} speaking coach and phonetician. A learner recorded themselves speaking ${target}.
Write every explanation, title and summary in ${explainIn}. Quote the learner's words and corrections in ${target}.
${audioPart ? 'You receive the audio AND a timestamped transcript. Judge pronunciation from the audio.' : `You only receive an automatic transcript (no audio). Speech-recognition slips often reveal pronunciation problems (e.g. "sheep" transcribed for "ship"): use them carefully and say when a pronunciation remark is a guess.`}

Evaluate:
1. PRONUNCIATION — sounds, word stress, silent letters (give IPA like /ˈkʌmftəbl/).
2. RHYTHM & FLOW — pace (${stats?.wordsPerMinute ?? '?'} words/min; natural conversation ≈ 120–160), hesitations (${stats?.fillers ?? 0} fillers detected), long pauses, intonation.
3. STRUCTURE — grammar, word order, tenses, prepositions, literal translations, more idiomatic phrasing.

Rules for "items": 4 to 10 high-impact remarks, each anchored on the exact second where it happens (use the transcript times), sorted by time. "originalSnippet" = what the learner said, "improvedSnippet" = the better version. Never invent words that are not in the transcript.
overallScore: 0–100, honest (A2 learner ≈ 45, fluent B2 ≈ 75, native-like ≈ 95).

Reply with JSON only:
{"overallFeedback":"1–2 encouraging sentences","overallScore":70,"pronunciationSummary":"…","rhythmSummary":"…","structureSummary":"…",
"items":[{"id":"a1","timestamp":12,"category":"pronunciation|rhythm|grammar_structure|vocabulary|fluency","severity":"tip|warning|error","title":"…","originalSnippet":"…","improvedSnippet":"…","explanation":"…","ipa":"/…/"}]}`

  const context = [
    options.topicTitle ? `Topic: ${options.topicTitle}` : 'Free talk',
    options.referenceText ? `Text the learner was reading from:\n"""${options.referenceText.slice(0, 3000)}"""` : '',
    `Duration: ${clock(options.durationSeconds)}`,
    pauses.length ? `Silences over 1.2 s at: ${pauses.map((p) => `${clock(p.start)} (${(p.end - p.start).toFixed(1)} s)`).join(', ')}` : '',
    `Transcript:\n${lines}`,
  ].filter(Boolean).join('\n\n')

  const userContent: ContentPart[] = [{ type: 'text', text: context }]
  if (audioPart) userContent.push(audioPart)

  const result = await chat(primary, {
    title: 'Vivre la langue · Coach oral',
    temperature: 0.3,
    maxTokens: 5000,
    json: true,
    signal: options.signal,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: audioPart ? userContent : context },
    ],
  })

  const parsed = parseJsonLoose<Record<string, unknown>>(result.content)
  const duration = Math.max(1, Math.round(options.durationSeconds))
  const rawItems = Array.isArray(parsed.items) ? (parsed.items as Record<string, unknown>[]) : []
  const items: SpeakingVideoAdviceItem[] = rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const time = Math.max(0, Math.min(duration, Math.round(Number(item.timestamp) || 0)))
      const category = CATEGORIES.includes(item.category as SpeakingVideoAdviceCategory) ? (item.category as SpeakingVideoAdviceCategory) : 'grammar_structure'
      const severity = (['tip', 'warning', 'error'] as const).includes(item.severity as 'tip') ? (item.severity as 'tip' | 'warning' | 'error') : 'tip'
      return {
        id: String(item.id || `a${index + 1}`),
        timestamp: time,
        category,
        severity,
        title: String(item.title || ''),
        originalSnippet: item.originalSnippet ? String(item.originalSnippet) : undefined,
        improvedSnippet: item.improvedSnippet ? String(item.improvedSnippet) : undefined,
        explanation: String(item.explanation || ''),
        ipa: item.ipa ? String(item.ipa) : undefined,
      }
    })
    .filter((item) => item.title || item.explanation)
    .sort((a, b) => a.timestamp - b.timestamp)

  const score = Number(parsed.overallScore)
  return {
    overallFeedback: String(parsed.overallFeedback || ''),
    overallScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : undefined,
    pronunciationSummary: String(parsed.pronunciationSummary || ''),
    rhythmSummary: String(parsed.rhythmSummary || ''),
    structureSummary: String(parsed.structureSummary || ''),
    items,
    modelUsed: result.model,
    analyzedAt: new Date().toISOString(),
  }
}
