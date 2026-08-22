import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Language, ApiSettings } from '../domain'
import { GLOBAL_CATEGORIES, GlobalTopicCategory, NicheTopic, getPromptText } from './speaking/speakingTopics'
import { useCamera } from './speaking/CameraContext'
import { TeleprompterOverlay } from './speaking/TeleprompterOverlay'
import { SpeakingWorkspace } from './speaking/SpeakingWorkspace'
import { QuickWordLookup, StageWordRequest } from './speaking/QuickWordLookup'
import { StagedWord, analyzeWordWithAi } from './speaking/wordAiService'
import { StagedWordsReviewModal } from './speaking/StagedWordsReviewModal'
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
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
  Sparkles,
  Languages,
} from 'lucide-react'

type SpeakingPageProps = {
  ui: 'fr' | 'en'
  language: Language
  api: ApiSettings
  customPrompterText?: string | null
  onConsumePrompterText?: () => void
  existingTags?: string[]
  onAiTaskChange?: (running: boolean) => void
  onSaveWord?: (args: {
    raw: string
    sentence: string
    language: Language
    translation: string
    parent: string
    pronunciation: string
    tags?: string[]
  }) => void
}

const L = {
  fr: {
    heading: 'Studio vocal',
    sub: 'Entraîne ton éloquence face caméra : lis avec prompteur ou parle librement sur des sujets variés.',
    enableCamTitle: 'Active la caméra pour commencer',
    enableCamBtn: 'Activer la caméra',
    camOff: 'Caméra désactivée',
    micOff: 'Micro désactivé',
    record: 'Enregistrer',
    stop: 'Terminer',
    pause: 'Pause',
    resume: 'Reprendre',
    chooseTopic: 'Choisir un sujet',
    changeTopic: 'Changer de sujet',
    clearTopic: 'Enlever le sujet',
    closeCam: 'Couper la caméra',
    prompterPromptTitle: 'Utiliser un prompteur ?',
    withPrompter: 'Oui',
    withoutPrompter: 'Non',
    talkingPoints: 'Pistes de réflexion :',
    takesHeading: 'Mes sessions',
    noTakes: 'Aucune prise enregistrée. Lance ta première session !',
    openReview: 'Ouvrir l’Espace Notes',
    deleteTake: 'Supprimer',
    downloadTake: 'Télécharger',
  },
  en: {
    heading: 'Voice studio',
    sub: 'Practice speaking on camera: read with a teleprompter or speak freely on various topics.',
    enableCamTitle: 'Activate the camera to get started',
    enableCamBtn: 'Activate camera',
    camOff: 'Camera off',
    micOff: 'Microphone off',
    record: 'Record',
    stop: 'Finish',
    pause: 'Pause',
    resume: 'Resume',
    chooseTopic: 'Choose a topic',
    changeTopic: 'Change topic',
    clearTopic: 'Clear topic',
    closeCam: 'Turn off camera',
    prompterPromptTitle: 'Use a teleprompter?',
    withPrompter: 'Yes',
    withoutPrompter: 'No',
    talkingPoints: 'Talking points:',
    takesHeading: 'My sessions',
    noTakes: 'No recorded takes yet. Start your very first session!',
    openReview: 'Open Notes Workspace',
    deleteTake: 'Delete',
    downloadTake: 'Download',
  },
} as const

export function SpeakingPage({
  ui,
  language,
  api,
  customPrompterText,
  onConsumePrompterText,
  existingTags = [],
  onAiTaskChange,
  onSaveWord,
}: SpeakingPageProps) {
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
    requestMediaAccess,
    stopAllMedia,
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
    clearTopic,
    sessions,
    activeReviewSession,
    setActiveReviewSession,
    handleUpdateSession,
    handleDeleteSession,
  } = useCamera()

  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [showQuickLookup, setShowQuickLookup] = useState(false)
  const [inPickerCategory, setInPickerCategory] = useState<GlobalTopicCategory | null>(null)
  const [pendingNiche, setPendingNiche] = useState<NicheTopic | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Staged words saved by AI during the session
  const [stagedWords, setStagedWords] = useState<StagedWord[]>([])
  const [showReviewModal, setShowReviewModal] = useState(false)

  const handleRequestStageWord = (req: StageWordRequest) => {
    onAiTaskChange?.(true)
    analyzeWordWithAi({
      word: req.word,
      targetLang: req.targetLang,
      uiLang: ui,
      existingTags,
      api,
      contextSentence: req.contextSentence,
      fallbackTranslation: req.fallbackTranslation,
    })
      .then((analysis) => {
        const staged: StagedWord = {
          id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          word: analysis.word || req.word,
          translation: analysis.translation,
          pronunciation: analysis.pronunciation,
          parent: analysis.parent,
          partOfSpeech: analysis.partOfSpeech,
          tags: analysis.tags,
          contextSentence: req.contextSentence,
          language: req.targetLang,
          timestamp: new Date().toISOString(),
        }
        setStagedWords((prev) => {
          const filtered = prev.filter((w) => w.word.toLowerCase() !== staged.word.toLowerCase())
          return [...filtered, staged]
        })
      })
      .catch((err) => {
        console.error('[SpeakingPage] Background AI analysis error:', err)
      })
      .finally(() => {
        onAiTaskChange?.(false)
      })
  }

  const handleStageWord = (word: StagedWord) => {
    setStagedWords((prev) => {
      const filtered = prev.filter((w) => w.word.toLowerCase() !== word.word.toLowerCase())
      return [...filtered, word]
    })
  }

  const handleApproveWord = (stagedWord: StagedWord) => {
    if (onSaveWord) {
      onSaveWord({
        raw: stagedWord.word,
        sentence: stagedWord.contextSentence || '',
        language: stagedWord.language || language,
        translation: stagedWord.translation,
        parent: stagedWord.parent,
        pronunciation: stagedWord.pronunciation,
        tags: stagedWord.tags,
      })
    }
    setStagedWords((prev) => prev.filter((w) => w.id !== stagedWord.id))
  }

  const handleDiscardWord = (wordId: string) => {
    setStagedWords((prev) => prev.filter((w) => w.id !== wordId))
  }

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const studioContainerRef = useRef<HTMLDivElement>(null)

  // If customPrompterText is passed (from Writing "Pratiquer à l'oral"), enable prompter, auto-start camera, and consume once
  useEffect(() => {
    if (customPrompterText && customPrompterText.trim()) {
      setShowPrompter(true)
      if (!cameraActive) {
        void requestMediaAccess()
      }
      onConsumePrompterText?.()
    }
  }, [customPrompterText, setShowPrompter, cameraActive, requestMediaAccess, onConsumePrompterText])

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && stream) {
      node.srcObject = stream
      void node.play().catch(() => undefined)
    }
  }, [stream])

  // Attach active stream to video element whenever stream, camera status or review view changes
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream
      }
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream, cameraActive, activeReviewSession])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined)
      }
    }
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

  // If a session is open in the notes workspace, render the full workspace view!
  if (activeReviewSession) {
    return (
      <div className="page speaking-page">
        <SpeakingWorkspace
          ui={ui}
          session={activeReviewSession}
          onUpdate={handleUpdateSession}
          onDelete={handleDeleteSession}
          onBack={() => setActiveReviewSession(null)}
        />
      </div>
    )
  }

  // Reusable bottom control bar (rendered standalone or integrated into prompter)
  const renderControls = (inPrompter: boolean) => (
    <div className={`hud-bottom-bar ${inPrompter ? 'in-prompter' : ''}`}>
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
        <button
          className={`device-btn ${showQuickLookup ? 'active' : ''}`}
          onClick={() => {
            setShowQuickLookup(!showQuickLookup)
            setShowTopicPicker(false)
          }}
          title={ui === 'fr' ? 'Dictionnaire & Traduction' : 'Dictionary & Translation'}
        >
          <Languages size={16} />
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

      {/* Right: Topic selection & Clear Topic button */}
      <div className="hud-right-actions-stack">
        {selectedNiche && !inPrompter && (
          <>
            {/* Directive Talking Points (when without prompter) */}
            <div className="topic-directives-card">
              <div className="directives-title">
                <Sparkles size={12} />
                <span>{t.talkingPoints}</span>
              </div>
              <ul className="directives-list">
                {(ui === 'fr' ? selectedNiche.angles : selectedNiche.anglesEn).map((angle, idx) => (
                  <li key={idx}>{angle}</li>
                ))}
              </ul>
            </div>

            <div className="selected-topic-pill-overlay">
              <span className="topic-badge">{selectedNiche.badge}</span>
              <span className="topic-text">
                {ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn}
              </span>
            </div>
          </>
        )}

        <div className="hud-topic-btn-group">
          {selectedNiche && !showPrompter && (
            <button
              className="hud-topic-clear-btn"
              onClick={clearTopic}
              title={t.clearTopic}
            >
              <X size={14} />
            </button>
          )}

          <button
            className="hud-topic-trigger-btn"
            onClick={() => {
              setShowTopicPicker(!showTopicPicker)
              setShowQuickLookup(false)
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
  )

  return (
    <div className="page speaking-page">
      {/* Header */}
      <header className="page-header">
        <div>
          <h1>{t.heading}</h1>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <section className="studio-stage-wrapper">
        <div
          ref={studioContainerRef}
          className={`studio-camera-viewport ${cameraActive ? 'active' : 'inactive'} ${isFullscreen ? 'fullscreen' : ''}`}
        >
          {/* Active Live Video */}
          {cameraActive && (
            <video
              ref={setVideoRef}
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

          {/* Inactive Camera State */}
          {!cameraActive && (
            <div className="studio-dashed-auth-box">
              <div className="dashed-auth-inner">
                <div className="dashed-cam-icon">
                  <Camera size={28} />
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
                background: `radial-gradient(ellipse at center, rgba(14, 18, 26, 0) 0%, rgba(10, 12, 18, ${overlayOpacity}) 100%)`,
              }}
            >
              {/* HUD Top Bar */}
              <div className="hud-top-bar">
                <div className="hud-top-left-actions" />

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

                  {/* Fullscreen Button */}
                  <button
                    className="hud-glass-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                  >
                    {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>

                  {/* Close / Turn Off Camera Button */}
                  <button
                    className="hud-glass-btn close-cam"
                    onClick={stopAllMedia}
                    title={t.closeCam}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Bottom-Right In-Place Topic Selection Drawer (Does NOT mask camera) */}
              {showTopicPicker && (
                <div
                  className="in-place-topic-drawer"
                  style={{
                    backgroundColor: 'rgba(15, 20, 28, 0.75)',
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

              {/* Minimalist Transparent Prompter Integrated with Controls */}
              {showPrompter && (selectedNiche || customPrompterText) ? (
                <TeleprompterOverlay
                  text={customPrompterText || (selectedNiche ? getPromptText(selectedNiche, language) : '')}
                  opacity={overlayOpacity}
                  onClose={() => setShowPrompter(false)}
                >
                  {renderControls(true)}
                </TeleprompterOverlay>
              ) : (
                /* Standalone Bottom Bar when Prompter is not shown */
                renderControls(false)
              )}

              {/* Quick Word & Phrase Lookup Drawer (Minimalist / Bottom-Left) */}
              <QuickWordLookup
                isOpen={showQuickLookup}
                onClose={() => setShowQuickLookup(false)}
                language={language}
                ui={ui}
                api={api}
                existingTags={existingTags}
                onRequestStageWord={handleRequestStageWord}
              />
            </div>
          )}
        </div>
      </section>

      {/* "Mes sessions" Management Grid */}
      <section className="recorded-sessions-section">
        <div className="section-header-row">
          <h2>{t.takesHeading}</h2>
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

      {/* Bottom-Left Visual Notification for Staged AI Words */}
      {stagedWords.length > 0 && (
        <aside
          className="speaking-staged-notification glass"
          onClick={() => setShowReviewModal(true)}
          title="Cliquer pour revoir et valider les fiches de vocabulaire générées par l'IA"
          role="button"
          tabIndex={0}
        >
          <div className="staged-notif-icon-wrap">
            <Sparkles size={16} />
            <span className="staged-notif-pulse-dot" />
          </div>
          <div className="staged-notif-content">
            <strong className="staged-notif-title">
              {stagedWords.length === 1
                ? ui === 'fr'
                  ? '1 mot enregistré à revoir'
                  : '1 saved word to review'
                : ui === 'fr'
                ? `${stagedWords.length} mots enregistrés à revoir`
                : `${stagedWords.length} saved words to review`}
            </strong>
            <span className="staged-notif-sub">
              {ui === 'fr' ? 'Clique pour valider la fiche IA' : 'Click to review AI card'}
            </span>
          </div>
          <button
            type="button"
            className="staged-notif-cta"
            onClick={(e) => {
              e.stopPropagation()
              setShowReviewModal(true)
            }}
          >
            {ui === 'fr' ? 'Revoir' : 'Review'}
          </button>
        </aside>
      )}

      {/* Review & Approve Modal */}
      <StagedWordsReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        stagedWords={stagedWords}
        language={language}
        api={api}
        existingTags={existingTags}
        onApprove={handleApproveWord}
        onDiscard={handleDiscardWord}
      />
    </div>
  )
}
