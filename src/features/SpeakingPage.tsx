import React, { useEffect, useRef, useState } from 'react'
import type { Language, ApiSettings } from '../domain'
import { GLOBAL_CATEGORIES, GlobalTopicCategory, NicheTopic, getPromptText } from './speaking/speakingTopics'
import { useCamera } from './speaking/CameraContext'
import { TeleprompterOverlay } from './speaking/TeleprompterOverlay'
import { SessionReviewModal } from './speaking/SessionReviewModal'
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Sliders,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  Pause,
  Trash2,
  Download,
  FileText,
  Video,
  Maximize2,
  Minimize2,
  BookOpen,
} from 'lucide-react'

type SpeakingPageProps = {
  ui: 'fr' | 'en'
  language: Language
  api: ApiSettings
}

const L = {
  fr: {
    heading: 'Studio vocal & vidéo',
    sub: 'Entraîne ton éloquence face caméra : lis avec prompteur ou parle librement sur des sujets variés.',
    enableCamTitle: 'Enregistre tes sessions en activant la caméra',
    enableCamBtn: 'Activer la caméra',
    camOff: 'Caméra désactivée',
    micOff: 'Micro désactivé',
    record: 'Enregistrer',
    stop: 'Terminer',
    pause: 'Pause',
    resume: 'Reprendre',
    chooseTopic: 'Choisir un sujet',
    changeTopic: 'Changer de sujet',
    prompterPromptTitle: 'Utiliser un prompteur ?',
    withPrompter: 'Oui',
    withoutPrompter: 'Non',
    takesHeading: 'Mes Prises & Enregistrements',
    noTakes: 'Aucune prise enregistrée. Lance ta première session !',
    openReview: 'Ouvrir l’Espace Notes',
    deleteTake: 'Supprimer',
    downloadTake: 'Télécharger',
    opacityControl: 'Opacité de l’overlay',
  },
  en: {
    heading: 'Voice & Video Studio',
    sub: 'Practice speaking on camera: read with a teleprompter or speak freely on various topics.',
    enableCamTitle: 'Record your sessions by activating the camera',
    enableCamBtn: 'Activate camera',
    camOff: 'Camera off',
    micOff: 'Microphone off',
    record: 'Record',
    stop: 'Finish',
    pause: 'Pause',
    resume: 'Resume',
    chooseTopic: 'Choose a topic',
    changeTopic: 'Change topic',
    prompterPromptTitle: 'Use a teleprompter?',
    withPrompter: 'Yes',
    withoutPrompter: 'No',
    takesHeading: 'My Takes & Recordings',
    noTakes: 'No recorded takes yet. Start your very first session!',
    openReview: 'Open Notes Workspace',
    deleteTake: 'Delete',
    downloadTake: 'Download',
    opacityControl: 'Overlay opacity',
  },
} as const

export function SpeakingPage({ ui, language }: SpeakingPageProps) {
  const t = L[ui]
  const {
    stream,
    cameraActive,
    cameraDisabled,
    micMuted,
    recording,
    isPaused,
    elapsed,
    audioLevel,
    permissionError,
    overlayOpacity,
    setOverlayOpacity,
    requestMediaAccess,
    toggleCameraTrack,
    toggleMicTrack,
    isCountingDown,
    countdownSeconds,
    startRecordingWithCountdown,
    stopRecording,
    pauseRecording,
    resumeRecording,
    selectedCategory,
    setSelectedCategory,
    selectedNiche,
    setSelectedNiche,
    showPrompter,
    setShowPrompter,
    sessions,
    activeReviewSession,
    setActiveReviewSession,
    handleUpdateSession,
    handleDeleteSession,
  } = useCamera()

  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [inPickerCategory, setInPickerCategory] = useState<GlobalTopicCategory | null>(null)
  const [pendingNiche, setPendingNiche] = useState<NicheTopic | null>(null)
  const [showHudSettings, setShowHudSettings] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const studioContainerRef = useRef<HTMLDivElement>(null)

  // Attach active stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream])

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!studioContainerRef.current) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void studioContainerRef.current.requestFullscreen()
    }
  }

  const handleStartRecord = () => {
    // Enter fullscreen mode then countdown
    if (studioContainerRef.current && !document.fullscreenElement) {
      void studioContainerRef.current.requestFullscreen().catch(() => undefined)
    }
    startRecordingWithCountdown()
  }

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleSelectNiche = (niche: NicheTopic) => {
    setPendingNiche(niche)
  }

  const handleConfirmPrompter = (withPrompter: boolean) => {
    if (pendingNiche) {
      setSelectedNiche(pendingNiche)
      setShowPrompter(withPrompter)
    }
    setPendingNiche(null)
    setShowTopicPicker(false)
    setInPickerCategory(null)
  }

  return (
    <div className="page speaking-page">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="eyebrow">{ui === 'fr' ? 'PARLER' : 'SPEAK'}</p>
          <h1>{t.heading}</h1>
          <p className="subhead">{t.sub}</p>
        </div>
        <div className="header-right-badges">
          <span className="session-count-pill">
            <Video size={14} /> {sessions.length} {ui === 'fr' ? 'prises' : 'takes'}
          </span>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <section className="studio-stage-wrapper">
        <div
          ref={studioContainerRef}
          className={`studio-camera-viewport ${isFullscreen ? 'fullscreen' : ''}`}
        >
          {/* Active Live Video */}
          {cameraActive && (
            <video
              ref={videoRef}
              className={`studio-live-video ${cameraDisabled ? 'disabled' : ''}`}
              autoPlay
              muted
              playsInline
            />
          )}

          {/* Camera Disabled Screen */}
          {cameraActive && cameraDisabled && (
            <div className="studio-black-screen">
              <CameraOff size={42} />
              <p>{t.camOff}</p>
            </div>
          )}

          {/* Inactive Camera State (Dashed border enclosure) */}
          {!cameraActive && (
            <div className="studio-dashed-auth-box">
              <div className="dashed-auth-inner">
                <div className="dashed-cam-icon">
                  <Camera size={32} />
                </div>
                <h3>{t.enableCamTitle}</h3>
                {permissionError && <p className="studio-auth-error">{permissionError}</p>}
                <button className="dashed-activate-btn" onClick={() => void requestMediaAccess()}>
                  {t.enableCamBtn}
                </button>
              </div>
            </div>
          )}

          {/* 5-Second Transparent Countdown Screen (No opaque background) */}
          {isCountingDown && (
            <div className="transparent-countdown-overlay">
              <div className="countdown-number-display">{countdownSeconds}</div>
            </div>
          )}

          {/* Active Camera HUD Overlay */}
          {cameraActive && !isCountingDown && (
            <div
              className="studio-glass-hud"
              style={{
                background: `radial-gradient(ellipse at center, rgba(14, 18, 26, ${Math.max(0, overlayOpacity - 0.35)}) 0%, rgba(10, 12, 18, ${overlayOpacity}) 100%)`,
              }}
            >
              {/* HUD Top Bar */}
              <div className="hud-top-bar">
                <div className="hud-top-left-actions">
                  <button
                    className="hud-glass-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>

                <div className="hud-top-right-tools">
                  {/* VU Meter */}
                  <div className="hud-audio-meter" title={micMuted ? t.micOff : `Audio: ${audioLevel}%`}>
                    {micMuted ? (
                      <MicOff size={14} className="muted-icon" />
                    ) : (
                      <>
                        <Mic size={14} />
                        <div className="vu-bars">
                          <i style={{ height: `${Math.min(100, audioLevel * 1.4)}%` }} />
                          <i style={{ height: `${Math.min(100, audioLevel * 1.8)}%` }} />
                          <i style={{ height: `${Math.min(100, audioLevel * 1.2)}%` }} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Opacity Control */}
                  <button
                    className={`hud-glass-btn ${showHudSettings ? 'active' : ''}`}
                    onClick={() => setShowHudSettings(!showHudSettings)}
                    title={t.opacityControl}
                  >
                    <Sliders size={14} />
                  </button>

                  {showHudSettings && (
                    <div className="hud-opacity-popover">
                      <label>
                        <span>{t.opacityControl}</span>
                        <input
                          type="range"
                          min="0.1"
                          max="0.9"
                          step="0.05"
                          value={overlayOpacity}
                          onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                        />
                        <b>{Math.round(overlayOpacity * 100)}%</b>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Minimalist Transparent Prompter at Bottom */}
              {showPrompter && selectedNiche && (
                <TeleprompterOverlay
                  text={getPromptText(selectedNiche, language)}
                  opacity={overlayOpacity}
                  onClose={() => setShowPrompter(false)}
                />
              )}

              {/* Bottom-Right In-Place Topic Selection Drawer (Does NOT mask camera) */}
              {showTopicPicker && (
                <div
                  className="in-place-topic-drawer"
                  style={{
                    backgroundColor: `rgba(15, 20, 28, ${Math.min(0.95, overlayOpacity + 0.3)})`,
                  }}
                >
                  {/* Step 1: Pick Category / Domain */}
                  {!inPickerCategory && !pendingNiche && (
                    <div className="drawer-subview">
                      <div className="drawer-head">
                        <strong>{ui === 'fr' ? 'Choisir un domaine' : 'Pick a domain'}</strong>
                        <button className="drawer-close" onClick={() => setShowTopicPicker(false)}>
                          <X size={14} />
                        </button>
                      </div>
                      <div className="drawer-list">
                        {GLOBAL_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            className="drawer-cat-btn"
                            onClick={() => setInPickerCategory(cat)}
                          >
                            <span>{cat.icon}</span>
                            <b>{ui === 'fr' ? cat.title : cat.titleEn}</b>
                            <ChevronRight size={14} className="arr" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Pick Niche Subtopic */}
                  {inPickerCategory && !pendingNiche && (
                    <div className="drawer-subview">
                      <div className="drawer-head">
                        <button className="drawer-back" onClick={() => setInPickerCategory(null)}>
                          <ChevronLeft size={14} /> {ui === 'fr' ? 'Domaines' : 'Domains'}
                        </button>
                        <button className="drawer-close" onClick={() => setShowTopicPicker(false)}>
                          <X size={14} />
                        </button>
                      </div>
                      <div className="drawer-list">
                        {inPickerCategory.subtopics.map((sub) => (
                          <button
                            key={sub.id}
                            className="drawer-niche-btn"
                            onClick={() => handleSelectNiche(sub)}
                          >
                            <span>{sub.badge}</span>
                            <b>{ui === 'fr' ? sub.title : sub.titleEn}</b>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Minimal Prompter Question (Oui / Non) */}
                  {pendingNiche && (
                    <div className="drawer-prompter-question">
                      <h4>{t.prompterPromptTitle}</h4>
                      <p className="pending-topic-title">
                        “{ui === 'fr' ? pendingNiche.title : pendingNiche.titleEn}”
                      </p>
                      <div className="prompter-question-btns">
                        <button
                          className="pq-btn secondary"
                          onClick={() => handleConfirmPrompter(false)}
                        >
                          {t.withoutPrompter}
                        </button>
                        <button
                          className="pq-btn primary"
                          onClick={() => handleConfirmPrompter(true)}
                        >
                          {t.withPrompter}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* HUD Bottom Bar */}
              <div className="hud-bottom-bar">
                {/* Left: Device toggles */}
                <div className="hud-device-controls">
                  <button
                    className={`device-btn ${micMuted ? 'off' : ''}`}
                    onClick={toggleMicTrack}
                    title={micMuted ? 'Activer micro' : 'Couper micro'}
                  >
                    {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                  <button
                    className={`device-btn ${cameraDisabled ? 'off' : ''}`}
                    onClick={toggleCameraTrack}
                    title={cameraDisabled ? 'Activer caméra' : 'Couper caméra'}
                  >
                    {cameraDisabled ? <CameraOff size={16} /> : <Camera size={16} />}
                  </button>
                </div>

                {/* Center: Record button / Live timer */}
                <div className="hud-record-center">
                  {recording && (
                    <div className="hud-live-timer">
                      <span className="red-recording-dot" />
                      <span className="timer-digits">{formatTimer(elapsed)}</span>
                    </div>
                  )}

                  {!recording ? (
                    <button className="primary-record-btn" onClick={handleStartRecord}>
                      <span className="rec-red-circle" />
                      <span className="rec-label">{t.record}</span>
                    </button>
                  ) : (
                    <div className="active-recording-actions">
                      <button
                        className="pause-record-btn"
                        onClick={isPaused ? resumeRecording : pauseRecording}
                        title={isPaused ? t.resume : t.pause}
                      >
                        {isPaused ? <Play size={16} /> : <Pause size={16} />}
                      </button>
                      <button className="stop-record-btn" onClick={stopRecording} title={t.stop}>
                        <span className="stop-white-square" />
                        <span>{t.stop}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Right: Topic selection / Change Topic */}
                <div className="hud-right-actions-stack">
                  {selectedNiche && (
                    <div className="selected-topic-pill-overlay">
                      <span className="topic-badge">{selectedNiche.badge}</span>
                      <span className="topic-text">
                        {ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn}
                      </span>
                    </div>
                  )}
                  <button
                    className="hud-topic-trigger-btn"
                    onClick={() => {
                      setShowTopicPicker(!showTopicPicker)
                      setPendingNiche(null)
                      setInPickerCategory(null)
                    }}
                  >
                    <BookOpen size={14} />
                    <span>{selectedNiche ? t.changeTopic : t.chooseTopic}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Split-Screen Review & Notes Modal */}
      {activeReviewSession && (
        <SessionReviewModal
          ui={ui}
          session={activeReviewSession}
          onUpdate={handleUpdateSession}
          onDelete={handleDeleteSession}
          onClose={() => setActiveReviewSession(null)}
        />
      )}

      {/* "Mes Prises" Management Grid */}
      <section className="recorded-sessions-section">
        <div className="section-header-row">
          <div>
            <p className="eyebrow">{ui === 'fr' ? 'HISTORIQUE VIDÉO' : 'VIDEO ARCHIVE'}</p>
            <h2>{t.takesHeading}</h2>
          </div>
          <span className="sessions-counter-badge">{sessions.length}</span>
        </div>

        {sessions.length === 0 ? (
          <div className="empty-sessions-box">
            <Video size={36} />
            <p>{t.noTakes}</p>
          </div>
        ) : (
          <div className="sessions-cards-grid">
            {sessions.map((take) => (
              <article key={take.id} className="session-grid-card">
                <div className="card-video-preview" onClick={() => setActiveReviewSession(take)}>
                  {take.mediaUrl ? (
                    <video src={take.mediaUrl} preload="metadata" playsInline />
                  ) : (
                    <div className="video-empty-preview">
                      <Video size={28} />
                    </div>
                  )}
                  <div className="preview-hover-play">
                    <Play size={22} />
                  </div>
                  <span className="preview-duration-badge">{formatTimer(take.duration)}</span>
                </div>

                <div className="card-content-area">
                  <div className="card-top-meta">
                    <span className="card-mode-chip">
                      {take.mode === 'guided'
                        ? ui === 'fr'
                          ? 'Guidé'
                          : 'Guided'
                        : ui === 'fr'
                        ? 'Libre'
                        : 'Free'}
                    </span>
                    <span className="card-date">{new Date(take.createdAt).toLocaleDateString()}</span>
                  </div>

                  <h3 className="card-session-title" onClick={() => setActiveReviewSession(take)}>
                    {take.title}
                  </h3>

                  <div className="card-footer-actions">
                    <button
                      className="card-review-link"
                      onClick={() => setActiveReviewSession(take)}
                    >
                      <FileText size={14} /> {t.openReview}
                    </button>

                    <div className="card-icon-buttons">
                      {take.mediaUrl && (
                        <a
                          href={take.mediaUrl}
                          download={`${take.title.replace(/[^a-z0-9à-ÿ]/gi, '_') || 'session'}.webm`}
                          className="icon-action-btn"
                          title={t.downloadTake}
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        className="icon-action-btn delete"
                        onClick={() => {
                          if (
                            window.confirm(
                              ui === 'fr'
                                ? 'Supprimer cette prise définitivement ?'
                                : 'Delete this take permanently?',
                            )
                          ) {
                            void handleDeleteSession(take.id)
                          }
                        }}
                        title={t.deleteTake}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
