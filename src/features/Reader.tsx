import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, Language, Resource } from '../domain'
import { normalizeWord } from '../domain'
import { builtinSilentLetters, intonationProfile, isVerbLike, guessPartOfSpeech, silentLettersFor } from '../phonetics'
import { explainWordInContext, speak, stopSpeaking } from '../ai'
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

const PAGE_SIZE_OPTIONS = [120, 220, 350, 500] as const

const labels = {
  fr: {
    back: '← Bibliothèque', grammar: 'Grammaire', rhythm: '⌁ Rythme', listen: 'Écouter la page',
    listening: 'Lecture…', page: 'Page', previous: '← Précédent', next: 'Suivant →', wordsPerPage: 'mots / page',
    progress: 'Progression', renameHint: 'Clique sur le titre ou la couverture pour les modifier',
    editText: 'Modifier le texte', doneEditing: 'Terminer', saveText: 'Enregistrer le texte',
    deleteResource: 'Supprimer la ressource', confirmDelete: 'Confirmer la suppression ?', cancel: 'Annuler',
    focus: 'Learning Focus grammar', deck: 'Ajouter au deck', added: 'Ajouté au deck', wordListen: 'Écouter',
    context: 'Dans ce contexte', thinking: 'Analyse du contexte…', silentTitle: 'Lettres muettes',
    silentAuto: 'détectées automatiquement', silentCustom: 'personnalisées', silentReset: 'Revenir au réglage auto',
    silentHint: 'Clique sur une lettre pour la rendre muette (grise) ou prononcée.',
    aiMissing: 'Ajoute une clé OpenRouter dans Paramètres pour l’explication contextuelle IA.',
    chapterDefault: 'Chapitre', noAi: 'Dictionnaire local',
  },
  en: {
    back: '← Library', grammar: 'Grammar', rhythm: '⌁ Rhythm', listen: 'Listen to page',
    listening: 'Playing…', page: 'Page', previous: '← Previous', next: 'Next →', wordsPerPage: 'words / page',
    progress: 'Progress', renameHint: 'Click the title or the cover to change them',
    editText: 'Edit text', doneEditing: 'Done', saveText: 'Save text',
    deleteResource: 'Delete resource', confirmDelete: 'Really delete this resource?', cancel: 'Cancel',
    focus: 'Learning Focus grammar', deck: 'Add to my deck', added: 'In your deck', wordListen: 'Listen',
    context: 'In this context', thinking: 'Reading the context…', silentTitle: 'Silent letters',
    silentAuto: 'auto-detected', silentCustom: 'custom', silentReset: 'Back to automatic',
    silentHint: 'Click a letter to make it silent (grey) or pronounced.',
    aiMissing: 'Add an OpenRouter key in Settings for the AI contextual explanation.',
    chapterDefault: 'Chapter', noAi: 'Local dictionary',
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

export function Cover({ cover, coverImage, type, onClick }: { cover: Resource['cover']; coverImage?: string; type: string; onClick?: () => void }) {
  const inner = coverImage
    ? <img className="cover-img" src={coverImage} alt="" />
    : <><span className="cover-type">{type}</span><div className="cover-shape one" /><div className="cover-shape two" /><div className="cover-line" /></>
  if (!onClick) return <div className={`cover ${cover}`}>{inner}</div>
  return <button className={`cover ${cover} cover-editable`} onClick={onClick} title="Changer la couverture">{inner}<span className="cover-edit-badge">✎</span></button>
}

export function Reader({ state, resource, ui, onBack, onUpdate, onDelete, onProgress, onAddWord, onOpenFocus, onPageSize, onSilentOverride }: {
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
  onSilentOverride: (normalized: string, letters: string[] | null) => void
}) {
  const t = labels[ui]
  const settings = state.settings
  const api = settings.api
  const [pageIndex, setPageIndex] = useState(() => Number(localStorage.getItem(`vivre-page-${resource.id}`) ?? 0) || 0)
  const [fontSize, setFontSize] = useState(settings.readerFontSize)
  const [showGrammar, setShowGrammar] = useState(settings.showGrammar)
  const [showRhythm, setShowRhythm] = useState(false)
  const [selected, setSelected] = useState<{ raw: string; sentence: string; previous: string[] } | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftParagraphs, setDraftParagraphs] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [listening, setListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => () => stopSpeaking(), [])

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

  const listenToPage = async () => {
    if (listening) { stopSpeaking(); setListening(false); return }
    setListening(true)
    await speak(page.map((entry) => entry.text).join(' '), resource.language, api)
    setListening(false)
  }

  const clickWord = (raw: string, entry: Entry) => {
    const sentences = splitSentences(entry.text)
    const sentenceIndex = sentences.findIndex((sentence) => sentence.includes(raw))
    const sentence = sentenceIndex >= 0 ? sentences[sentenceIndex] : entry.text
    const previous = sentences.slice(Math.max(0, sentenceIndex - 2), sentenceIndex >= 0 ? sentenceIndex : 0)
    setSelected({ raw, sentence, previous })
  }

  const progress = Math.round(((safePage + 1) / pages.length) * 100)

  return <div className="reader-page" onClick={() => setSelected(null)}>
    <header className="reader-top">
      <button className="text-button" onClick={(event) => { event.stopPropagation(); onBack() }}>{t.back}</button>
      <div className="reader-controls">
        <button className="control control-focus" onClick={(event) => { event.stopPropagation(); onOpenFocus(resource) }}>✎ {t.focus}</button>
        <button className={showGrammar ? 'control active' : 'control'} onClick={(event) => { event.stopPropagation(); setShowGrammar(!showGrammar) }}>{t.grammar}</button>
        <button className={showRhythm ? 'control active' : 'control'} onClick={(event) => { event.stopPropagation(); setShowRhythm(!showRhythm) }}>{t.rhythm}</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); void listenToPage() }}>{listening ? `■ ${t.listening}` : `▶ ${t.listen}`}</button>
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
          <button disabled={safePage === 0} onClick={(event) => { event.stopPropagation(); gotoPage(safePage - 1) }}>{t.previous}</button>
          <span>{t.page} {safePage + 1} / {pages.length}</span>
          <button disabled={safePage >= pages.length - 1} onClick={(event) => { event.stopPropagation(); gotoPage(safePage + 1) }}>{t.next}</button>
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
            : <Paragraph text={entry.text} fontSize={fontSize} language={resource.language} showGrammar={showGrammar} overrides={state.silentOverrides} onWordClick={(raw) => clickWord(raw, entry)} />}
        </div>)}
        {editing && <button className="primary" onClick={(event) => { event.stopPropagation(); saveEditing() }}>{t.saveText} <span>→</span></button>}
        {showRhythm && !editing && <RhythmBar page={page} language={resource.language} />}
      </article>

      <aside className="reader-right">
        <span className="eyebrow">{ui === 'fr' ? 'UN OUTIL DISCRET' : 'A QUIET TOOL'}</span>
        <p>{ui === 'fr' ? 'Clique sur un mot pour le comprendre dans ce contexte. Les lettres grises sont muettes.' : 'Click a word to understand it in context. Grey letters are silent.'}</p>
        <div className="legend"><i className="verb" /> {ui === 'fr' ? 'verbe / action' : 'verb'}<i className="silent-dot" /> {ui === 'fr' ? 'lettre muette' : 'silent letter'}</div>
      </aside>
    </section>

    {selected && <WordCard ui={ui} selected={selected} state={state} language={resource.language}
      inDeck={state.words.some((word) => word.normalized === normalizeWord(selected.raw) && word.language === resource.language)}
      onClose={() => setSelected(null)}
      onAddWord={() => onAddWord({ raw: selected.raw, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })}
      onSilentOverride={onSilentOverride} />}
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

function Paragraph({ text, fontSize, language, showGrammar, overrides, onWordClick }: {
  text: string
  fontSize: number
  language: Language
  showGrammar: boolean
  overrides: Record<string, string[]>
  onWordClick: (raw: string) => void
}) {
  return <p className="paragraph" style={{ fontSize }}>
    {text.split(/(\s+)/).map((part, index) => /\s+/.test(part) ? <span key={index}>{part}</span> : (
      <Word key={`${part}-${index}`} raw={part} language={language} showGrammar={showGrammar} overrides={overrides} onClick={onWordClick} />
    ))}
  </p>
}

function Word({ raw, language, showGrammar, overrides, onClick }: {
  raw: string
  language: Language
  showGrammar: boolean
  overrides: Record<string, string[]>
  onClick: (raw: string) => void
}) {
  const normalized = normalizeWord(raw)
  const verb = showGrammar && isVerbLike(normalized, language)
  const silent = silentLettersFor(normalized, language, overrides)
  const custom = Object.prototype.hasOwnProperty.call(overrides, normalized)
  // mark each letter occurrence: letters listed in `silent` are greyed (first occurrences)
  const remaining = [...silent]
  return <button className={`word ${verb ? 'grammar-mark' : ''} ${custom ? 'silent-custom' : ''}`} onClick={(event) => { event.stopPropagation(); onClick(raw) }}>
    {[...raw].map((letter, index) => {
      const lower = letter.toLowerCase()
      let isSilent = false
      const at = remaining.indexOf(lower)
      if (at >= 0 && /[a-zà-ÿ]/i.test(letter)) { isSilent = true; remaining.splice(at, 1) }
      return <span className={isSilent ? 'silent' : ''} key={index}>{letter}</span>
    })}
  </button>
}

function RhythmBar({ page, language }: { page: Entry[]; language: Language }) {
  // Syllable-level intonation strip shown above the text — real waves following
  // the native melody (function words low, content words peaked).
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
  // smooth path (quadratic through midpoints)
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

function WordCard({ ui, selected, state, language, inDeck, onClose, onAddWord, onSilentOverride }: {
  ui: UI
  selected: { raw: string; sentence: string; previous: string[] }
  state: AppState
  language: Language
  inDeck: boolean
  onClose: () => void
  onAddWord: () => boolean
  onSilentOverride: (normalized: string, letters: string[] | null) => void
}) {
  const t = labels[ui]
  const api = state.settings.api
  const normalized = normalizeWord(selected.raw)
  const cleanWord = selected.raw.replace(/[.,!?;:()"“”]/g, '')
  const local = useMemo(() => lookupWord(selected.raw, selected.sentence, language), [selected, language])
  const [ai, setAi] = useState<{ explanation: string; translation: string; partOfSpeech: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState(inDeck)
  const overrides = state.silentOverrides
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, normalized)
  const silent = silentLettersFor(normalized, language, overrides)

  useEffect(() => {
    let alive = true
    setAi(null)
    if (!api.openRouterKey) return
    setLoading(true)
    explainWordInContext({ word: cleanWord, sentence: selected.sentence, previousSentences: selected.previous, learningLanguage: language, api })
      .then((result) => { if (alive && result) setAi(result) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.raw])

  const toggleLetter = (letter: string, occurrence: number) => {
    const lower = letter.toLowerCase()
    const current = [...silent]
    // count occurrences of this letter up to `occurrence`
    const seen = [...selected.raw.toLowerCase()].slice(0, occurrence + 1).filter((l) => l === lower).length
    const inSilent = current.filter((l) => l === lower).length
    if (inSilent >= seen) {
      // remove one occurrence of this letter from silent list
      const at = current.lastIndexOf(lower)
      current.splice(at, 1)
    } else {
      current.push(lower)
    }
    const builtin = builtinSilentLetters(normalized, language)
    const same = current.length === builtin.length && current.every((l) => builtin.includes(l))
    onSilentOverride(normalized, same ? null : current)
  }

  const partOfSpeech = ai?.partOfSpeech || local.partOfSpeech || guessPartOfSpeech(normalized, language)
  const translation = ai?.translation || local.definitions[0]?.translation || ''
  const explanation = ai?.explanation || local.definitions[0]?.definition || ''

  return <aside className="word-card" onClick={(event) => event.stopPropagation()}>
    <button className="card-x" onClick={onClose}>×</button>
    <div className="word-heading">
      <h2>{cleanWord}</h2>
      {local.phonetic && <span className="phonetic">/ {local.phonetic} /</span>}
    </div>
    <p className="word-type">{partOfSpeech} · {language === 'en' ? 'American English' : 'Français'}</p>
    <div className="definition">
      <span>{t.context}{ai ? ' · IA' : api.openRouterKey ? '' : ` · ${t.noAi}`}</span>
      {loading && <p className="word-loading">{t.thinking}</p>}
      {!loading && translation && <p className="word-translation">{translation}</p>}
      {!loading && explanation && <p>{explanation}</p>}
      {!loading && !api.openRouterKey && <small className="ai-hint">{t.aiMissing}</small>}
    </div>
    <div className="silent-editor">
      <div className="silent-editor-head">
        <span>{t.silentTitle}</span>
        <em>{hasOverride ? t.silentCustom : t.silentAuto}</em>
      </div>
      <div className="silent-letters">
        {[...cleanWord].map((letter, index) => {
          const lower = letter.toLowerCase()
          if (!/[a-zà-ÿ]/i.test(letter)) return <span key={index} className="punct">{letter}</span>
          // is this occurrence silent?
          const occurrence = [...cleanWord.toLowerCase()].slice(0, index + 1).filter((l) => l === lower).length
          const silentCount = silent.filter((l) => l === lower).length
          const isSilent = silentCount >= occurrence
          return <button key={index} className={isSilent ? 'letter silent-on' : 'letter'} onClick={() => toggleLetter(letter, index)}>{letter}</button>
        })}
      </div>
      <p className="silent-hint">{t.silentHint}</p>
      {hasOverride && <button className="text-button" onClick={() => onSilentOverride(normalized, null)}>↺ {t.silentReset}</button>}
    </div>
    <div className="word-actions">
      <button className="outline" onClick={() => void speak(cleanWord, language, api)}>▶ {t.wordListen}</button>
      <button className={added ? 'saved-deck' : 'primary'} onClick={() => setAdded(onAddWord() || true)}>{added ? `✓ ${t.added}` : `＋ ${t.deck}`}</button>
    </div>
  </aside>
}
