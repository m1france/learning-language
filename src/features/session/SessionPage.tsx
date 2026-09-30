import React, { useEffect } from 'react'
import { BookOpen, Check, ChevronRight, Layers, Mic, Pause, PenLine, Sparkles } from 'lucide-react'
import type { AppState, SessionStepId, UiLanguage } from '../../domain'
import { learnCopy } from '../../i18n'
import { dayKey } from '../srs/fsrs'
import { learningSettings } from '../srs/srsStore'
import { ReadingStep, ReviewStep, SessionSummary, SpeakingStep, WritingStep } from './SessionSteps'
import { beginReading, closeStep, currentStepId, freezeStepContent, startSession } from './sessionPlan'

export const STEP_ICONS: Record<SessionStepId, React.ReactNode> = {
  review: <Layers size={15} />,
  reading: <BookOpen size={15} />,
  newWords: <Sparkles size={15} />,
  writing: <PenLine size={15} />,
  speaking: <Mic size={15} />,
}

/** Full-focus page for the guided daily session: one step at a time. */
export function SessionPage({
  state,
  ui,
  onChange,
  onOpenReader,
  onFinishReading,
  onHome,
  onAddText,
}: {
  state: AppState
  ui: UiLanguage
  onChange: (update: (prev: AppState) => AppState) => void
  onOpenReader: (resourceId: string) => void
  onFinishReading: () => void
  onHome: () => void
  onAddText: () => void
}) {
  const c = learnCopy(ui)
  const session = state.dailySession
  const isToday = session?.day === dayKey()
  const step = session ? currentStepId(session) : undefined

  // Arriving on an old or missing session plans today's.
  useEffect(() => { if (!isToday) onChange((prev) => startSession(prev)) }, [isToday]) // eslint-disable-line react-hooks/exhaustive-deps
  // Writing words and speaking sentences are chosen when their step opens.
  useEffect(() => { if (step === 'writing' || step === 'speaking') onChange((prev) => freezeStepContent(prev)) }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !isToday) return <div className="page lx-page" />

  const settings = learningSettings(state)
  const minutes = Math.round((state.activity?.[session.day]?.seconds ?? 0) / 60)
  const stepProps = { state, session, ui, onChange }
  const ready = (step !== 'writing' || session.writingWordIds) && (step !== 'speaking' || session.speakingSentences)

  return (
    <div className="page lx-page ss-page">
      <header className="ss-top">
        {!session.completedAt && <button type="button" className="outline ss-pause" onClick={onHome}><Pause size={14} /> {c.pause}</button>}
        <ol className="ss-stepper">
          {session.steps.map((item, index) => (
            <li key={item.id} className={`ss-step ${item.status}${index === session.currentStep && !session.completedAt ? ' current' : ''}`}>
              <span className="ss-step-icon">{item.status === 'done' ? <Check size={14} /> : STEP_ICONS[item.id]}</span>
              <span className="ss-step-label">{c.steps[item.id]}</span>
              {index < session.steps.length - 1 && <ChevronRight size={13} className="ss-step-sep" />}
            </li>
          ))}
        </ol>
        <span className="ss-time" title={c.todayMinutes(minutes, settings.dailyMinutes)}>
          {minutes} / {settings.dailyMinutes} {c.minutesUnit}
        </span>
      </header>

      {!session.completedAt && (
        <div className="ss-step-bar">
          <span>{c.stepOf(session.currentStep + 1, session.steps.length)}</span>
          <button type="button" className="text-button" onClick={() => onChange((prev) => closeStep(prev, 'skipped'))}>{c.skip}</button>
        </div>
      )}

      <main className="ss-main">
        {session.completedAt && <SessionSummary {...stepProps} onHome={onHome} />}
        {step === 'review' && <ReviewStep key={`review-${session.currentStep}`} {...stepProps} onPause={onHome} />}
        {step === 'newWords' && (
          <ReviewStep key={`new-${session.currentStep}`} {...stepProps} onPause={onHome}
            wordIds={session.newWordIds.filter((wordId) => state.words.some((word) => word.id === wordId))} />
        )}
        {step === 'reading' && (
          <ReadingStep {...stepProps}
            onOpenReader={(resourceId) => { onChange((prev) => beginReading(prev)); onOpenReader(resourceId) }}
            onFinish={onFinishReading}
            onAddText={onAddText} />
        )}
        {step === 'writing' && ready && <WritingStep key={session.day} {...stepProps} />}
        {step === 'speaking' && ready && <SpeakingStep key={session.day} {...stepProps} />}
      </main>
    </div>
  )
}
