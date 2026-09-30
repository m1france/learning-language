import React, { useMemo, useState } from 'react'
import type { AppState, LearnedWord, UiLanguage } from '../../domain'
import { learnCopy } from '../../i18n'
import { addDays, dayKey } from './fsrs'
import { type Maturity, computeStreak, forecast, learningSettings, maturityCounts, retentionRate, strugglingWords } from './srsStore'

const MATURITY_ORDER: Maturity[] = ['new', 'learning', 'young', 'mature', 'known']

const locale = (ui: UiLanguage) => (ui === 'fr' ? 'fr-FR' : 'en-GB')
const formatDay = (day: string, ui: UiLanguage, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale(ui), options)

/** Week strip: Monday → Sunday, filled when the day's goal was met. */
export function WeekDots({ state, ui }: { state: AppState; ui: UiLanguage }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const streak = computeStreak(state.activity, settings.dailyMinutes)
  return (
    <div className="lx-week" role="list">
      {streak.week.map((day, index) => (
        <span key={day.day} role="listitem" className={`lx-week-day ${day.status}`}
          title={`${formatDay(day.day, ui, { weekday: 'long', day: 'numeric', month: 'short' })} · ${day.minutes} ${c.minutesShort}`}>
          <i />
          <small>{c.weekdays[index]}</small>
        </span>
      ))}
    </div>
  )
}

export function ReviewStats({ state, ui, onPracticeWords }: { state: AppState; ui: UiLanguage; onPracticeWords?: (words: LearnedWord[]) => void }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const streak = useMemo(() => computeStreak(state.activity, settings.dailyMinutes), [state.activity, settings.dailyMinutes])
  const retention = useMemo(() => retentionRate(state), [state.reviewLog]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => maturityCounts(state), [state.words, state.settings.learningLanguage]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => forecast(state, 14), [state.words, state.settings.learningLanguage]) // eslint-disable-line react-hooks/exhaustive-deps
  const struggling = useMemo(() => strugglingWords(state), [state.words, state.settings.learningLanguage]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalWords = MATURITY_ORDER.reduce((sum, key) => sum + counts[key], 0)
  const maxForecast = Math.max(1, ...days.map((day) => day.count))
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="lx-stats">
      <section className="lx-stat-card lx-streak-card">
        <p className="lx-stat-label">{c.streakTitle}</p>
        <p className="lx-hero-number">{streak.current}<small> {c.days(streak.current)}</small></p>
        <WeekDots state={state} ui={ui} />
        <p className="lx-stat-foot">
          {c.best} : {streak.best} · <span title={c.jokerHint}>{c.jokers(streak.jokers)}</span>
        </p>
      </section>

      <section className="lx-stat-card">
        <p className="lx-stat-label">{c.retentionTitle}</p>
        {retention.rate === null
          ? <p className="lx-stat-empty">{c.retentionEmpty}</p>
          : <>
            <p className="lx-hero-number">{Math.round(retention.rate * 100)}<small> %</small></p>
            <p className="lx-stat-foot">{c.retentionHint(retention.count)}</p>
          </>}
      </section>

      <section className="lx-stat-card lx-wide">
        <p className="lx-stat-label">{c.collectionTitle} · {totalWords}</p>
        {totalWords > 0 && (
          <div className="lx-maturity-bar" role="img" aria-label={MATURITY_ORDER.map((key) => `${c.maturity[key]} ${counts[key]}`).join(', ')}>
            {MATURITY_ORDER.filter((key) => counts[key] > 0).map((key) => (
              <i key={key} className={`m-${key}`} style={{ flexGrow: counts[key] }} title={`${c.maturity[key]} : ${counts[key]}`} />
            ))}
          </div>
        )}
        <ul className="lx-legend">
          {MATURITY_ORDER.map((key) => (
            <li key={key}><span className={`lx-swatch m-${key}`} />{c.maturity[key]} <b>{counts[key]}</b></li>
          ))}
        </ul>
        <p className="lx-stat-foot">{c.maturityHint}</p>
      </section>

      <section className="lx-stat-card lx-wide">
        <p className="lx-stat-label">{c.forecastTitle}</p>
        <div className="lx-forecast" onMouseLeave={() => setHovered(null)}>
          {days.map((day, index) => (
            <button type="button" key={day.day} className={`lx-bar-slot${hovered === index ? ' hover' : ''}`}
              onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)}
              aria-label={`${formatDay(day.day, ui, { weekday: 'long', day: 'numeric', month: 'long' })} : ${day.count}`}>
              <span className="lx-bar" style={{ height: `${Math.max(day.count ? 4 : 0, (day.count / maxForecast) * 100)}%` }} />
              <small className={index === 0 ? 'today' : undefined}>{formatDay(day.day, ui, { weekday: 'narrow' })}</small>
            </button>
          ))}
          {hovered !== null && (
            <div className="lx-tooltip" style={{ left: `${((hovered + 0.5) / days.length) * 100}%` }}>
              <b>{days[hovered].count}</b> {c.reviewsWord}
              <span>{formatDay(days[hovered].day, ui, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
          )}
        </div>
      </section>

      <section className="lx-stat-card lx-wide">
        <p className="lx-stat-label">{c.heatmapTitle}</p>
        <Heatmap state={state} ui={ui} />
      </section>

      <section className="lx-stat-card lx-wide">
        <p className="lx-stat-label">{c.strugglingTitle}</p>
        {struggling.length === 0
          ? <p className="lx-stat-empty">{c.strugglingEmpty}</p>
          : <>
            <ul className="lx-struggling">
              {struggling.map((word) => (
                <li key={word.id}>
                  <b>{word.word}</b>
                  <span>{word.translation}</span>
                  <small>{c.lapses(word.srs?.lapses ?? 0)}</small>
                </li>
              ))}
            </ul>
            {onPracticeWords && <button type="button" className="outline" onClick={() => onPracticeWords(struggling)}>{c.practiceStart}</button>}
          </>}
      </section>
    </div>
  )
}

/** 20 weeks of activity, one cell per day, darker = more minutes. */
function Heatmap({ state, ui }: { state: AppState; ui: UiLanguage }) {
  const c = learnCopy(ui)
  const settings = learningSettings(state)
  const today = dayKey()
  const weeks = 20
  const shifted = new Date(`${today}T12:00:00`)
  const lastMonday = addDays(today, -((shifted.getDay() + 6) % 7))
  const firstMonday = addDays(lastMonday, -(weeks - 1) * 7)
  const goal = settings.dailyMinutes * 60

  const columns = Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = addDays(firstMonday, week * 7 + weekday)
      const activity = state.activity?.[day]
      const seconds = activity?.seconds ?? 0
      const level = day > today ? -1 : seconds === 0 && !activity?.reviews ? 0 : seconds < goal / 2 ? 1 : seconds < goal ? 2 : seconds < goal * 2 ? 3 : 4
      return { day, level, minutes: Math.round(seconds / 60), reviews: activity?.reviews ?? 0 }
    }))

  return (
    <div className="lx-heatmap" role="img" aria-label={c.heatmapTitle}>
      {columns.map((column, index) => (
        <div className="lx-heat-col" key={index}>
          {column.map((cell) => (
            <i key={cell.day} className={`lx-heat l${cell.level}`}
              title={cell.level < 0 ? undefined : `${formatDay(cell.day, ui, { weekday: 'short', day: 'numeric', month: 'short' })} · ${cell.minutes} ${c.minutesShort} · ${cell.reviews} ${c.reviewsWord}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
