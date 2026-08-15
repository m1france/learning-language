import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, GrammarMarkStyle, GrammarMarkType, Language, Resource, UiLanguage, WordMark } from '../domain'
import { normalizeWord } from '../domain'
import { knownParents, knownTags } from '../store'
import { copy, readerCopy } from '../i18n'

type Entry = {
  chapterId: string
  chapterIndex: number
  chapterTitle: string
  paragraphIndex: number
  text: string
  isChapterStart: boolean
}

type MarkMode = GrammarMarkType | 'silent' | null

type SelectedWord = { raw: string; sentence: string; x: number; y: number }

type WordDetails = {
  raw: string
  sentence: string
  language: Language
  sourceResourceId: string
  translation: string
  parent: string
  pronunciation: string
  knowledge?: number
  tags?: string[]
}

/** Couleurs du niveau de connaissance 1 → 5 (rouge → vert clair). */
const KNOWLEDGE_COLORS = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a']

const PAGE_SIZE_OPTIONS = [120, 220, 350, 500] as const

const MARK_TYPES: { id: GrammarMarkType; color: string }[] = [
  { id: 'verb', color: '#16a34a' },
  { id: 'noun', color: '#2563eb' },
  { id: 'adjective', color: '#d97706' },
  { id: 'adverb', color: '#dc2626' },
  { id: 'expression', color: '#7c3aed' },
]

const MARK_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#20201e']

const cleanRaw = (raw: string) => raw.replace(/[.,!?;:()"“”]/g, '').trim()
/** Retire les élisions françaises (l', d', j'…) pour la recherche dictionnaire. */
const wikiLookup = (raw: string) => cleanRaw(raw).replace(/^(l|d|j|n|s|t|c|qu|m)['’]/i, '')
const wikiUrl = (language: Language, word: string) => `https://${language}.wiktionary.org/wiki/${encodeURIComponent(word)}`
/** Linguee (DeepL) — dictionnaire français ↔ anglais, autorise l'embedding. */
const lingueeUrl = (language: Language, word: string) =>
  language === 'fr'
    ? `https://www.linguee.com/french-english/translation/${encodeURIComponent(word)}.html`
    : `https://www.linguee.com/english-french/translation/${encodeURIComponent(word)}.html`

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

const sentenceOf = (raw: string, text: string) => {
  const sentences = splitSentences(text)
  const index = sentences.findIndex((sentence) => sentence.includes(raw))
  return index >= 0 ? sentences[index] : text
}

const markKey = (language: Language, normalized: string) => `${language}:${normalized}`

/** Default color of a mark type, possibly overridden by the user's saved choice. */
const defaultMarkColor = (typeId: GrammarMarkType) => MARK_TYPES.find((item) => item.id === typeId)?.color ?? '#20201e'

export function Cover({ cover, coverImage, type, onClick, editHint }: { cover: Resource['cover']; coverImage?: string; type: string; onClick?: () => void; editHint?: string }) {
  const inner = coverImage
    ? <img className="cover-img" src={coverImage} alt="" />
    : <><span className="cover-type">{type}</span><div className="cover-shape one" /><div className="cover-shape two" /><div className="cover-line" /></>
  if (!onClick) return <div className={`cover ${cover}`}>{inner}</div>
  return <button className={`cover ${cover} cover-editable`} onClick={onClick} title={editHint ?? ''}>{inner}<span className="cover-edit-badge">✎</span></button>
}

export function Reader({ state, resource, ui, onBack, onUpdate, onDelete, onProgress, onSaveWord, onOpenFocus, onPageSize, onWordMark, onSilentMark, onMarkColor }: {
  state: AppState
  resource: Resource
  ui: UiLanguage
  onBack: () => void
  onUpdate: (resource: Resource) => void
  onDelete: (resourceId: string) => void
  onProgress: (resourceId: string, chapterIndex: number, paragraphIndex: number) => void
  onSaveWord: (args: WordDetails) => void
  onOpenFocus: (resource: Resource) => void
  onPageSize: (size: number) => void
  onWordMark: (key: string, mark: WordMark | null) => void
  onSilentMark: (key: string, letterIndex: number) => void
  onMarkColor: (type: GrammarMarkType, color: string) => void
}) {
  const t = readerCopy[ui]
  const settings = state.settings
  const categoryLabel = (typeId: string) => copy[ui].categories[typeId] ?? state.customCategories.find((c) => c.id === typeId)?.label ?? typeId
  const [pageIndex, setPageIndex] = useState(() => Number(localStorage.getItem(`vivre-page-${resource.id}`) ?? 0) || 0)
  const [fontSize, setFontSize] = useState(settings.readerFontSize)
  const [selected, setSelected] = useState<SelectedWord | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftParagraphs, setDraftParagraphs] = useState<string[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [markMode, setMarkMode] = useState<MarkMode>(null)
  const [markStyle, setMarkStyle] = useState<GrammarMarkStyle>('highlight')
  const [markColor, setMarkColor] = useState<string>(MARK_TYPES[0].color)
  const [wikiWord, setWikiWord] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [wikiArmed, setWikiArmed] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Effective color of a mark type: the user's saved choice wins over the default. */
  const typeColor = (typeId: GrammarMarkType) => settings.markColors[typeId] ?? defaultMarkColor(typeId)

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
    // Dictionary armed: the click opens the dictionary popup instead of the word form.
    if (wikiArmed) {
      setSelected(null)
      setWikiWord(wikiLookup(raw))
      setWikiOpen(true)
      return
    }
    const rect = target.getBoundingClientRect()
    setSelected({ raw, sentence: sentenceOf(raw, entry.text), x: rect.left, y: rect.bottom + 10 })
    setWikiWord(wikiLookup(raw))
  }

  const activateMarkType = (type: GrammarMarkType | 'silent') => {
    setSelected(null)
    if (markMode === type) { setMarkMode(null); return }
    setMarkMode(type)
    if (type !== 'silent') setMarkColor(typeColor(type))
  }

  const pickMarkColor = (color: string) => {
    setMarkColor(color)
    // Persist the choice: it becomes the new default color of this mark type.
    if (markMode && markMode !== 'silent') onMarkColor(markMode, color)
  }

  const startFocus = () => {
    // User gesture: force the browser into real fullscreen, then open the overlay.
    void document.documentElement.requestFullscreen?.().catch(() => { })
    setFocusOpen(true)
  }

  const closeFocus = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => { })
    setFocusOpen(false)
  }

  const progress = Math.round(((safePage + 1) / pages.length) * 100)
  const activeType = markMode && markMode !== 'silent' ? markMode : null

  return <div className={`reader-page ${markMode === 'silent' ? 'arm-silent' : ''} ${markMode && markMode !== 'silent' ? 'arm-word' : ''}`}
    onClick={() => { setSelected(null); if (wikiArmed) setWikiArmed(false) }}>
    <header className="reader-top">
      <button className="text-button" onClick={(event) => { event.stopPropagation(); onBack() }}>{t.back}</button>
      <div className="reader-controls">
        <button className="control control-learning-focus" onClick={(event) => { event.stopPropagation(); startFocus() }}>◉ {t.focus}</button>
        <button className="control control-focus" onClick={(event) => { event.stopPropagation(); onOpenFocus(resource) }}>✎ {t.teacherMode}</button>
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
        <Cover cover={resource.cover} coverImage={resource.coverImage} type={categoryLabel(resource.type)} onClick={() => fileInputRef.current?.click()} editHint={t.coverChange} />
        {resource.coverImage && <button className="text-button cover-reset" onClick={(event) => { event.stopPropagation(); onUpdate({ ...resource, coverImage: undefined }) }}>↺ {t.coverReset}</button>}
        <div className="reader-aside-meta">
          <span className="tag">{categoryLabel(resource.type)}</span>
          {editingTitle
            ? <input className="title-inline" autoFocus defaultValue={resource.title}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => saveTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') saveTitle((event.target as HTMLInputElement).value); if (event.key === 'Escape') setEditingTitle(false) }} />
            : <h2 className="title-clickable" title={t.renameHint} onClick={(event) => { event.stopPropagation(); setEditingTitle(true) }}>{resource.title}</h2>}
          {resource.author && <p>{resource.author}</p>}
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
          {entry.isChapterStart && <ChapterTitle hint={t.chapterRename} title={entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`} onRename={(title) => renameChapter(entry.chapterIndex, title)} />}
          {editing
            ? <textarea className="paragraph-edit" value={draftParagraphs[entryIndex] ?? entry.text} rows={Math.max(3, Math.ceil(entry.text.length / 90))}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftParagraphs((current) => current.map((value, index) => (index === entryIndex ? event.target.value : value)))} />
            : <Paragraph text={entry.text} fontSize={fontSize} language={resource.language} state={state} markMode={markMode}
              onWordClick={(raw, target) => clickWord(raw, entry, target)}
              onLetterClick={(raw, letterIndex) => onSilentMark(markKey(resource.language, normalizeWord(raw)), letterIndex)} />}
        </div>)}
        {editing && <button className="primary" onClick={(event) => { event.stopPropagation(); saveEditing() }}>{t.saveText} <span>→</span></button>}
      </article>

      <aside className="reader-right">
        <div className="mark-panel" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow">{t.marking.toUpperCase()}</span>
          {MARK_TYPES.map((type) => <button key={type.id}
            className={markMode === type.id ? 'mark-type active' : 'mark-type'}
            style={{ ['--type-color' as string]: typeColor(type.id) }}
            onClick={() => activateMarkType(type.id)}>
            <i />{t.marks[type.id]}
          </button>)}
          <button className={markMode === 'silent' ? 'mark-type active' : 'mark-type'}
            style={{ ['--type-color' as string]: '#8a877f' }}
            onClick={() => activateMarkType('silent')}>
            <i />{t.silentLetter}
          </button>
        </div>
      </aside>
    </section>

    {selected && <WordPanel ui={ui} selected={selected} state={state} language={resource.language}
      onClose={() => setSelected(null)}
      onOpenWord={(raw) => setSelected((current) => ({ raw, sentence: current?.sentence ?? '', x: current?.x ?? 80, y: current?.y ?? 120 }))}
      onSave={(details) => onSaveWord({ ...details, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })} />}

    {markMode && markMode !== 'silent' && activeType && <MarkMenu ui={ui} type={activeType} name={t.marks[activeType]} color={typeColor(activeType)}
      style={markStyle} markColor={markColor}
      onStyle={setMarkStyle} onColor={pickMarkColor} onClose={() => setMarkMode(null)} />}

    {markMode === 'silent' && <div className="mark-silent-exit" onClick={(event) => event.stopPropagation()}>
      <span>{t.markHintSilent}</span>
      <button onClick={() => setMarkMode(null)}>✕</button>
    </div>}

    {markMode && markMode !== 'silent' && <p className="mark-hint">{t.markHintWord}</p>}

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={() => setWikiArmed(!wikiArmed)} />
    {wikiOpen && wikiWord && <WikiPanel word={wikiWord} language={resource.language} onClose={() => setWikiOpen(false)} />}

    {focusOpen && <FocusReader state={state} resource={resource} ui={ui} onClose={closeFocus} onSaveWord={onSaveWord} />}
  </div>
}

/** Floating dictionary toggle, bottom-right of the reader page. */
function WikiFab({ label, armed, onToggle }: { label: string; armed: boolean; onToggle: () => void }) {
  return <button className={armed ? 'wiki-fab armed' : 'wiki-fab'} title={label} aria-label={label} aria-pressed={armed}
    onClick={(event) => { event.stopPropagation(); onToggle() }}>
    <span className="wiki-fab-w">W</span>
  </button>
}

/** Moderate bottom-right window embedding the dictionary page of the selected word. */
function WikiPanel({ word, language, onClose }: { word: string; language: Language; onClose: () => void }) {
  const [tab, setTab] = useState<'wiktionary' | 'linguee'>('wiktionary')
  const src = tab === 'wiktionary' ? wikiUrl(language, word) : lingueeUrl(language, word)
  return <div className="wiki-panel" onClick={(event) => event.stopPropagation()}>
    <div className="wiki-head">
      <div className="wiki-tabs" role="tablist">
        <button role="tab" className={tab === 'wiktionary' ? 'active' : ''} onClick={() => setTab('wiktionary')}>Wiktionary</button>
        <button role="tab" className={tab === 'linguee' ? 'active' : ''} onClick={() => setTab('linguee')}>Linguee</button>
      </div>
      <button className="card-x" onClick={onClose}>×</button>
    </div>
    <iframe key={`${tab}:${language}:${word}`} title={`${tab} — ${word}`} src={src} className="wiki-frame" />
  </div>
}

/**
 * Word annotation panel — LUTE-style fields, app style.
 * A word already saved opens in read-only view (no save button); the ✎ button
 * next to × switches to the editable form. New words open the form directly.
 * `docked` = fixed inside the Learning Focus side panel instead of floating.
 */
function WordPanel({ ui, selected, state, language, docked, onClose, onSave, onOpenWord }: {
  ui: UiLanguage
  selected: { raw: string; sentence: string; x?: number; y?: number }
  state: AppState
  language: Language
  docked?: boolean
  onClose: () => void
  onSave: (details: { raw: string; translation: string; parent: string; pronunciation: string; knowledge?: number; tags?: string[] }) => void
  onOpenWord: (raw: string) => void
}) {
  const t = readerCopy[ui]
  const findExisting = () => state.words.find((word) => word.normalized === normalizeWord(selected.raw) && word.language === language)
  const [word, setWord] = useState(() => cleanRaw(selected.raw))
  const [parent, setParent] = useState(() => findExisting()?.parent ?? '')
  const [pronunciation, setPronunciation] = useState(() => findExisting()?.phonetic ?? '')
  const [translation, setTranslation] = useState(() => findExisting()?.translation ?? findExisting()?.definitions[0]?.translation ?? '')
  // Migration douce : un ancien tag prédéfini (partOfSpeech) devient un tag personnalisé.
  const initialTags = () => {
    const existing = findExisting()
    if (!existing) return [] as string[]
    if (existing.tags?.length) return existing.tags
    if (existing.partOfSpeech) {
      const legacy = (readerCopy[ui].tags as Record<string, string>)[existing.partOfSpeech]
      return [legacy ?? existing.partOfSpeech]
    }
    return [] as string[]
  }
  const [tags, setTags] = useState<string[]>(initialTags)
  const [knowledge, setKnowledge] = useState<number | undefined>(() => findExisting()?.knowledge)
  const [saved, setSaved] = useState(false)
  const [parentTyping, setParentTyping] = useState(false)
  const [viewing, setViewing] = useState(() => Boolean(findExisting()))

  // Reset the form whenever another word is clicked.
  useEffect(() => {
    const existing = state.words.find((item) => item.normalized === normalizeWord(selected.raw) && item.language === language)
    setWord(cleanRaw(selected.raw))
    setParent(existing?.parent ?? '')
    setPronunciation(existing?.phonetic ?? '')
    setTranslation(existing?.translation ?? existing?.definitions[0]?.translation ?? '')
    setTags(existing
      ? (existing.tags?.length ? existing.tags : (existing.partOfSpeech ? [(readerCopy[ui].tags as Record<string, string>)[existing.partOfSpeech] ?? existing.partOfSpeech] : []))
      : [])
    setKnowledge(existing?.knowledge)
    setSaved(false)
    setParentTyping(false)
    setViewing(Boolean(existing))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.raw])

  const parents = knownParents(state, language)
  const query = parent.trim().toLowerCase()
  const suggestions = parentTyping && query
    ? parents.filter((item) => item.toLowerCase().includes(query) && item !== parent.trim()).slice(0, 6)
    : []

  // Tags personnalisés : création libre + suggestions des tags déjà utilisés.
  const allTags = knownTags(state, language)

  const addTag = (value: string) => {
    const cleaned = value.trim().replace(/,+$/, '')
    if (cleaned && !tags.includes(cleaned)) { setTags([...tags, cleaned]); setSaved(false) }
  }

  const removeTag = (value: string) => { setTags(tags.filter((item) => item !== value)); setSaved(false) }

  const submit = () => {
    if (!word.trim()) return
    onSave({ raw: word.trim(), translation: translation.trim(), parent: parent.trim(), pronunciation: pronunciation.trim(), knowledge, tags })
    setSaved(true)
  }

  const actions = <div className="wp-actions">
    {viewing && <button className="wp-icon" title={t.editWord} aria-label={t.editWord} onClick={() => setViewing(false)}>✎</button>}
    <button className="wp-icon" aria-label="×" onClick={onClose}>×</button>
  </div>

  // Données de la vue lecture seule : fiche du parent et mots liés.
  const parentEntry = parent ? state.words.find((item) => item.normalized === normalizeWord(parent) && item.language === language) : undefined
  const linked = state.words.filter((item) => item.language === language && item.parent
    && normalizeWord(item.parent) === normalizeWord(word) && item.normalized !== normalizeWord(word))

  const view = <>
    <div className="wp-view-head">
      <strong className="wp-view-word">{word}</strong>
      {tags.map((item) => <span key={item} className="wp-pos">{item}</span>)}
    </div>
    {knowledge !== undefined && <div className="wp-knowledge-view">
      {knowledge === 6
        ? <span className="wp-known-check">✓ {t.knownByHeart}</span>
        : <span className="wp-dots" title={`${knowledge} / 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n}
          style={n <= knowledge ? { background: KNOWLEDGE_COLORS[knowledge - 1] } : undefined} />)}</span>}
    </div>}
    {parent && <div className="wp-view-field"><span>{t.parentLabel}</span>
      <div className="wp-parent-line">
        <button className="wp-parent-tag" title={t.openLinkedWord} onClick={() => onOpenWord(parent)}>{parent}</button>
        {(parentEntry?.tags ?? []).map((item) => <span key={item} className="wp-pos">{item}</span>)}
        {parentEntry?.translation && <em className="wp-parent-translation">{parentEntry.translation}</em>}
      </div>
    </div>}
    {pronunciation && <div className="wp-view-field"><span>{t.pronunciationLabel}</span><p className="wp-view-text">{pronunciation}</p></div>}
    {translation && <div className="wp-view-field"><span>{t.translationLabel}</span><p className="wp-view-text">{translation}</p></div>}
    {linked.length > 0 && <div className="wp-view-field"><span>{t.linkedWordsLabel}</span>
      <div className="wp-linked">{linked.map((item) => <button key={item.id} className="wp-parent-tag" title={t.openLinkedWord}
        onClick={() => onOpenWord(item.word)}>{item.word}</button>)}</div>
    </div>}
  </>

  const form = <>
    <label className="wp-field">
      <span>{t.wordLabel}</span>
      <input value={word} onChange={(event) => { setWord(event.target.value); setSaved(false) }} />
    </label>

    <div className="wp-field">
      <span>{t.tagLabel}</span>
      <div className="wp-tags tag-container">
        {tags.map((item) => (
          <span key={item} className="wp-tag-chip active">
            {item}
            <button type="button" aria-label="×" onClick={() => removeTag(item)}>×</button>
          </span>
        ))}
        <TagInput allTags={allTags} existingTags={tags} onAdd={addTag} label={t.tagLabel} />
      </div>
    </div>

    <div className="wp-field">
      <span>{t.knowledgeLabel}</span>
      <div className="wp-knowledge">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button"
          className={knowledge === n ? 'kl-btn active' : 'kl-btn'}
          style={{ ['--kl' as string]: KNOWLEDGE_COLORS[n - 1] }}
          onClick={() => { setKnowledge(knowledge === n ? undefined : n); setSaved(false) }}>{n}</button>)}
        <button type="button" className={knowledge === 6 ? 'kl-btn known active' : 'kl-btn known'} title={t.knownByHeart} aria-label={t.knownByHeart}
          onClick={() => { setKnowledge(knowledge === 6 ? undefined : 6); setSaved(false) }}>✓</button>
      </div>
    </div>

    <div className="wp-field">
      <span>{t.parentLabel}</span>
      {parent && !parentTyping
        ? <span className="wp-tag">{parent}<button aria-label="×" onClick={() => { setParent(''); setParentTyping(true); setSaved(false) }}>×</button></span>
        : <>
          <input value={parent} placeholder={t.parentLabel} autoFocus={parentTyping && !parent}
            onChange={(event) => { setParent(event.target.value); setParentTyping(true); setSaved(false) }}
            onFocus={() => setParentTyping(true)}
            onBlur={() => { if (parent.trim()) setParent(parent.trim()); setParentTyping(false) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { setParent(parent.trim()); setParentTyping(false) } }} />
          {suggestions.length > 0 && <div className="wp-suggest">
            {suggestions.map((item) => <button key={item} onMouseDown={(event) => { event.preventDefault(); setParent(item); setParentTyping(false); setSaved(false) }}>{item}</button>)}
          </div>}
        </>}
    </div>

    <label className="wp-field">
      <span>{t.pronunciationLabel}</span>
      <input value={pronunciation} placeholder={t.pronunciationLabel} onChange={(event) => { setPronunciation(event.target.value); setSaved(false) }} />
    </label>

    <label className="wp-field">
      <span>{t.translationLabel}</span>
      <textarea rows={3} value={translation} placeholder={t.translationLabel} onChange={(event) => { setTranslation(event.target.value); setSaved(false) }} />
    </label>

    <button className={saved ? 'saved-deck' : 'primary'} disabled={!word.trim()} onClick={submit}>{saved ? t.savedWord : `＋ ${t.saveWord}`}</button>
  </>

  if (docked) return <div className="word-panel docked" onClick={(event) => event.stopPropagation()}>
    {actions}
    {viewing ? view : form}
  </div>

  // Floating next to the clicked word, clamped inside the viewport.
  const panelWidth = 320
  const panelMaxHeight = Math.min(520, window.innerHeight - 24)
  const left = Math.max(12, Math.min((selected.x ?? 40) - 20, window.innerWidth - panelWidth - 12))
  let top = selected.y ?? 80
  if (top + panelMaxHeight > window.innerHeight - 12) top = Math.max(12, window.innerHeight - panelMaxHeight - 12)

  return <aside className="word-panel floating" style={{ left, top, maxHeight: panelMaxHeight }} onClick={(event) => event.stopPropagation()}>
    {actions}
    {viewing ? view : form}
  </aside>
}

/** Input de tag compact : pilule "+" qui s'ouvre en champ avec dropdown de suggestions. */
function TagInput({ allTags, existingTags, onAdd, label }: {
  allTags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  label: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus()
  }, [isOpen])

  const query = input.trim().toLowerCase()
  const suggestions = query
    ? allTags.filter((t) => t.toLowerCase().includes(query) && !existingTags.includes(t)).slice(0, 6)
    : allTags.filter((t) => !existingTags.includes(t)).slice(0, 6)

  const handleAdd = (tag: string) => {
    onAdd(tag)
    setInput('')
    setIsOpen(false)
  }

  if (!isOpen) {
    return (
      <button type="button" className="wp-tag-chip add-tag" onClick={() => setIsOpen(true)} aria-label={label}>
        +
      </button>
    )
  }

  return (
    <div className="tag-creator">
      <input
        ref={inputRef}
        className="wp-tag-input"
        value={input}
        placeholder={label}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (input.trim()) handleAdd(input.trim()) }
          if (e.key === 'Escape') { setIsOpen(false); setInput('') }
          if (e.key === 'Backspace' && !input) setIsOpen(false)
        }}
        onBlur={() => {
          if (input.trim()) handleAdd(input.trim())
          else { setIsOpen(false); setInput('') }
        }}
      />
      {suggestions.length > 0 && (
        <div className="tag-dropdown">
          {suggestions.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); handleAdd(s) }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Learning Focus — fullscreen reading mode: text on the left, word fields and
 * the Wiktionary embed on the right. The browser is forced into fullscreen by
 * the button that opens this overlay (user gesture).
 */
function FocusReader({ state, resource, ui, onClose, onSaveWord }: {
  state: AppState
  resource: Resource
  ui: UiLanguage
  onClose: () => void
  onSaveWord: (args: WordDetails) => void
}) {
  const t = readerCopy[ui]
  const settings = state.settings
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<{ raw: string; sentence: string } | null>(null)
  const [wikiWord, setWikiWord] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [wikiArmed, setWikiArmed] = useState(false)

  const entries = useMemo(() => flatten(resource), [resource])
  const pages = useMemo(() => paginate(entries, settings.readerPageSize), [entries, settings.readerPageSize])
  const safePage = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePage] ?? []

  const gotoPage = (next: number) => {
    setSelected(null)
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)))
  }

  const clickWord = (raw: string, text: string) => {
    // Dictionary armed: the click opens the dictionary popup instead of the word form.
    if (wikiArmed) {
      setWikiWord(wikiLookup(raw))
      setWikiOpen(true)
      return
    }
    setSelected({ raw, sentence: sentenceOf(raw, text) })
    setWikiWord(wikiLookup(raw))
  }

  return <div className="focus-reader" onClick={() => { setSelected(null); if (wikiArmed) setWikiArmed(false) }}>
    <header className="focus-top">
      <strong className="focus-title">{resource.title}</strong>
      <div className="focus-nav">
        <button aria-label={t.previous} disabled={safePage === 0} onClick={() => gotoPage(safePage - 1)}>←</button>
        <span>{safePage + 1} / {pages.length}</span>
        <button aria-label={t.next} disabled={safePage >= pages.length - 1} onClick={() => gotoPage(safePage + 1)}>→</button>
      </div>
      <button className="focus-exit" onClick={onClose}>✕ {t.focusExit}</button>
    </header>

    <div className="focus-body">
      <article className="focus-text">
        {page.map((entry) => <div key={`${entry.chapterId}-${entry.paragraphIndex}`}>
          {entry.isChapterStart && <h3 className="focus-chapter">{entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`}</h3>}
          <Paragraph text={entry.text} fontSize={settings.readerFontSize + 1} language={resource.language} state={state} markMode={null}
            onWordClick={(raw) => clickWord(raw, entry.text)}
            onLetterClick={() => { }} />
        </div>)}
      </article>

      <aside className="focus-side">
        {selected
          ? <WordPanel ui={ui} selected={selected} state={state} language={resource.language} docked
            onClose={() => setSelected(null)}
            onOpenWord={(raw) => setSelected({ raw, sentence: '' })}
            onSave={(details) => onSaveWord({ ...details, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })} />
          : <p className="focus-hint">{t.focusHint}</p>}
      </aside>
    </div>

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={() => setWikiArmed(!wikiArmed)} />
    {wikiOpen && wikiWord && <WikiPanel word={wikiWord} language={resource.language} onClose={() => setWikiOpen(false)} />}
  </div>
}

function MarkMenu({ ui, type, name, color, style, markColor, onStyle, onColor, onClose }: {
  ui: UiLanguage
  type: GrammarMarkType
  name: string
  color: string
  style: GrammarMarkStyle
  markColor: string
  onStyle: (style: GrammarMarkStyle) => void
  onColor: (color: string) => void
  onClose: () => void
}) {
  const t = readerCopy[ui]
  const [paletteOpen, setPaletteOpen] = useState(false)
  const styles: { id: GrammarMarkStyle; label: string; icon: React.ReactNode }[] = [
    { id: 'highlight', label: t.styleHighlight, icon: <span className="mo-demo mo-highlight" style={{ ['--type-color' as string]: markColor }}>abc</span> },
    { id: 'underline', label: t.styleUnderline, icon: <span className="mo-demo mo-underline" style={{ ['--type-color' as string]: markColor }}>abc</span> },
    { id: 'overlay', label: t.styleOverlay, icon: <span className="mo-demo mo-overlay" style={{ ['--type-color' as string]: markColor }}>abc</span> },
  ]
  return <div className="mark-menu-wrap" onClick={(event) => event.stopPropagation()}>
    <div className="mark-menu glass">
      <span className="mark-menu-type" style={{ ['--type-color' as string]: color }}><i />{name}</span>
      <span className="mark-menu-sep" />
      {styles.map((item) => <button key={item.id} className={style === item.id ? 'mark-option active' : 'mark-option'} onClick={() => onStyle(item.id)}>
        {item.icon}<span>{item.label}</span>
      </button>)}
      <span className="mark-menu-sep" />
      <div className="mark-color-wrap">
        <button className="mark-color" style={{ background: markColor }} onClick={() => setPaletteOpen(!paletteOpen)} aria-label={name} />
        {paletteOpen && <div className="mark-palette glass">
          {MARK_COLORS.map((item) => <button key={item} style={{ background: item }} className={item === markColor ? 'active' : ''}
            onClick={() => { onColor(item); setPaletteOpen(false) }} />)}
        </div>}
      </div>
    </div>
    <button className="mark-menu-close" onClick={onClose}>✕</button>
  </div>
}

function ChapterTitle({ title, hint, onRename }: { title: string; hint: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  return editing
    ? <input className="chapter-title chapter-title-input" autoFocus defaultValue={title}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => { onRename(event.target.value); setEditing(false) }}
      onKeyDown={(event) => { if (event.key === 'Enter') { onRename((event.target as HTMLInputElement).value); setEditing(false) } if (event.key === 'Escape') setEditing(false) }} />
    : <button className="chapter-title" title={hint} onClick={(event) => { event.stopPropagation(); setEditing(true) }}>{title}</button>
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
  const savedWord = state.words.find((word) => word.normalized === normalized && word.language === language)

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
  // Surlignage LUTE : niveau 1-5 = pointillés colorés, 6 (connu par cœur) = aucun surlignage.
  const deckClass = !savedWord || savedWord.knowledge === 6
    ? ''
    : savedWord.knowledge ? `word-known kl-${savedWord.knowledge}` : 'word-known'

  if (markMode === 'silent') return <span className={`word as-span ${markClass} ${deckClass}`} style={style}>{spans}</span>
  return <button className={`word ${markClass} ${deckClass}`} style={style}
    onClick={(event) => { event.stopPropagation(); onClick(raw, event.currentTarget) }}>{spans}</button>
}