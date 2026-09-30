import React from 'react'
import { ArrowRight, Check, Flame } from 'lucide-react'
import type { AppState, SessionStep, UiLanguage } from '../../domain'
import { learnCopy } from '../../i18n'
import { dayKey } from '../srs/fsrs'
import { WeekDots } from '../srs/ReviewStats'
import { buildReviewQueue, computeStreak, learningSettings } from '../srs/srsStore'
import { STEP_ICONS } from './SessionPage'
import { SPEAKING_SENTENCES, WRITING_SENTENCES, estimateMinutes, sessionForToday, wordsSavedWhileReading } from './sessionPlan'

/** Home-page banner: today's path, time goal ring and streak. */
export function SessionHero({ state, ui, onStart }: { state: AppState; ui: UiLanguage; onStart: () => void }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const { session, started } = sessionForToday(state)
  const streak = computeStreak(state.activity, settings.dailyMinutes)
  const minutes = Math.round((state.activity?.[dayKey()]?.seconds ?? 0) / 60)
  const ratio = Math.min(1, minutes / settings.dailyMinutes)
  const done = Boolean(session.completedAt)
  const resource = state.resources.find((item) => item.id === session.resourceId)
  const reviewCount = buildReviewQueue(state, new Date(), { cap: settings.sessionReviewCap }).ids.length

  if (!session.steps.length) return null

  const hint = (step: SessionStep) => {
    switch (step.id) {
      case 'review': return c.stepHint.review(step.status === 'done' ? step.stats?.cards ?? 0 : reviewCount)
      case 'reading': return resource ? c.stepHint.reading(resource.title) : ''
      case 'newWords': return c.stepHint.newWords(session.newWordIds.length || wordsSavedWhileReading(state, session).length)
      case 'writing': return c.stepHint.writing(WRITING_SENTENCES)
      case 'speaking': return c.stepHint.speaking(session.speakingSentences?.length ?? SPEAKING_SENTENCES)
    }
  }

  const radius = 34
  const circumference = 2 * Math.PI * radius

  return (
    <section className={`ss-hero${done ? ' done' : ''}`}>
      <div className="ss-hero-main">
        <p className="eyebrow">{c.heroEyebrow}</p>
        <h2>{done ? c.heroDone : c.heroTitle}</h2>
        {done && <p className="ss-hero-sub">{c.heroDoneHint}</p>}
        <ol className="ss-hero-steps">
          {session.steps.map((step, index) => (
            <li key={step.id} className={`${step.status}${started && index === session.currentStep && !done ? ' current' : ''}`}>
              <span className="ss-step-icon">{step.status === 'done' ? <Check size={14} /> : STEP_ICONS[step.id]}</span>
              <span className="ss-hero-step-text">
                <b>{c.steps[step.id]}</b>
                <small>{hint(step)}</small>
              </span>
            </li>
          ))}
        </ol>
        <div className="ss-hero-actions">
          <button type="button" className={done ? 'outline' : 'primary'} onClick={onStart}>
            {done ? c.heroAgain : started ? c.heroResume : c.heroStart} <ArrowRight size={15} />
          </button>
          {!done && <span className="ss-hero-estimate">{c.heroMinutes(estimateMinutes(state, session))}</span>}
        </div>
      </div>

      <aside className="ss-hero-side">
        <div className="ss-ring" role="img" aria-label={c.todayMinutes(minutes, settings.dailyMinutes)}>
          <svg viewBox="0 0 80 80" width="96" height="96">
            <circle cx="40" cy="40" r={radius} className="ss-ring-track" />
            <circle cx="40" cy="40" r={radius} className="ss-ring-fill"
              strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} transform="rotate(-90 40 40)" />
          </svg>
          <span className="ss-ring-label"><b>{minutes}</b><small>/ {settings.dailyMinutes} {c.minutesUnit}</small></span>
        </div>
        <p className="ss-hero-streak"><Flame size={15} /> <b>{streak.current}</b> {c.days(streak.current)}</p>
        <WeekDots state={state} ui={ui} />
      </aside>
    </section>
  )
}

/** Floating bar shown in the reader while the session's reading step is open. */
export function SessionDock({ state, ui, onFinish, onBack }: { state: AppState; ui: UiLanguage; onFinish: () => void; onBack: () => void }) {
  const c = learnCopy(ui)
  const session = state.dailySession
  if (!session) return null
  const saved = wordsSavedWhileReading(state, session).length
  return (
    <div className="ss-dock" role="region" aria-label={c.dockLabel}>
      <button type="button" className="ss-dock-label" onClick={onBack}>
        <span className="ss-dock-dot" />
        {c.dockLabel}
      </button>
      {saved > 0 && <span className="ss-dock-count">{c.wordsSaved(saved)}</span>}
      <button type="button" className="primary ss-dock-btn" onClick={onFinish}><Check size={14} /> {c.dockDone}</button>
    </div>
  )
}
