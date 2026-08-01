import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './media.css'

export type MediaLocale = 'fr' | 'en'

export type SpeakingSession = {
  id: string
  title: string
  prompt: string
  createdAt: string
  durationMs: number
  /** A page-lifetime object URL, a durable remote URL, or undefined for metadata-only history. */
  mediaUrl?: string
  /** Present while the recording is available in this browser. Stores may persist it in IndexedDB. */
  blob?: Blob
  mimeType?: string
}

export type SpeakingSessionStore = {
  loadSessions?: () => Promise<SpeakingSession[]> | SpeakingSession[]
  saveSession?: (session: SpeakingSession) => Promise<SpeakingSession | void> | SpeakingSession | void
  removeSession?: (id: string) => Promise<void> | void
}

export type SpeakingStudioProps = {
  /** Language of the interface, not necessarily the language being practised. */
  locale?: MediaLocale
  title?: string
  prompt?: string
  /** Use this for a controlled session history. */
  sessions?: SpeakingSession[]
  /** Used only when `sessions` is not controlled. */
  initialSessions?: SpeakingSession[]
  /** Receives every history update; useful for a shared app-level store. */
  onSessionsChange?: (sessions: SpeakingSession[]) => void
  /** Called with the Blob-backed recording as soon as the take stops. */
  onSaveSession?: (session: SpeakingSession) => Promise<SpeakingSession | void> | SpeakingSession | void
  /** Optional persistence adapter. The included default uses IndexedDB in supported browsers. */
  sessionStore?: SpeakingSessionStore
  onCameraStateChange?: (active: boolean) => void
  className?: string
}

type StudioStatus = 'idle' | 'requesting' | 'ready' | 'countdown' | 'recording' | 'processing' | 'error'

const labels = {
  fr: {
    eyebrow: 'PARLER',
    heading: 'Studio vocal',
    intro: 'Une prise à la fois. Écoute-toi, puis continue.',
    sessions: 'sessions',
    activate: 'Activer la caméra',
    requesting: 'Demande d’autorisation…',
    privacy: 'La caméra et le micro ne sont demandés qu’après ce clic.',
    ready: 'La caméra est prête.',
    readyHint: 'Un compte à rebours de trois secondes précède chaque prise.',
    startTake: 'Commencer une prise',
    stopTake: 'Arrêter et sauvegarder',
    stopCamera: 'Couper la caméra',
    live: 'CAMÉRA ACTIVE',
    recording: 'ENREGISTREMENT',
    processing: 'Sauvegarde de la prise…',
    prompt: 'Texte à dire',
    history: 'TES PRISES',
    historyTitle: 'Des traces vraies de ta voix.',
    noSessions: 'Ta première prise apparaîtra ici — aucune session fictive.',
    listen: 'Lire la prise',
    download: 'Télécharger',
    remove: 'Retirer',
    unavailable: 'Le fichier n’est plus disponible dans ce navigateur.',
    saved: 'Prise sauvegardée.',
    saveFailed: 'La prise est gardée ici, mais la sauvegarde durable a échoué.',
    cameraError: 'La caméra ou le micro ne sont pas disponibles.',
    permissionError: 'L’autorisation caméra/micro a été refusée. Tu peux la modifier dans ton navigateur puis réessayer.',
    noCamera: 'Aucune caméra n’a été trouvée sur cet appareil.',
    unsupported: 'Cet appareil ne prend pas en charge l’enregistrement vidéo dans le navigateur.',
    retry: 'Réessayer',
    close: 'Fermer',
    countdown: 'Prépare-toi…',
    recordingFor: 'Durée de la prise',
  },
  en: {
    eyebrow: 'SPEAK',
    heading: 'Voice studio',
    intro: 'One take at a time. Listen back, then keep going.',
    sessions: 'sessions',
    activate: 'Turn on camera',
    requesting: 'Requesting permission…',
    privacy: 'Your camera and microphone are requested only after this click.',
    ready: 'Your camera is ready.',
    readyHint: 'A three-second countdown starts before each take.',
    startTake: 'Start a take',
    stopTake: 'Stop and save',
    stopCamera: 'Turn off camera',
    live: 'CAMERA LIVE',
    recording: 'RECORDING',
    processing: 'Saving your take…',
    prompt: 'Words to try',
    history: 'YOUR TAKES',
    historyTitle: 'Real traces of your voice.',
    noSessions: 'Your first take will appear here — no made-up session history.',
    listen: 'Play take',
    download: 'Download',
    remove: 'Remove',
    unavailable: 'The file is no longer available in this browser.',
    saved: 'Take saved.',
    saveFailed: 'This take is kept here, but durable saving failed.',
    cameraError: 'Your camera or microphone is not available.',
    permissionError: 'Camera or microphone access was denied. Change it in your browser settings, then try again.',
    noCamera: 'No camera was found on this device.',
    unsupported: 'This device does not support browser video recording.',
    retry: 'Try again',
    close: 'Close',
    countdown: 'Get ready…',
    recordingFor: 'Take duration',
  },
} as const

const defaultPrompt = 'On Saturday morning, Maya left her apartment before the city was fully awake.'

function makeSessionId() {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `take-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatDuration(durationMs: number) {
  const wholeSeconds = Math.max(0, Math.floor(durationMs / 1000))
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

function formatDate(date: string, locale: MediaLocale) {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(value)
}

function preferredMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ].find((value) => MediaRecorder.isTypeSupported(value))
}

function errorMessage(error: unknown, locale: MediaLocale) {
  const t = labels[locale]
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return t.permissionError
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return t.noCamera
  }
  return t.cameraError
}

/**
 * A lightweight persistence adapter for apps that do not yet have a server-side store.
 * It uses IndexedDB, so media blobs survive a reload on the same device. Consumers may
 * replace it with `sessionStore` or `onSaveSession` to use their own backend.
 */
export function createIndexedDbSpeakingSessionStore(
  databaseName = 'vivre-la-langue-media',
  storeName = 'speaking-sessions',
): SpeakingSessionStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open local media history'))
    request.onsuccess = () => resolve(request.result)
  })

  const useStore = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
    const database = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      const request = action(transaction.objectStore(storeName))
      let result: T
      request.onsuccess = () => { result = request.result }
      request.onerror = () => reject(request.error ?? new Error('Could not update local media history'))
      transaction.oncomplete = () => {
        database.close()
        resolve(result)
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error ?? new Error('Could not update local media history'))
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error ?? new Error('Local media history was interrupted'))
      }
    })
  }

  return {
    async loadSessions() {
      const saved = await useStore<SpeakingSession[]>('readonly', (store) => store.getAll() as IDBRequest<SpeakingSession[]>)
      return saved
        .map((session) => ({
          ...session,
          mediaUrl: session.blob ? URL.createObjectURL(session.blob) : session.mediaUrl,
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    },
    async saveSession(session) {
      // Object URLs are only valid for a page lifetime; IndexedDB keeps the Blob instead.
      const { mediaUrl: _mediaUrl, ...persistable } = session
      await useStore<IDBValidKey>('readwrite', (store) => store.put(persistable) as IDBRequest<IDBValidKey>)
      return session
    },
    async removeSession(id) {
      await useStore<undefined>('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
    },
  }
}

const defaultSessionStore = createIndexedDbSpeakingSessionStore()

export function SpeakingStudio({
  locale = 'fr',
  title = 'Saturday on 8th Avenue',
  prompt = defaultPrompt,
  sessions,
  initialSessions = [],
  onSessionsChange,
  onSaveSession,
  sessionStore,
  onCameraStateChange,
  className = '',
}: SpeakingStudioProps) {
  const t = labels[locale]
  const [localSessions, setLocalSessions] = useState<SpeakingSession[]>(initialSessions)
  const [status, setStatus] = useState<StudioStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(sessions === undefined)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const countdownTimerRef = useRef<number | null>(null)
  const elapsedTimerRef = useRef<number | null>(null)
  const recordedAtRef = useRef<number>(0)
  const closeAfterRecordingRef = useRef(false)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const activeStore = sessionStore ?? defaultSessionStore
  const displayedSessions = sessions ?? localSessions

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = null
    setCountdown(null)
  }, [])

  const clearElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) window.clearInterval(elapsedTimerRef.current)
    elapsedTimerRef.current = null
  }, [])

  const releaseStream = useCallback(() => {
    clearCountdown()
    clearElapsedTimer()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    onCameraStateChange?.(false)
  }, [clearCountdown, clearElapsedTimer, onCameraStateChange])

  const updateSessions = useCallback((makeNext: (current: SpeakingSession[]) => SpeakingSession[]) => {
    const next = makeNext(displayedSessions)
    if (sessions === undefined) setLocalSessions(next)
    onSessionsChange?.(next)
    return next
  }, [displayedSessions, onSessionsChange, sessions])

  useEffect(() => {
    if (sessions !== undefined || !activeStore.loadSessions) {
      setLoadingHistory(false)
      return
    }
    let current = true
    setLoadingHistory(true)
    Promise.resolve(activeStore.loadSessions())
      .then((loaded) => {
        if (!current) return
        loaded.forEach((session) => {
          if (session.mediaUrl?.startsWith('blob:')) objectUrlsRef.current.add(session.mediaUrl)
        })
        setLocalSessions((existing) => {
          const byId = new Map(existing.map((item) => [item.id, item]))
          loaded.forEach((item) => byId.set(item.id, item))
          return [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        })
      })
      .catch(() => {
        if (current) setNotice(t.saveFailed)
      })
      .finally(() => { if (current) setLoadingHistory(false) })
    return () => { current = false }
  }, [activeStore, sessions, t.saveFailed])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => undefined)
  }, [stream])

  useEffect(() => () => {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
    releaseStream()
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [releaseStream])

  const persistSession = useCallback(async (session: SpeakingSession) => {
    const persist = onSaveSession ?? activeStore.saveSession
    if (!persist) return
    try {
      const stored = await persist(session)
      if (stored) {
        updateSessions((current) => current.map((item) => item.id === session.id ? { ...item, ...stored } : item))
      }
      setNotice(t.saved)
    } catch {
      setNotice(t.saveFailed)
    }
  }, [activeStore.saveSession, onSaveSession, t.saveFailed, t.saved, updateSessions])

  const saveFinishedRecording = useCallback(async () => {
    clearElapsedTimer()
    const recorder = recorderRef.current
    recorderRef.current = null
    const durationMs = Math.max(1000, Date.now() - recordedAtRef.current)
    const mimeType = recorder?.mimeType || chunksRef.current[0]?.type || 'video/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []

    if (!blob.size) {
      setError(t.cameraError)
      setStatus(streamRef.current ? 'ready' : 'idle')
      return
    }

    const mediaUrl = URL.createObjectURL(blob)
    objectUrlsRef.current.add(mediaUrl)
    const session: SpeakingSession = {
      id: makeSessionId(),
      title,
      prompt,
      createdAt: new Date().toISOString(),
      durationMs,
      mediaUrl,
      blob,
      mimeType,
    }
    updateSessions((current) => [session, ...current])
    setSelectedSessionId(session.id)
    await persistSession(session)

    const closeAfter = closeAfterRecordingRef.current
    closeAfterRecordingRef.current = false
    if (closeAfter) releaseStream()
    setStatus(closeAfter ? 'idle' : 'ready')
  }, [clearElapsedTimer, persistSession, prompt, releaseStream, t.cameraError, title, updateSessions])

  const beginRecording = useCallback(() => {
    const currentStream = streamRef.current
    if (!currentStream) return
    if (typeof MediaRecorder === 'undefined') {
      setError(t.unsupported)
      setStatus('ready')
      return
    }
    try {
      chunksRef.current = []
      const mimeType = preferredMimeType()
      const recorder = mimeType ? new MediaRecorder(currentStream, { mimeType }) : new MediaRecorder(currentStream)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        clearElapsedTimer()
        setError(t.cameraError)
        setStatus('ready')
      }
      recorder.onstop = () => { void saveFinishedRecording() }
      recordedAtRef.current = Date.now()
      setElapsed(0)
      recorder.start(500)
      setStatus('recording')
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - recordedAtRef.current)
      }, 250)
    } catch {
      setError(t.unsupported)
      setStatus('ready')
    }
  }, [clearElapsedTimer, saveFinishedRecording, t.cameraError, t.unsupported])

  const startCountdown = useCallback(() => {
    if (!streamRef.current || status === 'countdown' || status === 'recording' || status === 'processing') return
    clearCountdown()
    setError(null)
    setNotice(null)
    setStatus('countdown')
    let remaining = 3
    setCountdown(remaining)
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        setCountdown(remaining)
        return
      }
      clearCountdown()
      beginRecording()
    }, 1000)
  }, [beginRecording, clearCountdown, status])

  const activateCamera = useCallback(async () => {
    if (status === 'requesting' || status === 'countdown' || status === 'recording' || status === 'processing') return
    setError(null)
    setNotice(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t.unsupported)
      setStatus('error')
      return
    }
    setStatus('requesting')
    try {
      // Intentionally called only inside this click handler: there is no camera prompt on mount.
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = nextStream
      setStream(nextStream)
      onCameraStateChange?.(true)
      setStatus('ready')
      // A session starts from the same deliberate click, after a calm visible countdown.
      window.setTimeout(startCountdown, 80)
    } catch (caught) {
      setError(errorMessage(caught, locale))
      setStatus('error')
    }
  }, [locale, onCameraStateChange, startCountdown, status, t.unsupported])

  const stopTake = useCallback(() => {
    if (status === 'countdown') {
      clearCountdown()
      setStatus('ready')
      return
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      clearElapsedTimer()
      setStatus('processing')
      recorder.stop()
    }
  }, [clearCountdown, clearElapsedTimer, status])

  const stopCamera = useCallback(() => {
    if (status === 'countdown') {
      clearCountdown()
      releaseStream()
      setStatus('idle')
      return
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      closeAfterRecordingRef.current = true
      stopTake()
      return
    }
    releaseStream()
    setStatus('idle')
  }, [clearCountdown, releaseStream, status, stopTake])

  const removeSession = useCallback(async (session: SpeakingSession) => {
    const remaining = updateSessions((current) => current.filter((item) => item.id !== session.id))
    if (selectedSessionId === session.id) setSelectedSessionId(null)
    try {
      await activeStore.removeSession?.(session.id)
      if (session.mediaUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(session.mediaUrl)
        objectUrlsRef.current.delete(session.mediaUrl)
      }
    } catch {
      updateSessions(() => [...remaining, session].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setNotice(t.saveFailed)
    }
  }, [activeStore, selectedSessionId, t.saveFailed, updateSessions])

  const activeSession = useMemo(
    () => displayedSessions.find((session) => session.id === selectedSessionId) ?? displayedSessions[0],
    [displayedSessions, selectedSessionId],
  )
  const hasCamera = Boolean(stream)
  const isBusy = status === 'requesting' || status === 'countdown' || status === 'recording' || status === 'processing'

  return <div className={`media-speaking ${className}`.trim()}>
    <header className="media-heading">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.heading}</h1>
        <p>{t.intro}</p>
      </div>
      <span className="media-session-count">{displayedSessions.length} {t.sessions}</span>
    </header>

    <section className={`media-studio media-studio--${status}`} aria-live="polite">
      {!hasCamera && <div className="media-permission-card">
        <span className="media-camera-glyph" aria-hidden="true">◉</span>
        <p className="eyebrow">{status === 'requesting' ? t.requesting.toUpperCase() : t.eyebrow}</p>
        <h2>{status === 'requesting' ? t.requesting : t.heading}</h2>
        <p>{t.privacy}</p>
        <button className="primary media-primary" type="button" onClick={() => void activateCamera()} disabled={status === 'requesting'}>
          {status === 'requesting' ? t.requesting : t.activate}<span>→</span>
        </button>
      </div>}

      {hasCamera && <>
        <video className="media-preview" ref={videoRef} autoPlay muted playsInline aria-label="Aperçu de la caméra" />
        <div className="media-preview-tint" />
        <div className="media-live-status"><i className={status === 'recording' ? 'is-recording' : ''} />{status === 'recording' ? t.recording : t.live}</div>
        <div className="media-studio-copy">
          <p className="eyebrow">{status === 'recording' ? t.recordingFor.toUpperCase() : t.ready.toUpperCase()}</p>
          <h2>{status === 'recording' ? formatDuration(elapsed) : title}</h2>
          <p>{status === 'recording' ? t.prompt : t.readyHint}</p>
        </div>
        <div className="media-prompter">
          <span>{t.prompt}</span>
          <p>{prompt}</p>
        </div>
        {status === 'countdown' && <div className="media-countdown" role="status"><span>{t.countdown}</span><strong>{countdown}</strong></div>}
        {status === 'processing' && <div className="media-processing" role="status"><i />{t.processing}</div>}
        <div className="media-camera-actions">
          {status === 'recording' || status === 'processing' || status === 'countdown'
            ? <button className="media-stop-take" type="button" onClick={stopTake} disabled={status === 'processing'}>{t.stopTake}</button>
            : <button className="primary media-primary" type="button" onClick={startCountdown} disabled={isBusy}>{t.startTake}<span>●</span></button>}
          <button className="media-stop-camera" type="button" onClick={stopCamera} disabled={status === 'processing'}>{t.stopCamera}</button>
        </div>
      </>}
    </section>

    {(error || notice) && <div className={error ? 'media-message media-message--error' : 'media-message'} role={error ? 'alert' : 'status'}>
      <span>{error ?? notice}</span>
      {error && <button type="button" onClick={() => void activateCamera()}>{t.retry}</button>}
      {!error && <button type="button" aria-label={t.close} onClick={() => setNotice(null)}>×</button>}
    </div>}

    <section className="media-history">
      <div className="media-history-heading"><div><p className="eyebrow">{t.history}</p><h2>{t.historyTitle}</h2></div></div>
      {loadingHistory && <p className="media-history-empty">…</p>}
      {!loadingHistory && displayedSessions.length === 0 && <p className="media-history-empty">{t.noSessions}</p>}
      {!loadingHistory && displayedSessions.length > 0 && <div className="media-history-grid">
        <div className="media-session-list">{displayedSessions.map((session) => <button type="button" key={session.id} className={activeSession?.id === session.id ? 'is-active' : ''} onClick={() => setSelectedSessionId(session.id)}>
          <span>{formatDuration(session.durationMs)}</span><div><strong>{session.title}</strong><small>{formatDate(session.createdAt, locale)}</small></div><b>→</b>
        </button>)}</div>
        {activeSession && <article className="media-playback-card">
          <div><p className="eyebrow">{formatDate(activeSession.createdAt, locale)}</p><h3>{activeSession.title}</h3><p>{activeSession.prompt}</p></div>
          {activeSession.mediaUrl
            ? <video controls playsInline preload="metadata" src={activeSession.mediaUrl} aria-label={`${t.listen}: ${activeSession.title}`} />
            : <p className="media-file-missing">{t.unavailable}</p>}
          <footer>{activeSession.mediaUrl && <a href={activeSession.mediaUrl} download={`vivre-la-langue-${activeSession.id}.${activeSession.mimeType?.includes('mp4') ? 'mp4' : 'webm'}`}>{t.download} ↓</a>}<button type="button" onClick={() => void removeSession(activeSession)}>{t.remove}</button></footer>
        </article>}
      </div>}
    </section>
  </div>
}

export default SpeakingStudio
