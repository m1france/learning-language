import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Language, ListeningLesson, TranscriptCue } from '../../domain'
import { id, normalizeWord } from '../../domain'
import { analyzeWordWithAi, type AiWordAnalysisResult } from '../speaking/wordAiService'
import { isYouTubeUrl } from './transcription'
import {
  Clock3,
  FileAudio,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  SlidersHorizontal,
  Video,
  X,
} from 'lucide-react'

type Ui = 'fr' | 'en'
type WordSave = { raw: string; sentence: string; language: Language; translation: string; parent?: string; partOfSpeech?: string; pronunciation?: string; tags?: string[]; sourceSkill: 'listening' }

const text = {
  fr: {
    heroTitle: 'Colle ton lien YouTube pour commencer à écouter',
    urlPlaceholder: 'https://www.youtube.com/watch?v=…', startSession: 'Lancer la session',
    history: 'Mes écoutes', newSession: 'Nouvelle écoute',
    waiting: 'Les sous-titres apparaissent ici dès que la vidéo démarre.',
    replay: 'Réécouter la phrase', speed: 'Vitesse',
    saveWord: 'Ajouter au vocabulaire', saved: 'Ajouté', dictionary: 'Dictionnaire', analyze: 'Analyse du mot…', openDictionary: 'Ouvrir Wiktionary',
    clickWord: 'Clique sur un mot du sous-titre pour le comprendre et l’ajouter à ton vocabulaire.',
    youtubeOnly: 'Seuls les liens YouTube sont pris en charge ici.',
    error: 'Une erreur est survenue.', settings: 'Ouvrir les réglages', close: 'Fermer',
    sourceCaptions: 'Sous-titres source importés', generated: 'Transcription générée', fileNeedsImport: 'Le fichier doit être réimporté après un rechargement ; la transcription, elle, est sauvegardée.',
  },
  en: {
    heroTitle: 'Paste your YouTube link to start listening',
    urlPlaceholder: 'https://www.youtube.com/watch?v=…', startSession: 'Start session',
    history: 'My listening', newSession: 'New session',
    waiting: 'Subtitles show up here as soon as the video plays.',
    replay: 'Replay sentence', speed: 'Speed',
    saveWord: 'Add to vocabulary', saved: 'Added', dictionary: 'Dictionary', analyze: 'Analyzing word…', openDictionary: 'Open Wiktionary',
    clickWord: 'Click a word in the subtitle to understand it and add it to your vocabulary.',
    youtubeOnly: 'Only YouTube links are supported here.',
    error: 'Something went wrong.', settings: 'Open settings', close: 'Close',
    sourceCaptions: 'Source captions imported', generated: 'Transcript generated', fileNeedsImport: 'Re-import the file after a reload; its transcript remains saved.',
  },
} as const

const youtubeId = (value?: string) => {
  if (!value) return ''
  try {
    const parsed = new URL(value)
    return parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1).split('/')[0] : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || ''
  } catch { return '' }
}

const formatTime = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`
const wiktionaryUrl = (language: Language, word: string) => `https://${language}.wiktionary.org/wiki/${encodeURIComponent(word)}`

export function ListeningPage({
  ui,
  state,
  onChange,
  onSaveWord,
  onOpenSettings,
}: {
  ui: Ui
  state: AppState
  onChange: (state: AppState) => void
  onSaveWord: (word: WordSave) => void
  onOpenSettings: () => void
}) {
  const t = text[ui]
  const lessons = state.listening?.lessons ?? []
  // The hero stays the default face of the page; a session only opens on demand.
  const [sessionOn, setSessionOn] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [playerTime, setPlayerTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [word, setWord] = useState<{ raw: string; sentence: string; start: number } | null>(null)
  const [wordAnalysis, setWordAnalysis] = useState<AiWordAnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const youtubeFrame = useRef<HTMLIFrameElement>(null)

  const activeLesson: ListeningLesson | null = sessionOn
    ? lessons.find((lesson) => lesson.id === state.listening?.activeLessonId) ?? lessons[0] ?? null
    : null

  const activeCue = useMemo(
    () => activeLesson?.transcript.find((cue) => playerTime >= cue.start && playerTime < cue.end) ?? null,
    [activeLesson, playerTime],
  )

  const setActiveLesson = (lessonId: string) => {
    onChange({ ...state, listening: { ...state.listening, activeLessonId: lessonId } })
    setSessionOn(true)
  }
  const persistLesson = (lesson: ListeningLesson) => {
    onChange({
      ...state,
      listening: { ...state.listening, lessons: [lesson, ...lessons.filter((item) => item.id !== lesson.id)], activeLessonId: lesson.id },
    })
    setSessionOn(true)
  }

  useEffect(() => {
    if (!activeLesson || activeLesson.source !== 'youtube') return
    const receiveTime = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com')) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.event === 'infoDelivery' && typeof data.info?.currentTime === 'number') setPlayerTime(data.info.currentTime)
      } catch {}
    }
    const timer = window.setInterval(() => youtubeFrame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }), '*'), 400)
    window.addEventListener('message', receiveTime)
    return () => { window.clearInterval(timer); window.removeEventListener('message', receiveTime) }
  }, [activeLesson?.id, activeLesson?.source])

  const createLesson = (lesson: Omit<ListeningLesson, 'id' | 'createdAt' | 'updatedAt' | 'language'>) => persistLesson({
    ...lesson, id: id('listen'), language: state.settings.learningLanguage, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })

  const importYoutube = async () => {
    setError('')
    const trimmed = url.trim()
    if (!isYouTubeUrl(trimmed)) { setError(t.youtubeOnly); return }
    setBusy(true)
    try {
      const response = await fetch('/api/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, language: state.settings.learningLanguage }),
      })
      const payload = await response.json().catch(() => ({})) as { videoId?: string; cues?: TranscriptCue[]; title?: string; thumbnail?: string; error?: string }

      if (!response.ok || !payload.cues?.length) {
        throw new Error(payload.error || (ui === 'fr' ? 'Aucun sous-titre trouvé pour cette vidéo.' : 'No captions found for this video.'))
      }

      createLesson({
        title: payload.title || `YouTube · ${payload.videoId || youtubeId(trimmed)}`,
        source: 'youtube',
        sourceUrl: trimmed,
        youtubeId: payload.videoId || youtubeId(trimmed),
        thumbnail: payload.thumbnail,
        transcript: payload.cues,
      })
      setUrl('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : t.error) } finally { setBusy(false) }
  }

  const seek = (cue: TranscriptCue, autoplay = true) => {
    setPlayerTime(cue.start)
    if (activeLesson?.source === 'youtube') {
      const send = (func: string, args: unknown[]) => youtubeFrame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
      send('seekTo', [cue.start, true])
      if (autoplay) send('playVideo', [])
    }
  }

  const inspectWord = async (raw: string, sentence: string, start: number) => {
    const clean = normalizeWord(raw)
    if (!clean) return
    setWord({ raw: clean, sentence, start }); setWordAnalysis(null); setAnalyzing(true)
    const analysis = await analyzeWordWithAi({
      word: clean, targetLang: state.settings.learningLanguage, uiLang: ui, existingTags: Array.from(new Set(state.words.flatMap((item) => item.tags))), api: state.settings.api, contextSentence: sentence,
    })
    setWordAnalysis(analysis); setAnalyzing(false)
  }

  const saveCurrentWord = () => {
    if (!word) return
    onSaveWord({ raw: word.raw, sentence: word.sentence, language: state.settings.learningLanguage, translation: wordAnalysis?.translation ?? '', parent: wordAnalysis?.parent, partOfSpeech: wordAnalysis?.partOfSpeech, pronunciation: wordAnalysis?.pronunciation, tags: wordAnalysis?.tags, sourceSkill: 'listening' })
  }

  const isSaved = word ? state.words.some((item) => item.language === state.settings.learningLanguage && item.normalized === normalizeWord(word.raw)) : false

  return <div className="page listening-page listening-lab">
    {activeLesson && <div className="listening-theater-bar">
      <button type="button" className="outline listening-icon-btn" onClick={() => { setSessionOn(false); setError('') }} title={t.newSession} aria-label={t.newSession}><Plus size={15} /></button>
      <label className="listening-history" title={t.history}>
        <Clock3 size={14} />
        <select value={activeLesson.id} onChange={(event) => setActiveLesson(event.target.value)} aria-label={t.history}>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select>
      </label>
    </div>}

    {activeLesson ? <section className="listening-theater">
      <div className="listening-stage">
        {activeLesson.source === 'youtube' && activeLesson.youtubeId ? <iframe ref={youtubeFrame} title={activeLesson.title} src={`https://www.youtube-nocookie.com/embed/${activeLesson.youtubeId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0&cc_load_policy=0&modestbranding=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          : <div className="listening-media-empty"><FileAudio size={28} /><strong>{activeLesson.fileName || activeLesson.title}</strong><p>{activeLesson.source === 'upload' ? t.fileNeedsImport : activeLesson.source === 'youtube' ? t.sourceCaptions : t.generated}</p></div>}
      </div>
      <div className="listening-subtitles">
        <p className="listening-sub listening-sub-original">
          {activeCue
            ? activeCue.text.split(/(\s+)/).map((part, index) => /^\s+$/.test(part) ? part : <button key={`${part}-${index}`} type="button" className="cue-word" onClick={() => inspectWord(part, activeCue.text, activeCue.start)}>{part}</button>)
            : <span className="listening-sub-idle">{t.waiting}</span>}
        </p>
      </div>
      <div className="listening-controls">
        <button type="button" onClick={() => activeCue && seek(activeCue)}><RotateCcw size={15} /> {t.replay}</button>
        <label><SlidersHorizontal size={14} /> {t.speed}<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option></select></label>
        <span className="listening-hint">{t.clickWord}</span>
      </div>
    </section>
    : <section className="listening-hero">
      <h2>{t.heroTitle}</h2>
      <form className="listening-hero-form" onSubmit={(event) => { event.preventDefault(); void importYoutube() }}>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t.urlPlaceholder} spellCheck={false} autoComplete="off" />
        <button type="submit" className="listening-hero-send" disabled={busy || !url.trim()} aria-label={t.startSession} title={t.startSession}>
          {busy ? <Loader2 className="spin" size={18} /> : <Send size={17} />}
        </button>
      </form>
      {error && <p className="listening-error listening-hero-error"><X size={14} /> {error}{error.includes('clé OpenAI') && <button type="button" onClick={onOpenSettings}><Settings size={13} /> {t.settings}</button>}</p>}
      {lessons.length > 0 && <div className="listening-recent">
        <span>{t.history}</span>
        {lessons.slice(0, 4).map((lesson) => (
          <button key={lesson.id} type="button" onClick={() => setActiveLesson(lesson.id)} title={lesson.title}>
            {lesson.thumbnail ? <img src={lesson.thumbnail} alt="" loading="lazy" /> : <Video size={14} />}
            <span>{lesson.title}</span>
          </button>
        ))}
      </div>}
    </section>}

    {word && <aside className="listening-dictionary listening-word-pop">
      <button type="button" className="listening-dict-close" onClick={() => setWord(null)} aria-label={t.close}><X size={16} /></button>
      <p className="eyebrow">{t.dictionary.toUpperCase()}</p>
      <h2>{word.raw}</h2>
      <p className="listening-word-context">« {word.sentence} »</p>
      {analyzing ? <p className="listening-word-analyzing"><Loader2 className="spin" size={15} /> {t.analyze}</p>
        : <>
          {wordAnalysis?.translation && <strong className="listening-translation">{wordAnalysis.translation}</strong>}
          <div className="listening-word-chips">
            {wordAnalysis?.partOfSpeech && <span className="listening-chip">{wordAnalysis.partOfSpeech}</span>}
            {wordAnalysis?.pronunciation && <span className="listening-chip">{wordAnalysis.pronunciation}</span>}
          </div>
          <div className="listening-word-actions">
            <a href={wiktionaryUrl(state.settings.learningLanguage, word.raw)} target="_blank" rel="noreferrer">{t.openDictionary}</a>
            <button type="button" className="primary" onClick={saveCurrentWord} disabled={isSaved}><Save size={14} /> {isSaved ? t.saved : t.saveWord}</button>
          </div>
        </>}
    </aside>}
  </div>
}
