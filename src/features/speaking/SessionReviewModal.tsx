import React, { useEffect, useRef, useState } from 'react'
import type { SpeakingSessionRecord, SpeakingSessionTimestamp } from './speakingStorage'
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Download,
  Trash2,
  Tag,
  Star,
  Clock,
  Plus,
  Check,
  FileText,
  Volume2,
  VolumeX,
  Maximize2,
  Edit2,
} from 'lucide-react'

type SessionReviewModalProps = {
  ui: 'fr' | 'en'
  session: SpeakingSessionRecord
  onUpdate: (session: SpeakingSessionRecord) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionReviewModal({
  ui,
  session,
  onUpdate,
  onDelete,
  onClose,
}: SessionReviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(session.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [notes, setNotes] = useState(session.notes || '')
  const [timestamps, setTimestamps] = useState<SpeakingSessionTimestamp[]>(session.timestamps || [])
  const [newTag, setNewTag] = useState('')
  const [tags, setTags] = useState<string[]>(session.tags || [])
  const [ratings, setRatings] = useState(
    session.ratings || { fluency: 4, pronunciation: 4, confidence: 4 },
  )
  const [savedBadge, setSavedBadge] = useState(false)

  // Sync video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
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

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
  }

  const addCurrentTimestamp = () => {
    const time = Math.floor(currentTime)
    const newTs: SpeakingSessionTimestamp = {
      id: `${Date.now()}`,
      time,
      text: ui === 'fr' ? `Remarque à ${formatTime(time)}` : `Note at ${formatTime(time)}`,
    }
    const updated = [...timestamps, newTs].sort((a, b) => a.time - b.time)
    setTimestamps(updated)
    triggerAutosave({ timestamps: updated })
  }

  const updateTimestampText = (id: string, text: string) => {
    const updated = timestamps.map((ts) => (ts.id === id ? { ...ts, text } : ts))
    setTimestamps(updated)
    triggerAutosave({ timestamps: updated })
  }

  const deleteTimestamp = (id: string) => {
    const updated = timestamps.filter((ts) => ts.id !== id)
    setTimestamps(updated)
    triggerAutosave({ timestamps: updated })
  }

  const addTag = () => {
    const clean = newTag.trim().replace(/^#/, '')
    if (clean && !tags.includes(clean)) {
      const updated = [...tags, clean]
      setTags(updated)
      setNewTag('')
      triggerAutosave({ tags: updated })
    }
  }

  const removeTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove)
    setTags(updated)
    triggerAutosave({ tags: updated })
  }

  const setRating = (key: 'fluency' | 'pronunciation' | 'confidence', value: number) => {
    const updated = { ...ratings, [key]: value }
    setRatings(updated)
    triggerAutosave({ ratings: updated })
  }

  const triggerAutosave = (override?: Partial<SpeakingSessionRecord>) => {
    const updatedRecord: SpeakingSessionRecord = {
      ...session,
      title,
      notes,
      timestamps,
      tags,
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

  const downloadMedia = () => {
    if (!session.mediaUrl) return
    const a = document.createElement('a')
    a.href = session.mediaUrl
    a.download = `${title.replace(/[^a-z0-9à-ÿ]/gi, '_') || 'session'}.${session.kind === 'video' ? 'webm' : 'webm'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="review-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="review-modal-workspace">
        {/* Workspace Header */}
        <header className="review-workspace-header">
          <div className="review-header-left">
            {isEditingTitle ? (
              <div className="review-title-editor">
                <input
                  type="text"
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                />
                <button className="icon-save-btn" onClick={handleTitleSubmit}>
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="review-title-display" onClick={() => setIsEditingTitle(true)}>
                <h2>{title}</h2>
                <button className="icon-edit-btn" title="Renommer">
                  <Edit2 size={15} />
                </button>
              </div>
            )}
            <div className="review-meta-tags">
              <span className="meta-badge mode">
                {session.mode === 'guided'
                  ? ui === 'fr'
                    ? 'Texte guidé'
                    : 'Guided text'
                  : session.mode === 'challenge'
                  ? ui === 'fr'
                    ? 'Défi improvisé'
                    : 'Improv challenge'
                  : ui === 'fr'
                  ? 'Texte libre'
                  : 'Free speech'}
              </span>
              {session.topicName && <span className="meta-badge topic">{session.topicName}</span>}
              <span className="meta-badge time">
                <Clock size={12} /> {new Date(session.createdAt).toLocaleDateString()} · {formatTime(session.duration)}
              </span>
              {savedBadge && (
                <span className="saved-badge">
                  <Check size={12} /> {ui === 'fr' ? 'Sauvegardé' : 'Saved'}
                </span>
              )}
            </div>
          </div>

          <div className="review-header-actions">
            <button className="review-action-btn" onClick={downloadMedia} title={ui === 'fr' ? 'Télécharger la vidéo' : 'Download video'}>
              <Download size={15} /> {ui === 'fr' ? 'Télécharger' : 'Download'}
            </button>
            <button
              className="review-action-btn danger"
              onClick={() => {
                if (window.confirm(ui === 'fr' ? 'Supprimer cette prise définitivement ?' : 'Delete this take permanently?')) {
                  onDelete(session.id)
                  onClose()
                }
              }}
              title={ui === 'fr' ? 'Supprimer la prise' : 'Delete take'}
            >
              <Trash2 size={15} />
            </button>
            <button className="review-close-btn" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Split Screen Workspace Body */}
        <div className="review-workspace-body">
          {/* Left Column: Video Player */}
          <div className="review-player-pane">
            <div className="video-viewport-wrapper">
              <video
                ref={videoRef}
                className="review-video-element"
                src={session.mediaUrl}
                playsInline
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
              />

              {/* Floating playback overlay controls */}
              <div className="video-glass-bar">
                <button className="vid-control-btn play" onClick={togglePlay}>
                  {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <button className="vid-control-btn" onClick={() => seekTo(Math.max(0, currentTime - 5))} title="-5s">
                  <RotateCcw size={15} />
                </button>

                <div className="vid-scrubber-track">
                  <input
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => seekTo(Number(e.target.value))}
                  />
                  <div className="vid-time-display">
                    <span>{formatTime(currentTime)}</span>
                    <span>/</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <button className="vid-control-btn" onClick={() => setIsMuted(!isMuted)}>
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                {/* Speed buttons */}
                <div className="vid-speed-selector">
                  {[0.75, 1, 1.25, 1.5].map((speed) => (
                    <button
                      key={speed}
                      className={`speed-pill ${playbackRate === speed ? 'active' : ''}`}
                      onClick={() => changeSpeed(speed)}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                <button
                  className="vid-control-btn"
                  onClick={() => {
                    if (videoRef.current) {
                      if (document.fullscreenElement) {
                        void document.exitFullscreen()
                      } else {
                        void videoRef.current.requestFullscreen()
                      }
                    }
                  }}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>

            {/* Quick action under video */}
            <div className="player-quick-tools">
              <button className="add-timestamp-btn" onClick={addCurrentTimestamp}>
                <Plus size={14} /> {ui === 'fr' ? `Ajouter un marqueur à ${formatTime(currentTime)}` : `Add timestamp marker at ${formatTime(currentTime)}`}
              </button>
            </div>
          </div>

          {/* Right Column: Notes & Annotation Workspace */}
          <div className="review-notes-pane">
            <div className="notes-pane-section">
              <div className="section-title-bar">
                <span className="pane-section-label">
                  <Star size={14} /> {ui === 'fr' ? 'Auto-évaluation' : 'Self-Assessment'}
                </span>
              </div>
              <div className="ratings-grid">
                <div className="rating-item">
                  <span className="rating-label">{ui === 'fr' ? 'Fluidité' : 'Fluency'}</span>
                  <div className="rating-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={`star-btn ${ratings.fluency >= star ? 'filled' : ''}`}
                        onClick={() => setRating('fluency', star)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rating-item">
                  <span className="rating-label">{ui === 'fr' ? 'Prononciation' : 'Pronunciation'}</span>
                  <div className="rating-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={`star-btn ${ratings.pronunciation >= star ? 'filled' : ''}`}
                        onClick={() => setRating('pronunciation', star)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rating-item">
                  <span className="rating-label">{ui === 'fr' ? 'Confiance' : 'Confidence'}</span>
                  <div className="rating-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={`star-btn ${ratings.confidence >= star ? 'filled' : ''}`}
                        onClick={() => setRating('confidence', star)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps & Key Moments */}
            <div className="notes-pane-section">
              <div className="section-title-bar">
                <span className="pane-section-label">
                  <Clock size={14} /> {ui === 'fr' ? 'Horodatages & Moments clés' : 'Key Timestamps'}
                </span>
                <span className="ts-count">{timestamps.length}</span>
              </div>

              {timestamps.length === 0 ? (
                <p className="no-timestamps-hint">
                  {ui === 'fr'
                    ? 'Utilise le bouton sous la vidéo pour marquer un moment précis (ex: erreur de mot, bonne intonation).'
                    : 'Use the button below the video to mark key moments (e.g. pronunciation glitch, great intonation).'}
                </p>
              ) : (
                <div className="timestamps-list">
                  {timestamps.map((ts) => (
                    <div key={ts.id} className="timestamp-row">
                      <button
                        className="ts-jump-badge"
                        onClick={() => seekTo(ts.time)}
                        title={ui === 'fr' ? 'Sauter à ce moment' : 'Jump to this time'}
                      >
                        <Play size={10} /> {formatTime(ts.time)}
                      </button>
                      <input
                        type="text"
                        className="ts-text-input"
                        value={ts.text}
                        onChange={(e) => updateTimestampText(ts.id, e.target.value)}
                        placeholder={ui === 'fr' ? 'Note sur ce passage...' : 'Note for this moment...'}
                      />
                      <button
                        className="ts-delete-btn"
                        onClick={() => deleteTimestamp(ts.id)}
                        title={ui === 'fr' ? 'Supprimer le marqueur' : 'Delete marker'}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tags section */}
            <div className="notes-pane-section">
              <div className="section-title-bar">
                <span className="pane-section-label">
                  <Tag size={14} /> {ui === 'fr' ? 'Tags & Thématiques' : 'Tags'}
                </span>
              </div>
              <div className="tags-container">
                {tags.map((tag) => (
                  <span key={tag} className="note-tag-chip">
                    #{tag}
                    <button onClick={() => removeTag(tag)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <div className="add-tag-inline">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder={ui === 'fr' ? '+ Nouveau tag...' : '+ New tag...'}
                  />
                </div>
              </div>
            </div>

            {/* Main Notes Editor */}
            <div className="notes-pane-section fill">
              <div className="section-title-bar">
                <span className="pane-section-label">
                  <FileText size={14} /> {ui === 'fr' ? 'Bloc-Notes de la Session' : 'Session Notes'}
                </span>
              </div>
              <textarea
                className="session-notes-editor"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder={
                  ui === 'fr'
                    ? 'Écris ici tes observations, le vocabulaire que tu as appris, les points à retravailler ou tes réussites...'
                    : 'Write down your feedback, new vocabulary used, pronunciation fixes, or highlights here...'
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
