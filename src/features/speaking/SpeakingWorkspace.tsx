import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import type { SpeakingSessionRecord, SpeakingVideoAdviceCategory, SpeakingVideoAdviceItem } from './speakingStorage'
import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { NotionSpeakingEditor } from './NotionSpeakingEditor'
import { useCamera } from './CameraContext'
import { speakingCopy } from '../../i18n'
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Trash2,
  Clock,
  Check,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Mic,
  Activity,
  BookOpen,
  HelpCircle,
  Flame,
  Info,
  ChevronRight,
  Sparkle,
} from 'lucide-react'

type SpeakingWorkspaceProps = {
  ui: UiLanguage
  language?: Language
  api?: ApiSettings
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

const CATEGORY_META: Record<
  SpeakingVideoAdviceCategory,
  { labelFr: string; labelEn: string; icon: string; color: string; bg: string }
> = {
  pronunciation: {
    labelFr: 'Prononciation',
    labelEn: 'Pronunciation',
    icon: '🎙️',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
  },
  rhythm: {
    labelFr: 'Rythme & Débit',
    labelEn: 'Rhythm & Flow',
    icon: '⏱️',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
  },
  grammar_structure: {
    labelFr: 'Structure & Grammaire',
    labelEn: 'Structure & Grammar',
    icon: '📐',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
  },
  vocabulary: {
    labelFr: 'Vocabulaire',
    labelEn: 'Vocabulary',
    icon: '📚',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
  },
  fluency: {
    labelFr: 'Fluidité & Liaisons',
    labelEn: 'Fluency & Connected Speech',
    icon: '🌊',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
  },
}

export function SpeakingWorkspace({
  ui,
  language = 'en',
  api,
  session,
  onUpdate,
  onDelete,
  onBack,
}: SpeakingWorkspaceProps) {
  const t = speakingCopy[ui || 'fr'] || speakingCopy.fr
  const { triggerSessionAnalysis } = useCamera()

  const videoRef = useRef<HTMLVideoElement>(null)
  const videoWrapperRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<number | null>(null)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(session.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [centerPulseIcon, setCenterPulseIcon] = useState<'play' | 'pause' | null>(null)

  // Document & Rating state
  const [title, setTitle] = useState(session.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [notes, setNotes] = useState(session.notes || '')
  const [ratings, setRatings] = useState(
    session.ratings || { fluency: 4, pronunciation: 4, confidence: 4 },
  )
  const [savedBadge, setSavedBadge] = useState(false)

  // AI Advice UI state
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all')
  const [activeAdviceId, setActiveAdviceId] = useState<string | null>(null)
  const [activePillarTab, setActivePillarTab] = useState<'pronunciation' | 'rhythm' | 'structure'>('pronunciation')

  // Safe duration display
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
      if (
        videoRef.current.duration &&
        !isNaN(videoRef.current.duration) &&
        isFinite(videoRef.current.duration)
      ) {
        setDuration(videoRef.current.duration)
      }
    }
  }

  // Auto-hide controls logic: 3 seconds after mouse movement
  const resetControlsTimer = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current)
    }
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }, [isPlaying])

  const handleMouseMove = () => {
    resetControlsTimer()
  }

  const handleMouseLeave = () => {
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current)
    }
    if (isPlaying) {
      setShowControls(false)
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      void videoRef.current.play()
      setIsPlaying(true)
      setCenterPulseIcon('play')
      setTimeout(() => setCenterPulseIcon(null), 500)
      resetControlsTimer()
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
      setShowControls(true)
      setCenterPulseIcon('pause')
      setTimeout(() => setCenterPulseIcon(null), 500)
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current)
      }
    }
  }

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      setCurrentTime(seconds)
      void videoRef.current.play().catch(() => undefined)
      setIsPlaying(true)
      resetControlsTimer()
    }
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
    resetControlsTimer()
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      videoRef.current.muted = newVolume === 0
      setIsMuted(newVolume === 0)
    }
    resetControlsTimer()
  }

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted
      videoRef.current.muted = nextMuted
      setIsMuted(nextMuted)
      if (nextMuted) {
        videoRef.current.volume = 0
      } else {
        videoRef.current.volume = volume || 1
      }
    }
    resetControlsTimer()
  }

  const toggleFullscreen = () => {
    if (!videoWrapperRef.current) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    } else {
      void videoWrapperRef.current.requestFullscreen().catch(() => undefined)
    }
  }

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl &&
          (activeEl.getAttribute('contenteditable') === 'true' ||
            activeEl.classList.contains('notion-speaking-content')))

      if (!isTyping) {
        if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault()
          togglePlay()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const maxDur = duration || session.duration || 999999
          const curr = videoRef.current?.currentTime ?? currentTime
          seekTo(Math.min(maxDur, curr + 5))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const curr = videoRef.current?.currentTime ?? currentTime
          seekTo(Math.max(0, curr - 5))
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault()
          toggleMute()
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault()
          toggleFullscreen()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [duration, session.duration, currentTime, isPlaying, isMuted])

  const downloadMedia = () => {
    if (!session.mediaUrl) return
    const a = document.createElement('a')
    a.href = session.mediaUrl
    a.download = `${title.replace(/[^a-z0-9à-ÿ]/gi, '_') || 'session'}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Analysis helpers
  const analysis = session.analysis
  const analysisStatus = session.analysisStatus || (analysis ? 'completed' : 'idle')
  const isAnalyzing = analysisStatus === 'analyzing'
  const isTooLong = analysisStatus === 'too_long' || session.duration > 180

  const filteredAdviceItems = useMemo(() => {
    if (!analysis || !Array.isArray(analysis.items)) return []
    if (selectedCategoryFilter === 'all') return analysis.items
    return analysis.items.filter((item) => item.category === selectedCategoryFilter)
  }, [analysis, selectedCategoryFilter])

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

      {/* Main Split Grid (Left: YouTube Player + AI Advice / Right: Notion Editor) */}
      <main className="workspace-body-grid">
        {/* Left Column */}
        <section className="workspace-video-pane">
          {/* YouTube Style Video Player Container with Integrated Overlay Controls */}
          <div
            ref={videoWrapperRef}
            className={`yt-video-container ${!showControls && isPlaying ? 'controls-hidden' : ''} ${
              isFullscreen ? 'is-fullscreen' : ''
            }`}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {session.mediaUrl ? (
              <video
                ref={videoRef}
                src={session.mediaUrl}
                className="yt-video-element"
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  setIsPlaying(false)
                  setShowControls(true)
                }}
                onClick={togglePlay}
              />
            ) : (
              <div className="ws-video-placeholder">
                <p>Aucun flux vidéo disponible</p>
              </div>
            )}

            {/* Center Play / Pause Feedback Animation */}
            {centerPulseIcon && (
              <div className="yt-center-pulse">
                {centerPulseIcon === 'play' ? (
                  <Play size={44} fill="currentColor" />
                ) : (
                  <Pause size={44} fill="currentColor" />
                )}
              </div>
            )}

            {/* YouTube Overlay Controls Bar (Inside the Video Container) */}
            <div className={`yt-controls-overlay ${showControls ? 'visible' : 'hidden'}`}>
              {/* Full-width Scrubber Progress Bar */}
              <div className="yt-scrubber-row">
                <input
                  type="range"
                  className="yt-scrubber-range"
                  min="0"
                  max={displayDuration || 100}
                  step="0.05"
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, var(--coral, #ee775d) ${(currentTime / (displayDuration || 1)) * 100}%, rgba(255, 255, 255, 0.28) ${(currentTime / (displayDuration || 1)) * 100}%)`,
                  }}
                />
              </div>

              {/* Bottom Controls Row: Play, Volume, Time on left / Speed, Fullscreen on right */}
              <div className="yt-buttons-row">
                {/* Left Controls */}
                <div className="yt-left-controls">
                  <button
                    className="yt-btn"
                    onClick={togglePlay}
                    title={isPlaying ? t.pauseSpace : t.playSpace}
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                  </button>

                  <div className="yt-volume-wrap">
                    <button
                      className="yt-btn volume-btn"
                      onClick={toggleMute}
                      title={isMuted ? t.unmuteM : t.muteM}
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX size={18} />
                      ) : volume < 0.5 ? (
                        <Volume1 size={18} />
                      ) : (
                        <Volume2 size={18} />
                      )}
                    </button>
                    <input
                      type="range"
                      className="yt-volume-slider"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    />
                  </div>

                  <div className="yt-time-badge">
                    <span className="current">{formatTime(currentTime)}</span>
                    <span className="sep">/</span>
                    <span className="total">{formatTime(displayDuration)}</span>
                  </div>
                </div>

                {/* Right Controls */}
                <div className="yt-right-controls">
                  <div className="yt-speed-chips-group">
                    {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        className={`yt-speed-chip ${playbackRate === rate ? 'active' : ''}`}
                        onClick={() => changeSpeed(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <button
                    className="yt-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? t.exitFullscreenF : t.fullscreenF}
                  >
                    {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* New AI Speaking Advice & Analysis Section (Under the Video) */}
          <section className="speaking-ai-analysis-card">
            {/* Header with Title, Status & Refresh */}
            <div className="ai-analysis-header-row">
              <div className="ai-analysis-title-group">
                <div className="ai-sparkle-circle">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="ai-analysis-title">{t.aiCoachingTitle}</h3>
                  <p className="ai-analysis-subtitle">{t.aiCoachingSubtitle}</p>
                </div>
              </div>

              <div className="ai-analysis-actions">
                {analysis?.overallScore !== undefined && (
                  <div className="ai-score-pill" title={t.overallScoreTitle}>
                    <span className="score-num">{analysis.overallScore}</span>
                    <span className="score-max">/100</span>
                  </div>
                )}

                <button
                  className={`ai-reanalyze-btn ${isAnalyzing ? 'loading' : ''}`}
                  onClick={() => void triggerSessionAnalysis(session.id)}
                  disabled={isAnalyzing}
                  title={t.reanalyzeTitle}
                >
                  <RotateCcw size={13} className={isAnalyzing ? 'spin' : ''} />
                  <span>
                    {isAnalyzing ? t.analyzingBtn : t.reanalyzeBtn}
                  </span>
                </button>
              </div>
            </div>

            {/* STATE 1: Analyzing Loader */}
            {isAnalyzing && (
              <div className="ai-analyzing-box">
                <div className="ai-radar-pulse">
                  <div className="radar-circle c1" />
                  <div className="radar-circle c2" />
                  <div className="radar-circle c3" />
                  <Mic size={22} className="radar-mic" />
                </div>
                <div className="ai-analyzing-text">
                  <strong>{t.analyzingRecording}</strong>
                  <p>{t.analyzingDesc}</p>
                </div>
              </div>
            )}

            {/* STATE 2: Video Too Long Banner */}
            {!isAnalyzing && isTooLong && (
              <div className="ai-limit-alert">
                <Info size={18} className="limit-icon" />
                <div className="limit-content">
                  <strong>{t.takeTooLongTitle}</strong>
                  <p>{t.takeTooLongDesc}</p>
                </div>
              </div>
            )}

            {/* STATE 3: Error Banner */}
            {!isAnalyzing && !isTooLong && analysisStatus === 'error' && (
              <div className="ai-error-alert">
                <AlertTriangle size={18} className="error-icon" />
                <div className="error-content">
                  <strong>{t.analysisFailedTitle}</strong>
                  <p>{session.analysisError || 'OpenRouter API Error'}</p>
                  <button
                    className="error-retry-btn"
                    onClick={() => void triggerSessionAnalysis(session.id)}
                  >
                    <RotateCcw size={12} /> {t.retryBtn}
                  </button>
                </div>
              </div>
            )}

            {/* STATE 4: Idle / Not Analyzed Yet */}
            {!isAnalyzing && !isTooLong && analysisStatus === 'idle' && !analysis && (
              <div className="ai-idle-box">
                <p>{t.noAnalysisDesc}</p>
                <button
                  className="primary-analyze-trigger-btn"
                  onClick={() => void triggerSessionAnalysis(session.id)}
                >
                  <Sparkles size={14} />
                  <span>{t.analyzeVideoBtn}</span>
                </button>
              </div>
            )}

            {/* STATE 5: Analysis Completed */}
            {!isAnalyzing && analysis && (
              <div className="ai-completed-container">
                {/* Global Motivational Feedback */}
                <div className="ai-global-feedback-box">
                  <p className="global-quote">“{analysis.overallFeedback}”</p>
                </div>

                {/* 3 Core Pillars Tabs */}
                <div className="ai-pillars-tabs">
                  <button
                    className={`pillar-tab ${activePillarTab === 'pronunciation' ? 'active' : ''}`}
                    onClick={() => setActivePillarTab('pronunciation')}
                  >
                    <span>🎙️</span>
                    <b>{ui === 'fr' ? 'Prononciation' : 'Pronunciation'}</b>
                  </button>
                  <button
                    className={`pillar-tab ${activePillarTab === 'rhythm' ? 'active' : ''}`}
                    onClick={() => setActivePillarTab('rhythm')}
                  >
                    <span>⏱️</span>
                    <b>{ui === 'fr' ? 'Rythme & Débit' : 'Rhythm & Flow'}</b>
                  </button>
                  <button
                    className={`pillar-tab ${activePillarTab === 'structure' ? 'active' : ''}`}
                    onClick={() => setActivePillarTab('structure')}
                  >
                    <span>📐</span>
                    <b>{ui === 'fr' ? 'Structure & Syntaxe' : 'Structure & Syntax'}</b>
                  </button>
                </div>

                {/* Pillar Summary Card */}
                <div className="ai-pillar-content-card">
                  {activePillarTab === 'pronunciation' && (
                    <div className="pillar-detail">
                      <p>{analysis.pronunciationSummary}</p>
                    </div>
                  )}
                  {activePillarTab === 'rhythm' && (
                    <div className="pillar-detail">
                      <p>{analysis.rhythmSummary}</p>
                    </div>
                  )}
                  {activePillarTab === 'structure' && (
                    <div className="pillar-detail">
                      <p>{analysis.structureSummary}</p>
                    </div>
                  )}
                </div>

                {/* Timestamped Advice List */}
                <div className="ai-advice-items-section">
                  <div className="advice-items-header">
                    <h4>
                      {ui === 'fr'
                        ? `Conseils horodatés (${analysis.items?.length || 0})`
                        : `Timestamped Advice (${analysis.items?.length || 0})`}
                    </h4>

                    {/* Filter Category Chips */}
                    <div className="advice-filter-chips">
                      <button
                        className={`filter-chip ${selectedCategoryFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedCategoryFilter('all')}
                      >
                        {ui === 'fr' ? 'Tous' : 'All'}
                      </button>
                      {(['pronunciation', 'rhythm', 'grammar_structure', 'vocabulary'] as const).map(
                        (cat) => {
                          const meta = CATEGORY_META[cat]
                          const count = analysis.items?.filter((i) => i.category === cat).length || 0
                          if (count === 0) return null
                          return (
                            <button
                              key={cat}
                              className={`filter-chip ${selectedCategoryFilter === cat ? 'active' : ''}`}
                              onClick={() => setSelectedCategoryFilter(cat)}
                            >
                              <span>{meta.icon}</span>
                              <span>{ui === 'fr' ? meta.labelFr : meta.labelEn}</span>
                              <span className="count">({count})</span>
                            </button>
                          )
                        },
                      )}
                    </div>
                  </div>

                  {/* List of interactive Advice Cards */}
                  <div className="advice-cards-list">
                    {filteredAdviceItems.length === 0 ? (
                      <p className="no-advice-filter-msg">
                        {ui === 'fr' ? 'Aucun conseil dans cette catégorie.' : 'No advice in this category.'}
                      </p>
                    ) : (
                      filteredAdviceItems.map((item) => {
                        const meta = CATEGORY_META[item.category] || CATEGORY_META.pronunciation
                        const isCurrentActive = activeAdviceId === item.id

                        return (
                          <article
                            key={item.id}
                            className={`advice-item-card ${isCurrentActive ? 'is-selected' : ''}`}
                            onClick={() => {
                              seekTo(item.timestamp)
                              setActiveAdviceId(item.id)
                            }}
                          >
                            <div className="advice-card-top-row">
                              {/* Clickable Timestamp jump button */}
                              <button
                                className="advice-timestamp-pill"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  seekTo(item.timestamp)
                                  setActiveAdviceId(item.id)
                                }}
                                title="Cliquer pour sauter à ce moment dans la vidéo"
                              >
                                <Play size={10} fill="currentColor" />
                                <span>{formatTime(item.timestamp)}</span>
                              </button>

                              <span
                                className="advice-cat-badge"
                                style={{ color: meta.color, backgroundColor: meta.bg }}
                              >
                                <span>{meta.icon}</span>
                                <span>{ui === 'fr' ? meta.labelFr : meta.labelEn}</span>
                              </span>

                              <span className={`advice-severity-chip ${item.severity}`}>
                                {item.severity === 'error'
                                  ? ui === 'fr'
                                    ? 'À corriger'
                                    : 'Error'
                                  : item.severity === 'warning'
                                  ? ui === 'fr'
                                    ? 'Attention'
                                    : 'Warning'
                                  : ui === 'fr'
                                  ? 'Astuce'
                                  : 'Tip'}
                              </span>
                            </div>

                            <h5 className="advice-card-title">{item.title}</h5>

                            {/* Comparison Box (if original and improved snippets provided) */}
                            {(item.originalSnippet || item.improvedSnippet) && (
                              <div className="advice-snippet-compare">
                                {item.originalSnippet && (
                                  <div className="snippet-box original">
                                    <span className="lbl">{ui === 'fr' ? 'Entendu :' : 'Heard:'}</span>
                                    <span className="val">{item.originalSnippet}</span>
                                  </div>
                                )}
                                {item.improvedSnippet && (
                                  <div className="snippet-box improved">
                                    <span className="lbl">{ui === 'fr' ? 'Suggéré :' : 'Better:'}</span>
                                    <span className="val">{item.improvedSnippet}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* IPA Phonetic Tag if provided */}
                            {item.ipa && (
                              <div className="advice-ipa-tag">
                                <span className="ipa-lbl">IPA :</span>
                                <code className="ipa-code">{item.ipa}</code>
                              </div>
                            )}

                            <p className="advice-explanation-text">{item.explanation}</p>
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
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

          {/* Discreet Star Ratings at the Very Bottom */}
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
