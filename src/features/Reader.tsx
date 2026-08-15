import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, GrammarMarkStyle, GrammarMarkType, Language, Resource, UiLanguage, WordMark } from '../domain'
import { normalizeWord } from '../domain'
import { DEFAULT_MARKINGS, knownParents, knownTags } from '../store'
import { copy, readerCopy } from '../i18n'
import { loadOriginals, modifiedCharIndices } from './LearningFocus'

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

const AVAILABLE_MARK_COLORS = [
  '#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2',
  '#db2777', '#059669', '#4f46e5', '#d946ef', '#ea580c', '#0284c7',
  '#84cc16', '#6366f1', '#e11d48', '#0d9488', '#ca8a04', '#9333ea',
]

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
const defaultMarkColor = (typeId: string) => DEFAULT_MARKINGS.find((item) => item.id === typeId)?.color ?? '#2563eb'

export function Cover({ cover, coverImage, type, onClick, editHint }: { cover: Resource['cover']; coverImage?: string; type: string; onClick?: () => void; editHint?: string }) {
  const inner = coverImage
    ? <img className="cover-img" src={coverImage} alt="" />
    : <><span className="cover-type">{type}</span><div className="cover-shape one" /><div className="cover-shape two" /><div className="cover-line" /></>
  if (!onClick) return <div className={`cover ${cover}`}>{inner}</div>
  return <button className={`cover ${cover} cover-editable`} onClick={onClick} title={editHint ?? ''}>{inner}<span className="cover-edit-badge">✎</span></button>
}

export function Reader({ state, resource, ui, onBack, onUpdate, onDelete, onProgress, onSaveWord, onDeleteWord, onOpenFocus, onPageSize, onWordMark, onSilentMark, onMarkColor, onAddMarking, onRenameMarking, onDeleteMarking, onResetMarks }: {
  state: AppState
  resource: Resource
  ui: UiLanguage
  onBack: () => void
  onUpdate: (resource: Resource) => void
  onDelete: (resourceId: string) => void
  onProgress: (resourceId: string, chapterIndex: number, paragraphIndex: number) => void
  onSaveWord: (args: WordDetails) => void
  onDeleteWord?: (raw: string, language: Language) => void
  onOpenFocus: (resource: Resource) => void
  onPageSize: (size: number) => void
  onWordMark: (key: string, mark: WordMark | null) => void
  onSilentMark: (key: string, letterIndex: number) => void
  onMarkColor: (type: GrammarMarkType, color: string) => void
  onAddMarking?: (label: string, color: string) => void
  onRenameMarking?: (markingId: string, newLabel: string) => void
  onDeleteMarking?: (markingId: string) => void
  onResetMarks?: (language: Language) => void
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
  const [markColor, setMarkColor] = useState<string>('#16a34a')
  const [wikiWord, setWikiWord] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [wikiArmed, setWikiArmed] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; markingId: string } | null>(null)
  const [pageContextMenu, setPageContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [editingMarkValue, setEditingMarkValue] = useState('')
  const [newMarkModalOpen, setNewMarkModalOpen] = useState(false)
  const [originals, setOriginals] = useState<Record<string, string>>(() => loadOriginals(resource.id))
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setOriginals(loadOriginals(resource.id))
  }, [resource.id, resource.chapters])

  const markings = useMemo(() => state.markings && state.markings.length > 0 ? state.markings : DEFAULT_MARKINGS, [state.markings])

  const getMarkingLabel = (id: string) => {
    const custom = markings.find((m) => m.id === id)
    if (custom) return custom.label
    return t.marks[id] ?? id
  }

  /** Effective color of a mark type: the user's saved choice wins over the default. */
  const typeColor = (typeId: string) => {
    return settings.markColors[typeId] ?? markings.find((m) => m.id === typeId)?.color ?? defaultMarkColor(typeId)
  }

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setPageContextMenu(null)
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [])

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
      const draft = draftParagraphs[index]
      if (draft !== undefined) {
        chapters[entry.chapterIndex].paragraphs[entry.paragraphIndex] = draft
      }
    })
    onUpdate({ ...resource, chapters })
    setEditing(false)
  }

  const renameChapter = (chapterIndex: number, title: string) => {
    const chapters = resource.chapters.map((chapter, index) => (index === chapterIndex ? { ...chapter, title } : chapter))
    onUpdate({ ...resource, chapters })
  }

  const activateMarkType = (type: GrammarMarkType | 'silent') => {
    if (markMode === type) {
      setMarkMode(null)
      return
    }
    setMarkMode(type)
    if (type !== 'silent') {
      setMarkColor(typeColor(type))
    }
  }

  const pickMarkColor = (color: string) => {
    setMarkColor(color)
    if (markMode && markMode !== 'silent') onMarkColor(markMode, color)
  }

  const clickWord = (raw: string, entry: Entry, target: HTMLElement) => {
    if (wikiArmed) {
      setWikiWord(wikiLookup(raw))
      setWikiOpen(true)
      return
    }
    const normalized = normalizeWord(raw)
    const key = markKey(resource.language, normalized)
    if (markMode && markMode !== 'silent') {
      const current = state.wordMarks[key]
      if (current && current.type === markMode) onWordMark(key, null)
      else onWordMark(key, { type: markMode, style: markStyle, color: markColor })
      return
    }
    const rect = target.getBoundingClientRect()
    setSelected({ raw, sentence: sentenceOf(raw, entry.text), x: rect.left + rect.width / 2, y: rect.bottom + 8 })
    setWikiWord(wikiLookup(raw))
  }

  const startFocus = () => {
    const root = document.documentElement
    if (root.requestFullscreen) {
      root.requestFullscreen().catch(() => {})
    }
    setFocusOpen(true)
  }

  const closeFocus = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => { })
    setFocusOpen(false)
  }

  const handlePageContextMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('.mark-type, .mark-type-add, .mark-context-menu, .mark-inline-input, input, textarea, .word, .paragraph-edit, .chapter-title-input')) {
      return
    }
    event.preventDefault()
    setContextMenu(null)
    setPageContextMenu({ x: event.clientX, y: event.clientY })
  }

  const handleResetFormatting = () => {
    onResetMarks?.(resource.language)
    setPageContextMenu(null)
  }

  const handleResetTeacherMode = () => {
    const origMap = loadOriginals(resource.id)
    if (Object.keys(origMap).length > 0) {
      const chapters = resource.chapters.map((chapter, chapterIndex) => ({
        ...chapter,
        paragraphs: chapter.paragraphs.map((paragraph, paragraphIndex) => {
          const key = `${chapterIndex}:${paragraphIndex}`
          return origMap[key] !== undefined ? origMap[key] : paragraph
        }),
      }))
      onUpdate({ ...resource, chapters })
    }
    localStorage.removeItem(`vivre-focus-${resource.id}`)
    localStorage.removeItem(`vivre-focus-originals-${resource.id}`)
    localStorage.removeItem(`vivre-focus-edited-${resource.id}`)
    setOriginals({})
    setPageContextMenu(null)
  }

  const handleBackToLibrary = () => {
    setPageContextMenu(null)
    onBack()
  }

  const progress = Math.round(((safePage + 1) / pages.length) * 100)
  const activeType = markMode && markMode !== 'silent' ? markMode : null

  return <div className={`reader-page ${markMode === 'silent' ? 'arm-silent' : ''} ${markMode && markMode !== 'silent' ? 'arm-word' : ''}`}
    onClick={() => { setSelected(null); setContextMenu(null); setPageContextMenu(null); if (wikiArmed) setWikiArmed(false) }}
    onContextMenu={handlePageContextMenu}>
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
        {page.map((entry, entryIndex) => {
          const paragraphKey = `${entry.chapterIndex}:${entry.paragraphIndex}`
          const original = originals[paragraphKey]
          const greenChars = (original !== undefined && original !== entry.text)
            ? modifiedCharIndices(original, entry.text)
            : undefined

          return (
            <div key={`${entry.chapterId}-${entry.paragraphIndex}`}>
              {entry.isChapterStart && <ChapterTitle hint={t.chapterRename} title={entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`} onRename={(title) => renameChapter(entry.chapterIndex, title)} />}
              {editing
                ? <textarea className="paragraph-edit" value={draftParagraphs[entryIndex] ?? entry.text} rows={Math.max(3, Math.ceil(entry.text.length / 90))}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setDraftParagraphs((current) => current.map((value, index) => (index === entryIndex ? event.target.value : value)))} />
                : <Paragraph text={entry.text} fontSize={fontSize} language={resource.language} state={state} markMode={markMode} green={greenChars}
                  onWordClick={(raw, target) => clickWord(raw, entry, target)}
                  onLetterClick={(raw, letterIndex) => onSilentMark(markKey(resource.language, normalizeWord(raw)), letterIndex)} />}
            </div>
          )
        })}
        {editing && <button className="primary" onClick={(event) => { event.stopPropagation(); saveEditing() }}>{t.saveText} <span>→</span></button>}
      </article>

      <aside className="reader-right">
        <div className="mark-panel" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow">{t.marking.toUpperCase()}</span>
          {markings.map((type) => {
            const isEditing = editingMarkId === type.id
            return (
              <button
                key={type.id}
                className={markMode === type.id ? 'mark-type active' : 'mark-type'}
                style={{ ['--type-color' as string]: typeColor(type.id) }}
                onClick={() => {
                  if (!isEditing) activateMarkType(type.id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setContextMenu({ x: event.clientX, y: event.clientY, markingId: type.id })
                }}
              >
                <i />
                {isEditing ? (
                  <input
                    className="mark-inline-input"
                    autoFocus
                    value={editingMarkValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingMarkValue(e.target.value)}
                    onBlur={() => {
                      if (editingMarkValue.trim() && editingMarkValue.trim() !== getMarkingLabel(type.id)) {
                        onRenameMarking?.(type.id, editingMarkValue.trim())
                      }
                      setEditingMarkId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingMarkValue.trim() && editingMarkValue.trim() !== getMarkingLabel(type.id)) {
                          onRenameMarking?.(type.id, editingMarkValue.trim())
                        }
                        setEditingMarkId(null)
                      }
                      if (e.key === 'Escape') {
                        setEditingMarkId(null)
                      }
                    }}
                  />
                ) : (
                  <span>{getMarkingLabel(type.id)}</span>
                )}
              </button>
            )
          })}
          <button
            className={markMode === 'silent' ? 'mark-type active' : 'mark-type'}
            style={{ ['--type-color' as string]: '#8a877f' }}
            onClick={() => activateMarkType('silent')}
          >
            <i />
            <span>{t.silentLetter}</span>
          </button>
          <button
            className="mark-type-add"
            onClick={(e) => {
              e.stopPropagation()
              setNewMarkModalOpen(true)
            }}
          >
            {t.addMarking}
          </button>
        </div>
      </aside>
    </section>

    {contextMenu && (
      <div
        className="mark-context-menu"
        style={{ left: Math.min(window.innerWidth - 150, contextMenu.x), top: Math.min(window.innerHeight - 100, contextMenu.y) }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="mark-context-item"
          onClick={() => {
            setEditingMarkId(contextMenu.markingId)
            setEditingMarkValue(getMarkingLabel(contextMenu.markingId))
            setContextMenu(null)
          }}
        >
          ✎ {t.rename}
        </button>
        <button
          className="mark-context-item danger"
          onClick={() => {
            if (markMode === contextMenu.markingId) setMarkMode(null)
            onDeleteMarking?.(contextMenu.markingId)
            setContextMenu(null)
          }}
        >
          🗑 {t.delete}
        </button>
      </div>
    )}

    {pageContextMenu && (
      <div
        className="page-context-menu"
        style={{ left: Math.min(window.innerWidth - 240, pageContextMenu.x), top: Math.min(window.innerHeight - 150, pageContextMenu.y) }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="page-context-item"
          onClick={handleResetFormatting}
        >
          <i>↺</i> {t.resetFormatting}
        </button>
        <button
          type="button"
          className="page-context-item"
          onClick={handleResetTeacherMode}
        >
          <i>✎</i> {t.resetTeacherMode}
        </button>
        <div className="page-context-sep" />
        <button
          type="button"
          className="page-context-item"
          onClick={handleBackToLibrary}
        >
          <i>←</i> {t.backToLibrary}
        </button>
      </div>
    )}

    {newMarkModalOpen && (
      <NewMarkingModal
        ui={ui}
        existingColors={markings.map((m) => typeColor(m.id))}
        onClose={() => setNewMarkModalOpen(false)}
        onCreate={(name, color) => {
          onAddMarking?.(name, color)
        }}
      />
    )}

    {selected && <WordPanel ui={ui} selected={selected} state={state} language={resource.language}
      onClose={() => setSelected(null)}
      onOpenWord={(raw) => setSelected((current) => ({ raw, sentence: current?.sentence ?? '', x: current?.x ?? 80, y: current?.y ?? 120 }))}
      onSave={(details) => onSaveWord({ ...details, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })}
      onDeleteWord={(raw) => onDeleteWord?.(raw, resource.language)} />}

    {markMode && markMode !== 'silent' && activeType && <MarkMenu ui={ui} type={activeType} name={getMarkingLabel(activeType)} color={typeColor(activeType)}
      style={markStyle} markColor={markColor} toolbarStyle={settings.readerToolbarStyle}
      onStyle={setMarkStyle} onColor={pickMarkColor} onClose={() => setMarkMode(null)} />}

    {markMode === 'silent' && <div className="mark-silent-exit" onClick={(event) => event.stopPropagation()}>
      <span>{t.markHintSilent}</span>
      <button onClick={() => setMarkMode(null)}>✕</button>
    </div>}

    {markMode && markMode !== 'silent' && <p className="mark-hint">{t.markHintWord}</p>}

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={() => setWikiArmed(!wikiArmed)} />
    {wikiOpen && wikiWord && <WikiPanel word={wikiWord} language={resource.language} onClose={() => setWikiOpen(false)} />}

    {focusOpen && <FocusReader state={state} resource={resource} ui={ui} onClose={closeFocus} onSaveWord={onSaveWord} onDeleteWord={onDeleteWord} />}
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
function WordPanel({ ui, selected, state, language, docked, onClose, onSave, onDeleteWord, onOpenWord }: {
  ui: UiLanguage
  selected: { raw: string; sentence: string; x?: number; y?: number }
  state: AppState
  language: Language
  docked?: boolean
  onClose: () => void
  onSave: (details: { raw: string; translation: string; parent: string; pronunciation: string; knowledge?: number; tags?: string[] }) => void
  onDeleteWord?: (raw: string) => void
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

  const existing = findExisting()

  const handleDelete = () => {
    onDeleteWord?.(word)
    onClose()
  }

  const actions = <div className="wp-actions">
    {existing && <button className="wp-icon wp-icon-delete" title="Supprimer le mot enregistré" aria-label="Supprimer le mot enregistré" onClick={handleDelete}>🗑</button>}
    {viewing && <button className="wp-icon wp-icon-edit" title={t.editWord} aria-label={t.editWord} onClick={() => setViewing(false)}>✎</button>}
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
    <div className="wp-field">
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

    <div className="wp-field">
      <input value={pronunciation} placeholder={t.pronunciationLabel} onChange={(event) => { setPronunciation(event.target.value); setSaved(false) }} />
    </div>

    <div className="wp-field">
      <textarea rows={3} value={translation} placeholder={t.translationLabel} onChange={(event) => { setTranslation(event.target.value); setSaved(false) }} />
    </div>

    <div className="wp-field">
      <TagInput allTags={allTags} existingTags={tags} onAdd={addTag} onRemove={removeTag} label={t.tagLabel} />
    </div>

    <div className="wp-footer">
      <button className={saved ? 'saved-deck' : 'primary'} disabled={!word.trim()} onClick={submit}>{saved ? t.savedWord : `＋ ${t.saveWord}`}</button>
      {word && <span className="wp-footer-word"><em>{word}</em></span>}
    </div>
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

/** Input de tag avec autocomplétion inline (style Google) et liste des tags en texte brut à droite. */
function TagInput({ allTags, existingTags, onAdd, onRemove, label }: {
  allTags: string[]
  existingTags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  label: string
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const query = input.trim().toLowerCase()
  const match = query
    ? allTags.find((t) => t.toLowerCase().startsWith(query) && !existingTags.some((ex) => ex.toLowerCase() === t.toLowerCase()))
    : undefined

  const ghostSuffix = match && input ? match.slice(input.length) : ''

  const handleCommit = (tagToCommit?: string) => {
    const finalTag = tagToCommit || match || input.trim()
    if (finalTag) {
      onAdd(finalTag)
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCommit()
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      if (match) {
        e.preventDefault()
        setInput(match)
      }
    } else if (e.key === 'Escape') {
      setInput('')
    }
  }

  return (
    <div className="wp-tag-line-row">
      <div className="wp-tag-input-box">
        <div className="wp-tag-ghost-text" aria-hidden="true">
          <span className="wp-tag-ghost-typed">{input}</span>
          <span className="wp-tag-ghost-suffix">{ghostSuffix}</span>
        </div>
        <input
          ref={inputRef}
          className="wp-tag-input-field"
          value={input}
          placeholder={existingTags.length === 0 ? label : '+ Tag'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) {
              handleCommit()
            }
          }}
        />
      </div>
      {existingTags.length > 0 && (
        <div className="wp-tag-text-list">
          {existingTags.map((item) => (
            <button
              key={item}
              type="button"
              className="wp-tag-text-item"
              title="Cliquer pour supprimer"
              aria-label={`Supprimer ${item}`}
              onClick={() => onRemove(item)}
            >
              {item}
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
function FocusReader({ state, resource, ui, onClose, onSaveWord, onDeleteWord }: {
  state: AppState
  resource: Resource
  ui: UiLanguage
  onClose: () => void
  onSaveWord: (args: WordDetails) => void
  onDeleteWord?: (raw: string, language: Language) => void
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
        {page.map((entry) => {
          const origMap = loadOriginals(resource.id)
          const paragraphKey = `${entry.chapterIndex}:${entry.paragraphIndex}`
          const original = origMap[paragraphKey]
          const greenChars = (original !== undefined && original !== entry.text)
            ? modifiedCharIndices(original, entry.text)
            : undefined

          return (
            <div key={`${entry.chapterId}-${entry.paragraphIndex}`}>
              {entry.isChapterStart && <h3 className="focus-chapter">{entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`}</h3>}
              <Paragraph text={entry.text} fontSize={settings.readerFontSize + 1} language={resource.language} state={state} markMode={null} green={greenChars}
                onWordClick={(raw) => clickWord(raw, entry.text)}
                onLetterClick={() => { }} />
            </div>
          )
        })}
      </article>

      <aside className="focus-side">
        {selected
          ? <WordPanel ui={ui} selected={selected} state={state} language={resource.language} docked
            onClose={() => setSelected(null)}
            onOpenWord={(raw) => setSelected({ raw, sentence: '' })}
            onSave={(details) => onSaveWord({ ...details, sentence: selected.sentence, language: resource.language, sourceResourceId: resource.id })}
            onDeleteWord={(raw) => onDeleteWord?.(raw, resource.language)} />
          : <p className="focus-hint">{t.focusHint}</p>}
      </aside>
    </div>

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={() => setWikiArmed(!wikiArmed)} />
    {wikiOpen && wikiWord && <WikiPanel word={wikiWord} language={resource.language} onClose={() => setWikiOpen(false)} />}
  </div>
}

function MarkMenu({ ui, type, name, color, style, markColor, toolbarStyle, onStyle, onColor, onClose }: {
  ui: UiLanguage
  type: GrammarMarkType
  name: string
  color: string
  style: GrammarMarkStyle
  markColor: string
  toolbarStyle?: string
  onStyle: (style: GrammarMarkStyle) => void
  onColor: (color: string) => void
  onClose: () => void
}) {
  const t = readerCopy[ui]
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hexOpen, setHexOpen] = useState(false)
  const [hexInput, setHexInput] = useState(markColor)
  const nativeColorRef = useRef<HTMLInputElement>(null)

  const PRESET_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777']

  const styles: { id: GrammarMarkStyle; label: string; icon: React.ReactNode }[] = [
    { id: 'highlight', label: t.styleHighlight, icon: <span className="mo-demo mo-highlight" style={{ ['--type-color' as string]: markColor }}>abc</span> },
    { id: 'underline', label: t.styleUnderline, icon: <span className="mo-demo mo-underline" style={{ ['--type-color' as string]: markColor }}>abc</span> },
    { id: 'overlay', label: t.styleOverlay, icon: <span className="mo-demo mo-overlay" style={{ ['--type-color' as string]: markColor }}>abc</span> },
  ]

  const handleApplyHex = (val: string) => {
    let clean = val.trim()
    if (!clean.startsWith('#')) clean = '#' + clean
    setHexInput(clean)
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      onColor(clean)
    }
  }

  const glassClass = toolbarStyle === 'opaque' ? 'glass toolbar-opaque' : toolbarStyle === 'solid' ? 'glass toolbar-solid' : 'glass'

  return <div className="mark-menu-wrap" onClick={(event) => event.stopPropagation()}>
    <div className={`mark-menu ${glassClass}`}>
      <span className="mark-menu-type" style={{ ['--type-color' as string]: color }}><i />{name}</span>
      <span className="mark-menu-sep" />
      {styles.map((item) => <button key={item.id} className={style === item.id ? 'mark-option active' : 'mark-option'} onClick={() => onStyle(item.id)}>
        {item.icon}<span>{item.label}</span>
      </button>)}
      <span className="mark-menu-sep" />
      <div className="mark-color-wrap">
        <button className="mark-color" style={{ background: markColor }} onClick={() => { setPaletteOpen(!paletteOpen); setHexOpen(false) }} aria-label={name} />
        {paletteOpen && !hexOpen && <div className={`mark-palette ${glassClass}`}>
          {PRESET_COLORS.map((item) => (
            <button
              key={item}
              style={{ background: item }}
              className={`mark-palette-color ${item.toLowerCase() === markColor.toLowerCase() ? 'active' : ''}`}
              onClick={() => { onColor(item); setPaletteOpen(false) }}
            />
          ))}
          <button
            type="button"
            className="mark-palette-custom-btn"
            title={t.customColor}
            onClick={() => { setHexOpen(true); setHexInput(markColor) }}
          >
            +
          </button>
        </div>}

        {paletteOpen && hexOpen && <div className={`mark-hex-panel ${glassClass}`}>
          <div className="mark-hex-input-row">
            <button
              type="button"
              className="mark-hex-preview"
              style={{ background: markColor }}
              title={t.customColor}
              onClick={() => nativeColorRef.current?.click()}
            />
            <input
              ref={nativeColorRef}
              type="color"
              className="mark-hex-native-input"
              value={markColor.startsWith('#') && markColor.length === 7 ? markColor : '#2563eb'}
              onChange={(e) => {
                onColor(e.target.value)
                setHexInput(e.target.value)
              }}
            />
            <input
              type="text"
              className="mark-hex-input"
              placeholder="#HEX"
              maxLength={7}
              value={hexInput}
              onChange={(e) => handleApplyHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setPaletteOpen(false)
              }}
            />
          </div>
          <button type="button" className="mark-hex-back-btn" onClick={() => setHexOpen(false)}>
            ← {t.back.replace('←', '').trim()}
          </button>
        </div>}
      </div>
    </div>
    <button className="mark-menu-close" onClick={onClose}>✕</button>
  </div>
}

function NewMarkingModal({
  ui,
  existingColors,
  onClose,
  onCreate,
}: {
  ui: UiLanguage
  existingColors: string[]
  onClose: () => void
  onCreate: (label: string, color: string) => void
}) {
  const t = readerCopy[ui]
  const normalizedExisting = useMemo(() => new Set(existingColors.map((c) => c.toLowerCase())), [existingColors])
  const initialColor = AVAILABLE_MARK_COLORS.find((c) => !normalizedExisting.has(c.toLowerCase())) ?? AVAILABLE_MARK_COLORS[0]
  const [label, setLabel] = useState('')
  const [selectedColor, setSelectedColor] = useState(initialColor)
  const nativeColorRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!label.trim()) return
    onCreate(label.trim(), selectedColor)
    onClose()
  }

  return (
    <div className="mark-modal-overlay" onClick={onClose}>
      <div className="mark-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="mark-modal-head">
          <h3>{t.newMarking}</h3>
          <button onClick={onClose} aria-label={t.cancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="mark-modal-field">
            <label>{t.markingName}</label>
            <input
              type="text"
              autoFocus
              placeholder={t.markingNamePlaceholder}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="mark-modal-field">
            <label>{t.marks.verb ? `${t.marks.verb} / ${t.marking}` : 'Couleur'}</label>
            <div className="mark-color-palette-grid">
              {AVAILABLE_MARK_COLORS.map((color) => {
                const isUsed = normalizedExisting.has(color.toLowerCase())
                const isSelected = selectedColor.toLowerCase() === color.toLowerCase()
                return (
                  <button
                    type="button"
                    key={color}
                    disabled={isUsed}
                    title={isUsed ? t.colorAlreadyUsed : color}
                    className={`mark-color-choice-btn ${isSelected ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => {
                      if (!isUsed) setSelectedColor(color)
                    }}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="text-button"
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
                onClick={() => nativeColorRef.current?.click()}
              >
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: selectedColor, display: 'inline-block', border: '1px solid var(--line)' }} />
                <span>{t.customColor}</span>
              </button>
              <input
                ref={nativeColorRef}
                type="color"
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                value={selectedColor.startsWith('#') && selectedColor.length === 7 ? selectedColor : '#2563eb'}
                onChange={(e) => setSelectedColor(e.target.value)}
              />
            </div>
          </div>

          <div className="mark-modal-actions">
            <button type="button" className="outline" onClick={onClose}>{t.cancel}</button>
            <button type="submit" className="primary" disabled={!label.trim()}>{t.createMarking} <span>→</span></button>
          </div>
        </form>
      </div>
    </div>
  )
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

function Paragraph({ text, fontSize, language, state, markMode, green, onWordClick, onLetterClick }: {
  text: string
  fontSize: number
  language: Language
  state: AppState
  markMode: MarkMode
  green?: Set<number>
  onWordClick: (raw: string, target: HTMLElement) => void
  onLetterClick: (raw: string, letterIndex: number) => void
}) {
  let offset = 0
  return <p className="paragraph" style={{ fontSize }}>
    {text.split(/(\s+)/).map((part, index) => {
      if (/\s+/.test(part)) {
        offset += part.length
        return <span key={index}>{part}</span>
      }
      const wordOffset = offset
      offset += part.length
      return (
        <Word key={`${part}-${index}`} raw={part} language={language} state={state} markMode={markMode} green={green} offset={wordOffset} onClick={onWordClick} onLetterClick={onLetterClick} />
      )
    })}
  </p>
}

function Word({ raw, language, state, markMode, green, offset = 0, onClick, onLetterClick }: {
  raw: string
  language: Language
  state: AppState
  markMode: MarkMode
  green?: Set<number>
  offset?: number
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
    const isGreen = green?.has(offset + index) ?? false
    const cls = `${isGreen ? 'edited-char' : ''} ${isGrayed ? 'user-gray' : ''}`.trim()
    if (markMode === 'silent') {
      return <span key={index} className={`letter-cell ${cls}`}
        onClick={(event) => { event.stopPropagation(); if (isAlpha) onLetterClick(raw, myAlpha) }}>{letter}</span>
    }
    return <span key={index} className={cls || undefined}>{letter}</span>
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