import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { getAgentConfig } from './wordAiService'
import { getLanguageName } from '../../languages'
import type { SpeakingVideoAnalysis, SpeakingVideoAdviceItem, SpeakingVideoAdviceCategory } from './speakingStorage'
import { extractAiContent, extractCleanJson, isReasoningModel } from '../aiResponseUtils'

const UI_LANG_NAMES: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  zh: 'Chinois',
  ru: 'Russe',
  pt: 'Portugais',
}

/**
 * Converts a Blob to a base64 data URL string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Extracts a lightweight audio-only WAV or WebM blob from a video blob if possible,
 * to ensure fast upload and low bandwidth consumption.
 */
export async function extractAudioBlob(videoBlob: Blob): Promise<Blob> {
  try {
    const audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const arrayBuffer = await videoBlob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Render to WAV
    const wavBlob = audioBufferToWavBlob(audioBuffer)
    void audioContext.close().catch(() => undefined)
    return wavBlob
  } catch (e) {
    // If audio extraction fails, fallback to original blob
    console.warn('[SpeakingAiService] Audio extraction fallback to original blob', e)
    return videoBlob
  }
}

/**
 * Encodes AudioBuffer into a compact mono 16kHz WAV Blob
 */
function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = 1 // downmix to mono for compact size
  const targetSampleRate = 16000 // 16kHz is ideal for speech recognition & speech analysis
  const offlineCtx = new OfflineAudioContext(numChannels, Math.ceil(audioBuffer.duration * targetSampleRate), targetSampleRate)
  
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start(0)

  // We write simple PCM WAV header synchronously from source buffer channel
  const channelData = audioBuffer.getChannelData(0)
  // Subsample to 16kHz
  const step = audioBuffer.sampleRate / targetSampleRate
  const outLength = Math.floor(channelData.length / step)
  const downsampled = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const idx = Math.floor(i * step)
    downsampled[i] = channelData[idx] || 0
  }

  const pcm16 = new Int16Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]))
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }

  const wavHeader = new ArrayBuffer(44)
  const view = new DataView(wavHeader)

  // "RIFF" chunk
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcm16.byteLength, true)
  writeString(view, 8, 'WAVE')
  // "fmt " chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // 1 channel
  view.setUint32(24, targetSampleRate, true)
  view.setUint32(28, targetSampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // 16 bits
  // "data" chunk
  writeString(view, 36, 'data')
  view.setUint32(40, pcm16.byteLength, true)

  return new Blob([wavHeader, pcm16.buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export type AnalyzeSpeakingVideoParams = {
  blob?: Blob
  durationSeconds: number
  targetLanguage: Language
  uiLanguage: UiLanguage
  api: ApiSettings
  topicTitle?: string
  topicAngles?: string[]
  referenceText?: string
  mode?: 'free' | 'guided' | 'challenge'
}

/**
 * Analyzes a recorded speaking session using OpenRouter AI.
 * Focuses on pronunciation, rhythm, sentence structure, and timestamped tips.
 */
export async function analyzeSpeakingVideo(
  params: AnalyzeSpeakingVideoParams,
): Promise<{ ok: true; analysis: SpeakingVideoAnalysis } | { ok: false; error: string; tooLong?: boolean }> {
  const {
    blob,
    durationSeconds,
    targetLanguage,
    uiLanguage,
    api,
    topicTitle,
    topicAngles = [],
    referenceText,
    mode,
  } = params

  // 1. Duration check: limit to 3 minutes (180 seconds)
  if (durationSeconds > 180) {
    return {
      ok: false,
      error: 'La vidéo dépasse 3 minutes (180 secondes). L’analyse IA est optimisée pour les prises de moins de 3 minutes.',
      tooLong: true,
    }
  }

  // 2. Resolve Agent / OpenRouter config
  // Default to the best free OpenRouter model (google/gemini-2.0-flash-exp:free)
  const defaultModel = 'google/gemini-2.0-flash-exp:free'
  const customModel = api.taskModelSpeakingAnalysis?.trim() || api.agentModel?.trim() || defaultModel
  const agentConfig = getAgentConfig(api, customModel)

  if (!agentConfig || !agentConfig.key) {
    return {
      ok: false,
      error: 'Aucune clé API configurée pour l’analyse vidéo OpenRouter. Renseigne ta clé dans les Paramètres (section Connexions).',
    }
  }

  const targetLangName = getLanguageName(targetLanguage)
  const explanationLang = UI_LANG_NAMES[uiLanguage] || 'Français'
  const formattedDuration = `${Math.floor(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s`

  const systemPrompt = `You are a world-class speech coach, phonetician, and language teacher analyzing a student's recorded oral practice session.
Target Language: ${targetLangName}
Target Practice Duration: ${formattedDuration} (${durationSeconds} seconds total).
${topicTitle ? `Topic: "${topicTitle}"` : ''}
${topicAngles.length > 0 ? `Topic Angles: ${topicAngles.join(', ')}` : ''}
${referenceText ? `Reference / Prompter text: """${referenceText}"""` : ''}

Your mission:
Analyze the audio/speech in full depth and return comprehensive, encouraging, and highly specific pedagogical feedback.
All explanations, summaries, and advice titles MUST BE WRITTEN IN ${explanationLang}.

You MUST evaluate 3 core pillars:
1. PRONUNCIATION (Phonetics & Articulation):
   - Identify mispronounced words, vowel lengths, consonant blends, silent letters, and syllable stress.
   - For every pronunciation mistake, provide US/standard IPA phonetic transcription with bold stress (e.g. /ˈkʌmftəbl/ or /ˈrek·əɡ·naɪz/).
2. RHYTHM & PACING (Speech Rate & Flow):
   - Assess cadence, unnatural long silences, breathing spots, stuttering, filler words ("um", "euh", "like"), and sentence rhythm / intonation.
3. SENTENCE STRUCTURE & GRAMMAR (Syntax & Vocabulary):
   - Spot grammatical errors (tense mistakes, missing prepositions, agreements), unnatural literal translations from native tongue, and recommend more idiomatic phrases.

CRITICAL TIMESTAMP RULES:
- For the "items" array, each item MUST have an exact timestamp (in seconds, integer from 0 to ${Math.round(durationSeconds)}) corresponding to the moment in the recording where the error occurred or where the tip applies.
- Sort all items chronologically by their timestamp.
- Provide between 3 and 8 clear, high-impact items.

Categories allowed for items:
- "pronunciation" : specific word pronunciation or accentuation issue
- "rhythm" : pacing, pause too long, hesitation, breath control, intonation
- "grammar_structure" : syntax, verb conjugation, preposition, word order
- "vocabulary" : awkward word choice, better synonym, idiom
- "fluency" : connected speech, liaison, natural flow

Return STRICTLY a JSON object matching this schema:
{
  "overallFeedback": "Overall motivating summary of the performance in 1-2 sentences in ${explanationLang}.",
  "overallScore": 85,
  "pronunciationSummary": "Clear feedback on pronunciation, phonetic points and accent in ${explanationLang}.",
  "rhythmSummary": "Clear feedback on speaking pace, pauses, hesitations and flow in ${explanationLang}.",
  "structureSummary": "Clear feedback on sentence construction, grammar and vocabulary richness in ${explanationLang}.",
  "items": [
    {
      "id": "adv-1",
      "timestamp": 12,
      "category": "pronunciation",
      "severity": "warning",
      "title": "Prononciation de 'comfortable'",
      "originalSnippet": "com-for-ta-ble",
      "improvedSnippet": "ˈkʌmftəbl",
      "explanation": "Le mot se prononce en 3 syllabes compactes avec l'accent tonique sur la première syllabe.",
      "ipa": "/ˈkʌmftəbl/"
    },
    {
      "id": "adv-2",
      "timestamp": 35,
      "category": "rhythm",
      "severity": "tip",
      "title": "Pause et hésitation prolongée",
      "originalSnippet": "and... uh... I think",
      "improvedSnippet": "and I think",
      "explanation": "Essaie de marquer une inspiration silencieuse plutôt qu'un 'euh' prolongé pour garder l'attention.",
      "ipa": ""
    },
    {
      "id": "adv-3",
      "timestamp": 62,
      "category": "grammar_structure",
      "severity": "error",
      "title": "Accord du verbe au passé",
      "originalSnippet": "he have gone",
      "improvedSnippet": "he has gone",
      "explanation": "À la 3ème personne du singulier (he/she/it), l'auxiliaire 'have' devient 'has'.",
      "ipa": ""
    }
  ]
}`

  try {
    let mediaDataUrl: string | null = null

    if (blob && blob.size > 0) {
      try {
        // Extract audio or use media blob directly
        const audioBlob = await extractAudioBlob(blob)
        mediaDataUrl = await blobToBase64(audioBlob)
      } catch (err) {
        console.warn('[SpeakingAiService] Media conversion issue, using base blob:', err)
        try {
          mediaDataUrl = await blobToBase64(blob)
        } catch {
          mediaDataUrl = null
        }
      }
    }

    const userPromptText = `Please analyze my oral speaking recording (${targetLangName}).
Duration: ${durationSeconds} seconds.
${topicTitle ? `Topic: ${topicTitle}` : 'Free practice session'}
${mode ? `Mode: ${mode}` : ''}
${referenceText ? `Read text: """${referenceText}"""` : ''}

Listen to the recording carefully, transcribe and evaluate my speech rhythm, phonetics, grammar, and give me timestamped advice.`

    const isReasoning = isReasoningModel(agentConfig.model)
    const isFish = agentConfig.model.toLowerCase().includes('fish')

    // Construct message content
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
      | { type: 'input_audio'; input_audio: { data: string; format: string } }
    > = [{ type: 'text', text: userPromptText }]

    if (mediaDataUrl && !isReasoning) {
      // Pass data URL as multimodal input when not a pure text reasoning model
      userContent.push({
        type: 'image_url',
        image_url: {
          url: mediaDataUrl,
        },
      })
    }

    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentConfig.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App - Speaking Video AI Analysis',
      },
      body: JSON.stringify({
        model: agentConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: isReasoning ? userPromptText : userContent },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        ...(!isFish && !isReasoning && !agentConfig.endpoint.includes('moonshot') ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Erreur OpenRouter (HTTP ${response.status}): ${errText.slice(0, 200) || response.statusText}`,
      }
    }

    const data = await response.json()
    const rawContent = extractAiContent(data)

    if (!rawContent) {
      return { ok: false, error: 'L’IA OpenRouter a renvoyé une réponse vide.' }
    }

    let parsed: any
    try {
      parsed = extractCleanJson(rawContent)
    } catch {
      return { ok: false, error: 'Impossible de décoder la réponse JSON retournée par le modèle.' }
    }

    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : []
    const validCategories: SpeakingVideoAdviceCategory[] = [
      'pronunciation',
      'rhythm',
      'grammar_structure',
      'vocabulary',
      'fluency',
    ]

    const items: SpeakingVideoAdviceItem[] = rawItems
      .map((item, idx): SpeakingVideoAdviceItem | null => {
        if (!item || typeof item !== 'object') return null
        const rawTime = typeof item.timestamp === 'number' ? item.timestamp : Number(item.timestamp) || 0
        const clampedTime = Math.max(0, Math.min(Math.round(durationSeconds), Math.round(rawTime)))
        const cat: SpeakingVideoAdviceCategory = validCategories.includes(item.category)
          ? item.category
          : 'pronunciation'
        const sev = ['tip', 'warning', 'error'].includes(item.severity) ? item.severity : 'tip'

        return {
          id: String(item.id || `adv-${idx + 1}-${Date.now()}`),
          timestamp: clampedTime,
          category: cat,
          severity: sev as 'tip' | 'warning' | 'error',
          title: String(item.title || `Conseil à ${clampedTime}s`),
          originalSnippet: item.originalSnippet ? String(item.originalSnippet) : undefined,
          improvedSnippet: item.improvedSnippet ? String(item.improvedSnippet) : undefined,
          explanation: String(item.explanation || ''),
          ipa: item.ipa ? String(item.ipa) : undefined,
        }
      })
      .filter(Boolean) as SpeakingVideoAdviceItem[]

    // Sort items chronologically
    items.sort((a, b) => a.timestamp - b.timestamp)

    const analysis: SpeakingVideoAnalysis = {
      overallFeedback: String(parsed.overallFeedback || 'Analyse terminée avec succès.'),
      overallScore: typeof parsed.overallScore === 'number' ? parsed.overallScore : 80,
      pronunciationSummary: String(parsed.pronunciationSummary || 'Prononciation fluide et compréhensible.'),
      rhythmSummary: String(parsed.rhythmSummary || 'Bonne cadence générale et bon débit.'),
      structureSummary: String(parsed.structureSummary || 'Phrases bien construites.'),
      items,
      modelUsed: agentConfig.model,
      analyzedAt: new Date().toISOString(),
    }

    return {
      ok: true,
      analysis,
    }
  } catch (err) {
    console.error('[speakingVideoAiService] Error:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Une erreur inattendue est survenue durant l’analyse vidéo.',
    }
  }
}
