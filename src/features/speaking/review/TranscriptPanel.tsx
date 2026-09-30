import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Captions, Check, Copy, CornerDownRight, Loader2, Pencil, Repeat, Search, Sparkles, X } from 'lucide-react'
import type { SpeakingSessionRecord, TranscriptSegment } from '../speakingStorage'
import { speechStats, type TranscriptionPlan } from '../transcriptionService'
import { formatClock } from './notesMarkdown'
import type { ReviewCopy } from '../../../i18n/reviewCopy'

type Props = {
  session: SpeakingSessionRecord
  currentTime: number
  playing: boolean
  plan: TranscriptionPlan | null
  loopId: string | null
  onSeek: (seconds: number) => void
  onLoop: (segment: TranscriptSegment | null) => void
  onAddToNotes: (text: string, seconds: number) => void
  onTranscribe: () => void
  onEditSegment: (id: string, text: string) => void
  onOpenSettings?: () => void
  c: ReviewCopy
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  let index = lower.indexOf(query)
  while (index !== -1) {
    parts.push(text.slice(from, index), <mark key={index}>{text.slice(index, index + query.length)}</mark>)
    from = index + query.length
    index = lower.indexOf(query, from)
  }
  parts.push(text.slice(from))
  return parts
}

export function TranscriptPanel({ session, currentTime, playing, plan, loopId, onSeek, onLoop, onAddToNotes, onTranscribe, onEditSegment, onOpenSettings, c }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const userScrolledAt = useRef(0)
  const transcript = session.transcript
  const segments = transcript?.segments ?? []
  const stats = useMemo(() => speechStats(transcript, session.duration), [transcript, session.duration])
  const needle = query.trim().toLowerCase()
  const visible = needle ? segments.filter((segment) => segment.text.toLowerCase().includes(needle)) : segments
  const active = segments.find((segment) => currentTime >= segment.start && currentTime < segment.end + 0.15)

  // Follow playback unless the learner is scrolling the list.
  useEffect(() => {
    if (!playing || !active || needle || Date.now() - userScrolledAt.current < 4000) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${active.id}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active?.id, playing, needle])

  if (session.transcriptStatus === 'transcribing') {
    const ratio = session.transcriptProgress ?? 0
    return (
      <div className="sr-state">
        <Loader2 size={18} className="sr-spin" />
        <p className="sr-state-title">{c.transcribing}</p>
        <p className="sr-state-sub">{plan?.label}</p>
        <div className="sr-progress"><b style={{ width: `${Math.max(6, ratio * 100)}%` }} /></div>
      </div>
    )
  }

  if (!segments.length) {
    return (
      <div className="sr-state">
        <Captions size={20} />
        <p className="sr-state-title">{c.noTranscriptTitle}</p>
        <p className="sr-state-sub">{plan ? c.noTranscriptHint(plan.label) : c.noTranscriptNoKey}</p>
        {session.transcriptError && <p className="sr-error"><AlertTriangle size={13} /> {session.transcriptError}</p>}
        {plan
          ? <button type="button" className="sr-btn primary" onClick={onTranscribe}><Sparkles size={14} /> {c.transcribe}</button>
          : onOpenSettings && <button type="button" className="sr-btn" onClick={onOpenSettings}>{c.openSettings}</button>}
      </div>
    )
  }

  const copyAll = async () => {
    const text = segments.map((segment) => `[${formatClock(segment.start)}] ${segment.text}`).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1400) } catch { /* denied */ }
  }

  const engineLabel = transcript?.engine === 'browser' ? c.engineBrowser : plan && transcript?.engine === plan.engine ? plan.label : transcript?.model || transcript?.engine

  return (
    <div className="sr-transcript">
      <div className="sr-tr-bar">
        <label className="sr-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.searchTranscript} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={c.clear}><X size={13} /></button>}
        </label>
        <button type="button" className="sr-icon-btn" onClick={copyAll} title={c.copyTranscript} aria-label={c.copyTranscript}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      {stats && !needle && (
        <dl className="sr-stats">
          <div><dt>{c.statWords}</dt><dd>{stats.words}</dd></div>
          <div title={c.statPaceHint}><dt>{c.statPace}</dt><dd>{stats.wordsPerMinute}<small> {c.perMinute}</small></dd></div>
          <div><dt>{c.statUnique}</dt><dd>{stats.uniqueWords}</dd></div>
          <div title={c.statFillersHint}><dt>{c.statFillers}</dt><dd>{stats.fillers}</dd></div>
        </dl>
      )}

      <div className="sr-seg-list" ref={listRef} onWheel={() => { userScrolledAt.current = Date.now() }} onTouchMove={() => { userScrolledAt.current = Date.now() }}>
        {visible.length === 0 && <p className="sr-muted">{c.noMatch}</p>}
        {visible.map((segment) => {
          const isActive = active?.id === segment.id
          const isEditing = editing?.id === segment.id
          return (
            <div key={segment.id} data-seg={segment.id} className={`sr-seg${isActive ? ' active' : ''}${loopId === segment.id ? ' looping' : ''}`}>
              <button type="button" className="sr-seg-time" onClick={() => onSeek(segment.start)}>{formatClock(segment.start)}</button>
              {isEditing ? (
                <textarea
                  className="sr-seg-edit"
                  autoFocus
                  value={editing.text}
                  onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onEditSegment(segment.id, editing.text.trim() || segment.text); setEditing(null) }
                    if (event.key === 'Escape') setEditing(null)
                  }}
                  onBlur={() => { onEditSegment(segment.id, editing.text.trim() || segment.text); setEditing(null) }}
                />
              ) : (
                <p className="sr-seg-text" onClick={() => onSeek(segment.start)}>
                  {isActive && segment.words?.length && !needle
                    ? segment.words.map((word, index) => (
                      <span key={index} className={currentTime >= word.start ? 'spoken' : ''}>{word.text} </span>
                    ))
                    : highlight(segment.text, needle)}
                </p>
              )}
              {!isEditing && (
                <span className="sr-seg-actions">
                  <button type="button" title={loopId === segment.id ? c.stopLoop : c.loop} aria-label={c.loop}
                    className={loopId === segment.id ? 'on' : ''} onClick={() => onLoop(loopId === segment.id ? null : segment)}>
                    <Repeat size={13} />
                  </button>
                  <button type="button" title={c.addToNotes} aria-label={c.addToNotes} onClick={() => onAddToNotes(segment.text, segment.start)}>
                    <CornerDownRight size={13} />
                  </button>
                  <button type="button" title={c.editSegment} aria-label={c.editSegment} onClick={() => setEditing({ id: segment.id, text: segment.text })}>
                    <Pencil size={13} />
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      <footer className="sr-tr-foot">
        <span>{engineLabel}{transcript?.edited ? ` · ${c.edited}` : ''}</span>
        {plan && (
          <button type="button" className="sr-link" onClick={onTranscribe}>
            {transcript?.engine === 'browser' ? c.improveWith(plan.label) : c.retranscribe}
          </button>
        )}
      </footer>
      {session.transcriptError && <p className="sr-error small"><AlertTriangle size={12} /> {session.transcriptError}</p>}
    </div>
  )
}
