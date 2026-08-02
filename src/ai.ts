import type { ApiSettings, Language } from './domain'

/**
 * AI helpers:
 * - contextual word explanation through OpenRouter (never leaks chain-of-thought)
 * - high-quality TTS through an OpenRouter audio model, with a careful
 *   browser-voice fallback (picks the most natural installed voice)
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Removes any reasoning / meta commentary that a model may prepend or append. */
export function cleanAiText(raw: string): string {
  const bannedStarts = [
    'the user', "l'utilisateur", 'let me', 'laissez-moi', "d'abord", 'first,', 'okay', 'ok,',
    'sure', 'bien sûr', 'voici', 'here is', 'analysis', 'raisonnement', 'thinking', 'thought',
    '→', '->', 'step ', 'étape ', 'note:', 'remarque:', 'i need', 'je dois', 'we need',
  ]
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      const lower = line.toLowerCase().replace(/^[-*•#\d.)\s]+/, '')
      return !bannedStarts.some((start) => lower.startsWith(start))
    })
  const joined = lines.join('\n').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim()
  // If the model still wrapped the real answer after a separator, keep the tail.
  const parts = joined.split(/\n\s*---+\s*\n/)
  return (parts[parts.length - 1] ?? joined).trim()
}

export type WordContextResult = {
  explanation: string
  translation: string
  partOfSpeech: string
}

export async function explainWordInContext(args: {
  word: string
  sentence: string
  previousSentences: string[]
  learningLanguage: Language
  api: ApiSettings
}): Promise<WordContextResult | null> {
  const { word, sentence, previousSentences, learningLanguage, api } = args
  if (!api.openRouterKey) return null
  const answerLanguage = learningLanguage === 'en' ? 'français' : 'anglais'
  const learnedLanguage = learningLanguage === 'en' ? 'anglais (américain)' : 'français'
  const context = [...previousSentences, sentence].filter(Boolean).join(' ')

  const system = [
    `Tu es un dictionnaire contextuel pour un élève qui apprend l'${learnedLanguage}.`,
    `On te donne un mot et son contexte (les phrases qui précèdent + la phrase actuelle).`,
    `Tu expliques UNIQUEMENT ce que ce mot signifie DANS CE CONTEXTE PRÉCIS, pas ses autres sens.`,
    `Tu réponds en ${answerLanguage}, clairement, en 1 à 3 phrases courtes, sans détour ni blabla.`,
    `INTERDIT : montrer ton raisonnement, décrire la demande, citer la phrase entière, utiliser du markdown,`,
    `commencer par une flèche, dire "le mot", "the user", "the sentence", ou donner des étapes.`,
    `Format EXACT de la réponse, trois lignes et rien d'autre :`,
    `POS: <nature du mot en ${answerLanguage}, ex: nom, verbe, adjectif, adverbe, expression>`,
    `TRAD: <traduction la plus naturelle dans ce contexte>`,
    `EXPL: <explication claire et directe du sens du mot ici, en ${answerLanguage}>`,
  ].join('\n')

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${api.openRouterKey}`,
      },
      body: JSON.stringify({
        model: api.openRouterModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Mot : « ${word} »\nContexte : « ${context} »` },
        ],
        temperature: 0.2,
        max_tokens: 220,
      }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content ?? ''
    const pos = /POS\s*:\s*(.+)/i.exec(content)?.[1] ?? ''
    const trad = /TRAD\s*:\s*(.+)/i.exec(content)?.[1] ?? ''
    const expl = /EXPL\s*:\s*([\s\S]+)/i.exec(content)?.[1] ?? content
    return {
      partOfSpeech: cleanAiText(pos) || '',
      translation: cleanAiText(trad) || '',
      explanation: cleanAiText(expl) || cleanAiText(content),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

let audioElement: HTMLAudioElement | null = null

/** Score how natural an installed browser voice sounds, to avoid robotic defaults. */
function voiceScore(voice: SpeechSynthesisVoice, lang: Language): number {
  const name = voice.name.toLowerCase()
  const target = lang === 'en' ? 'en' : 'fr'
  let score = 0
  if (voice.lang.toLowerCase().startsWith(target)) score += 4
  if (lang === 'en' && /en[-_]us/i.test(voice.lang)) score += 3
  if (lang === 'fr' && /fr[-_]fr/i.test(voice.lang)) score += 2
  if (name.includes('natural') || name.includes('neural')) score += 6
  if (name.includes('premium') || name.includes('enhanced')) score += 5
  if (name.includes('google')) score += 4
  if (/(samantha|alex|ava|zoe|allison|susan|karen|daniel|amelie|amélie|thomas|audrey|aurelie)/.test(name)) score += 3
  if (voice.localService) score += 1
  if (name.includes('compact')) score -= 4
  return score
}

export function bestVoice(lang: Language, preferredName?: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  const voices = speechSynthesis.getVoices()
  if (!voices.length) return null
  if (preferredName) {
    const chosen = voices.find((voice) => voice.name === preferredName)
    if (chosen) return chosen
  }
  return [...voices].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0] ?? null
}

export function listVoices(lang: Language): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const target = lang === 'en' ? 'en' : 'fr'
  const voices = speechSynthesis.getVoices()
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith(target))
    .sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))
}

async function speakWithOpenRouter(text: string, api: ApiSettings): Promise<boolean> {
  if (!api.openRouterKey || !api.ttsModel) return false
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.openRouterKey}` },
      body: JSON.stringify({
        model: api.ttsModel,
        messages: [{ role: 'user', content: text }],
        modalities: ['audio', 'text'],
        audio: { voice: 'alloy', format: 'mp3' },
      }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { choices?: { message?: { audio?: { data?: string } } }[] }
    const base64 = data.choices?.[0]?.message?.audio?.data
    if (!base64) return false
    audioElement?.pause()
    audioElement = new Audio(`data:audio/mp3;base64,${base64}`)
    await audioElement.play()
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  audioElement?.pause()
  audioElement = null
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

/** Speak text with the best available engine: AI TTS when configured, else the most natural browser voice. */
export async function speak(text: string, lang: Language, api: ApiSettings): Promise<'ai' | 'browser' | 'none'> {
  stopSpeaking()
  if (await speakWithOpenRouter(text, api)) return 'ai'
  if (typeof speechSynthesis === 'undefined') return 'none'
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = bestVoice(lang, api.ttsVoice || undefined)
  if (voice) utterance.voice = voice
  utterance.lang = lang === 'en' ? 'en-US' : 'fr-FR'
  utterance.rate = 0.92
  utterance.pitch = 1
  speechSynthesis.speak(utterance)
  return 'browser'
}
