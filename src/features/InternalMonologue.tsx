import { useEffect, useMemo, useState } from 'react'
import type { MediaLocale } from './SpeakingStudio'
import './media.css'

export type InternalMonologueScenario = {
  id: string
  title: string
  description: string
  prompt: string
  questions: string[]
}

export type MonologueReflection = {
  scenarioId: string
  text: string
  savedAt: string
}

export type InternalMonologueProps = {
  locale?: MediaLocale
  scenarios?: InternalMonologueScenario[]
  /** Route the selected prompt into the speaking studio. */
  onStartSpeaking?: (scenario: InternalMonologueScenario) => void
  onSaveReflection?: (reflection: MonologueReflection) => Promise<void> | void
  className?: string
}

export const defaultMonologueScenarios: InternalMonologueScenario[] = [
  {
    id: 'my-space',
    title: 'My space',
    description: 'Show us your favorite corner at home.',
    prompt: 'Show me around the place where you feel most yourself.',
    questions: ['What is within reach?', 'What do you do here?', 'Why does this corner feel like yours?'],
  },
  {
    id: 'my-tastes',
    title: 'My tastes',
    description: 'Tell us about a series you love.',
    prompt: 'Tell me about a show, song, or book you keep returning to.',
    questions: ['What pulled you in?', 'Who would you recommend it to?', 'What detail stays with you?'],
  },
  {
    id: 'daily-life',
    title: 'My daily life',
    description: 'Describe your morning routine.',
    prompt: 'Walk me through one ordinary morning, exactly as it happens.',
    questions: ['What is the first thing you notice?', 'Which part changes from day to day?', 'What do you look forward to?'],
  },
  {
    id: 'my-opinions',
    title: 'My opinions',
    description: 'Would you rather live in a city or a small town?',
    prompt: 'Choose between city life and a small town, then make your case.',
    questions: ['What matters most to you?', 'What would you miss from the other option?', 'Has your answer changed over time?'],
  },
]

const copy = {
  fr: {
    eyebrow: 'MONOLOGUE INTÉRIEUR',
    heading: 'Parle de ta vraie vie.',
    choose: 'Choisis une situation',
    guide: 'Un point de départ, pas un script.',
    start: 'Ouvrir dans le studio vocal',
    think: 'Lancer 1 minute de réflexion',
    thinking: 'Réflexion en cours',
    reset: 'Recommencer',
    reflection: 'Une idée à garder',
    placeholder: 'Écris une phrase, un mot, ou rien du tout…',
    save: 'Garder cette idée',
    saved: 'Idée sauvegardée.',
    saveFailed: 'Cette idée n’a pas pu être sauvegardée.',
    complete: 'Terminer la réflexion',
    completeDone: 'Réflexion terminée',
    minutes: 'min',
  },
  en: {
    eyebrow: 'INTERNAL MONOLOGUE',
    heading: 'Speak from your actual life.',
    choose: 'Choose a situation',
    guide: 'A place to begin, not a script.',
    start: 'Open in voice studio',
    think: 'Start a one-minute think',
    thinking: 'Thinking time',
    reset: 'Start over',
    reflection: 'One idea to keep',
    placeholder: 'Write a sentence, a word, or nothing at all…',
    save: 'Keep this idea',
    saved: 'Idea saved.',
    saveFailed: 'This idea could not be saved.',
    complete: 'Finish reflection',
    completeDone: 'Reflection complete',
    minutes: 'min',
  },
} as const

function monologueStorageKey(id: string) { return `vivre-monologue-${id}` }

export function InternalMonologue({
  locale = 'fr',
  scenarios = defaultMonologueScenarios,
  onStartSpeaking,
  onSaveReflection,
  className = '',
}: InternalMonologueProps) {
  const t = copy[locale]
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const selected = useMemo(() => scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0], [scenarios, selectedId])

  useEffect(() => {
    if (!selected) return
    setCompleted(false)
    setSecondsLeft(null)
    try { setNote(localStorage.getItem(monologueStorageKey(selected.id)) ?? '') } catch { setNote('') }
  }, [selected?.id])

  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((value) => value === null ? null : Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  if (!selected) return null
  const minutes = String(Math.floor((secondsLeft ?? 60) / 60)).padStart(1, '0')
  const seconds = String((secondsLeft ?? 60) % 60).padStart(2, '0')

  const selectScenario = (scenario: InternalMonologueScenario) => {
    setSelectedId(scenario.id)
    setMessage(null)
  }

  const save = async () => {
    const reflection = { scenarioId: selected.id, text: note.trim(), savedAt: new Date().toISOString() }
    try {
      if (onSaveReflection) await onSaveReflection(reflection)
      else localStorage.setItem(monologueStorageKey(selected.id), note)
      setMessage(t.saved)
    } catch {
      setMessage(t.saveFailed)
    }
  }

  return <section className={`media-monologue ${className}`.trim()}>
    <div className="media-monologue-heading"><p className="eyebrow">{t.eyebrow}</p><h2>{t.heading}</h2></div>
    <div className="media-monologue-layout">
      <div className="media-scenario-list" aria-label={t.choose}>{scenarios.map((scenario, index) => <button type="button" key={scenario.id} onClick={() => selectScenario(scenario)} className={selected.id === scenario.id ? 'is-selected' : ''}>
        <span>{String(index + 1).padStart(2, '0')}</span><div><strong>{scenario.title}</strong><small>{scenario.description}</small></div><b>→</b>
      </button>)}</div>
      <article className="media-monologue-detail">
        <p className="eyebrow">{t.guide}</p>
        <h3>{selected.title}</h3>
        <p className="media-monologue-prompt">“{selected.prompt}”</p>
        <ol>{selected.questions.map((question) => <li key={question}>{question}</li>)}</ol>
        <div className="media-think-row">
          {secondsLeft === null || secondsLeft === 0
            ? <button type="button" className="outline" onClick={() => setSecondsLeft(60)}>{t.think} <span>→</span></button>
            : <div className="media-think-timer"><span>{t.thinking}</span><strong>{minutes}:{seconds}</strong><button type="button" onClick={() => setSecondsLeft(null)}>{t.reset}</button></div>}
          <button type="button" className="primary" onClick={() => onStartSpeaking?.(selected)}>{t.start}<span>→</span></button>
        </div>
        <label className="media-reflection"><span>{t.reflection}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t.placeholder} /></label>
        <footer><button type="button" className="text-button" onClick={() => void save()}>{t.save}</button><button type="button" className={completed ? 'media-complete is-complete' : 'media-complete'} onClick={() => setCompleted((value) => !value)}>{completed ? `✓ ${t.completeDone}` : t.complete}</button></footer>
        {message && <p className="media-reflection-message" role="status">{message}</p>}
      </article>
    </div>
  </section>
}

export default InternalMonologue
