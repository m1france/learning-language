import React, { useRef, useState, useMemo } from 'react'
import type { SpeakingSessionRecord } from './speakingStorage'
import { NotionSpeakingEditor } from './NotionSpeakingEditor'
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Trash2,
  Clock,
  Check,
  Edit2,
  Volume2,
  VolumeX,
} from 'lucide-react'

type SpeakingWorkspaceProps = {
  ui: 'fr' | 'en'
  session: SpeakingSessionRecord
  onUpdate: (session: SpeakingSessionRecord) => void
  onDelete: (id: string) => void
  onBack: () => void
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SpeakingWorkspace({
  ui,
  session,
  onUpdate,
  onDelete,
  onBack,
}: SpeakingWorkspaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(session.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [notes, setNotes] = useState(session.notes || '')
  const [ratings, setRatings] = useState(
    session.ratings || { fluency: 4, pronunciation: 4, confidence: 4 },
  )
  const [savedBadge, setSavedBadge] = useState(false)

  // Safe duration display without Infinity / NaN
  const displayDuration = useMemo(() => {
    if (duration && !isNaN(duration) && isFinite(duration) && duration > 0) {
      return duration
    }
    if (session.duration && isFinite(session.duration) && session.duration > 0) {
      return session.duration
    }
    return 0
  }, [duration, session.duration])

  // Sync video time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      if (videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
        setDuration(videoRef.current.duration)
      }
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      void videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      setCurrentTime(seconds)
      void videoRef.current.play().catch(() => undefined)
      setIsPlaying(true)
    }
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const triggerAutosave = (override?: Partial<SpeakingSessionRecord>) => {
    const updatedRecord: SpeakingSessionRecord = {
      ...session,
      title,
      notes,
      ratings,
      ...override,
    }
    onUpdate(updatedRecord)
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 2000)
  }

  const handleNotesChange = (val: string) => {
    setNotes(val)
    triggerAutosave({ notes: val })
  }

  const handleTitleSubmit = () => {
    setIsEditingTitle(false)
    triggerAutosave({ title })
  }

  const setRating = (key: 'fluency' | 'pronunciation' | 'confidence', value: number) => {
    const updated = { ...ratings, [key]: value }
    setRatings(updated)
    triggerAutosave({ ratings: updated })
  }

  // Global keyboard shortcuts for video playback when not typing
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl && (activeEl.getAttribute('contenteditable') === 'true' || activeEl.classList.contains('notion-speaking-content')))

      if (!isTyping) {
        if (e.key === 'Backspace' || e.key === ' ' || e.code === 'Space') {
          e.preventDefault()
          togglePlay()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const maxDur = duration || session.duration || 999999
          const curr = videoRef.current?.currentTime ?? currentTime
          seekTo(Math.min(maxDur, curr + 10))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const curr = videoRef.current?.currentTime ?? currentTime
          seekTo(Math.max(0, curr - 10))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [duration, session.duration, currentTime])

  const downloadMedia = () => {
    if (!session.mediaUrl) return
    const a = document.createElement('a')
    a.href = session.mediaUrl
    a.download = `${title.replace(/[^a-z0-9à-ÿ]/gi, '_') || 'session'}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="speaking-workspace-page">
      {/* Top Header Bar */}
      <header className="workspace-header-bar">
        <div className="workspace-header-left">
          <button className="workspace-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>{ui === 'fr' ? 'Retour aux prises' : 'Back to takes'}</span>
          </button>

          <div className="workspace-title-row">
            {isEditingTitle ? (
              <input
                className="workspace-title-inline-input"
                type="text"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSubmit()
                  if (e.key === 'Escape') {
                    setTitle(session.title)
                    setIsEditingTitle(false)
                  }
                }}
              />
            ) : (
              <h1
                className="workspace-title-inline-heading"
                onClick={() => setIsEditingTitle(true)}
                title={ui === 'fr' ? 'Cliquer pour modifier le titre' : 'Click to edit title'}
              >
                {title}
              </h1>
            )}

            <div className="workspace-meta-inline">
              <span className="ws-chip mode">
                {session.mode === 'guided'
                  ? ui === 'fr'
                    ? 'Texte guidé'
                    : 'Guided'
                  : ui === 'fr'
                  ? 'Texte libre'
                  : 'Free'}
              </span>
              {session.topicName && <span className="ws-chip topic">{session.topicName}</span>}
              <span className="ws-chip date">
                <Clock size={12} /> {new Date(session.createdAt).toLocaleDateString()} ·{' '}
                {formatTime(displayDuration)}
              </span>
              {savedBadge && (
                <span className="ws-saved-pill">
                  <Check size={12} /> {ui === 'fr' ? 'Enregistré' : 'Saved'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-header-actions">
          {session.mediaUrl && (
            <button className="ws-action-btn" onClick={downloadMedia} title="Télécharger la vidéo">
              <Download size={14} />
              <span>{ui === 'fr' ? 'Télécharger' : 'Download'}</span>
            </button>
          )}

          <button
            className="ws-action-btn danger"
            onClick={() => {
              if (
                window.confirm(
                  ui === 'fr'
                    ? 'Supprimer définitivement cet enregistrement et ses notes ?'
                    : 'Delete this recording and notes permanently?',
                )
              ) {
                onDelete(session.id)
                onBack()
              }
            }}
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {/* Main Split Grid (Video Left / Notion Editor Right) */}
      <main className="workspace-body-grid">
        {/* Left Column: Video Player with External Controls Underneath */}
        <section className="workspace-video-pane">
          <div className="workspace-video-wrapper">
            {session.mediaUrl ? (
              <video
                ref={videoRef}
                src={session.mediaUrl}
                className="ws-video-player"
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onClick={togglePlay}
              />
            ) : (
              <div className="ws-video-placeholder">
                <p>Aucun flux vidéo disponible</p>
              </div>
            )}
          </div>

          {/* External Controls Bar Underneath the Video (Not taking 1/3 of the video) */}
          <div className="ws-video-external-controls">
            <button
              className={`ws-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Lecture'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <div className="ws-scrubber-box">
              <input
                type="range"
                min="0"
                max={displayDuration || 100}
                step="0.1"
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
              />
              <span className="ws-time-display">
                {formatTime(currentTime)} / {formatTime(displayDuration)}
              </span>
            </div>

            <div className="ws-speed-group">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  className={`ws-speed-chip ${playbackRate === rate ? 'active' : ''}`}
                  onClick={() => changeSpeed(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <button
              className="ws-mute-btn"
              onClick={toggleMute}
              title={isMuted ? 'Activer le son' : 'Muet'}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </section>

        {/* Right Column: Unified Notion-style Notes Editor */}
        <section className="workspace-notes-pane">
          <div className="ws-notes-header-hint">
            <span className="hint-label">{ui === 'fr' ? 'Bloc-notes interactif' : 'Interactive notes'}</span>
          </div>

          {/* Unified Notion-Style WYSIWYG Document */}
          <div className="ws-notes-editor-scroll">
            <NotionSpeakingEditor
              initialContent={notes}
              currentTime={currentTime}
              onSeek={seekTo}
              onChange={handleNotesChange}
              placeholder={
                ui === 'fr'
                  ? 'Écris tes notes librement...\nTape @ pour insérer un horodatage interactif.'
                  : 'Write your notes freely...\nType @ to insert an interactive timestamp.'
              }
            />
          </div>

          {/* Discreet Star Ratings at the Very Bottom (No "Auto-évaluation" label) */}
          <footer className="ws-discreet-ratings-footer">
            <div className="ws-rating-row">
              <span className="ws-rating-name">{ui === 'fr' ? 'Fluidité' : 'Fluency'}</span>
              <div className="ws-stars-box">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`ws-star-btn ${star <= (ratings.fluency || 0) ? 'filled' : ''}`}
                    onClick={() => setRating('fluency', star)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="ws-rating-row">
              <span className="ws-rating-name">
                {ui === 'fr' ? 'Prononciation' : 'Pronunciation'}
              </span>
              <div className="ws-stars-box">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`ws-star-btn ${
                      star <= (ratings.pronunciation || 0) ? 'filled' : ''
                    }`}
                    onClick={() => setRating('pronunciation', star)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="ws-rating-row">
              <span className="ws-rating-name">
                {ui === 'fr' ? 'Confiance' : 'Confidence'}
              </span>
              <div className="ws-stars-box">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`ws-star-btn ${
                      star <= (ratings.confidence || 0) ? 'filled' : ''
                    }`}
                    onClick={() => setRating('confidence', star)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          </footer>
        </section>
      </main>
    </div>
  )
}
