import React, { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, RotateCcw, Sparkles, Volume2 } from 'lucide-react'
import type { SpeakingSessionRecord, SpeakingVideoAdviceCategory } from '../speakingStorage'
import { formatClock } from './notesMarkdown'
import type { ReviewCopy } from '../../../i18n/reviewCopy'

type Props = {
  session: SpeakingSessionRecord
  canAnalyze: boolean
  currentTime: number
  onAnalyze: () => void
  onSeek: (seconds: number) => void
  onSpeak: (text: string) => void
  c: ReviewCopy
}

const PILLARS = ['pronunciation', 'rhythm', 'structure'] as const

export function CoachPanel({ session, canAnalyze, currentTime, onAnalyze, onSeek, onSpeak, c }: Props) {
  const [filter, setFilter] = useState<SpeakingVideoAdviceCategory | 'all'>('all')
  const [openPillar, setOpenPillar] = useState<(typeof PILLARS)[number] | null>(null)
  const analysis = session.analysis
  const status = session.analysisStatus
  const hasTranscript = Boolean(session.transcript?.segments.length)

  const categories = useMemo(() => {
    const counts = new Map<SpeakingVideoAdviceCategory, number>()
    analysis?.items.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1))
    return [...counts.entries()]
  }, [analysis])

  if (status === 'analyzing') {
    return (
      <div className="sr-coach-loading" aria-live="polite">
        <p className="sr-state-title"><Sparkles size={14} /> {c.analyzing}</p>
        {[92, 76, 84, 60].map((width, index) => <span key={index} className="sr-skeleton" style={{ width: `${width}%` }} />)}
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="sr-state">
        <Sparkles size={20} />
        <p className="sr-state-title">{c.coachEmptyTitle}</p>
        <p className="sr-state-sub">{!canAnalyze ? c.coachNoKey : hasTranscript ? c.coachEmptyHint : c.coachNeedsTranscript}</p>
        {status === 'error' && session.analysisError && <p className="sr-error"><AlertTriangle size={13} /> {session.analysisError}</p>}
        <button type="button" className="sr-btn primary" disabled={!canAnalyze} onClick={onAnalyze}>
          <Sparkles size={14} /> {hasTranscript ? c.analyze : c.transcribeAndAnalyze}
        </button>
      </div>
    )
  }

  const score = analysis.overallScore
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const items = filter === 'all' ? analysis.items : analysis.items.filter((item) => item.category === filter)
  const summaries: Record<(typeof PILLARS)[number], string> = {
    pronunciation: analysis.pronunciationSummary,
    rhythm: analysis.rhythmSummary,
    structure: analysis.structureSummary,
  }

  return (
    <div className="sr-coach">
      <div className="sr-coach-head">
        {score !== undefined && (
          <div className="sr-score" role="img" aria-label={`${score} / 100`}>
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle cx="32" cy="32" r={radius} className="track" />
              <circle cx="32" cy="32" r={radius} className="fill" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} transform="rotate(-90 32 32)" />
            </svg>
            <b>{score}</b>
          </div>
        )}
        <p className="sr-coach-quote">{analysis.overallFeedback}</p>
      </div>

      <div className="sr-pillars">
        {PILLARS.map((pillar) => summaries[pillar] && (
          <div key={pillar} className={`sr-pillar${openPillar === pillar ? ' open' : ''}`}>
            <button type="button" onClick={() => setOpenPillar(openPillar === pillar ? null : pillar)} aria-expanded={openPillar === pillar}>
              <span>{c.pillars[pillar]}</span>
              <ChevronDown size={14} />
            </button>
            {openPillar === pillar && <p>{summaries[pillar]}</p>}
          </div>
        ))}
      </div>

      {analysis.items.length > 0 && (
        <>
          <div className="sr-chips" role="tablist">
            <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{c.all} <small>{analysis.items.length}</small></button>
            {categories.map(([category, count]) => (
              <button key={category} type="button" className={filter === category ? 'on' : ''} onClick={() => setFilter(category)}>
                <i className={`sr-dot ${category}`} /> {c.categories[category]} <small>{count}</small>
              </button>
            ))}
          </div>
          <ol className="sr-advice">
            {items.map((item) => {
              const near = Math.abs(currentTime - item.timestamp) < 2.5
              return (
                <li key={item.id} className={`${item.severity}${near ? ' near' : ''}`}>
                  <button type="button" className="sr-seg-time" onClick={() => onSeek(Math.max(0, item.timestamp - 1))}>{formatClock(item.timestamp)}</button>
                  <div className="sr-advice-body">
                    <p className="sr-advice-title"><i className={`sr-dot ${item.category}`} /> {item.title}</p>
                    {(item.originalSnippet || item.improvedSnippet) && (
                      <p className="sr-compare">
                        {item.originalSnippet && <s>{item.originalSnippet}</s>}
                        {item.originalSnippet && item.improvedSnippet && <span aria-hidden>→</span>}
                        {item.improvedSnippet && (
                          <button type="button" className="sr-better" onClick={() => onSpeak(item.improvedSnippet!)} title={c.listen}>
                            {item.improvedSnippet} <Volume2 size={12} />
                          </button>
                        )}
                      </p>
                    )}
                    {item.ipa && <code className="sr-ipa">{item.ipa}</code>}
                    <p className="sr-advice-text">{item.explanation}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}

      <footer className="sr-tr-foot">
        <span>{analysis.modelUsed} · {new Date(analysis.analyzedAt).toLocaleDateString()}</span>
        <button type="button" className="sr-link" disabled={!canAnalyze} onClick={onAnalyze}><RotateCcw size={12} /> {c.reanalyze}</button>
      </footer>
      {status === 'error' && session.analysisError && <p className="sr-error small"><AlertTriangle size={12} /> {session.analysisError}</p>}
    </div>
  )
}
