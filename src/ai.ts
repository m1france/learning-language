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
// Wiktionary dictionary (https://publicapi.dev/wiktionary-api)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export type WiktionaryResult = { partOfSpeech: string; definitions: string[] }

/**
 * Query the Wiktionary REST definition API for a word.
 * `endpoint` may be either the classic /w/api.php URL or the REST base; the
 * host is reused. For French-speaking learners of English, the French
 * Wiktionary is queried too so the gloss can be shown in French.
 */
export async function lookupWiktionary(word: string, learningLanguage: Language, endpoint: string): Promise<WiktionaryResult | null> {
  let host = learningLanguage === 'en' ? 'en.wiktionary.org' : 'fr.wiktionary.org'
  try {
    const url = new URL(endpoint)
    if (url.hostname.includes('wiktionary.org')) host = url.hostname
  } catch { /* keep default host */ }

  const glossHost = learningLanguage === 'en' ? 'fr.wiktionary.org' : 'en.wiktionary.org'
  const query = encodeURIComponent(word.toLowerCase())

  const parse = async (h: string): Promise<{ partOfSpeech: string; definitions: string[] } | null> => {
    const response = await fetch(`https://${h}/api/rest_v1/page/definition/${query}`)
    if (!response.ok) return null
    const data = (await response.json()) as Record<string, { partOfSpeech?: string; definitions?: { definition?: string }[] }[]>
    const entries = Object.values(data).flat()
    const partOfSpeech = entries.find((entry) => entry.partOfSpeech)?.partOfSpeech ?? ''
    const definitions = entries
      .flatMap((entry) => entry.definitions ?? [])
      .map((definition) => stripHtml(definition.definition ?? ''))
      .filter((text) => text.length > 3 && !/^#?\s*(plural|past|third-person|present participle)/i.test(text))
      .slice(0, 3)
    return definitions.length ? { partOfSpeech, definitions } : null
  }

  try {
    // Gloss in the learner's UI language first (fr.wiktionary for English words), then the main host.
    const gloss = await parse(glossHost)
    const main = host === glossHost ? null : await parse(host)
    const partOfSpeech = gloss?.partOfSpeech || main?.partOfSpeech || ''
    const definitions = [...(gloss?.definitions ?? []), ...(main?.definitions ?? [])]
      .filter((text, index, all) => all.indexOf(text) === index)
      .slice(0, 3)
    if (!definitions.length) return null
    return { partOfSpeech, definitions }
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

export type SpeakEngine = 'openrouter' | 'elevenlabs' | 'fish' | 'google' | 'browser' | 'none'
export type SpeakResult = { engine: SpeakEngine; error?: string }

async function playBlob(blob: Blob): Promise<void> {
  audioElement?.pause()
  audioElement = new Audio(URL.createObjectURL(blob))
  await audioElement.play()
}

async function speakWithElevenLabs(text: string, api: ApiSettings): Promise<{ ok: boolean; error?: string }> {
  if (!api.elevenLabsKey) return { ok: false, error: 'pas de clé ElevenLabs' }
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${api.elevenLabsVoice || '21m00Tcm4TlvDq8ikWAM'}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': api.elevenLabsKey },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} — ${(await response.text().catch(() => '')).slice(0, 140)}` }
    await playBlob(await response.blob())
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'erreur réseau' }
  }
}

async function speakWithFish(text: string, api: ApiSettings): Promise<{ ok: boolean; error?: string }> {
  if (!api.fishKey) return { ok: false, error: 'pas de clé Fish Audio' }
  try {
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.fishKey}` },
      body: JSON.stringify({ text, format: 'mp3', ...(api.fishReferenceId ? { reference_id: api.fishReferenceId } : {}) }),
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status} — ${(await response.text().catch(() => '')).slice(0, 140)}` }
    await playBlob(await response.blob())
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'erreur réseau' }
  }
}

async function speakWithOpenRouter(text: string, api: ApiSettings): Promise<{ ok: boolean; error?: string }> {
  if (!api.openRouterKey) return { ok: false, error: 'pas de clé OpenRouter' }
  if (!api.ttsModel) return { ok: false, error: 'aucun modèle TTS choisi' }
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
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { ok: false, error: `HTTP ${response.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}` }
    }
    const data = (await response.json()) as { choices?: { message?: { audio?: { data?: string } } }[] }
    const base64 = data.choices?.[0]?.message?.audio?.data
    if (!base64) return { ok: false, error: 'le modèle n’a pas renvoyé d’audio' }
    audioElement?.pause()
    audioElement = new Audio(`data:audio/mp3;base64,${base64}`)
    await audioElement.play()
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'erreur réseau' }
  }
}

export function stopSpeaking() {
  audioElement?.pause()
  audioElement = null
  googleQueue?.element.pause()
  googleQueue = null
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

// ---------------------------------------------------------------------------
// Google Translate TTS — free, natural voice, played through <audio> (no CORS
// needed for playback). Long texts are split into ~180-char chunks.
// ---------------------------------------------------------------------------

let googleQueue: { element: HTMLAudioElement; chunks: string[] } | null = null

function chunkForTts(text: string, maxLength = 180): string[] {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?…;:]+[.!?…;:]*\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLength) { chunks.push(current.trim()); current = '' }
    if (sentence.length > maxLength) {
      // hard-split very long sentences on spaces
      let rest = sentence
      while (rest.length > maxLength) {
        const cut = rest.lastIndexOf(' ', maxLength)
        chunks.push(rest.slice(0, cut > 0 ? cut : maxLength).trim())
        rest = rest.slice(cut > 0 ? cut : maxLength)
      }
      current = rest
    } else current += sentence
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

function speakWithGoogle(text: string, lang: Language): Promise<boolean> {
  return new Promise((resolve) => {
    const chunks = chunkForTts(text)
    if (!chunks.length) { resolve(false); return }
    const tl = lang === 'en' ? 'en' : 'fr'
    let index = 0
    let settled = false
    const ok = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    const playNext = () => {
      if (index >= chunks.length) { googleQueue = null; return }
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(chunks[index])}`
      const element = new Audio(url)
      googleQueue = { element, chunks }
      element.onplaying = () => ok(true)
      element.onended = () => { index += 1; playNext() }
      element.onerror = () => { googleQueue = null; ok(false) }
      element.play().catch(() => { googleQueue = null; ok(false) })
    }
    playNext()
  })
}

/** Speak text via the provider chosen in Settings, with sensible fallbacks. */
export async function speak(text: string, lang: Language, api: ApiSettings): Promise<SpeakResult> {
  stopSpeaking()
  const errors: string[] = []
  if (api.ttsProvider === 'openrouter' && api.openRouterKey) {
    const attempt = await speakWithOpenRouter(text, api)
    if (attempt.ok) return { engine: 'openrouter' }
    errors.push(`OpenRouter: ${attempt.error}`)
  }
  if (api.ttsProvider === 'elevenlabs') {
    const attempt = await speakWithElevenLabs(text, api)
    if (attempt.ok) return { engine: 'elevenlabs' }
    errors.push(`ElevenLabs: ${attempt.error}`)
  }
  if (api.ttsProvider === 'fish') {
    const attempt = await speakWithFish(text, api)
    if (attempt.ok) return { engine: 'fish' }
    errors.push(`Fish Audio: ${attempt.error}`)
  }
  if (api.ttsProvider !== 'browser') {
    if (await speakWithGoogle(text, lang)) return { engine: 'google', error: errors.join(' · ') || undefined }
    errors.push('voix Google indisponible')
  }
  if (typeof speechSynthesis === 'undefined') return { engine: 'none', error: errors.join(' · ') }
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = bestVoice(lang, api.ttsVoice || undefined)
  if (voice) utterance.voice = voice
  utterance.lang = lang === 'en' ? 'en-US' : 'fr-FR'
  utterance.rate = 0.92
  utterance.pitch = 1
  speechSynthesis.speak(utterance)
  return { engine: 'browser', error: errors.filter(Boolean).join(' · ') }
}
