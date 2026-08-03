import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, GrammarMarkStyle, GrammarMarkType, Language, Resource, WordMark } from '../domain'
import { normalizeWord } from '../domain'
import { intonationProfile, guessPartOfSpeech } from '../phonetics'
import { explainWordInContext, lookupWiktionary, speak, stopSpeaking } from '../ai'
import { lookupWord } from '../store'

type UI = 'fr' | 'en'

type Entry = {
  chapterId: string
  chapterIndex: number
  chapterTitle: string
  paragraphIndex: number
  text: string
  isChapterStart: boolean
}

type MarkMode = GrammarMarkType | 'silent' | null

const PAGE_SIZE_OPTIONS = [120, 220, 350, 500] as const

const MARK_TYPES: { id: GrammarMarkType; fr: string; en: string; color: string }[] = [
  { id: 'verb', fr: 'Verbe', en: 'Verb', color: '#16a34a' },
  { id: 'noun', fr: 'Nom', en: 'Noun', color: '#2563eb' },
  { id: 'adjective', fr: 'Adjectif', en: 'Adjective', color: '#d97706' },
  { id: 'adverb', fr: 'Adverbe', en: 'Adverb', color: '#dc2626' },
  { id: 'expression', fr: 'Expression', en: 'Expression', color: '#7c3aed' },
]

const MARK_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#20201e']

const labels = {
  fr: {
    back: '← Bibliothèque', rhythm: '⌁ Rythme', listen: 'Écouter la page',
    listening: 'Lecture…', previous: '←', next: '→', wordsPerPage: 'mots / page',
    progress: 'Progression', renameHint: 'Clique sur le titre ou la couverture pour les modifier',
    editText: 'Modifier le texte', doneEditing: 'Terminer', saveText: 'Enregistrer le texte',
    deleteResource: 'Supprimer la ressource', confirmDelete: 'Confirmer la suppression ?', cancel: 'Annuler',
    focus: 'Learning Focus grammar', deck: 'Ajouter au deck', added: 'Ajouté au deck', wordListen: 'Écouter',
    context: 'Dans ce contexte', thinking: 'Analyse du contexte…',
    aiMissing: 'Ajoute une clé OpenRouter dans Paramètres pour l’explication contextuelle IA.',
    chapterDefault: 'Chapitre', noAi: 'Dictionnaire local', wiktionary: 'Wiktionary',
    marking: 'Marquage', silentLetter: 'Lettre muette',
    styleHighlight: 'Surligné', styleUnderline: 'Souligné', styleOverlay: 'Surbrillance',
    markHintWord: 'Clique sur un mot pour le marquer. Re-clique pour retirer.',
    markHintSilent: 'Clique sur une lettre pour la griser. Re-clique pour la rétablir.',
    ttsAi: 'Voix IA', ttsGoogle: 'Voix naturelle (Google)', ttsBrowser: 'Voix navigateur', ttsError: 'TTS IA en échec',
  },
  en: {
    back: '← Library', rhythm: '⌁ Rhythm', listen: 'Listen to page',
    listening: 'Playing…', previous: '←', next: '→', wordsPerPage: 'words / page',
    progress: 'Progress', renameHint: 'Click the title or the cover to change them',
    editText: 'Edit text', doneEditing: 'Done', saveText: 'Save text',
    deleteResource: 'Delete resource', confirmDelete: 'Really delete this resource?', cancel: 'Cancel',
    focus: 'Learning Focus grammar', deck: 'Add to my deck', added: 'In your deck', wordListen: 'Listen',
    context: 'In this context', thinking: 'Reading the context…',
    aiMissing: 'Add an OpenRouter key in Settings for the AI contextual explanation.',
    chapterDefault: 'Chapter', noAi: 'Local dictionary', wiktionary: 'Wiktionary',
    marking: 'Marking', silentLetter: 'Silent letter',
    styleHighlight: 'Highlight', styleUnderline: 'Underline', styleOverlay: 'Overlay',
    markHintWord: 'Click a word to mark it. Click again to remove.',
    markHintSilent: 'Click a letter to grey it out. Click again to restore.',
    ttsAi: 'AI voice', ttsGoogle: 'Natural voice (Google)', ttsBrowser: 'Browser voice', ttsError: 'AI TTS failed',
  },
} as const

function flatten(resource: Resource): Entry[] {
  return resource.chapters.flatMap((chapter, chapterIndex) =>
    chapter.paragraphs.map((text, paragraphIndex) => ({
      chapterId: chapter.id,
      chapterIndex,
      chapterTitle: chapter.title,
      paragraphIndex,
      text,
      isChapterStart: paragraphIndex === 0,
    })),
  )
}

function paginate(entries: Entry[], wordsPerPage: number): Entry[][] {
  const pages: Entry[][] = []
  let current: Entry[] = []
  let count = 0
  for (const entry of entries) {
    const words = entry.text.split(/\s+/).filter(Boolean).length
    const chapterBreak = entry.isChapterStart && current.length > 0
    if ((count > 0 && count + words > wordsPerPage) || chapterBreak) {
      pages.push(current)
      current = []
      count = 0
    }
    current.push(entry)
    count += words
  }
  if (current.length) pages.push(current)
  return pages.length ? pages : [[]]
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
}

const markKey = (language: Language, normalized: string) => `${language}:${normalized}`

export function Cover({ cover, coverImage, type, onClick }: { cover: Resource['cover']; coverImage?: string; type: string; onClick?: () => void }) {
  const inner = coverImage
    ? <img className="cover-img" src={coverImage} alt="" />
    : <><span className="cover-type">{type}</span><div className="cover-shape one" /><div className="cover-shape two" /><div className="cover-line" /></>
  if (!onClick) return <div className={`cover ${cover}`}>{inner}</div>
  return <button className={`cover ${cover} cover-editable`} onClick={onClick} title="Changer la couverture">{inner}<span className="cover-edit-badge">✎</span></button>
}

export function Reader({ state, resource, ui, onBack, onUpdate, onDelete, onProgress, onAddWord, onOpenFocus, onPageSize, onWordMark, onSilentMark }: {
  state: AppState
  resource: Resource
  ui: UI
  onBack: () => void
  onUpdate: (resource: Resource) => void
  onDelete: (resourceId: string) => void
  onProgress: (resourceId: string, chapterIndex: number, paragraphIndex: number) => void
  onAddWord: (args: { raw: string; sentence: string; language: Language; sourceResourceId: string }) => boolean
  onOpenFocus: (resource: Resource) => void
  onPageSize: (size: number) => void
  onWordMark: (key: string, mark: WordMark | null) => void
  onSilentMark: (key: string, letterIndex: number) => void
}) {
  const t = labels[ui]
  const settings = state.settings
  const api = settings.api
  const [pageIndex, setPageIndex] = useState(() => Number(localStorage.getItem(`vivre-page-${resource.id}`) ?? 0) || 0)
  const [fontSize, setFontSize] = useState(settings.readerFontSize)
  const [showRhythm, setShowRhythm] = useState(false)
  const [selected, setSelected] = useState<{ raw: string; sentence: string; previous: string[]; x: number; y: number } | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftParagraphs, setDraftParagraphs] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [ttsNote, setTtsNote] = useState<string | null>(null)
  const [markMode, setMarkMode] = useState<MarkMode>(null)
  const [markStyle, setMarkStyle] = useState<GrammarMarkStyle>('highlight')
  const [markColor, setMarkColor] = useState<string>(MARK_TYPES[0].color)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ttsTimerRef = useRef<number | null>(null)

  const entries = useMemo(() => flatten(resource), [resource])
  const pages = useMemo(() => paginate(entries, settings.readerPageSize), [entries, settings.readerPageSize])
  const safePage = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePage] ?? []

  useEffect(() => {
    localStorage.setItem(`vivre-page-${resource.id}`, String(safePage))
    const first = page[0]
    if (first) onProgress(resource.id, first.chapterIndex, first.paragraphIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, resource.id])

  useEffect(() => () => { stopSpeaking(); if (ttsTimerRef.current) window.clearTimeout(ttsTimerRef.current) }, [])

  const notifyTts = (note: string) => {
    setTtsNote(note)
    if (ttsTimerRef.current) window.clearTimeout(ttsTimerRef.current)
    ttsTimerRef.current = window.setTimeout(() => setTtsNote(null), 6000)
  }

  const speakText = async (text: string) => {
    const result = await speak(text, resource.language, api)
    const engineLabel: Record<string, string> = {
      openrouter: `✦ ${t.ttsAi} — ${api.ttsModel}`,
      elevenlabs: '✦ ElevenLabs',
      fish: '✦ Fish Audio',
      google: `✦ ${t.ttsGoogle}`,
    }
    if (result.engine === 'browser') notifyTts(`▶ ${t.ttsBrowser}${result.error ? ` · ${result.error}` : ''}`)
    else if (result.engine === 'none') notifyTts(result.error ?? '')
    else notifyTts(`${engineLabel[result.engine]}${result.error ? ` · ${result.error}` : ''}`)
  }

  const gotoPage = (next: number) => {
    setSelected(null)
    setEditing(false)
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)))
  }

  const saveTitle = (title: string) => {
    if (title.trim() && title.trim() !== resource.title) onUpdate({ ...resource, title: title.trim() })
    setEditingTitle(false)
  }

  const pickCover = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onUpdate({ ...resource, coverImage: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const startEditing = () => {
    setDraftParagraphs(page.map((entry) => entry.text))
    setEditing(true)
  }

  const saveEditing = () => {
    const chapters = resource.chapters.map((chapter) => ({ ...chapter, paragraphs: [...chapter.paragraphs] }))
    page.forEach((entry, index) => {
      const draft = draftParagraphs[index]?.trim()
      if (draft) chapters[entry.chapterIndex].paragraphs[entry.paragraphIndex] = draft
    })
    onUpdate({ ...resource, chapters })
    setEditing(false)
  }

  const renameChapter = (chapterIndex: number, title: string) => {
    if (!title.trim()) return
    const chapters = resource.chapters.map((chapter, index) => (index === chapterIndex ? { ...chapter, title: title.trim() } : chapter))
    onUpdate({ ...resource, chapters })
  }

  const clickWord = (raw: string, entry: Entry, target: HTMLElement) => {
    const normalized = normalizeWord(raw)
    const key = markKey(resource.language, normalized)
    if (markMode && markMode !== 'silent') {
      const existing = state.wordMarks[key]
      if (existing && existing.type === markMode) onWordMark(key, null)
      else onWordMark(key, { type: markMode, style: markStyle, color: markColor })
      return
    }
    if (markMode === 'silent') return // letters handle their own clicks
    const sentences = splitSentences(entry.text)
    const sentenceIndex = sentences.findIndex((sentence) => sentence.includes(raw))
    const sentence = sentenceIndex >= 0 ? sentences[sentenceIndex] : entry.text
    const previous = sentences.slice(Math.max(0, sentenceIndex - 2), sentenceIndex >= 0 ? sentenceIndex : 0)
    const rect = target.getBoundingClientRect()
    setSelected({ raw, sentence, previous, x: rect.left, y: rect.bottom + 10 })
  }

  const activateMarkType = (type: GrammarMarkType | 'silent') => {
    setSelected(null)
    if (markMode === type) { setMarkMode(null); return }
    setMarkMode(type)
    if (type !== 'silent') {
      const preset = MARK_TYPES.find((item) => item.id === type)
      if (preset) setMarkColor(preset.color)
    }
  }

  const progress = Math.round(((safePage + 1) / pages.length) * 100)
  const activeType = markMode && markMode !== 'silent' ? MARK_TYPES.find((item) => item.id === markMode) : null

  return <div className={`reader-page ${markMode === 'silent' ? 'arm-silent' : ''} ${markMode && markMode !== 'silent' ? 'arm-word' : ''}`} onClick={() => setSelected(null)}>
    <header className="reader-top">
      <button className="text-button" onClick={(event) => { event.stopPropagation(); onBack() }}>{t.back}</button>
      <div className="reader-controls">
        <button className="control control-focus" onClick={(event) => { event.stopPropagation(); onOpenFocus(resource) }}>✎ {t.focus}</button>
        <button className={showRhythm ? 'control active' : 'control'} onClick={(event) => { event.stopPropagation(); setShowRhythm(!showRhythm) }}>{t.rhythm}</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); void speakText(page.map((entry) => entry.text).join(' ')) }}>{`▶ ${t.listen}`}</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.min(26, fontSize + 1)) }}>A+</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.max(15, fontSize - 1)) }}>A−</button>
        <select className="control page-size" value={settings.readerPageSize} onClick={(event) => event.stopPropagation()} onChange={(event) => { onPageSize(Number(event.target.value)); setPageIndex(0) }}>
          {PAGE_SIZE_OPTIONS.map((size) => <option value={size} key={size}>{size} {t.wordsPerPage}</option>)}
        </select>
      </div>
    </header>

    <section className="reader-layout">
      <aside className="reader-aside">
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => pickCover(event.target.files?.[0])} />
        <Cover cover={resource.cover} coverImage={resource.coverImage} type={resource.type} onClick={() => fileInputRef.current?.click()} />
        {resource.coverImage && <button className="text-button cover-reset" onClick={(event) => { event.stopPropagation(); onUpdate({ ...resource, coverImage: undefined }) }}>↺ Couverture par défaut</button>}
        <div className="reader-aside-meta">
          <span className="tag">{resource.type}</span>
          {editingTitle
            ? <input className="title-inline" autoFocus defaultValue={resource.title}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => saveTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') saveTitle((event.target as HTMLInputElement).value); if (event.key === 'Escape') setEditingTitle(false) }} />
            : <h2 className="title-clickable" title={t.renameHint} onClick={(event) => { event.stopPropagation(); setEditingTitle(true) }}>{resource.title}</h2>}
          <p>{resource.author}</p>
        </div>
        <div className="reader-progress"><div><span>{t.progress}</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div>
        <div className="reader-page-nav">
          <button aria-label={t.previous} disabled={safePage === 0} onClick={(event) => { event.stopPropagation(); gotoPage(safePage - 1) }}>←</button>
          <span>{safePage + 1} / {pages.length}</span>
          <button aria-label={t.next} disabled={safePage >= pages.length - 1} onClick={(event) => { event.stopPropagation(); gotoPage(safePage + 1) }}>→</button>
        </div>

        <button className="text-button edit-toggle" onClick={(event) => { event.stopPropagation(); editing ? setEditing(false) : startEditing() }}>{editing ? t.doneEditing : `✎ ${t.editText}`}</button>
        {confirmingDelete
          ? <div className="delete-confirm" onClick={(event) => event.stopPropagation()}><p>{t.confirmDelete}</p><div><button className="outline" onClick={() => setConfirmingDelete(false)}>{t.cancel}</button><button className="danger" onClick={() => onDelete(resource.id)}>{t.deleteResource}</button></div></div>
          : <button className="text-button delete-link" onClick={(event) => { event.stopPropagation(); setConfirmingDelete(true) }}>🗑 {t.deleteResource}</button>}
      </aside>

      <article className={`reading-text ${settings.readerWidth}`}>
        {page.map((entry, entryIndex) => <div key={`${entry.chapterId}-${entry.paragraphIndex}`}>
          {entry.isChapterStart && <ChapterTitle ui={ui} title={entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`} onRename={(title) => renameChapter(entry.chapterIndex, title)} />}
          {editing
            ? <textarea className="paragraph-edit" value={draftParagraphs[entryIndex] ?? entry.text} rows={Math.max(3, Math.ceil(entry.text.length / 90))}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setDraftParagraphs((current) => current.map((value, index) => (index === entryIndex ? event.target.value : value)))} />
            : <Paragraph text={entry.text} fontSize={fontSize} language={resource.language} state={state} markMode={markMode}
                onWordClick={(raw, target) => clickWord(raw, entry, target)}
                onLetterClick={(raw, letterIndex) => onSilentMark(markKey(resource.language, normalizeWord(raw)), letterIndex)} />}
        </div>)}
        {editing && <button className="primary" onClick={(event) => { event.stopPropagation(); saveEditing() }}>{t.saveText} <span>→</span></button>}
        {showRhythm && !editing && <RhythmBar page={page} language={resource.language} />}
      </article>

      <aside className="reader-right">
        <span className="eyebrow">{ui === 'fr' ? 'UN OUTIL DISCRET' : 'A QUIET TOOL'}</span>
        <p>{ui === 'fr' ? 'Clique sur un mot pour le comprendre dans ce contexte.' : 'Click a word to understand it in this context.'}</p>
        <div className="mark-panel" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow">{t.marking.toUpperCase()}</span>
          {MARK_TYPES.map((type) => <button key={type.id}
            className={markMode === type.id ? 'mark-type active' : 'mark-type'}
            style={{ ['--type-color' as string]: type.color }}
            onClick={() => activateMarkType(type.id)}>
            <i />{ui === 'fr' ? type.fr : type.en}
          </button>)}
          <button className={markMode === 'silent' ? 'mark-type active' : 'mark-type'}
            style={{ ['--type-color' as string]: '#8a877f' }}
            onClick={() => activateMarkType('silent')}>
            <i />{t.silentLetter}
          </button>
        </div>
      </aside>
    </section>

    {selected && <WordCard ui={ui} selected={selected} state={state} language={resource.language}
      inDeck={state.words.some((word) => word.normalized === normalizeWord(selected.raw) && word.language === resource.language)}
      onClose={() => setSelected(null)}
      onAddWord={() => onAddWord({ raw: selected.raw, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })}
      onSpeak={(text) => void speakText(text)} />}

    {markMode && markMode !== 'silent' && activeType && <MarkMenu ui={ui} type={activeType}
      style={markStyle} color={markColor}
      onStyle={setMarkStyle} onColor={setMarkColor} onClose={() => setMarkMode(null)} />}

    {markMode === 'silent' && <div className="mark-silent-exit" onClick={(event) => event.stopPropagation()}>
      <span>{t.markHintSilent}</span>
      <button onClick={() => setMarkMode(null)}>✕</button>
    </div>}

    {markMode && markMode !== 'silent' && <p className="mark-hint">{t.markHintWord}</p>}

    {ttsNote && <div className="tts-note" onClick={(event) => event.stopPropagation()}>{ttsNote}</div>}
  </div>
}

function MarkMenu({ ui, type, style, color, onStyle, onColor, onClose }: {
  ui: UI
  type: { id: GrammarMarkType; fr: string; en: string; color: string }
  style: GrammarMarkStyle
  color: string
  onStyle: (style: GrammarMarkStyle) => void
  onColor: (color: string) => void
  onClose: () => void
}) {
  const t = labels[ui]
  const [paletteOpen, setPaletteOpen] = useState(false)
  const styles: { id: GrammarMarkStyle; label: string; icon: React.ReactNode }[] = [
    { id: 'highlight', label: t.styleHighlight, icon: <span className="mo-demo mo-highlight" style={{ ['--type-color' as string]: color }}>abc</span> },
    { id: 'underline', label: t.styleUnderline, icon: <span className="mo-demo mo-underline" style={{ ['--type-color' as string]: color }}>abc</span> },
    { id: 'overlay', label: t.styleOverlay, icon: <span className="mo-demo mo-overlay" style={{ ['--type-color' as string]: color }}>abc</span> },
  ]
  return <div className="mark-menu-wrap" onClick={(event) => event.stopPropagation()}>
    <div className="mark-menu glass">
      <span className="mark-menu-type" style={{ ['--type-color' as string]: type.color }}><i />{ui === 'fr' ? type.fr : type.en}</span>
      <span className="mark-menu-sep" />
      {styles.map((item) => <button key={item.id} className={style === item.id ? 'mark-option active' : 'mark-option'} onClick={() => onStyle(item.id)}>
        {item.icon}<span>{item.label}</span>
      </button>)}
      <span className="mark-menu-sep" />
      <div className="mark-color-wrap">
        <button className={paletteOpen ? 'mark-option active' : 'mark-option'} onClick={() => setPaletteOpen(!paletteOpen)}>
          <span className="mo-color" style={{ background: color }} /><span>{ui === 'fr' ? 'Couleur' : 'Color'}</span>
        </button>
        {paletteOpen && <div className="mark-palette glass">
          {MARK_COLORS.map((value) => <button key={value} className={color === value ? 'active' : ''} style={{ background: value }} onClick={() => { onColor(value); setPaletteOpen(false) }} />)}
        </div>}
      </div>
    </div>
    <button className="mark-exit glass" onClick={onClose}>✕</button>
  </div>
}

function ChapterTitle({ title, onRename, ui }: { title: string; onRename: (title: string) => void; ui: UI }) {
  const [editing, setEditing] = useState(false)
  return editing
    ? <input className="chapter-inline" autoFocus defaultValue={title}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => { onRename(event.target.value); setEditing(false) }}
        onKeyDown={(event) => { if (event.key === 'Enter') { onRename((event.target as HTMLInputElement).value); setEditing(false) } if (event.key === 'Escape') setEditing(false) }} />
    : <button className="chapter-title" title={ui === 'fr' ? 'Cliquer pour renommer le chapitre' : 'Click to rename the chapter'} onClick={(event) => { event.stopPropagation(); setEditing(true) }}>{title}</button>
}

function Paragraph({ text, fontSize, language, state, markMode, onWordClick, onLetterClick }: {
  text: string
  fontSize: number
  language: Language
  state: AppState
  markMode: MarkMode
  onWordClick: (raw: string, target: HTMLElement) => void
  onLetterClick: (raw: string, letterIndex: number) => void
}) {
  return <p className="paragraph" style={{ fontSize }}>
    {text.split(/(\s+)/).map((part, index) => /\s+/.test(part) ? <span key={index}>{part}</span> : (
      <Word key={`${part}-${index}`} raw={part} language={language} state={state} markMode={markMode} onClick={onWordClick} onLetterClick={onLetterClick} />
    ))}
  </p>
}

function Word({ raw, language, state, markMode, onClick, onLetterClick }: {
  raw: string
  language: Language
  state: AppState
  markMode: MarkMode
  onClick: (raw: string, target: HTMLElement) => void
  onLetterClick: (raw: string, letterIndex: number) => void
}) {
  const normalized = normalizeWord(raw)
  const key = markKey(language, normalized)
  const mark = state.wordMarks[key]
  const grayed = state.silentMarks[key] ?? []

  const letters = [...raw]
  let alphaIndex = -1
  const spans = letters.map((letter, index) => {
    const isAlpha = /[a-zà-ÿ'-]/i.test(letter)
    if (isAlpha) alphaIndex += 1
    const myAlpha = alphaIndex
    const isGrayed = isAlpha && grayed.includes(myAlpha)
    if (markMode === 'silent') {
      return <span key={index} className={`letter-cell ${isGrayed ? 'user-gray' : ''}`}
        onClick={(event) => { event.stopPropagation(); if (isAlpha) onLetterClick(raw, myAlpha) }}>{letter}</span>
    }
    return <span key={index} className={isGrayed ? 'user-gray' : ''}>{letter}</span>
  })

  const markClass = mark ? `marked-${mark.style}` : ''
  const style = mark ? ({ ['--mark-color' as string]: mark.color } as React.CSSProperties) : undefined

  if (markMode === 'silent') return <span className={`word as-span ${markClass}`} style={style}>{spans}</span>
  return <button className={`word ${markClass}`} style={style}
    onClick={(event) => { event.stopPropagation(); onClick(raw, event.currentTarget) }}>{spans}</button>
}

function RhythmBar({ page, language }: { page: Entry[]; language: Language }) {
  const sentences = useMemo(() => page.flatMap((entry) => splitSentences(entry.text)), [page])
  return <div className="rhythm-panel" onClick={(event) => event.stopPropagation()}>
    <span className="eyebrow">INTONATION</span>
    <div className="rhythm-lines">
      {sentences.slice(0, 6).map((sentence, index) => <RhythmLine sentence={sentence} language={language} key={index} />)}
    </div>
  </div>
}

function RhythmLine({ sentence, language }: { sentence: string; language: Language }) {
  const words = sentence.split(/\s+/).filter(Boolean)
  const end = sentence.trim().endsWith('?') ? '?' : sentence.trim().endsWith('!') ? '!' : sentence.trim().endsWith('.') ? '.' : ''
  const profile = intonationProfile(words, language, end as '.' | '?' | '!' | '')
  const width = 640
  const height = 46
  const step = words.length > 1 ? width / (words.length - 1) : width
  const points = profile.map((point, index) => ({
    x: index * step,
    y: height - 8 - point.stress * (height - 16) + (point.rise ? -6 : 0),
  }))
  let d = ''
  points.forEach((point, index) => {
    if (index === 0) { d = `M ${point.x} ${point.y}`; return }
    const prev = points[index - 1]
    const midX = (prev.x + point.x) / 2
    d += ` Q ${prev.x} ${prev.y}, ${midX} ${(prev.y + point.y) / 2}`
    if (index === points.length - 1) d += ` T ${point.x} ${point.y}`
  })
  return <div className="rhythm-line">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" />
      {points.map((point, index) => profile[index].rise || (index === points.length - 1)
        ? <circle key={index} cx={point.x} cy={point.y} r="3" fill={profile[index].rise ? 'var(--coral)' : 'var(--blue)'} />
        : null)}
    </svg>
    <p>{words.map((word, index) => <span key={index} className={profile[index].stress > 0.5 ? 'stressed' : 'unstressed'}>{word} </span>)}</p>
  </div>
}

type DictState = {
  partOfSpeech: string
  translation: string
  explanation: string
  source: 'ai' | 'wiktionary' | 'local'
} | null

function WordCard({ ui, selected, state, language, inDeck, onClose, onAddWord, onSpeak }: {
  ui: UI
  selected: { raw: string; sentence: string; previous: string[]; x: number; y: number }
  state: AppState
  language: Language
  inDeck: boolean
  onClose: () => void
  onAddWord: () => boolean
  onSpeak: (text: string) => void
}) {
  const t = labels[ui]
  const api = state.settings.api
  const normalized = normalizeWord(selected.raw)
  const cleanWord = selected.raw.replace(/[.,!?;:()"“”]/g, '')
  const local = useMemo(() => lookupWord(selected.raw, selected.sentence, language), [selected, language])
  const [dict, setDict] = useState<DictState>(null)
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState(inDeck)

  useEffect(() => {
    let alive = true
    setDict(null)
    const fallback = () => ({
      partOfSpeech: local.partOfSpeech || guessPartOfSpeech(normalized, language),
      translation: local.definitions[0]?.translation ?? '',
      explanation: local.definitions[0]?.definition ?? '',
      source: 'local' as const,
    })
    setLoading(true)
    const run = async (): Promise<DictState> => {
      if (api.dictionaryProvider === 'ai' || (api.dictionaryProvider === 'local' && api.openRouterKey)) {
        const aiResult = await explainWordInContext({ word: cleanWord, sentence: selected.sentence, previousSentences: selected.previous, learningLanguage: language, api })
        if (aiResult) return {
          partOfSpeech: aiResult.partOfSpeech || guessPartOfSpeech(normalized, language),
          translation: aiResult.translation,
          explanation: aiResult.explanation,
          source: 'ai',
        }
      }
      if (api.dictionaryProvider === 'wiktionary') {
        const wiki = await lookupWiktionary(cleanWord, language, api.dictionaryEndpoint)
        if (wiki) return {
          partOfSpeech: wiki.partOfSpeech || guessPartOfSpeech(normalized, language),
          translation: wiki.definitions[0] ?? '',
          explanation: wiki.definitions.slice(1).join(' ') || wiki.definitions[0] || '',
          source: 'wiktionary',
        }
      }
      return fallback()
    }
    void run().then((result) => { if (alive) setDict(result) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.raw])

  const sourceName = dict?.source === 'ai' ? 'IA' : dict?.source === 'wiktionary' ? 'Wiktionary' : t.noAi

  // Position the card next to the clicked word, clamped inside the viewport.
  const cardWidth = 340
  const cardMaxHeight = Math.min(520, window.innerHeight - 24)
  const left = Math.max(12, Math.min(selected.x - 20, window.innerWidth - cardWidth - 12))
  let top = selected.y
  if (top + cardMaxHeight > window.innerHeight - 12) top = Math.max(12, window.innerHeight - cardMaxHeight - 12)

  return <aside className="word-card" style={{ left, top, maxHeight: cardMaxHeight }} onClick={(event) => event.stopPropagation()}>
    <button className="card-x" onClick={onClose}>×</button>
    <div className="word-heading">
      <h2>{cleanWord}</h2>
      {local.phonetic && <span className="phonetic">/ {local.phonetic} /</span>}
    </div>
    <p className="word-type">{dict?.partOfSpeech || (loading ? '…' : guessPartOfSpeech(normalized, language))} · {sourceName}</p>
    <div className="definition">
      <span>{t.context}</span>
      {loading && <p className="word-loading">{t.thinking}</p>}
      {!loading && dict?.translation && <p className="word-translation">{dict.translation}</p>}
      {!loading && dict?.explanation && dict.explanation !== dict.translation && <p>{dict.explanation}</p>}
      {!loading && dict?.source === 'local' && !api.openRouterKey && <small className="ai-hint">{t.aiMissing}</small>}
    </div>
    <div className="word-actions">
      <button className="outline" onClick={() => onSpeak(cleanWord)}>▶ {t.wordListen}</button>
      <button className={added ? 'saved-deck' : 'primary'} onClick={() => setAdded(onAddWord() || true)}>{added ? `✓ ${t.added}` : `＋ ${t.deck}`}</button>
    </div>
  </aside>
}
