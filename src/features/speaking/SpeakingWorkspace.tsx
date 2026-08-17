import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { SpeakingSessionRecord } from './speakingStorage'
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
  Bold,
  Italic,
  List,
  Heading2,
  Quote,
  Eye,
  Edit3,
  Columns,
  Sparkles,
} from 'lucide-react'

type SpeakingWorkspaceProps = {
  ui: 'fr' | 'en'
  session: SpeakingSessionRecord
  onUpdate: (session: SpeakingSessionRecord) => void
  onDelete: (id: string) => void
  onBack: () => void
}

function parseTimeToSeconds(timeStr: string): number {
  const clean = timeStr.replace(/^[@\[\]]/g, '').trim()
  const parts = clean.split(':').map((p) => parseInt(p, 10))
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

function formatTime(seconds: number): string {
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(session.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [notes, setNotes] = useState(
    session.notes ||
      (ui === 'fr'
        ? '## Notes de session\n\n- Remarques générales :\n- Points forts :\n- Pistes d’amélioration :\n\n@00:05 Première prise de parole\n'
        : '## Session Notes\n\n- Key points:\n- Highlights:\n- Improvement areas:\n\n@00:05 First talking point\n'),
  )
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split')
  const [ratings, setRatings] = useState(
    session.ratings || { fluency: 4, pronunciation: 4, confidence: 4 },
  )
  const [savedBadge, setSavedBadge] = useState(false)

  // Sync video time
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

  // Insert markdown snippet or timestamp at cursor position
  const insertFormatting = (before: string, after = '', placeholder = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentText = textarea.value
    const selectedText = currentText.substring(start, end) || placeholder

    const replacement = `${before}${selectedText}${after}`
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end)

    setNotes(newText)
    triggerAutosave({ notes: newText })

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length)
    }, 10)
  }

  const insertCurrentTimestamp = () => {
    const timeStr = `@${formatTime(currentTime)} `
    insertFormatting(timeStr, '', '')
  }

  const downloadMedia = () => {
    if (!session.mediaUrl) return
    const a = document.createElement('a')
    a.href = session.mediaUrl
    a.download = `${title.replace(/[^a-z0-9à-ÿ]/gi, '_') || 'session'}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Interactive Markdown Parser with Clickable @Timestamps
  const renderedMarkdown = useMemo(() => {
    if (!notes) return null

    const lines = notes.split('\n')
    return lines.map((line, lineIdx) => {
      // Empty line
      if (!line.trim()) {
        return <div key={lineIdx} className="md-empty-line" />
      }

      // Heading 1
      if (line.startsWith('# ')) {
        return (
          <h1 key={lineIdx} className="md-h1">
            {renderInlineMarkdown(line.substring(2), seekTo)}
          </h1>
        )
      }
      // Heading 2
      if (line.startsWith('## ')) {
        return (
          <h2 key={lineIdx} className="md-h2">
            {renderInlineMarkdown(line.substring(3), seekTo)}
          </h2>
        )
      }
      // Heading 3
      if (line.startsWith('### ')) {
        return (
          <h3 key={lineIdx} className="md-h3">
            {renderInlineMarkdown(line.substring(4), seekTo)}
          </h3>
        )
      }
      // Blockquote
      if (line.startsWith('> ')) {
        return (
          <blockquote key={lineIdx} className="md-blockquote">
            {renderInlineMarkdown(line.substring(2), seekTo)}
          </blockquote>
        )
      }
      // Unordered list
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={lineIdx} className="md-list-item">
            {renderInlineMarkdown(line.substring(2), seekTo)}
          </li>
        )
      }

      // Regular paragraph
      return (
        <p key={lineIdx} className="md-paragraph">
          {renderInlineMarkdown(line, seekTo)}
        </p>
      )
    })
  }, [notes])

  return (
    <div className="speaking-workspace-page">
      {/* Top Navigation Bar */}
      <header className="workspace-header-bar">
        <div className="workspace-header-left">
          <button className="workspace-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>{ui === 'fr' ? 'Retour aux prises' : 'Back to takes'}</span>
          </button>

          <div className="workspace-title-area">
            {isEditingTitle ? (
              <div className="workspace-title-editor">
                <input
                  type="text"
                  value={title}
                  autoFocus
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                />
                <button className="workspace-icon-save" onClick={handleTitleSubmit}>
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div className="workspace-title-display" onClick={() => setIsEditingTitle(true)}>
                <h1>{title}</h1>
                <button className="workspace-icon-edit" title="Modifier le titre">
                  <Edit2 size={14} />
                </button>
              </div>
            )}

            <div className="workspace-meta-row">
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
                {formatTime(session.duration)}
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

      {/* Main Workspace Body (Video Left / Markdown Notes Right) */}
      <main className="workspace-body-grid">
        {/* Left Column: Video Player */}
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

            {/* Glassmorphism Player Toolbar */}
            <div className="ws-player-glass-bar">
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
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                />
                <span className="ws-time-display">
                  {formatTime(currentTime)} / {formatTime(duration)}
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

              <button className="ws-mute-btn" onClick={toggleMute} title={isMuted ? 'Activer le son' : 'Muet'}>
                {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>

          {/* Quick Insert Timestamp Button Below Video */}
          <div className="ws-insert-ts-row">
            <button className="ws-insert-ts-btn" onClick={insertCurrentTimestamp}>
              <Clock size={14} />
              <span>
                {ui === 'fr'
                  ? `Insérer @${formatTime(currentTime)} dans les notes`
                  : `Insert @${formatTime(currentTime)} into notes`}
              </span>
            </button>
          </div>
        </section>

        {/* Right Column: Markdown Notes Editor & Interactive Viewer */}
        <section className="workspace-notes-pane">
          {/* Notes Toolbar */}
          <div className="ws-notes-toolbar">
            <div className="ws-format-tools">
              <button
                className="ws-tool-btn"
                onClick={() => insertFormatting('## ', '', 'Titre')}
                title="Titre (##)"
              >
                <Heading2 size={14} />
              </button>
              <button
                className="ws-tool-btn"
                onClick={() => insertFormatting('**', '**', 'texte en gras')}
                title="Gras (**)"
              >
                <Bold size={14} />
              </button>
              <button
                className="ws-tool-btn"
                onClick={() => insertFormatting('*', '*', 'texte en italique')}
                title="Italique (*)"
              >
                <Italic size={14} />
              </button>
              <button
                className="ws-tool-btn"
                onClick={() => insertFormatting('- ', '', 'Point clé')}
                title="Liste (-)"
              >
                <List size={14} />
              </button>
              <button
                className="ws-tool-btn"
                onClick={() => insertFormatting('> ', '', 'Citation ou remarque')}
                title="Citation (>)"
              >
                <Quote size={14} />
              </button>
              <button
                className="ws-tool-btn timestamp"
                onClick={insertCurrentTimestamp}
                title="Insérer le chrono actuel (@MM:SS)"
              >
                <Clock size={13} />
                <span>@{formatTime(currentTime)}</span>
              </button>
            </div>

            {/* View Mode Switch */}
            <div className="ws-mode-switch">
              <button
                className={`ws-mode-tab ${viewMode === 'edit' ? 'active' : ''}`}
                onClick={() => setViewMode('edit')}
                title="Éditer en Markdown"
              >
                <Edit3 size={13} />
                <span>{ui === 'fr' ? 'Édition' : 'Edit'}</span>
              </button>
              <button
                className={`ws-mode-tab ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Vue partagée Édition + Rendu"
              >
                <Columns size={13} />
                <span>{ui === 'fr' ? 'Mixte' : 'Split'}</span>
              </button>
              <button
                className={`ws-mode-tab ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
                title="Aperçu interactif"
              >
                <Eye size={13} />
                <span>{ui === 'fr' ? 'Rendu' : 'Preview'}</span>
              </button>
            </div>
          </div>

          {/* Notes Content Workspace */}
          <div className={`ws-notes-content-area ${viewMode}`}>
            {(viewMode === 'edit' || viewMode === 'split') && (
              <textarea
                ref={textareaRef}
                className="ws-markdown-editor"
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder={
                  ui === 'fr'
                    ? 'Tape tes remarques ici en Markdown...\nUtilise @01:23 pour insérer un marqueur temporel cliquable.'
                    : 'Write your notes in Markdown here...\nUse @01:23 to insert a clickable timestamp.'
                }
              />
            )}

            {(viewMode === 'preview' || viewMode === 'split') && (
              <div className="ws-markdown-rendered-view">{renderedMarkdown}</div>
            )}
          </div>

          {/* Discreet Star Ratings at the very bottom (No unnecessary labels) */}
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

// Inline Markdown Parser helper supporting **bold**, *italic*, and @MM:SS timestamps
function renderInlineMarkdown(
  text: string,
  onSeek: (seconds: number) => void,
): React.ReactNode[] {
  // Regex to split by @MM:SS or [MM:SS] or **bold** or *italic*
  const pattern = /(@[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|\[[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\]|\*\*[^*]+\*\*|\*[^*]+\*)/g

  const parts = text.split(pattern)

  return parts.map((part, idx) => {
    if (!part) return null

    // Match Timestamp @MM:SS or [MM:SS]
    if (/^(@[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?|\[[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\])$/.test(part)) {
      const seconds = parseTimeToSeconds(part)
      const label = part.replace(/^[@\[\]]/g, '').trim()
      return (
        <button
          key={idx}
          className="md-interactive-timestamp"
          onClick={() => onSeek(seconds)}
          title={`Sauter à ${label}`}
        >
          <Play size={10} />
          <span>{label}</span>
        </button>
      )
    }

    // Match Bold **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>
    }

    // Match Italic *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>
    }

    return <span key={idx}>{part}</span>
  })
}
