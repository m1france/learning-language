import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { Language, ApiSettings } from '../domain'
import {
  GLOBAL_CATEGORIES,
  IMPROV_CHALLENGES,
  GlobalTopicCategory,
  NicheTopic,
  getPromptText,
  getChallengeText,
} from './speaking/speakingTopics'
import {
  SpeakingSessionRecord,
  saveSpeakingSession,
  getAllSpeakingSessions,
  deleteSpeakingSession,
  updateSpeakingSession,
} from './speaking/speakingStorage'
import { ImprovWheel } from './speaking/ImprovWheel'
import { TeleprompterOverlay } from './speaking/TeleprompterOverlay'
import { SessionReviewModal } from './speaking/SessionReviewModal'
import {
  Sparkles,
  BookOpen,
  Zap,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  RotateCcw,
  Sliders,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  Pause,
  Trash2,
  Download,
  FileText,
  Clock,
  Check,
  Video,
  Layers,
  HelpCircle,
} from 'lucide-react'

type Mode = 'free' | 'guided' | 'challenge'

const L = {
  fr: {
    heading: 'Studio vocal & vidéo',
    sub: 'Entraîne ton éloquence face caméra : en roue libre, guidé par un prompteur, ou au hasard d’un défi.',
    free: 'Texte libre',
    freeHint: 'Parle librement de ce que tu veux, sans contrainte.',
    guided: 'Texte guidé',
    guidedHint: 'Choisis un domaine, tes sujets de niche et ton prompteur.',
    challenge: 'Défi improvisé',
    challengeHint: 'La roue aux 55 sujets insolites pour tester ta répartie.',
    enableCam: 'Activer la caméra & le micro',
    camPrompt: 'Autorise l’accès à ta caméra et ton micro pour lancer le studio.',
    camOff: 'Caméra désactivée',
    micOff: 'Micro désactivé',
    record: 'Enregistrer',
    stop: 'Terminer',
    pause: 'Pause',
    resume: 'Reprendre',
    changeTopic: 'Changer de sujet',
    spinWheel: 'Faire tourner la roue',
    chooseTopic: 'Choisir un domaine & sujet',
    prompterPromptTitle: 'Utiliser un prompteur ?',
    prompterPromptDesc: 'Préfères-tu lire un texte structuré ou t’exprimer librement sur ce sujet ?',
    withPrompter: 'Oui, avec prompteur',
    withoutPrompter: 'Non, sans prompteur',
    takesHeading: 'Mes Prises & Enregistrements',
    noTakes: 'Aucune prise enregistrée. Lance ta première session !',
    openReview: 'Ouvrir l’Espace Notes',
    deleteTake: 'Supprimer',
    downloadTake: 'Télécharger',
    opacityControl: 'Opacité de l’overlay',
    anglesTitle: 'Pistes pour structurer ta pensée :',
  },
  en: {
    heading: 'Voice & Video Studio',
    sub: 'Practice your speaking on camera: free-form, guided with a teleprompter, or through improv challenges.',
    free: 'Free Speech',
    freeHint: 'Talk freely about anything you want with zero constraints.',
    guided: 'Guided Text',
    guidedHint: 'Pick a category, niche topics, and optional teleprompter.',
    challenge: 'Improv Challenge',
    challengeHint: 'A 55-topic fortune wheel to test your spontaneous speaking.',
    enableCam: 'Enable Camera & Microphone',
    camPrompt: 'Grant browser permission to camera and microphone to start.',
    camOff: 'Camera off',
    micOff: 'Microphone off',
    record: 'Record',
    stop: 'Finish',
    pause: 'Pause',
    resume: 'Resume',
    changeTopic: 'Change topic',
    spinWheel: 'Spin the wheel',
    chooseTopic: 'Choose category & topic',
    prompterPromptTitle: 'Use a teleprompter?',
    prompterPromptDesc: 'Would you like a prepared text to scroll or speak freely with topic prompts?',
    withPrompter: 'Yes, with prompter',
    withoutPrompter: 'No, speak freely',
    takesHeading: 'My Takes & Recordings',
    noTakes: 'No recorded takes yet. Start your very first session!',
    openReview: 'Open Notes Workspace',
    deleteTake: 'Delete',
    downloadTake: 'Download',
    opacityControl: 'Overlay opacity',
    anglesTitle: 'Key ideas to structure your talk:',
  },
} as const

export function SpeakingPage({
  ui,
  language,
}: {
  ui: 'fr' | 'en'
  language: Language
  api: ApiSettings
}) {
  const t = L[ui]
  const [mode, setMode] = useState<Mode>('free')

  // Stream & Recording state
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [cameraDisabled, setCameraDisabled] = useState(false)
  const [recording, setRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)

  // Guided Mode state
  const [selectedCategory, setSelectedCategory] = useState<GlobalTopicCategory | null>(null)
  const [selectedNiche, setSelectedNiche] = useState<NicheTopic | null>(null)
  const [showTopicPicker, setShowTopicPicker] = useState(false)
  const [showPrompterChoiceModal, setShowPrompterChoiceModal] = useState(false)
  const [showPrompter, setShowPrompter] = useState(false)

  // Challenge Mode state
  const [showWheel, setShowWheel] = useState(false)
  const [currentChallenge, setCurrentChallenge] = useState<typeof IMPROV_CHALLENGES[0] | null>(null)

  // HUD Glassmorphism settings
  const [overlayOpacity, setOverlayOpacity] = useState(0.82)
  const [showHudSettings, setShowHudSettings] = useState(false)

  // Saved sessions & Review modal
  const [sessions, setSessions] = useState<SpeakingSessionRecord[]>([])
  const [activeReviewSession, setActiveReviewSession] = useState<SpeakingSessionRecord | null>(null)

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Load saved sessions on mount
  useEffect(() => {
    void getAllSpeakingSessions().then((list) => {
      setSessions(list)
    })
  }, [])

  // Clean up media streams and timers on unmount
  useEffect(() => {
    return () => {
      stopAllMedia()
    }
  }, [])

  // Connect stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream])

  // Setup Audio Visualizer VU-Meter
  const setupAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    try {
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      const source = audioCtx.createMediaStreamSource(mediaStream)
      source.connect(analyser)

      audioContextRef.current = audioCtx
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
        animFrameRef.current = requestAnimationFrame(updateMeter)
      }

      updateMeter()
    } catch {
      // AudioContext not available or blocked
    }
  }, [])

  const stopAllMedia = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    setStream(null)
    setCameraActive(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }

  // Request user camera & mic permission
  const requestMediaAccess = async () => {
    try {
      setPermissionError(null)
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      setStream(media)
      setCameraActive(true)
      setCameraDisabled(false)
      setMicMuted(false)
      setupAudioAnalyser(media)
    } catch (err) {
      console.error('Error requesting media stream:', err)
      setPermissionError(
        ui === 'fr'
          ? 'Impossible d’accéder à la caméra ou au microphone. Vérifie les autorisations de ton navigateur.'
          : 'Unable to access camera or microphone. Please check your browser permissions.',
      )
    }
  }

  // Toggle Camera video track
  const toggleCameraTrack = () => {
    if (!stream) return
    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length > 0) {
      const nextState = !videoTracks[0].enabled
      videoTracks[0].enabled = nextState
      setCameraDisabled(!nextState)
    }
  }

  // Toggle Mic audio track
  const toggleMicTrack = () => {
    if (!stream) return
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length > 0) {
      const nextState = !audioTracks[0].enabled
      audioTracks[0].enabled = nextState
      setMicMuted(!nextState)
    }
  }

  // Recording controls with MediaRecorder
  const startRecording = async () => {
    if (!stream) {
      await requestMediaAccess()
    }
    const currentStream = stream
    if (!currentStream) return

    try {
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m))
      const recorder = supportedMime
        ? new MediaRecorder(currentStream, { mimeType: supportedMime })
        : new MediaRecorder(currentStream)

      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        const mime = recorder.mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        chunksRef.current = []

        if (blob.size > 0) {
          const finalDuration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
          let sessionTitle = ''
          let topicId = ''
          let topicName = ''

          if (mode === 'guided' && selectedNiche) {
            topicId = selectedNiche.id
            topicName = ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn
            sessionTitle = topicName
          } else if (mode === 'challenge' && currentChallenge) {
            topicId = `challenge-${currentChallenge.id}`
            topicName = `${currentChallenge.category}: #${currentChallenge.id}`
            sessionTitle = getChallengeText(currentChallenge, language)
          } else {
            sessionTitle = ui === 'fr' ? 'Session libre' : 'Free session'
          }

          const newSessionRecord = await saveSpeakingSession({
            id: `rec-${Date.now()}`,
            title: sessionTitle,
            mode,
            topicId,
            topicName,
            duration: finalDuration,
            createdAt: new Date().toISOString(),
            kind: 'video',
            notes: '',
            timestamps: [],
            tags: [mode === 'guided' ? 'Guidé' : mode === 'challenge' ? 'Défi' : 'Libre'],
            ratings: { fluency: 4, pronunciation: 4, confidence: 4 },
            blob,
          })

          setSessions((prev) => [newSessionRecord, ...prev])
        }

        setRecording(false)
        setIsPaused(false)
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
      }

      recorderRef.current = recorder
      startTimeRef.current = Date.now()
      setElapsed(0)
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000))
      }, 500)

      recorder.start(500)
      setRecording(true)
      setIsPaused(false)
    } catch (err) {
      console.error('Error starting MediaRecorder:', err)
    }
  }

  const pauseRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause()
      setIsPaused(true)
    }
  }

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume()
      setIsPaused(false)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Handle guided subtopic selection
  const handleSelectNiche = (niche: NicheTopic) => {
    setSelectedNiche(niche)
    setShowTopicPicker(false)
    setShowPrompterChoiceModal(true)
  }

  // Handle session updates from Review modal
  const handleUpdateSession = async (updated: SpeakingSessionRecord) => {
    await updateSpeakingSession(updated.id, {
      title: updated.title,
      notes: updated.notes,
      timestamps: updated.timestamps,
      tags: updated.tags,
      ratings: updated.ratings,
    })
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    setActiveReviewSession(updated)
  }

  const handleDeleteSession = async (id: string) => {
    await deleteSpeakingSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeReviewSession?.id === id) {
      setActiveReviewSession(null)
    }
  }

  const modeCards: { id: Mode; title: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'free', title: t.free, hint: t.freeHint, icon: <Sparkles size={20} /> },
    { id: 'guided', title: t.guided, hint: t.guidedHint, icon: <BookOpen size={20} /> },
    { id: 'challenge', title: t.challenge, hint: t.challengeHint, icon: <Zap size={20} /> },
  ]

  return (
    <div className="page speaking-page">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="eyebrow">{ui === 'fr' ? 'PARLER & STUDIO VOCAL' : 'SPEAK & VOICE STUDIO'}</p>
          <h1>{t.heading}</h1>
          <p className="subhead">{t.sub}</p>
        </div>
        <div className="header-right-badges">
          <span className="session-count-pill">
            <Video size={14} /> {sessions.length} {ui === 'fr' ? 'prises' : 'takes'}
          </span>
        </div>
      </header>

      {/* 3 Modes Bar */}
      <section className="mode-selector-grid">
        {modeCards.map((card) => (
          <button
            key={card.id}
            className={`mode-selector-card ${mode === card.id ? 'active' : ''}`}
            onClick={() => {
              setMode(card.id)
              if (card.id === 'guided' && !selectedNiche) {
                setShowTopicPicker(true)
              }
              if (card.id === 'challenge' && !currentChallenge) {
                setShowWheel(true)
              }
            }}
          >
            <div className="mode-card-icon">{card.icon}</div>
            <div className="mode-card-text">
              <strong>{card.title}</strong>
              <small>{card.hint}</small>
            </div>
            {mode === card.id && <span className="active-dot" />}
          </button>
        ))}
      </section>

      {/* Main Full-Size Video Studio Stage */}
      <section className="studio-stage-wrapper">
        <div className="studio-camera-viewport">
          {/* Active Live Camera Stream */}
          {cameraActive && (
            <video
              ref={videoRef}
              className={`studio-live-video ${cameraDisabled ? 'disabled' : ''}`}
              autoPlay
              muted
              playsInline
            />
          )}

          {/* Camera Disabled / Off Placeholder */}
          {cameraActive && cameraDisabled && (
            <div className="studio-black-screen">
              <CameraOff size={42} />
              <p>{t.camOff}</p>
            </div>
          )}

          {/* Initial Authorization View if Camera not started */}
          {!cameraActive && (
            <div className="studio-auth-placeholder">
              <div className="studio-auth-glow" />
              <div className="studio-auth-card">
                <div className="studio-cam-icon-halo">
                  <Camera size={34} />
                </div>
                <h3>{t.enableCam}</h3>
                <p>{t.camPrompt}</p>
                {permissionError && <p className="studio-auth-error">{permissionError}</p>}
                <button className="studio-auth-btn" onClick={() => void requestMediaAccess()}>
                  <Sparkles size={16} /> {t.enableCam}
                </button>
              </div>
            </div>
          )}

          {/* Web3 Glassmorphism HUD Overlay (Active Camera) */}
          {cameraActive && (
            <div
              className="studio-glass-hud"
              style={{
                background: `radial-gradient(ellipse at center, rgba(14, 18, 26, ${Math.max(0, overlayOpacity - 0.45)}) 0%, rgba(10, 12, 18, ${overlayOpacity}) 100%)`,
              }}
            >
              {/* HUD Top Bar */}
              <div className="hud-top-bar">
                <div className="hud-mode-badge">
                  <span className="mode-tag">
                    {mode === 'guided' ? <BookOpen size={13} /> : mode === 'challenge' ? <Zap size={13} /> : <Sparkles size={13} />}
                    {mode === 'guided' ? t.guided : mode === 'challenge' ? t.challenge : t.free}
                  </span>
                  <span className="lang-tag">{language.toUpperCase()}</span>
                </div>

                <div className="hud-top-right-tools">
                  {/* VU-Meter Live Audio Level */}
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

                  {/* HUD Opacity Slider Toggle */}
                  <button
                    className={`hud-glass-btn ${showHudSettings ? 'active' : ''}`}
                    onClick={() => setShowHudSettings(!showHudSettings)}
                    title={t.opacityControl}
                  >
                    <Sliders size={14} />
                  </button>

                  {/* Settings popup */}
                  {showHudSettings && (
                    <div className="hud-opacity-popover">
                      <label>
                        <span>{t.opacityControl}</span>
                        <input
                          type="range"
                          min="0.15"
                          max="0.95"
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

              {/* HUD Center / Mode Context Details */}
              <div className="hud-center-stage">
                {/* Mode 2 (Guided) : Centered badge if "without prompter" was chosen */}
                {mode === 'guided' && selectedNiche && !showPrompter && (
                  <div className="guided-centered-card">
                    <div className="niche-card-header">
                      <span className="niche-badge">{selectedNiche.badge}</span>
                      <h4>{ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn}</h4>
                    </div>
                    <div className="niche-angles-box">
                      <p className="angles-title">{t.anglesTitle}</p>
                      <ul>
                        {(ui === 'fr' ? selectedNiche.angles : selectedNiche.anglesEn).map((angle, i) => (
                          <li key={i}>{angle}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="niche-card-actions">
                      <button className="niche-action-pill" onClick={() => setShowTopicPicker(true)}>
                        <Layers size={13} /> {t.changeTopic}
                      </button>
                      <button className="niche-action-pill highlight" onClick={() => setShowPrompter(true)}>
                        <FileText size={13} /> {t.withPrompter}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode 3 (Challenge) : Display active chosen challenge */}
                {mode === 'challenge' && currentChallenge && (
                  <div className="challenge-hud-card">
                    <div className="challenge-tag-row">
                      <span className="challenge-chip">{currentChallenge.category}</span>
                      <span className="challenge-num">#{currentChallenge.id}</span>
                    </div>
                    <h3>“{getChallengeText(currentChallenge, language)}”</h3>
                    <div className="challenge-hud-actions">
                      <button className="challenge-btn-ghost" onClick={() => setShowWheel(true)}>
                        <RotateCcw size={13} /> {t.spinWheel}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode 3 (Challenge) : Prompt to spin if no challenge is active */}
                {mode === 'challenge' && !currentChallenge && (
                  <button className="spin-wheel-launch-btn" onClick={() => setShowWheel(true)}>
                    <Zap size={18} />
                    <span>{t.spinWheel}</span>
                  </button>
                )}

                {/* Mode 2 (Guided) : Prompt to pick a topic if none selected */}
                {mode === 'guided' && !selectedNiche && !showTopicPicker && (
                  <button className="spin-wheel-launch-btn" onClick={() => setShowTopicPicker(true)}>
                    <BookOpen size={18} />
                    <span>{t.chooseTopic}</span>
                  </button>
                )}
              </div>

              {/* Guided Mode: Bottom-Right Topic Selection Drawer/Overlay */}
              {mode === 'guided' && showTopicPicker && (
                <div
                  className="guided-picker-bottom-right"
                  style={{
                    background: `rgba(15, 20, 28, ${Math.min(0.96, overlayOpacity + 0.15)})`,
                  }}
                >
                  <div className="picker-drawer-header">
                    {selectedCategory ? (
                      <button className="picker-back-btn" onClick={() => setSelectedCategory(null)}>
                        <ChevronLeft size={16} /> {ui === 'fr' ? 'Domaines' : 'Categories'}
                      </button>
                    ) : (
                      <strong className="picker-heading">
                        <Layers size={14} /> {ui === 'fr' ? 'Choisis un domaine' : 'Pick a domain'}
                      </strong>
                    )}
                    <button className="picker-close-btn" onClick={() => setShowTopicPicker(false)}>
                      <X size={15} />
                    </button>
                  </div>

                  <div className="picker-drawer-content">
                    {/* Level 1: Global Categories */}
                    {!selectedCategory && (
                      <div className="global-categories-list">
                        {GLOBAL_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            className="global-cat-row"
                            onClick={() => setSelectedCategory(cat)}
                          >
                            <span className="cat-icon">{cat.icon}</span>
                            <div className="cat-info">
                              <strong>{ui === 'fr' ? cat.title : cat.titleEn}</strong>
                              <small>{ui === 'fr' ? cat.description : cat.descriptionEn}</small>
                            </div>
                            <ChevronRight size={16} className="arrow" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Level 2: Niche Subtopics */}
                    {selectedCategory && (
                      <div className="niche-subtopics-list">
                        <p className="subtopics-category-title">
                          {selectedCategory.icon} {ui === 'fr' ? selectedCategory.title : selectedCategory.titleEn}
                        </p>
                        {selectedCategory.subtopics.map((sub) => (
                          <button
                            key={sub.id}
                            className="niche-topic-row"
                            onClick={() => handleSelectNiche(sub)}
                          >
                            <div className="niche-info">
                              <span className="badge">{sub.badge}</span>
                              <strong>{ui === 'fr' ? sub.title : sub.titleEn}</strong>
                            </div>
                            <ChevronRight size={15} className="arrow" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guided Mode: Prompter Choice Modal (Oui / Non) */}
              {showPrompterChoiceModal && selectedNiche && (
                <div
                  className="prompter-choice-backdrop"
                  onClick={(e) => e.target === e.currentTarget && setShowPrompterChoiceModal(false)}
                >
                  <div className="prompter-choice-dialog">
                    <span className="dialog-icon-sparkle">
                      <Sparkles size={24} />
                    </span>
                    <h3>{t.prompterPromptTitle}</h3>
                    <p className="dialog-topic-name">
                      “{ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn}”
                    </p>
                    <p className="dialog-desc">{t.prompterPromptDesc}</p>

                    <div className="dialog-choice-buttons">
                      <button
                        className="choice-btn secondary"
                        onClick={() => {
                          setShowPrompterChoiceModal(false)
                          setShowPrompter(false)
                        }}
                      >
                        {t.withoutPrompter}
                      </button>
                      <button
                        className="choice-btn primary"
                        onClick={() => {
                          setShowPrompterChoiceModal(false)
                          setShowPrompter(true)
                        }}
                      >
                        <Play size={14} /> {t.withPrompter}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Teleprompter Overlay */}
              {showPrompter && selectedNiche && (
                <TeleprompterOverlay
                  ui={ui}
                  text={getPromptText(selectedNiche, language)}
                  title={ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn}
                  badge={selectedNiche.badge}
                  language={language}
                  recording={recording}
                  onClose={() => setShowPrompter(false)}
                />
              )}

              {/* HUD Bottom Bar: Recording Controls */}
              <div className="hud-bottom-bar">
                {/* Left Device Controls */}
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

                {/* Central Record Trigger */}
                <div className="hud-record-center">
                  {recording && (
                    <div className="hud-live-timer">
                      <span className="red-recording-dot" />
                      <span className="timer-digits">{formatTimer(elapsed)}</span>
                    </div>
                  )}

                  {!recording ? (
                    <button className="primary-record-btn" onClick={() => void startRecording()}>
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

                {/* Right Mode Actions */}
                <div className="hud-right-actions">
                  {mode === 'guided' && (
                    <button
                      className="hud-quick-btn"
                      onClick={() => setShowTopicPicker(!showTopicPicker)}
                    >
                      <BookOpen size={14} />
                      <span>{t.changeTopic}</span>
                    </button>
                  )}
                  {mode === 'challenge' && (
                    <button className="hud-quick-btn" onClick={() => setShowWheel(true)}>
                      <Zap size={14} />
                      <span>{t.spinWheel}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Wheel of Fortune Modal */}
      {showWheel && (
        <ImprovWheel
          ui={ui}
          language={language}
          onSelectChallenge={(ch) => setCurrentChallenge(ch)}
          onClose={() => setShowWheel(false)}
        />
      )}

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

      {/* "Tes Prises" Management Grid */}
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
            {sessions.map((take, index) => (
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
                        : take.mode === 'challenge'
                        ? ui === 'fr'
                          ? 'Défi'
                          : 'Challenge'
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
