/**
 * Thin wrapper around the browser Speech Recognition API (Chrome, Edge,
 * Safari). Used for live captions while recording, dictation in the
 * assistant composer and the voice-conversation mode.
 */

type RecognitionAlternative = { transcript: string; confidence?: number }
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
type RecognitionErrorEvent = { error: string; message?: string }

export type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type RecognitionCtor = new () => BrowserRecognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechRecognitionSupported = () => recognitionCtor() !== null

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function recognitionErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Micro refusé : autorise-le dans les réglages du navigateur.'
    case 'audio-capture':
      return 'Aucun micro détecté.'
    case 'network':
      return 'La reconnaissance vocale du navigateur a besoin d’une connexion.'
    case 'language-not-supported':
      return 'Langue non prise en charge par la reconnaissance vocale du navigateur.'
    default:
      return 'La reconnaissance vocale s’est interrompue.'
  }
}

export type ListenHandle = { stop: () => void; abort: () => void }

/**
 * One utterance: resolves with the final text when the speaker pauses.
 * `continuous` keeps listening until stop() (dictation).
 */
export function listen(options: {
  lang: string
  continuous?: boolean
  onInterim?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (message: string, code: string) => void
  onEnd?: () => void
}): ListenHandle | null {
  const Ctor = recognitionCtor()
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = options.lang
  recognition.continuous = Boolean(options.continuous)
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  let finalText = ''
  recognition.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const text = result[0]?.transcript ?? ''
      if (result.isFinal) finalText += text
      else interim += text
    }
    options.onInterim?.((finalText + interim).trim())
  }
  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return
    options.onError?.(recognitionErrorMessage(event.error), event.error)
  }
  recognition.onend = () => {
    if (finalText.trim()) options.onFinal(finalText.trim())
    options.onEnd?.()
  }
  try {
    recognition.start()
  } catch {
    return null
  }
  return { stop: () => recognition.stop(), abort: () => recognition.abort() }
}

export type LiveSegment = { start: number; end: number; text: string }

/**
 * Continuous captions aligned on a recording timeline. `now()` must return
 * the recording clock in seconds (pauses excluded).
 */
export function createLiveTranscriber(options: {
  lang: string
  now: () => number
  onSegment: (segment: LiveSegment) => void
  onInterim?: (text: string) => void
  onUnavailable?: (message: string) => void
}) {
  const Ctor = recognitionCtor()
  let recognition: BrowserRecognition | null = null
  let running = false
  let generation = 0
  let failures = 0
  let pending: { start: number; text: string } | null = null
  let endWaiter: (() => void) | null = null
  const starts = new Map<string, number>()
  const done = new Set<string>()

  const flushPending = () => {
    if (pending?.text.trim()) options.onSegment({ start: pending.start, end: Math.max(pending.start + 0.5, options.now()), text: pending.text.trim() })
    pending = null
  }

  const boot = () => {
    if (!Ctor || !running) return
    generation += 1
    const current = generation
    const rec = new Ctor()
    rec.lang = options.lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const key = `${current}:${i}`
        const result = event.results[i]
        const text = (result[0]?.transcript ?? '').trim()
        if (!starts.has(key)) starts.set(key, Math.max(0, options.now() - 0.8))
        if (result.isFinal) {
          if (!done.has(key) && text) {
            done.add(key)
            options.onSegment({ start: starts.get(key)!, end: options.now(), text })
          }
          pending = null
        } else {
          pending = { start: starts.get(key)!, text }
          options.onInterim?.(text)
        }
      }
      failures = 0
    }
    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      failures += 1
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'language-not-supported' || failures > 3) {
        running = false
        options.onUnavailable?.(recognitionErrorMessage(event.error))
      }
    }
    rec.onend = () => {
      flushPending()
      if (running && current === generation) {
        // Chrome stops after silences or ~60 s: pick up where it left off.
        window.setTimeout(boot, 120)
      } else {
        endWaiter?.()
        endWaiter = null
      }
    }
    recognition = rec
    try { rec.start() } catch { /* already started */ }
  }

  return {
    supported: Boolean(Ctor),
    start() {
      if (!Ctor) { options.onUnavailable?.('Reconnaissance vocale indisponible dans ce navigateur.'); return }
      running = true
      boot()
    },
    pause() {
      running = false
      recognition?.stop()
    },
    resume() {
      if (!Ctor || running) return
      running = true
      boot()
    },
    /** Stops and waits (briefly) for the last words to be finalised. */
    stop(): Promise<void> {
      const wasRunning = running
      running = false
      if (!recognition) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => { flushPending(); resolve() }, 1500)
        endWaiter = () => { window.clearTimeout(timer); resolve() }
        try { recognition?.stop() } catch { window.clearTimeout(timer); flushPending(); resolve() }
        if (!wasRunning) { window.clearTimeout(timer); flushPending(); resolve() }
      })
    },
  }
}
