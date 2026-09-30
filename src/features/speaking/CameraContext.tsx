import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { Language, ApiSettings, UiLanguage } from '../../domain'
import { GlobalTopicCategory, NicheTopic, getPromptText } from './speakingTopics'
import {
  SpeakingSessionRecord,
  type SpeakingSessionPatch,
  type TranscriptSegment,
  saveSpeakingSession,
  getAllSpeakingSessions,
  deleteSpeakingSession,
  updateSpeakingSession,
} from './speakingStorage'
import { coachSpeakingSession } from './speakingCoachService'
import { planTranscription, tidySegments, transcribeRecording, wantsLiveCaptions } from './transcriptionService'
import { createLiveTranscriber, isIOS, speechRecognitionSupported } from '../../lib/speech'
import { getLanguageBcp47 } from '../../languages'
import { resolveLlm } from '../../lib/llm'

type CameraContextType = {
  stream: MediaStream | null
  cameraActive: boolean
  cameraDisabled: boolean
  micMuted: boolean
  recording: boolean
  isPaused: boolean
  elapsed: number
  audioLevel: number
  permissionError: string | null
  overlayOpacity: number
  setOverlayOpacity: (val: number) => void
  requestMediaAccess: () => Promise<boolean>
  stopAllMedia: () => void
  toggleCameraTrack: () => void
  toggleMicTrack: () => void
  facingMode: 'user' | 'environment'
  flipCamera: () => Promise<void>
  
  // Countdown & Recording
  isCountingDown: boolean
  countdownSeconds: number
  startRecordingWithCountdown: (onBeforeStart?: () => void) => void
  stopRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void

  // Topic selection & Prompter
  selectedCategory: GlobalTopicCategory | null
  setSelectedCategory: (cat: GlobalTopicCategory | null) => void
  selectedNiche: NicheTopic | null
  setSelectedNiche: (niche: NicheTopic | null) => void
  showPrompter: boolean
  setShowPrompter: (show: boolean) => void
  clearTopic: () => void

  // Sessions
  sessions: SpeakingSessionRecord[]
  setSessions: React.Dispatch<React.SetStateAction<SpeakingSessionRecord[]>>
  activeReviewSession: SpeakingSessionRecord | null
  setActiveReviewSession: (session: SpeakingSessionRecord | null) => void
  handleUpdateSession: (updated: SpeakingSessionRecord) => Promise<void>
  handleDeleteSession: (id: string) => Promise<void>
  /** Saves a partial change (notes, title, transcript…) without touching the rest. */
  patchSession: (id: string, patch: SpeakingSessionPatch) => Promise<void>
  transcribeSession: (sessionId: string) => Promise<void>
  triggerSessionAnalysis: (sessionId: string) => Promise<void>
  /** Words recognised live while recording (browser captions). */
  liveCaption: string
  liveCaptionsOn: boolean
}

const CameraContext = createContext<CameraContextType | null>(null)

export function CameraProvider({
  children,
  language,
  ui = 'fr',
  api,
}: {
  children: React.ReactNode
  language: Language
  ui?: UiLanguage
  api?: ApiSettings
}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraDisabled, setCameraDisabled] = useState(false)
  const [micMuted, setMicMuted] = useState(false)
  const [recording, setRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [overlayOpacity, setOverlayOpacity] = useState(0.1) // Default 10%
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Countdown state
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [countdownSeconds, setCountdownSeconds] = useState(5)

  // Topic & Prompter
  const [selectedCategory, setSelectedCategory] = useState<GlobalTopicCategory | null>(null)
  const [selectedNiche, setSelectedNiche] = useState<NicheTopic | null>(null)
  const [showPrompter, setShowPrompter] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState<SpeakingSessionRecord[]>([])
  const [activeReviewSession, setActiveReviewSession] = useState<SpeakingSessionRecord | null>(null)

  // Refs
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const countdownIntervalRef = useRef<number | null>(null)
  const pausedAtRef = useRef<number | null>(null)
  const pausedTotalRef = useRef(0)
  const liveRef = useRef<ReturnType<typeof createLiveTranscriber> | null>(null)
  const liveSegmentsRef = useRef<TranscriptSegment[]>([])
  const sessionsRef = useRef<SpeakingSessionRecord[]>([])
  const apiRef = useRef(api)
  apiRef.current = api
  const [liveCaption, setLiveCaption] = useState('')
  const [liveCaptionsOn, setLiveCaptionsOn] = useState(false)

  /** Recording clock in seconds, pauses excluded. */
  const recordingClock = useCallback(() => {
    const pausedNow = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0
    return Math.max(0, (Date.now() - startTimeRef.current - pausedTotalRef.current - pausedNow) / 1000)
  }, [])

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  // Load saved sessions on mount
  useEffect(() => {
    void getAllSpeakingSessions().then((list) => {
      setSessions(list)
    })
  }, [])

  // Audio analyser setup
  const setupAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    try {
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined)
      }
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
      // AudioContext not available
    }
  }, [])

  const stopAllMedia = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    setStream(null)
    setCameraActive(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = null
    setIsCountingDown(false)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
  }, [])

  const requestMediaAccess = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionError(null)
      if (streamRef.current && streamRef.current.active) {
        setCameraActive(true)
        return true
      }
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = media
      setStream(media)
      setCameraActive(true)
      setCameraDisabled(false)
      setMicMuted(false)
      setupAudioAnalyser(media)
      return true
    } catch (err) {
      console.error('Error requesting media stream:', err)
      setPermissionError('Impossible d’accéder à la caméra ou au microphone. Vérifie les autorisations de ton navigateur.')
      return false
    }
  }, [setupAudioAnalyser])

  const toggleCameraTrack = useCallback(() => {
    if (!streamRef.current) return
    const videoTracks = streamRef.current.getVideoTracks()
    if (videoTracks.length > 0) {
      const nextState = !videoTracks[0].enabled
      videoTracks[0].enabled = nextState
      setCameraDisabled(!nextState)
    }
  }, [])

  const toggleMicTrack = useCallback(() => {
    if (!streamRef.current) return
    const audioTracks = streamRef.current.getAudioTracks()
    if (audioTracks.length > 0) {
      const nextState = !audioTracks[0].enabled
      audioTracks[0].enabled = nextState
      setMicMuted(!nextState)
    }
  }, [])

  const flipCamera = useCallback(async () => {
    const nextFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(nextFacing)
    if (streamRef.current) {
      const oldVideoTracks = streamRef.current.getVideoTracks()
      try {
        const newMedia = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        const newVideoTrack = newMedia.getVideoTracks()[0]
        if (newVideoTrack) {
          oldVideoTracks.forEach((t) => t.stop())
          const audioTracks = streamRef.current.getAudioTracks()
          const combined = new MediaStream([...audioTracks, newVideoTrack])
          streamRef.current = combined
          setStream(combined)
          setCameraActive(true)
          setCameraDisabled(false)
        }
      } catch (err) {
        console.error('Error flipping camera:', err)
      }
    }
  }, [facingMode])

  const doStartRecordingNow = useCallback(() => {
    const currentStream = streamRef.current
    if (!currentStream) return

    try {
      const mimeCandidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
      let supportedMime = ''
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        supportedMime = mimeCandidates.find((m) => {
          try { return MediaRecorder.isTypeSupported(m) } catch { return false }
        }) || ''
      }
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
        const finalDuration = Math.max(1, Math.round(recordingClock()))
        pausedAtRef.current = null

        setRecording(false)
        setIsPaused(false)
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null

        // Let the live captions finalise their last words before saving.
        await liveRef.current?.stop()
        liveRef.current = null
        setLiveCaption('')
        setLiveCaptionsOn(false)
        const liveSegments = tidySegments(liveSegmentsRef.current.map((segment) => ({ ...segment, end: Math.min(segment.end, finalDuration) })))
        liveSegmentsRef.current = []

        if (blob.size === 0) return

        const record = await saveSpeakingSession({
          id: `rec-${Date.now()}`,
          title: selectedNiche ? (ui === 'fr' ? selectedNiche.title : selectedNiche.titleEn || selectedNiche.title) : ui === 'fr' ? 'Session libre' : 'Free session',
          mode: selectedNiche ? 'guided' : 'free',
          topicId: selectedNiche?.id,
          topicName: selectedNiche?.title,
          duration: finalDuration,
          createdAt: new Date().toISOString(),
          kind: 'video',
          notes: '',
          timestamps: [],
          tags: [selectedNiche ? 'Guidé' : 'Libre'],
          ratings: { fluency: 0, pronunciation: 0, confidence: 0 },
          blob,
          language,
          analysisStatus: 'idle',
          transcriptStatus: liveSegments.length ? 'done' : 'idle',
          transcript: liveSegments.length
            ? { segments: liveSegments, engine: 'browser', language, createdAt: new Date().toISOString() }
            : undefined,
        })
        setSessions((prev) => [record, ...prev])
        sessionsRef.current = [record, ...sessionsRef.current]

        // Background pipeline: better transcript in the cloud if possible, then the coach.
        const currentApi = apiRef.current
        if (currentApi && planTranscription(currentApi)) {
          await transcribeRef.current(record.id)
        }
        const latest = sessionsRef.current.find((item) => item.id === record.id)
        if (currentApi && latest?.transcript?.segments.length && resolveLlm(currentApi)) {
          await analyzeRef.current(record.id)
        }
      }

      recorderRef.current = recorder
      startTimeRef.current = Date.now()
      pausedTotalRef.current = 0
      pausedAtRef.current = null
      setElapsed(0)
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.round(recordingClock()))
      }, 500)

      if (isIOS()) {
        recorder.start()
      } else {
        try {
          recorder.start(1000)
        } catch {
          recorder.start()
        }
      }
      setRecording(true)
      setIsPaused(false)

      // Free live captions (Chrome, Edge, Safari desktop). iOS can't share the mic with the recorder.
      liveSegmentsRef.current = []
      if (api && wantsLiveCaptions(api) && speechRecognitionSupported() && !isIOS()) {
        const live = createLiveTranscriber({
          lang: getLanguageBcp47(language),
          now: recordingClock,
          onSegment: (segment) => {
            liveSegmentsRef.current.push({ id: '', ...segment })
            setLiveCaption('')
          },
          onInterim: setLiveCaption,
          onUnavailable: () => setLiveCaptionsOn(false),
        })
        liveRef.current = live
        live.start()
        setLiveCaptionsOn(true)
      }
    } catch (err) {
      console.error('Error starting MediaRecorder:', err)
    }
  }, [selectedNiche, api, language, ui, recordingClock])

  const startRecordingWithCountdown = useCallback(async (onBeforeStart?: () => void) => {
    if (!streamRef.current) {
      const ok = await requestMediaAccess()
      if (!ok) return
    }

    if (onBeforeStart) {
      onBeforeStart()
    }

    setIsCountingDown(true)
    setCountdownSeconds(5)

    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)

    let currentSec = 5
    countdownIntervalRef.current = window.setInterval(() => {
      currentSec -= 1
      if (currentSec > 0) {
        setCountdownSeconds(currentSec)
      } else {
        if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
        setIsCountingDown(false)
        doStartRecordingNow()
      }
    }, 1000)
  }, [requestMediaAccess, doStartRecordingNow])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause()
      pausedAtRef.current = Date.now()
      liveRef.current?.pause()
      setIsPaused(true)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume()
      if (pausedAtRef.current) pausedTotalRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
      liveRef.current?.resume()
      setIsPaused(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
      setIsCountingDown(false)
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const clearTopic = useCallback(() => {
    setSelectedCategory(null)
    setSelectedNiche(null)
    setShowPrompter(false)
  }, [])

  const patchSession = useCallback(async (id: string, patch: SpeakingSessionPatch) => {
    const apply = (session: SpeakingSessionRecord) => (session.id === id ? { ...session, ...patch } : session)
    sessionsRef.current = sessionsRef.current.map(apply)
    setSessions((prev) => prev.map(apply))
    setActiveReviewSession((prev) => (prev?.id === id ? { ...prev, ...patch } : prev))
    await updateSpeakingSession(id, patch).catch((error) => console.error('[speaking] save failed', error))
  }, [])

  const handleUpdateSession = useCallback(async (updated: SpeakingSessionRecord) => {
    const { id, blob: _blob, mediaUrl: _url, ...patch } = updated
    await patchSession(id, patch)
  }, [patchSession])

  const handleDeleteSession = useCallback(async (id: string) => {
    const target = sessionsRef.current.find((session) => session.id === id)
    if (target?.mediaUrl) URL.revokeObjectURL(target.mediaUrl)
    await deleteSpeakingSession(id)
    sessionsRef.current = sessionsRef.current.filter((session) => session.id !== id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setActiveReviewSession((prev) => (prev?.id === id ? null : prev))
  }, [])

  const transcribeSession = useCallback(async (sessionId: string) => {
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    const currentApi = apiRef.current
    if (!session?.blob || !currentApi) return
    await patchSession(sessionId, { transcriptStatus: 'transcribing', transcriptError: undefined, transcriptProgress: 0 })
    try {
      const transcript = await transcribeRecording({
        blob: session.blob,
        api: currentApi,
        language: session.language || language,
        onProgress: (ratio) => {
          const apply = (item: SpeakingSessionRecord) => (item.id === sessionId ? { ...item, transcriptProgress: ratio } : item)
          setSessions((prev) => prev.map(apply))
          setActiveReviewSession((prev) => (prev?.id === sessionId ? { ...prev, transcriptProgress: ratio } : prev))
        },
      })
      const previous = sessionsRef.current.find((item) => item.id === sessionId)?.transcript
      // Keep the live captions if the cloud engine heard nothing.
      const next = transcript.segments.length || !previous ? transcript : previous
      await patchSession(sessionId, { transcript: next, transcriptStatus: 'done', transcriptError: undefined, transcriptProgress: undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription impossible.'
      const hasPrevious = Boolean(sessionsRef.current.find((item) => item.id === sessionId)?.transcript?.segments.length)
      await patchSession(sessionId, { transcriptStatus: hasPrevious ? 'done' : 'error', transcriptError: message, transcriptProgress: undefined })
    }
  }, [language, patchSession])

  const triggerSessionAnalysis = useCallback(async (sessionId: string) => {
    const session = sessionsRef.current.find((item) => item.id === sessionId)
    const currentApi = apiRef.current
    if (!session || !currentApi) return
    if (!session.transcript?.segments.length) {
      await patchSession(sessionId, { analysisStatus: 'error', analysisError: ui === 'fr' ? 'Transcris d’abord la prise : le coach s’appuie sur ce que tu as dit.' : 'Transcribe the take first: the coach works from what you said.' })
      return
    }
    await patchSession(sessionId, { analysisStatus: 'analyzing', analysisError: undefined })
    try {
      const analysis = await coachSpeakingSession({
        transcript: session.transcript,
        durationSeconds: session.duration,
        blob: session.blob,
        api: currentApi,
        language: session.language || language,
        uiLanguage: ui,
        topicTitle: session.topicName,
      })
      await patchSession(sessionId, { analysis, analysisStatus: 'completed', analysisError: undefined })
    } catch (error) {
      await patchSession(sessionId, { analysisStatus: 'error', analysisError: error instanceof Error ? error.message : 'Analyse impossible.' })
    }
  }, [language, ui, patchSession])

  // The recorder callback is created before these exist: reach them through refs.
  const transcribeRef = useRef(transcribeSession)
  transcribeRef.current = transcribeSession
  const analyzeRef = useRef(triggerSessionAnalysis)
  analyzeRef.current = triggerSessionAnalysis

  return (
    <CameraContext.Provider
      value={{
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
        stopAllMedia,
        toggleCameraTrack,
        toggleMicTrack,
        facingMode,
        flipCamera,
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
        setSessions,
        activeReviewSession,
        setActiveReviewSession,
        handleUpdateSession,
        handleDeleteSession,
        patchSession,
        transcribeSession,
        triggerSessionAnalysis,
        liveCaption,
        liveCaptionsOn,
      }}
    >
      {children}
    </CameraContext.Provider>
  )
}

export function useCamera() {
  const ctx = useContext(CameraContext)
  if (!ctx) {
    throw new Error('useCamera must be used within a CameraProvider')
  }
  return ctx
}
