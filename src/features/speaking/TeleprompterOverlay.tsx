import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Language } from '../../domain'
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Mic,
  MicOff,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react'

type TeleprompterOverlayProps = {
  ui: 'fr' | 'en'
  text: string
  title?: string
  badge?: string
  language: Language
  recording: boolean
  onClose: () => void
}

type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function createRecognition(lang: Language): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = lang === 'en' ? 'en-US' : 'fr-FR'
  return recognition
}

export function TeleprompterOverlay({
  ui,
  text,
  title,
  badge,
  language,
  recording,
  onClose,
}: TeleprompterOverlayProps) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1.1) // 0.5 – 2.5
  const [opacity, setOpacity] = useState(0.85) // Glassmorphism opacity
  const [expanded, setExpanded] = useState(false)
  const [follow, setFollow] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const hasRecognition = useMemo(() => createRecognition(language) !== null, [language])

  // Timed auto-scroll: ~140 wpm at speed 1.0
  useEffect(() => {
    if (!playing || follow || index >= words.length) return
    const perWord = 60000 / (140 * speed)
    const timer = window.setTimeout(() => {
      setIndex((i) => Math.min(words.length, i + 1))
    }, perWord)
    return () => window.clearTimeout(timer)
  }, [playing, follow, index, speed, words.length])

  // Voice follow
  useEffect(() => {
    if (!follow || !hasRecognition) return
    const recognition = createRecognition(language)
    if (!recognition) return
    recognitionRef.current = recognition
    let cursor = index
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1]
      const heard =
        last?.[0]?.transcript
          .toLowerCase()
          .replace(/[^a-zà-ÿ\s'-]/gi, '')
          .split(/\s+/)
          .filter(Boolean) ?? []
      for (const spoken of heard) {
        for (let ahead = cursor; ahead < Math.min(cursor + 6, words.length); ahead += 1) {
          if (words[ahead].toLowerCase().replace(/[^a-zà-ÿ'-]/gi, '') === spoken) {
            cursor = ahead + 1
            break
          }
        }
      }
      setIndex(cursor)
    }
    recognition.onend = () => {
      try {
        recognition.start()
      } catch {
        /* stopped */
      }
    }
    try {
      recognition.start()
    } catch {
      /* unsupported */
    }
    return () => {
      recognition.onend = null
      try {
        recognition.stop()
      } catch {
        /* noop */
      }
    }
  }, [follow, hasRecognition, language, words, index])

  // Center the current word in the viewing window
  useEffect(() => {
    const container = scrollRef.current
    const current = container?.querySelector('[data-current="true"]') as HTMLElement | null
    if (container && current) {
      const targetScroll = current.offsetTop - container.clientHeight / 2 + current.clientHeight / 2
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
  }, [index])

  const done = index >= words.length
  const pct = Math.min(100, Math.round((index / words.length) * 100))

  return (
    <div
      className={`prompter-glass-overlay ${expanded ? 'expanded' : ''}`}
      style={{
        backgroundColor: `rgba(15, 18, 24, ${opacity})`,
        borderColor: `rgba(255, 255, 255, ${Math.max(0.1, opacity * 0.25)})`,
      }}
    >
      {/* Header bar */}
      <div className="prompter-hud-header">
        <div className="prompter-hud-meta">
          {badge && <span className="prompter-hud-badge">{badge}</span>}
          <strong className="prompter-hud-title">{title || (ui === 'fr' ? 'Prompteur' : 'Teleprompter')}</strong>
          {recording && <span className="prompter-rec-dot" title="Enregistrement en cours" />}
        </div>

        <div className="prompter-hud-controls">
          <div className="prompter-progress-pill">
            <span className="pill-pct">{pct}%</span>
            <div className="pill-track">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>

          {hasRecognition && (
            <button
              className={`hud-icon-btn ${follow ? 'active' : ''}`}
              onClick={() => setFollow(!follow)}
              title={follow ? (ui === 'fr' ? 'Désactiver suivi vocal' : 'Disable voice follow') : (ui === 'fr' ? 'Activer suivi vocal' : 'Enable voice follow')}
            >
              {follow ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
          )}

          <button
            className={`hud-icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title={ui === 'fr' ? 'Réglages de transparence et vitesse' : 'Opacity & speed settings'}
          >
            <Sliders size={14} />
          </button>

          <button
            className="hud-icon-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? (ui === 'fr' ? 'Réduire' : 'Minimize') : (ui === 'fr' ? 'Agrandir' : 'Expand')}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button className="hud-icon-btn close" onClick={onClose} title={ui === 'fr' ? 'Fermer le prompteur' : 'Close prompter'}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Settings popover */}
      {showSettings && (
        <div className="prompter-settings-drawer">
          <div className="setting-row">
            <span className="setting-label">{ui === 'fr' ? 'Transparence' : 'Transparency'}</span>
            <input
              type="range"
              min="0.3"
              max="0.98"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span className="setting-val">{Math.round(opacity * 100)}%</span>
          </div>
          <div className="setting-row">
            <span className="setting-label">{ui === 'fr' ? 'Vitesse' : 'Speed'}</span>
            <input
              type="range"
              min="0.5"
              max="2.2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
            <span className="setting-val">{speed.toFixed(1)}x</span>
          </div>
        </div>
      )}

      {/* Text display window */}
      <div className="prompter-text-window" ref={scrollRef}>
        <div className="prompter-text-content">
          {words.map((word, i) => (
            <span
              key={i}
              data-current={i === index}
              className={`p-word ${i < index ? 'p-said' : i === index ? 'p-current' : 'p-upcoming'}`}
              onClick={() => setIndex(i)}
            >
              {word}{' '}
            </span>
          ))}
        </div>
      </div>

      {/* Footer bar */}
      <div className="prompter-hud-footer">
        <div className="prompter-playback-bar">
          <button className="prompter-btn" onClick={() => setIndex(0)} title={ui === 'fr' ? 'Recommencer au début' : 'Restart'}>
            <RotateCcw size={14} />
          </button>
          <button className="prompter-btn" onClick={() => setIndex((i) => Math.max(0, i - 8))} title={ui === 'fr' ? '- 8 mots' : '- 8 words'}>
            <ChevronLeft size={16} />
          </button>
          <button
            className={`prompter-btn primary ${playing ? 'playing' : ''}`}
            onClick={() => setPlaying(!playing)}
            title={playing ? (ui === 'fr' ? 'Pause' : 'Pause') : (ui === 'fr' ? 'Faire défiler' : 'Scroll')}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="prompter-btn" onClick={() => setIndex((i) => Math.min(words.length, i + 8))} title={ui === 'fr' ? '+ 8 mots' : '+ 8 words'}>
            <ChevronRight size={16} />
          </button>
        </div>

        {done && (
          <div className="prompter-finished-pill">
            <Check size={14} /> {ui === 'fr' ? 'Lecture terminée !' : 'Completed!'}
          </div>
        )}
      </div>
    </div>
  )
}
