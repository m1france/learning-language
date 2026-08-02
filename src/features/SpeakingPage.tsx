import { useEffect, useMemo, useRef, useState } from 'react'
import type { Language } from '../domain'
import { guidedTexts, tongueTwisters } from '../seed'
import { speak, stopSpeaking } from '../ai'
import type { ApiSettings } from '../domain'

/**
 * Parler — studio vocal.
 * 2.1 : deux boutons "Texte libre" / "Texte guidé" (prompteur 1–3 min qui
 *       défile automatiquement — suivi vocal si disponible — ou manuellement).
 * 2.2 : modes bonus : Virelangues et Défi impro.
 */

type Mode = 'none' | 'free' | 'guided' | 'twister' | 'challenge'

type Recording = { id: string; url: string; label: string; duration: number; createdAt: string; kind: 'video' | 'audio' }

const challenges = [
  'Décris ta matinée comme si c’était la bande-annonce d’un film.',
  'Vends-moi ta chaise comme si c’était le meilleur objet du monde.',
  'Raconte ta dernière semaine en utilisant seulement des phrases courtes.',
  'Explique ton plat préféré à quelqu’un qui ne l’a jamais goûté.',
  'Invente une excuse absurde pour arriver en retard.',
  'Présente ta ville à un touriste en 30 secondes.',
  'Raconte un souvenir d’enfance avec le plus de détails possibles.',
  'Défends une opinion impopulaire (ananas sur la pizza ?).',
]

const L = {
  fr: {
    heading: 'Studio vocal', sub: 'Texte libre ou texte guidé. À toi de choisir.',
    free: 'Texte libre', freeHint: 'Aucun texte. Tu pars de ce que tu veux.',
    guided: 'Texte guidé', guidedHint: 'Un prompteur défile en bas de l’écran.',
    twister: 'Virelangues', twisterHint: 'Un classique, mais avec le chronomètre.',
    challenge: 'Défi impro', challengeHint: 'Une carte au hasard, 30 secondes chrono.',
    record: '● Enregistrer', stop: '■ Arrêter', camera: 'Caméra', cameraOff: 'Couper la caméra',
    sessions: 'Tes prises', noSessions: 'Aucune prise pour l’instant.',
    pickText: 'Choisis un texte', minutes: 'min', startPrompt: 'Lancer le prompteur',
    pause: 'Pause', play: 'Défiler', speed: 'vitesse', follow: 'Suivi vocal',
    followOff: 'Défilement auto', listenModel: 'Écouter le modèle',
    again: 'Un autre !', go: 'C’est parti !', timesup: 'Temps écoulé — bien joué !',
  },
  en: {
    heading: 'Voice studio', sub: 'Free speech or guided text. Your call.',
    free: 'Free speech', freeHint: 'No text. Start from anything you want.',
    guided: 'Guided text', guidedHint: 'A teleprompter scrolls at the bottom.',
    twister: 'Tongue twisters', twisterHint: 'A classic, but timed.',
    challenge: 'Improv challenge', challengeHint: 'A random card, 30 seconds on the clock.',
    record: '● Record', stop: '■ Stop', camera: 'Camera', cameraOff: 'Turn camera off',
    sessions: 'Your takes', noSessions: 'No takes yet.',
    pickText: 'Pick a text', minutes: 'min', startPrompt: 'Start the prompter',
    pause: 'Pause', play: 'Scroll', speed: 'speed', follow: 'Voice follow',
    followOff: 'Auto-scroll', listenModel: 'Listen to the model',
    again: 'Another one!', go: 'Go!', timesup: 'Time’s up — well done!',
  },
} as const

// ---- speech recognition (optional, Chromium) --------------------------------
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
function createRecognition(lang: Language): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = lang === 'en' ? 'en-US' : 'fr-FR'
  return recognition
}

export function SpeakingPage({ ui, language, api }: { ui: 'fr' | 'en'; language: Language; api: ApiSettings }) {
  const t = L[ui]
  const [mode, setMode] = useState<Mode>('none')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guidedId, setGuidedId] = useState(guidedTexts[0].id)
  const [prompting, setPrompting] = useState(false)
  const [twisterId, setTwisterId] = useState(tongueTwisters[0].id)
  const [challenge, setChallenge] = useState<string | null>(null)
  const [challengeLeft, setChallengeLeft] = useState(30)

  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  useEffect(() => () => { stopAll(); stopSpeaking() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (videoRef.current && stream) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined) }
  }, [stream])

  const stopAll = () => {
    stream?.getTracks().forEach((track) => track.stop())
    setStream(null)
    setCameraOn(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const ensureMic = async (withCamera: boolean) => {
    try {
      if (stream && cameraOn === withCamera) return true
      stopAll()
      const next = await navigator.mediaDevices.getUserMedia(withCamera
        ? { video: { facingMode: 'user', width: { ideal: 1280 } }, audio: { echoCancellation: true, noiseSuppression: true } }
        : { audio: { echoCancellation: true, noiseSuppression: true } })
      setStream(next)
      setCameraOn(withCamera)
      setError(null)
      return true
    } catch {
      setError(ui === 'fr' ? 'Micro (ou caméra) indisponible. Vérifie les autorisations du navigateur.' : 'Microphone (or camera) unavailable. Check browser permissions.')
      return false
    }
  }

  const toggleRecording = async (label: string) => {
    if (recording) {
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
      return
    }
    if (!stream && !(await ensureMic(cameraOn))) return
    const currentStream = stream
    if (!currentStream) return
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm', 'audio/webm', 'video/mp4'].find((value) => MediaRecorder.isTypeSupported(value))
    const recorder = mime ? new MediaRecorder(currentStream, { mimeType: mime }) : new MediaRecorder(currentStream)
    chunksRef.current = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      chunksRef.current = []
      if (blob.size) {
        const kind = (recorder.mimeType || '').includes('video') ? 'video' as const : 'audio' as const
        setRecordings((list) => [{ id: `${Date.now()}`, url: URL.createObjectURL(blob), label, duration: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)), createdAt: new Date().toISOString(), kind }, ...list])
      }
      setRecording(false)
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    recorderRef.current = recorder
    startedAtRef.current = Date.now()
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 500)
    recorder.start(500)
    setRecording(true)
  }

  const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const guided = guidedTexts.find((text) => text.id === guidedId) ?? guidedTexts[0]
  const twister = tongueTwisters.find((item) => item.id === twisterId) ?? tongueTwisters[0]

  // challenge countdown
  useEffect(() => {
    if (mode !== 'challenge' || challenge === null || challengeLeft <= 0) return
    const timer = window.setTimeout(() => setChallengeLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [mode, challenge, challengeLeft])

  const modeCards: { id: Mode; title: string; hint: string; icon: string }[] = [
    { id: 'free', title: t.free, hint: t.freeHint, icon: '✦' },
    { id: 'guided', title: t.guided, hint: t.guidedHint, icon: '▤' },
    { id: 'twister', title: t.twister, hint: t.twisterHint, icon: '〰' },
    { id: 'challenge', title: t.challenge, hint: t.challengeHint, icon: '⚡' },
  ]

  return <div className="page speaking-page">
    <header className="page-header"><div><p className="eyebrow">{ui === 'fr' ? 'PARLER' : 'SPEAK'}</p><h1>{t.heading}</h1><p className="subhead">{t.sub}</p></div><span className="session-count">{recordings.length} {ui === 'fr' ? 'prises' : 'takes'}</span></header>

    <section className="mode-grid">
      {modeCards.map((card) => <button key={card.id} className={mode === card.id ? 'mode-card active' : 'mode-card'}
        onClick={() => { setMode(card.id); setPrompting(false); setChallenge(null); setChallengeLeft(30) }}>
        <span>{card.icon}</span><strong>{card.title}</strong><small>{card.hint}</small>
      </button>)}
    </section>

    {mode !== 'none' && <section className={`speak-studio ${cameraOn ? 'with-camera' : ''}`}>
      {cameraOn && <video ref={videoRef} className="speak-video" autoPlay muted playsInline />}
      <div className="speak-stage">
        {mode === 'free' && <div className="speak-copy"><p className="eyebrow">{t.free.toUpperCase()}</p><h2>{ui === 'fr' ? 'Parle de ce que tu veux.' : 'Talk about anything.'}</h2><p>{ui === 'fr' ? 'Ton quotidien, une opinion, une histoire. Le micro écoute, c’est tout.' : 'Your day, an opinion, a story. The mic just listens.'}</p></div>}
        {mode === 'guided' && <div className="speak-copy">
          <p className="eyebrow">{t.pickText.toUpperCase()}</p>
          <div className="guided-picker">
            {guidedTexts.map((text) => <button key={text.id} className={guidedId === text.id ? 'guided-chip active' : 'guided-chip'} onClick={() => setGuidedId(text.id)}>
              <strong>{text.title}</strong><span>~{text.minutes} {t.minutes}</span>
            </button>)}
          </div>
          <div className="guided-actions">
            <button className="outline" onClick={() => void speak(guided.text, language, api)}>▶ {t.listenModel}</button>
            <button className="primary" onClick={() => setPrompting(true)}>{t.startPrompt} <span>→</span></button>
          </div>
        </div>}
        {mode === 'twister' && <div className="speak-copy">
          <p className="eyebrow">{t.twister.toUpperCase()}</p>
          <h2 className="twister-text">“{twister.text}”</h2>
          <p>{ui === 'fr' ? `Travail ciblé : ${twister.focus}.` : `Focus: ${twister.focus}.`}</p>
          <div className="guided-actions">
            <button className="outline" onClick={() => void speak(twister.text, language, api)}>▶ {t.listenModel}</button>
            <button className="outline" onClick={() => setTwisterId(tongueTwisters[(tongueTwisters.findIndex((i) => i.id === twisterId) + 1) % tongueTwisters.length].id)}>{t.again}</button>
          </div>
        </div>}
        {mode === 'challenge' && <div className="speak-copy">
          <p className="eyebrow">{t.challenge.toUpperCase()}</p>
          {challenge === null
            ? <><h2>{ui === 'fr' ? 'Prêt·e ? 30 secondes.' : 'Ready? 30 seconds.'}</h2><button className="primary" onClick={() => { setChallenge(challenges[Math.floor(Math.random() * challenges.length)]); setChallengeLeft(30) }}>{t.go} <span>→</span></button></>
            : <><h2 className="challenge-text">{challenge}</h2>
                <div className="challenge-timer"><i style={{ width: `${(challengeLeft / 30) * 100}%` }} /><strong>{challengeLeft > 0 ? `${challengeLeft}s` : t.timesup}</strong></div>
                {challengeLeft <= 0 && <button className="outline" onClick={() => { setChallenge(challenges[Math.floor(Math.random() * challenges.length)]); setChallengeLeft(30) }}>{t.again}</button>}</>}
        </div>}
        <div className="speak-controls">
          {recording && <span className="rec-timer"><i />{format(elapsed)}</span>}
          <button className={recording ? 'record-btn recording' : 'record-btn'} onClick={() => void toggleRecording(mode === 'guided' ? guided.title : mode === 'twister' ? 'Virelangue' : mode === 'challenge' ? 'Défi impro' : 'Texte libre')}>
            {recording ? t.stop : t.record}
          </button>
          <button className="camera-toggle" onClick={() => void (cameraOn ? Promise.resolve(stopAll()) : ensureMic(true))}>{cameraOn ? t.cameraOff : `📷 ${t.camera}`}</button>
        </div>
        {error && <p className="speak-error">{error}</p>}
      </div>
    </section>}

    {prompting && mode === 'guided' && <Teleprompter ui={ui} text={guided.text} language={language} active={recording} onClose={() => setPrompting(false)} />}

    <section className="session-strip">
      <p className="eyebrow">{t.sessions.toUpperCase()}</p>
      {recordings.length === 0 && <p className="subhead">{t.noSessions}</p>}
      <div className="take-grid">
        {recordings.map((take, index) => <article key={take.id} className="take-card">
          <span>{String(recordings.length - index).padStart(2, '0')}</span>
          <div><strong>{take.label}</strong><small>{format(take.duration)}</small></div>
          {take.kind === 'video' ? <video controls playsInline preload="metadata" src={take.url} /> : <audio controls src={take.url} />}
          <button className="text-button" onClick={() => setRecordings((list) => list.filter((item) => item.id !== take.id))}>🗑</button>
        </article>)}
      </div>
    </section>
  </div>
}

function Teleprompter({ ui, text, language, active, onClose }: { ui: 'fr' | 'en'; text: string; language: Language; active: boolean; onClose: () => void }) {
  const t = L[ui]
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1) // 0.5 – 2
  const [follow, setFollow] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasRecognition = useMemo(() => createRecognition(language) !== null, [language])

  // timed auto-scroll: ~150 wpm at speed 1
  useEffect(() => {
    if (!playing || follow || index >= words.length) return
    const perWord = 60000 / (150 * speed)
    const timer = window.setTimeout(() => setIndex((i) => Math.min(words.length, i + 1)), perWord)
    return () => window.clearTimeout(timer)
  }, [playing, follow, index, speed, words.length])

  // voice follow: advance to the furthest matched word
  useEffect(() => {
    if (!follow || !hasRecognition) return
    const recognition = createRecognition(language)
    if (!recognition) return
    recognitionRef.current = recognition
    let cursor = 0
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1]
      const heard = last?.[0]?.transcript.toLowerCase().replace(/[^a-zà-ÿ\s'-]/gi, '').split(/\s+/).filter(Boolean) ?? []
      for (const spoken of heard) {
        for (let ahead = cursor; ahead < Math.min(cursor + 6, words.length); ahead += 1) {
          if (words[ahead].toLowerCase().replace(/[^a-zà-ÿ'-]/gi, '') === spoken) { cursor = ahead + 1; break }
        }
      }
      setIndex(cursor)
    }
    recognition.onend = () => { try { recognition.start() } catch { /* stopped */ } }
    try { recognition.start() } catch { /* unsupported */ }
    return () => { recognition.onend = null; try { recognition.stop() } catch { /* noop */ } }
  }, [follow, hasRecognition, language, words])

  // keep current word visible (centered in the 3-line window)
  useEffect(() => {
    const container = scrollRef.current
    const current = container?.querySelector('[data-current="true"]') as HTMLElement | null
    if (container && current) {
      container.scrollTop = current.offsetTop - container.clientHeight / 2 + current.clientHeight
    }
  }, [index])

  const done = index >= words.length
  const pct = Math.min(100, Math.round((index / words.length) * 100))

  return <div className="prompter-bar">
    <div className="prompter-head">
      <span className="eyebrow">{ui === 'fr' ? 'PROMPTEUR' : 'TELEPROMPTER'}{active ? ' · REC' : ''}</span>
      <div className="prompter-progress"><i style={{ width: `${pct}%` }} /></div>
      <div className="prompter-actions">
        {hasRecognition && <button className={follow ? 'pchip active' : 'pchip'} onClick={() => setFollow(!follow)}>{follow ? `🎙 ${t.follow}` : `⏱ ${t.followOff}`}</button>}
        <button className="pchip" onClick={() => setPlaying(!playing)}>{playing ? `⏸ ${t.pause}` : `▶ ${t.play}`}</button>
        <label className="pspeed">{t.speed}<input type="range" min="0.5" max="2" step="0.25" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
        <button className="pchip" onClick={() => setIndex(Math.max(0, index - 8))}>−</button>
        <button className="pchip" onClick={() => setIndex(Math.min(words.length, index + 8))}>＋</button>
        <button className="pchip pclose" onClick={onClose}>✕</button>
      </div>
    </div>
    <div className="prompter-window" ref={scrollRef}>
      <p className="prompter-text">
        {words.map((word, i) => <span key={i} data-current={i === index} className={i < index ? 'said' : i === index ? 'current' : ''}>{word} </span>)}
      </p>
    </div>
    {done && <div className="prompter-done">✓ {ui === 'fr' ? 'Texte terminé — belle lecture !' : 'Text finished — great reading!'}</div>}
  </div>
}
