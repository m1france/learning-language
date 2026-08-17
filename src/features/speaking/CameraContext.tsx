import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { Language } from '../../domain'
import { GlobalTopicCategory, NicheTopic, getPromptText } from './speakingTopics'
import {
  SpeakingSessionRecord,
  saveSpeakingSession,
  getAllSpeakingSessions,
  deleteSpeakingSession,
  updateSpeakingSession,
} from './speakingStorage'

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
}

const CameraContext = createContext<CameraContextType | null>(null)

export function CameraProvider({
  children,
  language,
}: {
  children: React.ReactNode
  language: Language
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
  const [overlayOpacity, setOverlayOpacity] = useState(0.4) // Default 40%

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

  // Keep streamRef in sync
  useEffect(() => {
    streamRef.current = stream
  }, [stream])

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
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
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

  const doStartRecordingNow = useCallback(() => {
    const currentStream = streamRef.current
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
          const topicName = selectedNiche ? selectedNiche.title : 'Session libre'
          const sessionTitle = topicName

          const newSessionRecord = await saveSpeakingSession({
            id: `rec-${Date.now()}`,
            title: sessionTitle,
            mode: selectedNiche ? 'guided' : 'free',
            topicId: selectedNiche?.id,
            topicName: selectedNiche?.title,
            duration: finalDuration,
            createdAt: new Date().toISOString(),
            kind: 'video',
            notes: '',
            timestamps: [],
            tags: [selectedNiche ? 'Guidé' : 'Libre'],
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
  }, [selectedNiche])

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
      setIsPaused(true)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume()
      setIsPaused(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
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

  const handleUpdateSession = useCallback(async (updated: SpeakingSessionRecord) => {
    await updateSpeakingSession(updated.id, {
      title: updated.title,
      notes: updated.notes,
      timestamps: updated.timestamps,
      tags: updated.tags,
      ratings: updated.ratings,
    })
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    setActiveReviewSession(updated)
  }, [])

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSpeakingSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setActiveReviewSession((prev) => (prev?.id === id ? null : prev))
  }, [])

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
