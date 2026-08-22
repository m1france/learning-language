import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Language, ListeningLesson, TranscriptCue } from '../../domain'
import { id, normalizeWord } from '../../domain'
import { analyzeWordWithAi, type AiWordAnalysisResult } from '../speaking/wordAiService'
import { ListeningTools } from './ListeningTools'
import { cuesFromPlainText, isYouTubeUrl, parseVtt, transcribeUploadedMedia } from './transcription'
import {
  ChevronDown,
  Clock3,
  FileAudio,
  FileUp,
  Languages,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Upload,
  Video,
  Volume2,
  X,
} from 'lucide-react'

type Ui = 'fr' | 'en'
type WordSave = { raw: string; sentence: string; language: Language; translation: string; parent?: string; partOfSpeech?: string; pronunciation?: string; tags?: string[]; sourceSkill: 'listening' }

const text = {
  fr: {
    eyebrow: 'ÉCOUTER · LABORATOIRE ACTIF', title: 'Écoute. Comprends. Garde ce qui compte.',
    subtitle: 'Importe une vidéo, un audio ou une vidéo YouTube. Chaque phrase devient un endroit où ralentir, chercher et revenir.',
    urlLabel: 'Lien YouTube', urlPlaceholder: 'https://www.youtube.com/watch?v=…', import: 'Préparer la vidéo',
    upload: 'Importer un audio ou une vidéo', uploadHint: 'MP3, M4A, WAV, WebM, MP4… · le fichier reste sur cet appareil', transcribe: 'Transcrire maintenant',
    pasted: 'Coller une transcription', pastedHint: 'Tu peux aussi coller un .vtt ou le texte brut de n’importe quel contenu.', create: 'Créer la leçon',
    noLesson: 'Ta prochaine écoute commence ici.', noLessonHint: 'Ajoute un lien ou un fichier pour obtenir des sous-titres synchronisés et un espace de travail.',
    transcript: 'Transcription', replay: 'Réécouter la phrase', speed: 'Vitesse', saveWord: 'Sauvegarder', saved: 'Sauvegardé', dictionary: 'Dictionnaire', analyze: 'Analyser le mot', openDictionary: 'Ouvrir Wiktionary',
    history: 'Mes écoutes', emptyHistory: 'Aucune leçon sauvegardée.', sourceCaptions: 'Sous-titres source importés', generated: 'Transcription générée', fileNeedsImport: 'Le fichier doit être réimporté après un rechargement ; la transcription, elle, est sauvegardée.',
    loading: 'Préparation de la transcription…', error: 'Une erreur est survenue.', plusTools: 'Plus d’outils', close: 'Fermer', settings: 'Ouvrir les réglages',
    clickWord: 'Clique sur un mot pour en voir le sens et l’ajouter à tes mots vivants.', youtubeOnly: 'Seuls les liens YouTube sont pris en charge ici.',
  },
  en: {
    eyebrow: 'LISTEN · ACTIVE LAB', title: 'Listen. Understand. Keep what matters.',
    subtitle: 'Import a video, audio file, or YouTube video. Every sentence becomes a place to slow down, look up, and return to.',
    urlLabel: 'YouTube link', urlPlaceholder: 'https://www.youtube.com/watch?v=…', import: 'Prepare video',
    upload: 'Import audio or video', uploadHint: 'MP3, M4A, WAV, WebM, MP4… · the file stays on this device', transcribe: 'Transcribe now',
    pasted: 'Paste a transcript', pastedHint: 'You can also paste a .vtt file or raw text from any content.', create: 'Create lesson',
    noLesson: 'Your next listening session starts here.', noLessonHint: 'Add a link or file to get synchronized subtitles and a focused workspace.',
    transcript: 'Transcript', replay: 'Replay sentence', speed: 'Speed', saveWord: 'Save', saved: 'Saved', dictionary: 'Dictionary', analyze: 'Analyze word', openDictionary: 'Open Wiktionary',
    history: 'My listening', emptyHistory: 'No saved lessons yet.', sourceCaptions: 'Source captions imported', generated: 'Transcript generated', fileNeedsImport: 'Re-import the file after a reload; its transcript remains saved.',
    loading: 'Preparing transcript…', error: 'Something went wrong.', plusTools: 'More tools', close: 'Close', settings: 'Open settings',
    clickWord: 'Click a word to see its meaning and add it to your living words.', youtubeOnly: 'Only YouTube links are supported here.',
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
  const activeLesson = lessons.find((lesson) => lesson.id === state.listening?.activeLessonId) ?? lessons[0]
  const [url, setUrl] = useState('')
  const [pastedTranscript, setPastedTranscript] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaKind, setMediaKind] = useState<'audio' | 'video'>('audio')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [playerTime, setPlayerTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [word, setWord] = useState<{ raw: string; sentence: string } | null>(null)
  const [wordAnalysis, setWordAnalysis] = useState<AiWordAnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const media = useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const youtubeFrame = useRef<HTMLIFrameElement>(null)

  const activeCue = useMemo(
    () => activeLesson?.transcript.find((cue) => playerTime >= cue.start && playerTime < cue.end) ?? null,
    [activeLesson, playerTime],
  )

  const setActiveLesson = (lessonId: string) => onChange({ ...state, listening: { ...state.listening, activeLessonId: lessonId } })
  const persistLesson = (lesson: ListeningLesson) => onChange({
    ...state,
    listening: { ...state.listening, lessons: [lesson, ...lessons.filter((item) => item.id !== lesson.id)], activeLessonId: lesson.id },
  })

  useEffect(() => () => { if (mediaUrl) URL.revokeObjectURL(mediaUrl) }, [mediaUrl])
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
    if (!isYouTubeUrl(url)) { setError(t.youtubeOnly); return }
    setBusy(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (state.settings.api.openAiKey.trim()) headers.Authorization = `Bearer ${state.settings.api.openAiKey.trim()}`
      const response = await fetch('/api/youtube-transcript', { method: 'POST', headers, body: JSON.stringify({ url, language: state.settings.learningLanguage }) })
      const payload = await response.json().catch(() => ({})) as { videoId?: string; cues?: TranscriptCue[]; error?: string }
      if (!response.ok || !payload.cues?.length) throw new Error(payload.error || t.error)
      createLesson({ title: `YouTube · ${youtubeId(url)}`, source: 'youtube', sourceUrl: url, youtubeId: payload.videoId || youtubeId(url), transcript: payload.cues })
      setUrl('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : t.error) } finally { setBusy(false) }
  }

  const importFile = async () => {
    if (!uploadedFile) return
    setError(''); setBusy(true)
    try {
      const cues = await transcribeUploadedMedia(uploadedFile, state.settings.learningLanguage, state.settings.api)
      if (!cues.length) throw new Error(t.error)
      setMediaUrl(URL.createObjectURL(uploadedFile))
      setMediaKind(uploadedFile.type.startsWith('video/') ? 'video' : 'audio')
      createLesson({ title: uploadedFile.name.replace(/\.[^.]+$/, ''), source: 'upload', fileName: uploadedFile.name, transcript: cues })
      setUploadedFile(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : t.error) } finally { setBusy(false) }
  }

  const importPasted = () => {
    const cues = pastedTranscript.includes('-->') ? parseVtt(pastedTranscript) : cuesFromPlainText(pastedTranscript)
    if (!cues.length) { setError(t.error); return }
    createLesson({ title: ui === 'fr' ? 'Transcription importée' : 'Imported transcript', source: 'transcript', transcript: cues })
    setPastedTranscript(''); setError('')
  }

  const seek = (cue: TranscriptCue, autoplay = true) => {
    setPlayerTime(cue.start)
    if (activeLesson?.source === 'youtube') {
      const send = (func: string, args: unknown[]) => youtubeFrame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
      send('seekTo', [cue.start, true]); if (autoplay) send('playVideo', [])
      window.setTimeout(() => send('pauseVideo', []), Math.max(500, (cue.end - cue.start) * 1000))
    } else if (media.current) {
      media.current.currentTime = cue.start
      media.current.playbackRate = speed
      if (autoplay) void media.current.play()
      window.setTimeout(() => media.current?.pause(), Math.max(500, (cue.end - cue.start) * 1000))
    }
  }

  const inspectWord = async (raw: string, sentence: string) => {
    const clean = normalizeWord(raw)
    if (!clean) return
    setWord({ raw: clean, sentence }); setWordAnalysis(null); setAnalyzing(true)
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
    <header className="listening-lab-header">
      <div><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      {lessons.length > 0 && <label className="listening-history"><Clock3 size={15} /><span>{t.history}</span><select value={activeLesson?.id ?? ''} onChange={(event) => setActiveLesson(event.target.value)}><option value="" disabled>{t.history}</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>}
    </header>

    {activeLesson ? <section className="listening-workspace">
      <div className="listening-player-panel">
        <div className="listening-player">
          {activeLesson.source === 'youtube' && activeLesson.youtubeId ? <iframe ref={youtubeFrame} title={activeLesson.title} src={`https://www.youtube-nocookie.com/embed/${activeLesson.youtubeId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            : activeLesson.source === 'upload' && mediaUrl ? (mediaKind === 'video' ? <video ref={media as React.RefObject<HTMLVideoElement>} src={mediaUrl} controls onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime)} /> : <audio ref={media as React.RefObject<HTMLAudioElement>} src={mediaUrl} controls onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime)} />)
            : <div className="listening-media-empty"><FileAudio size={28} /><strong>{activeLesson.fileName || activeLesson.title}</strong><p>{activeLesson.source === 'upload' ? t.fileNeedsImport : activeLesson.source === 'youtube' ? t.sourceCaptions : t.generated}</p></div>}
        </div>
        <div className="listening-controls"><button type="button" onClick={() => activeCue && seek(activeCue)}><RotateCcw size={15} /> {t.replay}</button><label><SlidersHorizontal size={14} /> {t.speed}<select value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (media.current) media.current.playbackRate = next }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option></select></label></div>
        <p className="listening-click-hint">{t.clickWord}</p>
      </div>
      <div className="listening-transcript-panel"><div className="listening-transcript-title"><div><p className="eyebrow">{t.transcript.toUpperCase()}</p><h2>{activeLesson.title}</h2></div><span>{activeLesson.source === 'youtube' ? t.sourceCaptions : t.generated}</span></div>
        <div className="listening-cues">{activeLesson.transcript.map((cue) => <article key={cue.id} className={activeCue?.id === cue.id ? 'active' : ''}><button className="cue-time" type="button" onClick={() => seek(cue)}>{formatTime(cue.start)}</button><p>{cue.text.split(/(\s+)/).map((part, index) => /^\s+$/.test(part) ? part : <button key={`${part}-${index}`} type="button" className="cue-word" onClick={() => inspectWord(part, cue.text)}>{part}</button>)}</p><button className="cue-replay" type="button" onClick={() => seek(cue)} aria-label={t.replay}><Volume2 size={14} /></button></article>)}</div>
      </div>
    </section> : <section className="listening-empty-state"><div><Video size={28} /><h2>{t.noLesson}</h2><p>{t.noLessonHint}</p></div></section>}

    <section className="listening-imports">
      <article><label>{t.urlLabel}<div className="listening-url-row"><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t.urlPlaceholder} /><button type="button" className="primary" onClick={importYoutube} disabled={busy}>{busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />} {t.import}</button></div></label></article>
      <article><div className="listening-import-title"><FileUp size={18} /><div><strong>{t.upload}</strong><span>{t.uploadHint}</span></div></div><input ref={fileInput} type="file" accept="audio/*,video/*" hidden onChange={(event) => setUploadedFile(event.target.files?.[0] ?? null)} /><div className="listening-file-actions"><button type="button" className="outline" onClick={() => fileInput.current?.click()}><Upload size={14} /> {uploadedFile?.name || t.upload}</button>{uploadedFile && <button type="button" className="primary" onClick={importFile} disabled={busy}>{busy ? <Loader2 className="spin" size={15} /> : <Languages size={15} />} {t.transcribe}</button>}</div></article>
      <article className="listening-paste"><strong>{t.pasted}</strong><span>{t.pastedHint}</span><textarea value={pastedTranscript} onChange={(event) => setPastedTranscript(event.target.value)} /><button type="button" className="outline" onClick={importPasted} disabled={!pastedTranscript.trim()}>{t.create}</button></article>
      {error && <p className="listening-error"><X size={14} /> {error}{error.includes('clé OpenAI') && <button type="button" onClick={onOpenSettings}><Settings size={13} /> {t.settings}</button>}</p>}
    </section>

    {word && <aside className="listening-dictionary"><button type="button" className="listening-dict-close" onClick={() => setWord(null)} aria-label={t.close}><X size={16} /></button><p className="eyebrow">{t.dictionary.toUpperCase()}</p><h2>{word.raw}</h2><p className="listening-word-context">« {word.sentence} »</p>{analyzing ? <p><Loader2 className="spin" size={15} /> {t.analyze}</p> : <>{wordAnalysis?.translation && <strong className="listening-translation">{wordAnalysis.translation}</strong>}{wordAnalysis?.pronunciation && <span>{wordAnalysis.pronunciation}</span>}<div><a href={wiktionaryUrl(state.settings.learningLanguage, word.raw)} target="_blank" rel="noreferrer">{t.openDictionary}</a><button type="button" className="primary" onClick={saveCurrentWord} disabled={isSaved}><Save size={14} /> {isSaved ? t.saved : t.saveWord}</button></div></>}</aside>}

    <button type="button" className="listening-tools-trigger" onClick={() => setToolsOpen(true)}><span />{t.plusTools}<ChevronDown size={14} /><span /></button>
    {toolsOpen && <ListeningTools ui={ui} state={state} onClose={() => setToolsOpen(false)} />}
  </div>
}
