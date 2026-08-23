import type { ApiSettings, Language } from './domain'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Scores a browser voice: prefer natural / online / high-quality voices for the target language. */
const voiceScore = (voice: SpeechSynthesisVoice, lang: Language, preferredName?: string): number => {
  const name = voice.name.toLowerCase()
  const langMatch = voice.lang.toLowerCase().startsWith(lang) ? 100 : 0
  const preferred = preferredName && voice.name === preferredName ? 500 : 0
  const natural = /natural|neural|online|premium|enhanced|google|samantha|aur[eé]lie|thomas|am[eé]lie/.test(name) ? 40 : 0
  const bad = /compact|espeak|festival/.test(name) ? -50 : 0
  return langMatch + preferred + natural + bad + (voice.default ? 10 : 0)
}

/** Single shared audio element for remote TTS playback. */
let audioElement: HTMLAudioElement | null = null

/**
 * TTS helpers:
 * - high-quality voices through an OpenRouter audio model, ElevenLabs,
 *   Fish Audio or Google Translate, with a careful browser-voice fallback
 *   (picks the most natural installed voice).
 */

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

async function speakWithOpenAi(
  text: string,
  api: ApiSettings,
): Promise<{ ok: boolean; error?: string }> {
  const key = (api.openAiKey || '').trim()
  if (!key) return { ok: false, error: 'Pas de clé OpenAI renseignée' }
  const voice = (api.ttsVoice || '').trim() || 'alloy'
  const model = (api.ttsModel || '').includes('hd') ? 'tts-1-hd' : 'tts-1'

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3',
      }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return { ok: false, error: `HTTP ${response.status}: ${errorText}` }
    }
    await playBlob(await response.blob())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur réseau OpenAI' }
  }
}

async function speakWithOpenRouter(
  text: string,
  api: ApiSettings,
  _lang: Language = 'en',
): Promise<{ ok: boolean; error?: string }> {
  const key = (api.openRouterKey || '').trim()
  if (!key) return { ok: false, error: 'Pas de clé OpenRouter renseignée' }
  const model = (api.ttsModel || '').trim() || 'openai/gpt-4o-mini-tts-2025-12-15'
  const voice = (api.ttsVoice || '').trim() || 'alloy'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
    'X-Title': 'Language Learning App',
  }

  const callChatEndpoint = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const isFish = model.toLowerCase().includes('fish')
      const requestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a pure text-to-speech audio reader. You must strictly speak the exact user text aloud in natural pronunciation without any additional words, explanations, introductions or conversational filler.',
          },
          { role: 'user', content: text },
        ],
      }
      if (!isFish) {
        requestBody.modalities = ['audio', 'text']
        requestBody.audio = { voice, format: 'mp3' }
      }
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return {
          ok: false,
          error: `HTTP ${response.status} (Chat Audio): ${detail ? detail.slice(0, 180) : response.statusText}`,
        }
      }
      const data = await response.json()
      const choice = data.choices?.[0]
      const base64 =
        choice?.message?.audio?.data ||
        choice?.audio ||
        (typeof choice?.message?.content === 'string' && choice.message.content.startsWith('data:audio')
          ? choice.message.content.split(',')[1]
          : undefined)
      if (!base64) return { ok: false, error: 'Le modèle Chat OpenRouter n’a pas renvoyé de données audio' }
      audioElement?.pause()
      audioElement = new Audio(`data:audio/mp3;base64,${base64}`)
      await audioElement.play()
      return { ok: true }
    } catch (caught) {
      return { ok: false, error: caught instanceof Error ? caught.message : 'Erreur réseau OpenRouter Chat' }
    }
  }

  return await callChatEndpoint()
}

/** Directly test OpenRouter voice synthesis without falling back. */
export async function testOpenRouterTts(
  api: ApiSettings,
  sampleText: string = 'Hello! This is a test of OpenRouter voice synthesis.',
): Promise<{ ok: boolean; error?: string }> {
  stopSpeaking()
  if (api.openAiKey) {
    const directRes = await speakWithOpenAi(sampleText, api)
    if (directRes.ok) return directRes
  }
  return await speakWithOpenRouter(sampleText, api, 'en')
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

  // 1. Direct OpenAI API key if available
  if (api.openAiKey && (api.ttsProvider === 'openrouter' || (api.ttsProvider as string) === 'openai')) {
    const attempt = await speakWithOpenAi(text, api)
    if (attempt.ok) return { engine: 'openrouter' }
    console.warn('[TTS OpenAI direct failed]:', attempt.error)
  }

  if (api.ttsProvider === 'openrouter') {
    const attempt = await speakWithOpenRouter(text, api, lang)
    if (attempt.ok) return { engine: 'openrouter' }
    console.warn('[TTS OpenRouter failed]:', attempt.error)
    errors.push(`OpenRouter: ${attempt.error}`)
  } else if (api.ttsProvider === 'elevenlabs') {
    const attempt = await speakWithElevenLabs(text, api)
    if (attempt.ok) return { engine: 'elevenlabs' }
    console.warn('[TTS ElevenLabs failed]:', attempt.error)
    errors.push(`ElevenLabs: ${attempt.error}`)
  } else if (api.ttsProvider === 'fish') {
    const attempt = await speakWithFish(text, api)
    if (attempt.ok) return { engine: 'fish' }
    console.warn('[TTS Fish Audio failed]:', attempt.error)
    errors.push(`Fish Audio: ${attempt.error}`)
  }

  // If the user explicitly chose browser TTS, use SpeechSynthesis directly
  if (api.ttsProvider === 'browser') {
    if (typeof speechSynthesis === 'undefined') return { engine: 'none', error: 'Synthèse vocale du navigateur indisponible' }
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = bestVoice(lang, api.ttsVoice || undefined)
    if (voice) utterance.voice = voice
    utterance.lang = lang === 'en' ? 'en-US' : 'fr-FR'
    utterance.rate = 0.92
    utterance.pitch = 1
    speechSynthesis.speak(utterance)
    return { engine: 'browser' }
  }

  // Fallback to Google Translate TTS
  if (await speakWithGoogle(text, lang)) {
    return { engine: 'google', error: errors.join(' · ') || undefined }
  }
  errors.push('voix Google indisponible')

  // Final fallback to browser SpeechSynthesis
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
