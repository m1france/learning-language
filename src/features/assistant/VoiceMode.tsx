import React, { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import type { AppState, CefrLevel, UiLanguage } from '../../domain'
import { speakAndWait, stopSpeaking } from '../../ai'
import { getLanguageBcp47 } from '../../languages'
import type { ChatMessage, LlmConfig } from '../../lib/llm'
import { isIOS, listen, speechRecognitionSupported, type ListenHandle } from '../../lib/speech'
import type { AssistantCopy } from '../../i18n/assistantCopy'
import { buildVoicePrompt, VOICE_SCENARIOS } from './assistantPrompt'
import { parseVoiceReply, runAgent } from './assistantAgent'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

export type VoiceExchange = { user?: string; assistant?: string; fix?: string }

type Props = {
  state: AppState
  ui: UiLanguage
  level: CefrLevel
  cfg: LlmConfig
  c: AssistantCopy
  /** Earlier messages of the conversation, for continuity. */
  history: ChatMessage[]
  onExchange: (exchange: VoiceExchange) => void
  onClose: (hadConversation: boolean) => void
}

export function VoiceMode({ state, ui, level, cfg, c, history, onExchange, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const scenario = VOICE_SCENARIOS[0]
  const custom = ''
  const [muted, setMuted] = useState(false)
  const [caption, setCaption] = useState('')
  const [heard, setHeard] = useState('')
  const [fixes, setFixes] = useState<{ id: number; text: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [level01, setLevel01] = useState(0)

  const messagesRef = useRef<ChatMessage[]>([])
  // The conversation before the call; turns spoken during the call live in messagesRef.
  const baseHistory = useRef(history).current
  const listenRef = useRef<ListenHandle | null>(null)
  const activeRef = useRef(false)
  const mutedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const exchangesRef = useRef(0)
  const lang = state.settings.learningLanguage
  const supported = speechRecognitionSupported()

  mutedRef.current = muted
  // Async turns outlive renders: read the chosen scenario through refs.
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario
  const customRef = useRef(custom)
  customRef.current = custom
  const respondRef = useRef<(text: string) => Promise<void>>(async () => undefined)

  // Microphone level for the orb (visual only; skipped on iOS where it competes with recognition).
  useEffect(() => {
    if (isIOS() || !supported) return
    let disposed = false
    let stream: MediaStream | null = null
    let frame = 0
    let context: AudioContext | null = null
    void navigator.mediaDevices?.getUserMedia({ audio: true }).then((media) => {
      if (disposed) { media.getTracks().forEach((track) => track.stop()); return }
      stream = media
      context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(media).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) { const v = (data[i] - 128) / 128; sum += v * v }
        setLevel01(Math.min(1, Math.sqrt(sum / data.length) * 4))
        frame = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => undefined)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      void context?.close().catch(() => undefined)
    }
  }, [supported]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = () => {
    listenRef.current?.abort()
    listenRef.current = null
  }

  const startListening = () => {
    if (!activeRef.current || mutedRef.current) { setPhase('idle'); return }
    stopListening()
    setHeard('')
    setPhase('listening')
    let gotFinal = false
    const handle = listen({
      lang: getLanguageBcp47(lang),
      onInterim: setHeard,
      onFinal: (text) => { gotFinal = true; void respondRef.current(text) },
      onError: (message, code) => {
        if (code === 'not-allowed' || code === 'service-not-allowed') { setError(message); activeRef.current = false; setPhase('idle') }
      },
      onEnd: () => {
        listenRef.current = null
        // Silence: keep listening while the call is on.
        if (!gotFinal && activeRef.current && !mutedRef.current) window.setTimeout(() => { if (activeRef.current && !listenRef.current) startListening() }, 250)
      },
    })
    if (!handle) { setError(c.voiceUnsupported); setPhase('idle'); return }
    listenRef.current = handle
  }

  const system = () => buildVoicePrompt(state, { level, ui, scenario: scenarioRef.current, custom: customRef.current })

  /** One tutor turn: ask the model, show the caption, speak it, then listen again. */
  const tutorTurn = async (userText?: string) => {
    setPhase('thinking')
    setCaption('')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const kickoff: ChatMessage[] = userText === undefined
      ? [{ role: 'user', content: '(The learner just joined the call. Greet them briefly and open the scenario with a question.)' }]
      : []
    try {
      const result = await runAgent({
        cfg,
        system: system(),
        messages: [...baseHistory.slice(-8), ...messagesRef.current, ...kickoff],
        temperature: 0.8,
        maxTokens: 500,
        reasoningEffort: 'low',
        signal: controller.signal,
        callbacks: { onText: (full) => setCaption(parseVoiceReply(full).say) },
      })
      if (!activeRef.current) return
      const reply = parseVoiceReply(result.content)
      if (!reply.say) throw new Error('empty')
      messagesRef.current.push({ role: 'assistant', content: `<say>${reply.say}</say>` })
      setCaption(reply.say)
      if (reply.fix) setFixes((prev) => [{ id: Date.now(), text: reply.fix! }, ...prev].slice(0, 12))
      onExchange({ user: userText, assistant: reply.say, fix: reply.fix })
      exchangesRef.current += 1
      setPhase('speaking')
      await speakAndWait(reply.say, lang, state.settings.api)
      if (activeRef.current) startListening()
    } catch (caught) {
      if ((caught as Error)?.name === 'AbortError' || !activeRef.current) return
      setError(caught instanceof Error && caught.message !== 'empty' ? caught.message : c.errorNoKey)
      setPhase('idle')
    }
  }

  const respond = async (text: string) => {
    stopListening()
    setHeard(text)
    messagesRef.current.push({ role: 'user', content: text })
    await tutorTurn(text)
  }
  respondRef.current = respond

  const start = () => {
    if (!supported) { setError(c.voiceUnsupported); return }
    activeRef.current = true
    setError(null)
    void tutorTurn()
  }

  const end = () => {
    activeRef.current = false
    abortRef.current?.abort()
    stopListening()
    stopSpeaking()
    onClose(exchangesRef.current > 0)
  }

  useEffect(() => {
    // Defer kickoff so React StrictMode can cancel the first setup cleanly.
    const timer = window.setTimeout(start, 0)
    return () => {
      window.clearTimeout(timer)
      activeRef.current = false
      abortRef.current?.abort()
      listenRef.current?.abort()
      stopSpeaking()
    }
  }, [])

  const tapOrb = () => {
    if (phase === 'speaking') { stopSpeaking(); return }
    if (phase === 'idle' && activeRef.current) startListening()
    else if (phase === 'listening') listenRef.current?.stop()
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    mutedRef.current = next
    if (next) { stopListening(); if (phase === 'listening') setPhase('idle') }
    else if (phase === 'idle' && activeRef.current) startListening()
  }

  const status = phase === 'listening' ? c.listening : phase === 'speaking' ? c.speaking : phase === 'thinking' ? c.thinking : muted ? c.unmute : c.tapToTalk

  return (
    <div className={`vm-overlay live ${phase}`} role="region" aria-label={c.voiceTitle}>
      <div className="vm-stage">
        <button type="button" className="vm-orb" onClick={tapOrb} aria-label={phase === 'speaking' ? c.tapToInterrupt : c.tapToTalk}
          style={{ ['--lvl' as string]: phase === 'listening' ? level01.toFixed(2) : '0' }}>
          <span className="vm-orb-core"><span className="vm-face"><i /><i /></span></span>
          <span className="vm-orb-ring" />
        </button>
        <p className="vm-status" aria-live="polite">{status}</p>
        <p className="vm-caption">{caption}</p>
        {heard && <p className="vm-heard">« {heard} »</p>}
        {error && <p className="vm-error">{error}</p>}
      </div>

      {fixes.length > 0 && (
        <aside className="vm-fixes" aria-label={c.corrections}>
          <h3>{c.corrections}</h3>
          <ul>{fixes.map((fix) => <li key={fix.id}>{fix.text}</li>)}</ul>
        </aside>
      )}

      <div className="vm-controls">
        <button type="button" className={`vm-ctrl${muted ? ' on' : ''}`} onClick={toggleMute} aria-label={muted ? c.unmute : c.mute}>
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button type="button" className="vm-ctrl end" onClick={end} aria-label={c.endCall}>
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  )
}
