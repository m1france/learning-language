import React, { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CheckCircle2, Dumbbell } from 'lucide-react'
import type { AppState, LearnedWord, UiLanguage } from '../../domain'
import { learnCopy } from '../../i18n'
import { knownTags } from '../../store'
import { daysBetween, dayKey } from './fsrs'
import { ReviewRunner, type ReviewSummary } from './ReviewRunner'
import { ReviewStats } from './ReviewStats'
import { type PracticeFilter, buildReviewQueue, nextDue, practiceWords } from './srsStore'

type View =
  | { kind: 'home' }
  | { kind: 'run'; ids: string[]; practice: boolean; key: number }
  | { kind: 'done'; summary: ReviewSummary; practice: boolean }

const PRACTICE_SIZE = 20

const shuffle = <T,>(items: T[]) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Seconds per card used for time estimates (Anki users average 8-12 s). */
export const SECONDS_PER_CARD = 10

export function ReviewPage({
  state,
  ui,
  onChange,
  onGoRead,
}: {
  state: AppState
  ui: UiLanguage
  onChange: (update: (prev: AppState) => AppState) => void
  onGoRead: () => void
}) {
  const c = learnCopy(ui)
  const [view, setView] = useState<View>({ kind: 'home' })
  const [filterKind, setFilterKind] = useState<PracticeFilter['kind']>('all')
  const [filterValue, setFilterValue] = useState('')

  const queue = useMemo(() => buildReviewQueue(state), [state.words, state.activity, state.settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const language = state.settings.learningLanguage
  const totalWords = state.words.filter((word) => word.language === language).length
  const upcoming = useMemo(() => nextDue(state), [state.words]) // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => knownTags(state, language), [state.words, state.customTags, language]) // eslint-disable-line react-hooks/exhaustive-deps
  const resources = state.resources.filter((resource) => state.words.some((word) => word.sourceResourceId === resource.id))

  const filter: PracticeFilter =
    filterKind === 'tag' ? { kind: 'tag', tag: filterValue || tags[0] || '' }
      : filterKind === 'resource' ? { kind: 'resource', resourceId: filterValue || resources[0]?.id || '' }
        : filterKind === 'recent' ? { kind: 'recent', days: 7 }
          : filterKind === 'struggling' ? { kind: 'struggling' }
            : { kind: 'all' }
  const practicePool = useMemo(() => practiceWords(state, filter), [state.words, filterKind, filterValue]) // eslint-disable-line react-hooks/exhaustive-deps

  const startReview = () => setView({ kind: 'run', ids: queue.ids, practice: false, key: Date.now() })
  const startPractice = (words: LearnedWord[]) => {
    if (!words.length) return
    setView({ kind: 'run', ids: shuffle(words).slice(0, PRACTICE_SIZE).map((word) => word.id), practice: true, key: Date.now() })
  }

  if (view.kind === 'run') {
    return (
      <div className="page lx-page lx-run-page">
        <ReviewRunner
          key={view.key}
          state={state}
          ui={ui}
          wordIds={view.ids}
          practice={view.practice}
          onChange={onChange}
          onExit={(summary) => setView(summary.reviewed > 0 ? { kind: 'done', summary, practice: view.practice } : { kind: 'home' })}
          onComplete={(summary) => setView({ kind: 'done', summary, practice: view.practice })}
        />
      </div>
    )
  }

  if (view.kind === 'done') {
    const { summary } = view
    const accuracy = summary.reviewed ? Math.round((summary.correct / summary.reviewed) * 100) : 0
    return (
      <div className="page lx-page">
        <section className="lx-finish">
          <CheckCircle2 size={34} className="lx-finish-icon" />
          <h1>{c.finishTitle}</h1>
          <div className="lx-finish-grid">
            <div><b>{summary.reviewed}</b><span>{c.finishCards}</span></div>
            <div><b>{accuracy} %</b><span>{c.finishAccuracy}</span></div>
            <div><b>{Math.max(1, Math.round(summary.seconds / 60))}</b><span>{c.finishMinutes}</span></div>
            {!view.practice && <div><b>{summary.newLearned}</b><span>{c.finishNew}</span></div>}
          </div>
          <div className="lx-finish-actions">
            <button type="button" className="outline" onClick={() => setView({ kind: 'home' })}>{c.back}</button>
            {!view.practice && queue.ids.length > 0 && (
              <button type="button" className="primary" onClick={startReview}>{c.cardsWaiting(queue.ids.length)} <ArrowRight size={15} /></button>
            )}
          </div>
        </section>
      </div>
    )
  }

  const nextLabel = upcoming
    ? c.nextDue(daysBetween(dayKey(), upcoming.day) === 1 ? c.tomorrow : c.inDays(daysBetween(dayKey(), upcoming.day)), upcoming.count)
    : null

  return (
    <div className="page lx-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{c.reviewEyebrow}</p>
          <h1>{c.reviewTitle}</h1>
          <p className="subhead">{c.reviewSub}</p>
        </div>
      </header>

      <section className="lx-cta">
        {totalWords === 0 ? (
          <div className="lx-cta-body">
            <div>
              <h2>{c.noWordsTitle}</h2>
              <p className="lx-cta-sub">{c.noWordsHint}</p>
            </div>
            <button type="button" className="primary" onClick={onGoRead}><BookOpen size={15} /> {c.goRead}</button>
          </div>
        ) : queue.ids.length > 0 ? (
          <div className="lx-cta-body">
            <div>
              <h2>{c.cardsWaiting(queue.ids.length)}</h2>
              <p className="lx-cta-counts">
                {queue.newCount > 0 && <span className="rv-count new">{queue.newCount} {c.counts.new}</span>}
                {queue.learningCount > 0 && <span className="rv-count learning">{queue.learningCount} {c.counts.learning}</span>}
                {queue.dueCount > 0 && <span className="rv-count review">{queue.dueCount} {c.counts.review}</span>}
                <span className="lx-cta-time">{c.aboutMinutes(Math.max(1, Math.ceil((queue.ids.length * SECONDS_PER_CARD) / 60)))}</span>
              </p>
              {queue.overflow > 0 && <p className="lx-cta-note">{c.overflow(queue.overflow)}</p>}
            </div>
            <button type="button" className="primary large-inline" onClick={startReview}>{c.start} <ArrowRight size={16} /></button>
          </div>
        ) : (
          <div className="lx-cta-body">
            <div>
              <h2><CheckCircle2 size={22} className="lx-ok" /> {c.allDone}</h2>
              {nextLabel && <p className="lx-cta-sub">{nextLabel}</p>}
            </div>
          </div>
        )}
      </section>

      {totalWords > 0 && (
        <section className="lx-practice">
          <div className="lx-practice-head">
            <Dumbbell size={17} />
            <div>
              <h3>{c.practiceTitle}</h3>
              <p>{c.practiceHint}</p>
            </div>
          </div>
          <div className="lx-practice-controls">
            <select value={filterKind} onChange={(event) => { setFilterKind(event.target.value as PracticeFilter['kind']); setFilterValue('') }}>
              <option value="all">{c.practiceFilters.all}</option>
              <option value="struggling">{c.practiceFilters.struggling}</option>
              <option value="recent">{c.practiceFilters.recent}</option>
              {tags.length > 0 && <option value="tag">{c.practiceFilters.tag}</option>}
              {resources.length > 0 && <option value="resource">{c.practiceFilters.resource}</option>}
            </select>
            {filterKind === 'tag' && (
              <select value={filterValue || tags[0]} onChange={(event) => setFilterValue(event.target.value)}>
                {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
            {filterKind === 'resource' && (
              <select value={filterValue || resources[0]?.id} onChange={(event) => setFilterValue(event.target.value)}>
                {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}
              </select>
            )}
            <span className="lx-practice-count">{c.wordsCount(Math.min(PRACTICE_SIZE, practicePool.length))}</span>
            <button type="button" className="outline" disabled={!practicePool.length} onClick={() => startPractice(practicePool)}>
              {c.practiceStart} <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}

      {totalWords > 0 && <ReviewStats state={state} ui={ui} onPracticeWords={startPractice} />}
    </div>
  )
}
