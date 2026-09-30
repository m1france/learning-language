import React from 'react'
import { ArrowRight, Check, Flame } from 'lucide-react'
import type { AppState, UiLanguage } from '../../domain'
import { learnCopy } from '../../i18n'
import { dayKey } from '../srs/fsrs'
import { computeStreak, learningSettings } from '../srs/srsStore'
import { STEP_ICONS } from './SessionPage'
import { estimateMinutes, sessionForToday, wordsSavedWhileReading } from './sessionPlan'

/** Home-page banner: today's path at a glance and the start button. Hidden once the session is done. */
export function SessionHero({ state, ui, onStart }: { state: AppState; ui: UiLanguage; onStart: () => void }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const { session, started } = sessionForToday(state)
  const streak = computeStreak(state.activity, settings.dailyMinutes)

  if (!session.steps.length || session.completedAt) return null

  return (
    <section className="ss-hero">
      <div className="ss-hero-main">
        <p className="eyebrow">{c.heroEyebrow}</p>
        <h2>{c.heroTitle}</h2>
        <ol className="ss-hero-steps">
          {session.steps.map((step, index) => (
            <li key={step.id} className={`${step.status}${started && index === session.currentStep ? ' current' : ''}`} title={c.steps[step.id]}>
              <span className="ss-step-icon">{step.status === 'done' ? <Check size={13} /> : STEP_ICONS[step.id]}</span>
              <span className="ss-hero-step-label">{c.steps[step.id]}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="ss-hero-actions">
        <button type="button" className="primary" onClick={onStart}>
          {started ? c.heroResume : c.heroStart} <ArrowRight size={15} />
        </button>
        <span className="ss-hero-estimate">
          {c.heroMinutes(estimateMinutes(state, session))}
          {streak.current > 0 && <> · <Flame size={12} /> {streak.current}</>}
        </span>
      </div>
    </section>
  )
}

/** Discreet pill shown in the home header once today's session is complete. */
export function SessionDonePill({ state, ui, onOpen }: { state: AppState; ui: UiLanguage; onOpen: () => void }) {
  const c = learnCopy(ui)
  const session = state.dailySession
  if (!session || session.day !== dayKey() || !session.completedAt) return null
  const settings = learningSettings(state)
  const streak = computeStreak(state.activity, settings.dailyMinutes)
  const minutes = Math.round((state.activity?.[dayKey()]?.seconds ?? 0) / 60)
  return (
    <button type="button" className="ss-done-pill" onClick={onOpen} title={c.heroAgain}>
      <Check size={13} className="ss-done-check" />
      <span>{c.heroDone}</span>
      <i />
      <Flame size={13} /> <b>{streak.current}</b> {c.days(streak.current)}
      <i />
      <b>{minutes}</b> {c.minutesUnit}
    </button>
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
