import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Clipboard, Download, FileText, Loader2, Maximize2, MoreHorizontal, Pause, Play, Trash2, Volume2, VolumeX } from 'lucide-react'
import type { ApiSettings, Language, UiLanguage } from '../../../domain'
import { speak } from '../../../ai'
import { computePeaks, decodeAudio, toSpeechPcm } from '../../../lib/audio'
import { resolveLlm } from '../../../lib/llm'
import { reviewCopy } from '../../../i18n/reviewCopy'
import { useCamera } from '../CameraContext'
import type { SpeakingSessionRecord, TranscriptSegment } from '../speakingStorage'
import { planTranscription, speechStats } from '../transcriptionService'
import { CoachPanel } from './CoachPanel'
import { NotesEditor, type NotesEditorHandle } from './NotesEditor'
import { countWords, formatClock, notesPlainText, timestampsIn } from './notesMarkdown'
import { TranscriptPanel } from './TranscriptPanel'
import { Waveform, type WaveMarker } from './Waveform'
import './review.css'

type Props = {
  ui: UiLanguage
  language: Language
  api: ApiSettings
  session: SpeakingSessionRecord
  onBack: () => void
  onOpenSettings?: () => void
}

type Tab = 'notes' | 'transcript' | 'coach'
const SPEEDS = [0.75, 1, 1.25, 1.5]
const RATING_KEYS = ['fluency', 'pronunciation', 'confidence'] as const

function useNarrow(query = '(max-width: 980px)') {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return narrow
}

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null
  return Boolean(el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
}

export function SessionReview({ ui, language, api, session, onBack, onOpenSettings }: Props) {
  const c = reviewCopy(ui)
  const { patchSession, handleDeleteSession, transcribeSession, triggerSessionAnalysis } = useCamera()
  const narrow = useNarrow()

  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<NotesEditorHandle>(null)
  const saveTimer = useRef<number | null>(null)
  const pendingNotes = useRef<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(session.duration || 0)
  const [speed, setSpeed] = useState(1)
  const [muted, setMuted] = useState(false)
  const [tab, setTab] = useState<Tab>(narrow ? 'notes' : 'transcript')
  const [loop, setLoop] = useState<TranscriptSegment | null>(null)
  const [title, setTitle] = useState(session.title)
  const [notes, setNotes] = useState(session.notes || '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const plan = useMemo(() => planTranscription(api), [api])
  const canAnalyze = Boolean(resolveLlm(api))
  const stats = useMemo(() => speechStats(session.transcript, session.duration), [session.transcript, session.duration])
  const timeRef = useRef(0)
  timeRef.current = currentTime

  useEffect(() => { if (!narrow && tab === 'notes') setTab('transcript') }, [narrow, tab])

  // ── Waveform peaks (computed once, then cached on the session) ────────────
  useEffect(() => {
    if (session.peaks?.length || !session.blob) return
    let cancelled = false
    void (async () => {
      try {
        const samples = await toSpeechPcm(await decodeAudio(session.blob!))
        if (!cancelled) await patchSession(session.id, { peaks: computePeaks(samples, 180).map((v) => Math.round(v * 100) / 100) })
      } catch { /* no audio track: the waveform stays a progress line */ }
    })()
    return () => { cancelled = true }
  }, [session.id, session.blob, session.peaks?.length, patchSession])

  // ── Player ────────────────────────────────────────────────────────────────
  const safeDuration = duration > 0 && Number.isFinite(duration) ? duration : session.duration || 0

  const seek = useCallback((seconds: number, autoplay = false) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(seconds, safeDuration || seconds))
    setCurrentTime(video.currentTime)
    if (autoplay && video.paused) void video.play().catch(() => undefined)
  }, [safeDuration])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }, [])

  // Smooth clock while playing (timeupdate only fires ~4×/s).
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const video = videoRef.current
      if (video) {
        if (loop && video.currentTime >= loop.end) video.currentTime = loop.start
        setCurrentTime(video.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, loop])

  const handleLoop = (segment: TranscriptSegment | null) => {
    setLoop(segment)
    if (segment) seek(segment.start, true)
  }

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void playerRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  // MediaRecorder webm files report an infinite duration until the end is reached.
  const onLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    if (!Number.isFinite(video.duration)) {
      const restore = () => { video.currentTime = 0; video.removeEventListener('durationchange', restore); setDuration(Number.isFinite(video.duration) ? video.duration : session.duration) }
      video.addEventListener('durationchange', restore)
      video.currentTime = 1e7
    } else {
      setDuration(video.duration)
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  const flushNotes = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (pendingNotes.current === null) return
    const value = pendingNotes.current
    pendingNotes.current = null
    void patchSession(session.id, { notes: value }).then(() => setSaveState('saved'))
  }, [patchSession, session.id])

  const handleNotesChange = useCallback((markdown: string) => {
    setNotes(markdown)
    pendingNotes.current = markdown
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flushNotes, 600)
  }, [flushNotes])

  useEffect(() => () => flushNotes(), [flushNotes])

  const saveTitle = () => {
    const next = title.trim() || session.title
    setTitle(next)
    if (next !== session.title) void patchSession(session.id, { title: next })
  }

  const addToNotes = (text: string, seconds: number) => {
    if (narrow) setTab('notes')
    window.setTimeout(() => {
      notesRef.current?.insertQuote(text, seconds)
      flash(c.addedToNotes)
    }, narrow ? 60 : 0)
  }

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1600)
  }

  // ── Transcript & coach ────────────────────────────────────────────────────
  const editSegment = (id: string, text: string) => {
    if (!session.transcript) return
    const segments = session.transcript.segments.map((segment) => (segment.id === id ? { ...segment, text, words: segment.text === text ? segment.words : undefined } : segment))
    void patchSession(session.id, { transcript: { ...session.transcript, segments, edited: true } })
  }

  const analyze = async () => {
    setTab('coach')
    if (!session.transcript?.segments.length && plan) await transcribeSession(session.id)
    await triggerSessionAnalysis(session.id)
  }

  const markers: WaveMarker[] = useMemo(() => [
    ...timestampsIn(notes).map((time) => ({ time, kind: 'note' as const, label: c.noteMarker })),
    ...(session.analysis?.items ?? []).map((item) => ({ time: item.timestamp, kind: item.severity, label: item.title })),
  ], [notes, session.analysis, c.noteMarker])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportMarkdown = () => {
    const lines = [
      `# ${title}`,
      `${new Date(session.createdAt).toLocaleString()} · ${formatClock(session.duration)}`,
      '',
      `## ${c.notesTitle}`,
      notes || '—',
    ]
    if (session.transcript?.segments.length) {
      lines.push('', `## ${c.tabTranscript}`, ...session.transcript.segments.map((segment) => `[${formatClock(segment.start)}] ${segment.text}`))
    }
    if (session.analysis) {
      lines.push('', `## ${c.tabCoach}`, session.analysis.overallFeedback, ...session.analysis.items.map((item) =>
        `- [${formatClock(item.timestamp)}] **${item.title}**${item.originalSnippet ? ` — ~~${item.originalSnippet}~~` : ''}${item.improvedSnippet ? ` → ${item.improvedSnippet}` : ''}: ${item.explanation}`))
    }
    return lines.join('\n')
  }

  const safeName = (title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'session')
  const download = (href: string, name: string) => {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const menuActions = [
    session.mediaUrl && { icon: <Download size={14} />, label: c.downloadVideo, run: () => download(session.mediaUrl!, `${safeName}.${session.blob?.type.includes('mp4') ? 'mp4' : 'webm'}`) },
    { icon: <FileText size={14} />, label: c.exportNotes, run: () => { const url = URL.createObjectURL(new Blob([exportMarkdown()], { type: 'text/markdown' })); download(url, `${safeName}.md`); window.setTimeout(() => URL.revokeObjectURL(url), 1000) } },
    { icon: <Clipboard size={14} />, label: c.copyNotes, run: async () => { try { await navigator.clipboard.writeText(exportMarkdown()); flash(c.copied) } catch { /* denied */ } } },
    { icon: <Trash2 size={14} />, label: c.deleteSession, danger: true, run: async () => { if (window.confirm(c.confirmDelete)) { await handleDeleteSession(session.id); onBack() } } },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; danger?: boolean; run: () => void }[]

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping() || event.metaKey || event.ctrlKey || event.altKey) return
      switch (event.key) {
        case ' ': case 'k': event.preventDefault(); togglePlay(); break
        case 'ArrowRight': event.preventDefault(); seek(timeRef.current + 5); break
        case 'ArrowLeft': event.preventDefault(); seek(timeRef.current - 5); break
        case 'l': seek(timeRef.current + 10); break
        case 'j': seek(timeRef.current - 10); break
        case 'm': toggleMute(); break
        case 'f': toggleFullscreen(); break
        case 'n': event.preventDefault(); if (narrow) setTab('notes'); window.setTimeout(() => notesRef.current?.focus(), 30); break
        case 't': event.preventDefault(); if (narrow) setTab('notes'); window.setTimeout(() => { notesRef.current?.focus(); notesRef.current?.insertTimestamp(timeRef.current) }, 30); break
        case 'Escape': if (loop) setLoop(null); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seek, narrow, loop])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  const noteWords = countWords(notesPlainText(notes))
  const ratings = session.ratings ?? { fluency: 0, pronunciation: 0, confidence: 0 }

  const notesPanel = (
    <section className="sr-notes" aria-label={c.notesTitle}>
      <header className="sr-notes-head">
        <h2>{c.notesTitle}</h2>
        <button type="button" className="sr-chip-btn" onClick={() => { notesRef.current?.focus(); notesRef.current?.insertTimestamp(currentTime) }} title={c.insertTimestampHint}>
          + {formatClock(currentTime)}
        </button>
      </header>
      <NotesEditor ref={notesRef} initialMarkdown={notes} getTime={() => timeRef.current} onSeek={(s) => seek(s, true)} onChange={handleNotesChange} c={c} />
      <footer className="sr-notes-foot">
        <div className="sr-ratings" aria-label={c.selfRating}>
          {RATING_KEYS.map((key) => (
            <div key={key} className="sr-rating">
              <span>{c.ratings[key]}</span>
              <span className="sr-rating-dots" role="radiogroup" aria-label={c.ratings[key]}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={ratings[key] === value} aria-label={`${value}/5`}
                    className={value <= (ratings[key] || 0) ? 'on' : ''}
                    onClick={() => void patchSession(session.id, { ratings: { ...ratings, [key]: ratings[key] === value ? 0 : value } })} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="sr-notes-meta">
          <span>{c.wordCount(noteWords)}</span>
          <span className="sr-hint">{c.editorHint}</span>
        </p>
      </footer>
    </section>
  )

  const tabs: Tab[] = narrow ? ['notes', 'transcript', 'coach'] : ['transcript', 'coach']

  return (
    <div className="sr-page">
      <header className="sr-top">
        <button type="button" className="sr-back" onClick={() => { flushNotes(); onBack() }} aria-label={c.back}>
          <ArrowLeft size={16} /> <span>{c.back}</span>
        </button>
        <div className="sr-title-wrap">
          <input className="sr-title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle}
            onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') { setTitle(session.title); (event.target as HTMLInputElement).blur() } }}
            aria-label={c.titleLabel} />
          <p className="sr-meta">
            <span>{new Date(session.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span>{formatClock(session.duration)}</span>
            {session.topicName && <span>{session.topicName}</span>}
            {stats && <span>{c.wordsSpoken(stats.words)}</span>}
          </p>
        </div>
        <div className="sr-top-actions">
          <span className={`sr-save ${saveState}`} aria-live="polite">
            {saveState === 'saving' ? <><Loader2 size={12} className="sr-spin" /> {c.saving}</> : saveState === 'saved' ? <><Check size={12} /> {c.saved}</> : null}
          </span>
          <div className="sr-menu-wrap">
            <button type="button" className="sr-icon-btn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={c.more}
              onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen) }}>
              <MoreHorizontal size={17} />
            </button>
            {menuOpen && (
              <div className="sr-menu" role="menu">
                {menuActions.map((action) => (
                  <button key={action.label} type="button" role="menuitem" className={action.danger ? 'danger' : ''} onClick={() => { setMenuOpen(false); action.run() }}>
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="sr-grid">
        <div className="sr-main">
          <div ref={playerRef} className={`sr-player${playing ? ' playing' : ''}`}>
            {session.mediaUrl ? (
              <video
                ref={videoRef}
                src={session.mediaUrl}
                playsInline
                preload="metadata"
                onClick={togglePlay}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={(event) => { if (!playing) setCurrentTime(event.currentTarget.currentTime) }}
                onLoadedMetadata={onLoadedMetadata}
              />
            ) : <div className="sr-player-empty">{c.noVideo}</div>}
            {!playing && session.mediaUrl && (
              <button type="button" className="sr-bigplay" onClick={togglePlay} aria-label={c.play}><Play size={26} fill="currentColor" /></button>
            )}
            <div className="sr-controls">
              <button type="button" onClick={togglePlay} aria-label={playing ? c.pause : c.play}>{playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}</button>
              <span className="sr-time">{formatClock(currentTime)} <i>/ {formatClock(safeDuration)}</i></span>
              <span className="sr-spacer" />
              {loop && <button type="button" className="sr-loop-pill" onClick={() => setLoop(null)}>{c.looping} ✕</button>}
              <button type="button" onClick={cycleSpeed} className="sr-speed" aria-label={c.speed}>{speed}×</button>
              <button type="button" onClick={toggleMute} aria-label={muted ? c.unmute : c.mute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
              <button type="button" onClick={toggleFullscreen} aria-label={c.fullscreen}><Maximize2 size={15} /></button>
            </div>
          </div>

          <Waveform peaks={session.peaks} duration={safeDuration} currentTime={currentTime} markers={markers} loop={loop}
            onSeek={(s) => seek(s)} label={c.timeline} />

          <div className="sr-tabs" role="tablist">
            {tabs.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {id === 'notes' ? c.notesTitle : id === 'transcript' ? c.tabTranscript : c.tabCoach}
                {id === 'transcript' && session.transcriptStatus === 'transcribing' && <Loader2 size={12} className="sr-spin" />}
                {id === 'coach' && session.analysisStatus === 'analyzing' && <Loader2 size={12} className="sr-spin" />}
                {id === 'coach' && session.analysis?.items.length ? <small>{session.analysis.items.length}</small> : null}
              </button>
            ))}
          </div>

          <div className="sr-panel">
            {tab === 'notes' && narrow && notesPanel}
            {tab === 'transcript' && (
              <TranscriptPanel session={session} currentTime={currentTime} playing={playing} plan={plan} loopId={loop?.id ?? null}
                onSeek={(s) => seek(s, true)} onLoop={handleLoop} onAddToNotes={addToNotes}
                onTranscribe={() => void transcribeSession(session.id)} onEditSegment={editSegment} onOpenSettings={onOpenSettings} c={c} />
            )}
            {tab === 'coach' && (
              <CoachPanel session={session} canAnalyze={canAnalyze} currentTime={currentTime} onAnalyze={() => void analyze()}
                onSeek={(s) => seek(s, true)} onSpeak={(text) => void speak(text, session.language || language, api)} c={c} />
            )}
          </div>
        </div>

        {!narrow && <aside className="sr-side">{notesPanel}</aside>}
      </div>

      {toast && <div className="sr-toast" role="status">{toast}</div>}
    </div>
  )
}
