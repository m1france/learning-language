import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, GrammarMarkStyle, GrammarMarkType, Language, LearnedWord, Resource, UiLanguage, WordMark, WordRelationType } from '../domain'
import { normalizeWord } from '../domain'
import { DEFAULT_MARKINGS, knownParents, knownTags, resolveWordFamily, setWordAsReference, type WordFamily } from '../store'
import { copy, readerCopy } from '../i18n'
import { loadOriginals, modifiedCharIndices } from './LearningFocus'
import { isGenericImportedAuthor } from '../App'
import {
  ArrowLeft,
  ArrowLeftRight,
  Maximize2,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  RotateCcw,
  Undo2,
  Plus,
  X,
  Check,
  Minimize2,
  Globe,
  BookOpen,
  BookmarkPlus,
  Star,
  Volume2,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { speak } from '../ai'
import { analyzeWordWithAi } from './speaking/wordAiService'
import {
  ResourceContextMenu,
  EditContentModal,
  RenameModal,
  DeleteModal,
  type ResourceAction,
  type ResourceContextTarget,
} from '../components/ResourceModals'

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
  sourceResourceId?: string
  translation: string
  parent: string
  relationType?: WordRelationType
  partOfSpeech?: string
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

let lastMultiWordDragTimestamp = 0

const cleanRaw = (raw: string) => raw.replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '').replace(/\s+/g, ' ').trim()
/** Retire les élisions françaises (l', d', j'…) pour la recherche dictionnaire. */
const wikiLookup = (raw: string) => cleanRaw(raw).replace(/^(l|d|j|n|s|t|c|qu|m)['’]/i, '')
const wikiUrl = (language: Language, word: string) => `https://${language}.wiktionary.org/wiki/${encodeURIComponent(word)}`
/** Linguee (DeepL) — dictionnaire français ↔ anglais, autorise l'embedding. */
const lingueeUrl = (language: Language, word: string) =>
  language === 'fr'
    ? `https://www.linguee.com/french-english/translation/${encodeURIComponent(word)}.html`
    : `https://www.linguee.com/english-french/translation/${encodeURIComponent(word)}.html`

/** Cambridge Dictionary — prononciation audio sound-by-sound (UK/US). */
const cambridgeUrl = (language: Language, word: string) => {
  const clean = cleanRaw(word).toLowerCase()
  if (language === 'fr') {
    return `https://dictionary.cambridge.org/dictionary/french-english/${encodeURIComponent(clean)}`
  }
  return `https://dictionary.cambridge.org/pronunciation/english/${encodeURIComponent(clean)}`
}

export type DictionaryTabId = 'wiktionary' | 'linguee' | 'cambridge'

const DICTIONARY_TABS: Record<DictionaryTabId, { label: string; getUrl: (language: Language, word: string) => string }> = {
  wiktionary: {
    label: 'Wiktionary',
    getUrl: wikiUrl,
  },
  linguee: {
    label: 'Linguee',
    getUrl: lingueeUrl,
  },
  cambridge: {
    label: 'Cambridge',
    getUrl: cambridgeUrl,
  },
}

function getSavedDefaultTab(): DictionaryTabId {
  try {
    const raw = localStorage.getItem('vivre-dict-default-tab')
    if (raw === 'wiktionary' || raw === 'linguee' || raw === 'cambridge') return raw
  } catch {}
  return 'wiktionary'
}

function getSavedTabOrder(): DictionaryTabId[] {
  try {
    const raw = localStorage.getItem('vivre-dict-tab-order')
    if (raw) {
      const parsed = JSON.parse(raw) as DictionaryTabId[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        const allTabs: DictionaryTabId[] = ['wiktionary', 'linguee', 'cambridge']
        const filtered = parsed.filter((id) => allTabs.includes(id))
        allTabs.forEach((id) => { if (!filtered.includes(id)) filtered.push(id) })
        return filtered
      }
    }
  } catch {}
  return ['wiktionary', 'linguee', 'cambridge']
}

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

export function Cover({
  cover,
  coverImage,
  type,
  isAiGenerated,
  onClick,
  onContextMenu,
  editHint,
}: {
  cover: Resource['cover']
  coverImage?: string
  type: string
  isAiGenerated?: boolean
  onClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  editHint?: string
}) {
  const inner = (
    <>
      {coverImage ? (
        <img className="cover-img" src={coverImage} alt="" />
      ) : (
        <>
          <span className="cover-type">{type}</span>
          <div className="cover-shape one" />
          <div className="cover-shape two" />
          <div className="cover-line" />
        </>
      )}
      {isAiGenerated && (
        <span className="cover-ai-watermark" title="Généré avec l'IA">
          IA
        </span>
      )}
    </>
  )
  if (!onClick && !onContextMenu) return <div className={`cover ${cover}`}>{inner}</div>
  return (
    <button
      className={`cover ${cover} cover-editable`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={editHint ?? ''}
    >
      {inner}
      <span className="cover-edit-badge"><Pencil size={11} /></span>
    </button>
  )
}

export function Reader({ state, resource, ui, onBack, onUpdate, onDelete, onProgress, onSaveWord, onDeleteWord, onOpenFocus, onPageSize, onWordMark, onSilentMark, onMarkColor, onAddMarking, onRenameMarking, onDeleteMarking, onResetMarks, onAiTaskChange }: {
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
  onAiTaskChange?: (running: boolean) => void
}) {
  const t = readerCopy[ui]
  const settings = state.settings
  const categoryLabel = (typeId: string) => copy[ui].categories[typeId] ?? state.customCategories.find((c) => c.id === typeId)?.label ?? typeId
  const [pageIndex, setPageIndex] = useState(() => Number(localStorage.getItem(`vivre-page-${resource.id}`) ?? 0) || 0)
  const [fontSize, setFontSize] = useState(settings.readerFontSize)
  const [selected, setSelected] = useState<SelectedWord | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [markMode, setMarkMode] = useState<MarkMode>(null)
  const [markStyle, setMarkStyle] = useState<GrammarMarkStyle>('highlight')
  const [markColor, setMarkColor] = useState<string>('#16a34a')
  const [wikiWord, setWikiWord] = useState('')
  const [wikiOpen, setWikiOpen] = useState(false)
  const [wikiArmed, setWikiArmed] = useState(false)
  const [wikiDefaultTab, setWikiDefaultTab] = useState<DictionaryTabId>(getSavedDefaultTab)
  const [focusOpen, setFocusOpen] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(() => localStorage.getItem('vivre-reader-left-collapsed') === '1')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; markingId: string } | null>(null)
  const [pageContextMenu, setPageContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [wordContextMenu, setWordContextMenu] = useState<{ x: number; y: number; raw: string; sentence: string; isSaved: boolean } | null>(null)
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [editingMarkValue, setEditingMarkValue] = useState('')
  const [savingWordAi, setSavingWordAi] = useState<string | null>(null)
  const [newMarkModalOpen, setNewMarkModalOpen] = useState(false)
  const [originals, setOriginals] = useState<Record<string, string>>(() => loadOriginals(resource.id))
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveWordWithAi = async (rawWord: string, sentence: string) => {
    const cleaned = cleanRaw(rawWord)
    if (!cleaned) return
    setSavingWordAi(cleaned)
    onAiTaskChange?.(true)
    try {
      const analysis = await analyzeWordWithAi({
        word: cleaned,
        targetLang: resource.language,
        uiLang: ui,
        existingTags: knownTags(state, resource.language),
        api: state.settings.api,
        contextSentence: sentence,
      })
      onSaveWord({
        raw: analysis.word || cleaned,
        sentence,
        language: resource.language,
        sourceResourceId: resource.id,
        translation: analysis.translation,
        parent: analysis.parent,
        pronunciation: analysis.pronunciation,
        partOfSpeech: analysis.partOfSpeech,
        tags: analysis.tags,
        knowledge: 1,
      })
    } catch (e) {
      console.error('[Reader] Error saving word with AI:', e)
    } finally {
      setSavingWordAi(null)
      onAiTaskChange?.(false)
    }
  }

  // Resource context menu & actions state (for right-clicking cover)
  const [resourceMenuTarget, setResourceMenuTarget] = useState<ResourceContextTarget | null>(null)
  const [editingContent, setEditingContent] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const toggleLeftPanel = () => {
    const next = !leftCollapsed
    setLeftCollapsed(next)
    localStorage.setItem('vivre-reader-left-collapsed', next ? '1' : '0')
  }

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
    const handleGlobalPointerDown = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.mark-context-menu, .page-context-menu, .word-context-menu, .resource-context-menu')) {
        return
      }
      setContextMenu(null)
      setPageContextMenu(null)
      setResourceMenuTarget(null)
      setWordContextMenu(null)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setPageContextMenu(null)
        setResourceMenuTarget(null)
        setWordContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handleGlobalPointerDown, true)
    window.addEventListener('touchstart', handleGlobalPointerDown, true)
    window.addEventListener('scroll', handleGlobalPointerDown, true)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleGlobalPointerDown, true)
      window.removeEventListener('touchstart', handleGlobalPointerDown, true)
      window.removeEventListener('scroll', handleGlobalPointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const toggleWiki = () => {
    if (wikiOpen || wikiArmed) {
      setWikiOpen(false)
      setWikiArmed(false)
    } else {
      setWikiArmed(true)
      setWikiOpen(false)
    }
  }

  // Raccourci clavier 'W' pour activer / désactiver Wiktionary & Linguee
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input, textarea, [contenteditable="true"]'))
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'w') {
        event.preventDefault()
        toggleWiki()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wikiOpen, wikiArmed])

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

  const knownPhrases = useMemo(() => {
    const fromWords = state.words
      .filter((w) => w.language === resource.language && w.word.trim().includes(' '))
      .map((w) => w.word.trim())
    const fromMarks = Object.keys(state.wordMarks)
      .filter((k) => k.startsWith(`${resource.language}:`) && k.includes(' '))
      .map((k) => k.slice(resource.language.length + 1))
    const all = Array.from(new Set([...fromWords, ...fromMarks]))
    return all.sort((a, b) => b.length - a.length)
  }, [state.words, state.wordMarks, resource.language])

  const clickWord = (raw: string, entry: Entry, target: HTMLElement, isInstance = false, offset = 0) => {
    const cleaned = cleanRaw(raw)
    if (!cleaned) return

    if (wikiArmed) {
      setWikiWord(wikiLookup(cleaned))
      setWikiOpen(true)
      return
    }
    const normalized = normalizeWord(cleaned)
    const genericKey = markKey(resource.language, normalized)
    const instKey = `inst:${resource.id}:${entry.chapterIndex}:${entry.paragraphIndex}:${offset}`

    if (markMode && markMode !== 'silent') {
      if (isInstance) {
        const currentInst = state.wordMarks[instKey]
        if (currentInst && currentInst.type === markMode) onWordMark(instKey, null)
        else onWordMark(instKey, { type: markMode, style: markStyle, color: markColor })
        return
      }
      const current = state.wordMarks[genericKey]
      if (current && current.type === markMode) onWordMark(genericKey, null)
      else onWordMark(genericKey, { type: markMode, style: markStyle, color: markColor })
      return
    }
    const rect = target.getBoundingClientRect()
    setSelected({ raw: cleaned, sentence: sentenceOf(cleaned, entry.text), x: rect.left + rect.width / 2, y: rect.bottom + 8 })
    setWikiWord(wikiLookup(cleaned))
  }

  const handleMultiWordSelect = (
    phrase: string,
    startOffset: number,
    _endOffset: number,
    entry: Entry,
    isInstance: boolean,
    event: MouseEvent | React.MouseEvent
  ) => {
    const cleaned = cleanRaw(phrase)
    if (!cleaned) return

    if (wikiArmed) {
      setWikiWord(wikiLookup(cleaned))
      setWikiOpen(true)
      return
    }

    if (markMode && markMode !== 'silent') {
      const instKey = `inst:${resource.id}:${entry.chapterIndex}:${entry.paragraphIndex}:${startOffset}`
      const genericKey = markKey(resource.language, normalizeWord(cleaned))
      if (isInstance) {
        const cur = state.wordMarks[instKey]
        if (cur && cur.type === markMode) onWordMark(instKey, null)
        else onWordMark(instKey, { type: markMode, style: markStyle, color: markColor })
      } else {
        const cur = state.wordMarks[genericKey]
        if (cur && cur.type === markMode) onWordMark(genericKey, null)
        else onWordMark(genericKey, { type: markMode, style: markStyle, color: markColor })
      }
      return
    }

    const x = Math.min(window.innerWidth - 160, Math.max(160, 'clientX' in event ? event.clientX : window.innerWidth / 2))
    const y = Math.min(window.innerHeight - 100, 'clientY' in event ? event.clientY + 12 : 200)
    setSelected({
      raw: cleaned,
      sentence: sentenceOf(cleaned, entry.text),
      x,
      y,
    })
    setWikiWord(wikiLookup(cleaned))
  }

  useEffect(() => {
    const handleWindowSelection = (e: MouseEvent) => {
      if (Date.now() - lastMultiWordDragTimestamp < 500) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const text = sel.toString().trim()
      if (!text || !text.includes(' ')) return

      const target = e.target as HTMLElement | null
      if (!target?.closest('.reading-text, .focus-text')) return

      const cleaned = cleanRaw(text)
      if (cleaned.length < 2) return

      lastMultiWordDragTimestamp = Date.now()

      let x = e.clientX
      let y = e.clientY + 14
      try {
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0) {
          x = rect.left + rect.width / 2
          y = rect.bottom + 8
        }
      } catch {}

      x = Math.min(window.innerWidth - 160, Math.max(160, x))
      y = Math.min(window.innerHeight - 100, y)

      if (markMode && markMode !== 'silent') {
        const isInstance = e.altKey || e.ctrlKey
        const genericKey = markKey(resource.language, normalizeWord(cleaned))
        if (!isInstance) {
          onWordMark(genericKey, { type: markMode, style: markStyle, color: markColor })
        }
        return
      }

      const parText = target.closest('.paragraph')?.textContent ?? cleaned
      setSelected({
        raw: cleaned,
        sentence: sentenceOf(cleaned, parText),
        x,
        y,
      })
      setWikiWord(wikiLookup(cleaned))
    }

    document.addEventListener('mouseup', handleWindowSelection)
    return () => document.removeEventListener('mouseup', handleWindowSelection)
  }, [markMode, markStyle, markColor, resource.language, onWordMark])

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
    if (target.closest('.mark-type, .mark-type-add, .mark-context-menu, .mark-inline-input, input, textarea, .word, .paragraph-edit, .chapter-title-input, .cover, .word-panel, .word-panel-wrapper, .wp-companion-panel, .wiki-panel, .focus-side, .modal-backdrop, .modal-card, [contenteditable="true"]')) {
      return
    }
    event.preventDefault()
    setContextMenu(null)
    setResourceMenuTarget(null)
    setPageContextMenu({ x: event.clientX, y: event.clientY })
  }

  const handleCoverContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setPageContextMenu(null)
    setResourceMenuTarget({ resource, x: event.clientX, y: event.clientY })
  }

  const handleResourceAction = (action: ResourceAction) => {
    if (action === 'editContent') setEditingContent(true)
    else if (action === 'rename') setRenaming(true)
    else if (action === 'changeCover') fileInputRef.current?.click()
    else if (action === 'delete') setDeleting(true)
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

  const handleWordContextMenu = (raw: string, entry: Entry, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setPageContextMenu(null)
    setResourceMenuTarget(null)
    const normalized = normalizeWord(raw)
    const isSaved = Boolean(state.words.find((w) => w.normalized === normalized && w.language === resource.language))
    setWordContextMenu({
      x: event.clientX,
      y: event.clientY,
      raw,
      sentence: sentenceOf(raw, entry.text),
      isSaved,
    })
  }

  return <div className={`reader-page ${markMode === 'silent' ? 'arm-silent' : ''} ${markMode && markMode !== 'silent' ? 'arm-word' : ''}`}
    onClick={() => {
      if (Date.now() - lastMultiWordDragTimestamp < 500) return
      setSelected(null); setContextMenu(null); setPageContextMenu(null); setResourceMenuTarget(null); setWordContextMenu(null); if (wikiArmed) setWikiArmed(false)
    }}
    onContextMenu={handlePageContextMenu}>
    <header className="reader-top">
      <button className="text-button" onClick={(event) => { event.stopPropagation(); onBack() }}><ArrowLeft size={16} /> {t.back.replace('←', '').trim()}</button>
      <div className="reader-controls">
        <button className="control control-learning-focus" onClick={(event) => { event.stopPropagation(); startFocus() }}><Maximize2 size={14} /> {t.focus}</button>
        <button className="control control-focus" onClick={(event) => { event.stopPropagation(); onOpenFocus(resource) }}><GraduationCap size={14} /> {t.teacherMode}</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.min(26, fontSize + 1)) }}>A+</button>
        <button className="control" onClick={(event) => { event.stopPropagation(); setFontSize(Math.max(15, fontSize - 1)) }}>A−</button>
        <select className="control page-size" value={settings.readerPageSize} onClick={(event) => event.stopPropagation()} onChange={(event) => { onPageSize(Number(event.target.value)); setPageIndex(0) }}>
          {PAGE_SIZE_OPTIONS.map((size) => <option value={size} key={size}>{size} {t.wordsPerPage}</option>)}
        </select>
      </div>
    </header>

    <section className={`reader-layout ${leftCollapsed ? 'left-collapsed' : ''}`}>
      <aside className={`reader-aside ${leftCollapsed ? 'collapsed' : ''}`}>
        <div className="reader-aside-inner">
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => pickCover(event.target.files?.[0])} />
          <Cover
            cover={resource.cover}
            coverImage={resource.coverImage}
            type={categoryLabel(resource.type)}
            isAiGenerated={resource.isAiGenerated}
            onClick={() => fileInputRef.current?.click()}
            onContextMenu={handleCoverContextMenu}
            editHint={t.coverChange}
          />
          <div className="reader-aside-meta">
            <span className="tag">{categoryLabel(resource.type)}</span>
            {editingTitle
              ? <input className="title-inline" autoFocus defaultValue={resource.title}
                onClick={(event) => event.stopPropagation()}
                onBlur={(event) => saveTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') saveTitle((event.target as HTMLInputElement).value); if (event.key === 'Escape') setEditingTitle(false) }} />
              : <h2 className="title-clickable" title={t.renameHint} onClick={(event) => { event.stopPropagation(); setEditingTitle(true) }}>{resource.title}</h2>}
            {resource.author && !isGenericImportedAuthor(resource.author) && <p>{resource.author}</p>}
          </div>
          <div className="reader-progress"><div><span>{t.progress}</span><strong>{progress}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div>
          <div className="reader-page-nav">
            <button aria-label={t.previous} disabled={safePage === 0} onClick={(event) => { event.stopPropagation(); gotoPage(safePage - 1) }}><ChevronLeft size={18} /></button>
            <span>{safePage + 1} / {pages.length}</span>
            <button aria-label={t.next} disabled={safePage >= pages.length - 1} onClick={(event) => { event.stopPropagation(); gotoPage(safePage + 1) }}><ChevronRight size={18} /></button>
          </div>
        </div>
      </aside>

      <button
        className={`reader-toggle-left-btn ${leftCollapsed ? 'collapsed' : ''}`}
        onClick={(event) => { event.stopPropagation(); toggleLeftPanel() }}
        title={leftCollapsed ? 'Afficher les informations de la ressource' : 'Masquer les informations de la ressource'}
        aria-label={leftCollapsed ? 'Afficher les informations de la ressource' : 'Masquer les informations de la ressource'}
      >
        {leftCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <article className={`reading-text ${settings.readerWidth}`}>
        {page.map((entry) => {
          const paragraphKey = `${entry.chapterIndex}:${entry.paragraphIndex}`
          const original = originals[paragraphKey]
          const greenChars = (original !== undefined && original !== entry.text)
            ? modifiedCharIndices(original, entry.text)
            : undefined

          return (
            <div key={`${entry.chapterId}-${entry.paragraphIndex}`}>
              {entry.isChapterStart && <ChapterTitle hint={t.chapterRename} title={entry.chapterTitle || `${t.chapterDefault} ${entry.chapterIndex + 1}`} onRename={(title) => renameChapter(entry.chapterIndex, title)} />}
              <Paragraph
                text={entry.text}
                fontSize={fontSize}
                language={resource.language}
                state={state}
                markMode={markMode}
                green={greenChars}
                resourceId={resource.id}
                chapterIndex={entry.chapterIndex}
                paragraphIndex={entry.paragraphIndex}
                knownPhrases={knownPhrases}
                onWordClick={(raw, target, isInstance, offset) => clickWord(raw, entry, target, isInstance, offset)}
                onMultiWordSelect={(phrase, startOffset, endOffset, isInstance, event) => handleMultiWordSelect(phrase, startOffset, endOffset, entry, isInstance, event)}
                onWordContextMenu={(raw, event) => handleWordContextMenu(raw, entry, event)}
                onLetterClick={(raw, letterIndex) => onSilentMark(markKey(resource.language, normalizeWord(raw)), letterIndex)}
              />
            </div>
          )
        })}
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
            <Plus size={13} /> {t.addMarking}
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
          <Pencil size={13} /> {t.rename}
        </button>
        <button
          className="mark-context-item danger"
          onClick={() => {
            if (markMode === contextMenu.markingId) setMarkMode(null)
            onDeleteMarking?.(contextMenu.markingId)
            setContextMenu(null)
          }}
        >
          <Trash2 size={13} /> {t.delete}
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
          <i><RotateCcw size={14} /></i> {t.resetFormatting}
        </button>
        <button
          type="button"
          className="page-context-item"
          onClick={handleResetTeacherMode}
        >
          <i><Undo2 size={14} /></i> {t.resetTeacherMode}
        </button>
        <div className="page-context-sep" />
        <button
          type="button"
          className="page-context-item"
          onClick={handleBackToLibrary}
        >
          <i><ArrowLeft size={14} /></i> {t.backToLibrary}
        </button>
      </div>
    )}

    {resourceMenuTarget && (
      <ResourceContextMenu
        target={resourceMenuTarget}
        onSelectAction={handleResourceAction}
        onClose={() => setResourceMenuTarget(null)}
      />
    )}

    {editingContent && (
      <EditContentModal
        resource={resource}
        onSave={(updated) => onUpdate(updated)}
        onClose={() => setEditingContent(false)}
      />
    )}

    {renaming && (
      <RenameModal
        resource={resource}
        onSave={(updated) => onUpdate(updated)}
        onClose={() => setRenaming(false)}
      />
    )}

    {deleting && (
      <DeleteModal
        resource={resource}
        onConfirm={(id) => {
          onDelete(id)
          onBack()
        }}
        onClose={() => setDeleting(false)}
      />
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
      <button onClick={() => setMarkMode(null)}><X size={14} /></button>
    </div>}

    {markMode && markMode !== 'silent' && <p className="mark-hint">{t.markHintWord}</p>}

    {wordContextMenu && (
      <div
        className="word-context-menu"
        style={{ left: Math.min(window.innerWidth - 240, wordContextMenu.x), top: Math.min(window.innerHeight - 170, wordContextMenu.y) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="word-context-head">
          <strong>{cleanRaw(wordContextMenu.raw)}</strong>
        </div>
        <div className="word-context-sep" />
        <button
          type="button"
          className="word-context-item"
          onClick={() => {
            setWikiWord(wikiLookup(wordContextMenu.raw))
            setWikiDefaultTab('wiktionary')
            setWikiOpen(true)
            setWordContextMenu(null)
          }}
        >
          <i><BookOpen size={14} /></i> Voir sur Wiktionary
        </button>
        <button
          type="button"
          className="word-context-item"
          onClick={() => {
            setWikiWord(wikiLookup(wordContextMenu.raw))
            setWikiDefaultTab('linguee')
            setWikiOpen(true)
            setWordContextMenu(null)
          }}
        >
          <i><Globe size={14} /></i> Voir sur Linguee
        </button>
        <button
          type="button"
          className="word-context-item"
          onClick={() => {
            setWikiWord(wikiLookup(wordContextMenu.raw))
            setWikiDefaultTab('cambridge')
            setWikiOpen(true)
            setWordContextMenu(null)
          }}
        >
          <i><Volume2 size={14} /></i> Voir sur Cambridge
        </button>
        <div className="word-context-sep" />
        {!wordContextMenu.isSaved ? (
          <>
            <button
              type="button"
              className="word-context-item save-item"
              onClick={() => {
                setSelected({
                  raw: wordContextMenu.raw,
                  sentence: wordContextMenu.sentence,
                  x: wordContextMenu.x,
                  y: wordContextMenu.y,
                })
                setWikiWord(wikiLookup(wordContextMenu.raw))
                setWordContextMenu(null)
              }}
            >
              <i><BookmarkPlus size={14} /></i> Enregistrer le mot
            </button>
            <button
              type="button"
              className="word-context-item ai-save-item"
              onClick={() => {
                const raw = wordContextMenu.raw
                const sent = wordContextMenu.sentence
                setWordContextMenu(null)
                void handleSaveWordWithAi(raw, sent)
              }}
            >
              <i>{savingWordAi === cleanRaw(wordContextMenu.raw) ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}</i> Enregistrer avec l'IA
            </button>
          </>
        ) : (
          <button
            type="button"
            className="word-context-item danger"
            onClick={() => {
              onDeleteWord?.(cleanRaw(wordContextMenu.raw), resource.language)
              setWordContextMenu(null)
            }}
          >
            <i><Trash2 size={14} /></i> Supprimer le mot enregistré
          </button>
        )}
      </div>
    )}

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={toggleWiki} />
    {wikiOpen && wikiWord && <WikiPanel word={wikiWord} language={resource.language} initialTab={wikiDefaultTab} onClose={() => setWikiOpen(false)} />}

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
function WikiPanel({ word, language, initialTab, onClose }: {
  word: string
  language: Language
  initialTab?: DictionaryTabId
  onClose: () => void
}) {
  const [defaultTab, setDefaultTab] = useState<DictionaryTabId>(getSavedDefaultTab)
  const [tabOrder, setTabOrder] = useState<DictionaryTabId[]>(getSavedTabOrder)
  const [tab, setTab] = useState<DictionaryTabId>(() => initialTab ?? getSavedDefaultTab())
  const [tabContextMenu, setTabContextMenu] = useState<{
    tabId: DictionaryTabId
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab)
    } else {
      setTab(getSavedDefaultTab())
    }
  }, [initialTab, word])

  useEffect(() => {
    if (!tabContextMenu) return
    const close = () => setTabContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [tabContextMenu])

  const tabConfig = DICTIONARY_TABS[tab] || DICTIONARY_TABS.wiktionary
  const src = tabConfig.getUrl(language, word)

  const handleTabContextMenu = (e: React.MouseEvent, tabId: DictionaryTabId) => {
    e.preventDefault()
    e.stopPropagation()
    setTabContextMenu({
      tabId,
      x: e.clientX,
      y: e.clientY,
    })
  }

  const makeDefault = (tabId: DictionaryTabId) => {
    setDefaultTab(tabId)
    localStorage.setItem('vivre-dict-default-tab', tabId)
    setTab(tabId)
    setTabContextMenu(null)
  }

  const moveLeft = (tabId: DictionaryTabId) => {
    const idx = tabOrder.indexOf(tabId)
    if (idx > 0) {
      const newOrder = [...tabOrder]
      const temp = newOrder[idx - 1]
      newOrder[idx - 1] = newOrder[idx]
      newOrder[idx] = temp
      setTabOrder(newOrder)
      localStorage.setItem('vivre-dict-tab-order', JSON.stringify(newOrder))
    }
    setTabContextMenu(null)
  }

  const moveRight = (tabId: DictionaryTabId) => {
    const idx = tabOrder.indexOf(tabId)
    if (idx < tabOrder.length - 1) {
      const newOrder = [...tabOrder]
      const temp = newOrder[idx + 1]
      newOrder[idx + 1] = newOrder[idx]
      newOrder[idx] = temp
      setTabOrder(newOrder)
      localStorage.setItem('vivre-dict-tab-order', JSON.stringify(newOrder))
    }
    setTabContextMenu(null)
  }

  const openCambridgePopup = (w: string = word) => {
    const url = cambridgeUrl(language, w)
    const width = 500
    const height = 700
    const left = Math.max(0, (window.screenX ?? 0) + window.innerWidth - width - 40)
    const top = Math.max(0, (window.screenY ?? 0) + 80)
    window.open(
      url,
      'cambridge_dict',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    )
  }

  useEffect(() => {
    if (tab === 'cambridge' && word) {
      openCambridgePopup(word)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, word, language])

  return (
    <div className="wiki-panel" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
      <div className="wiki-head">
        <div className="wiki-tabs" role="tablist">
          {tabOrder.map((id) => (
            <button
              key={id}
              role="tab"
              className={tab === id ? 'active' : ''}
              onClick={() => setTab(id)}
              onContextMenu={(e) => handleTabContextMenu(e, id)}
              title={id === defaultTab ? `${DICTIONARY_TABS[id]?.label} (Par défaut)` : DICTIONARY_TABS[id]?.label}
            >
              {DICTIONARY_TABS[id]?.label || id}
            </button>
          ))}
        </div>
        <button className="card-x" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
      </div>

      {tab === 'cambridge' ? (
        <div className="wiki-external-card">
          <div className="wiki-ext-icon">
            <Volume2 size={26} />
          </div>
          <h3>Cambridge Dictionary</h3>
          <p>Prononciation sound-by-sound pour <strong>{word}</strong></p>
          <button
            type="button"
            className="wiki-ext-btn"
            onClick={() => openCambridgePopup()}
          >
            <ExternalLink size={14} /> Ouvrir la fenêtre Cambridge
          </button>
        </div>
      ) : (
        <iframe
          key={`${tab}:${language}:${word}`}
          title={`${tab} — ${word}`}
          src={src}
          className="wiki-frame"
        />
      )}

      {tabContextMenu && (
        <div
          className="word-context-menu wiki-tab-context-menu"
          style={{
            left: Math.min(window.innerWidth - 230, tabContextMenu.x),
            top: Math.min(window.innerHeight - 160, tabContextMenu.y),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="word-context-item"
            onClick={() => makeDefault(tabContextMenu.tabId)}
          >
            <i><Star size={14} fill={defaultTab === tabContextMenu.tabId ? 'currentColor' : 'none'} /></i>
            <span>Dictionnaire par défaut {defaultTab === tabContextMenu.tabId ? '✓' : ''}</span>
          </button>
          <button
            type="button"
            className="word-context-item"
            disabled={tabOrder.indexOf(tabContextMenu.tabId) === 0}
            style={tabOrder.indexOf(tabContextMenu.tabId) === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            onClick={() => moveLeft(tabContextMenu.tabId)}
          >
            <i><ArrowLeft size={14} /></i>
            <span>Déplacer vers la gauche</span>
          </button>
          <button
            type="button"
            className="word-context-item"
            disabled={tabOrder.indexOf(tabContextMenu.tabId) === tabOrder.length - 1}
            style={tabOrder.indexOf(tabContextMenu.tabId) === tabOrder.length - 1 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            onClick={() => moveRight(tabContextMenu.tabId)}
          >
            <i><ArrowRight size={14} /></i>
            <span>Déplacer vers la droite</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Convert markdown to HTML for rich contentEditable fields.
 */
function markdownToHtml(md: string): string {
  if (!md) return ''

  let escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  escaped = escaped
    .replace(/&lt;u&gt;/gi, '<u>')
    .replace(/&lt;\/u&gt;/gi, '</u>')
    .replace(/&lt;ins&gt;/gi, '<u>')
    .replace(/&lt;\/ins&gt;/gi, '</u>')

  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>')
  escaped = escaped.replace(/\n/g, '<br>')

  return escaped
}

/**
 * Serialize rich contentEditable HTML back to clean markdown.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html')

  function traverse(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()

      let inner = ''
      el.childNodes.forEach((child) => {
        inner += traverse(child)
      })

      if (tag === 'br') return '\n'
      if (tag === 'strong' || tag === 'b') {
        const clean = inner.trim()
        if (!clean) return inner
        return `**${clean}**`
      }
      if (tag === 'em' || tag === 'i') {
        const clean = inner.trim()
        if (!clean) return inner
        return `*${clean}*`
      }
      if (tag === 'u' || tag === 'ins') {
        const clean = inner.trim()
        if (!clean) return inner
        return `<u>${clean}</u>`
      }
      if (tag === 'div' || tag === 'p') {
        if (!inner || inner === '\n') return '\n'
        return `\n${inner}`
      }

      return inner
    }
    return ''
  }

  let result = traverse(doc.body)
  result = result.replace(/^\n+/, '').replace(/\n+$/, '')
  return result
}

/**
 * Rich editable field rendering bold, italic, and underline directly in-place.
 */
function RichInputField({
  value,
  placeholder,
  multiline = false,
  className,
  onChange,
}: {
  value: string
  placeholder?: string
  multiline?: boolean
  className?: string
  onChange: (value: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef(value)
  const isComposingRef = useRef(false)

  useEffect(() => {
    if (editorRef.current) {
      const currentMd = htmlToMarkdown(editorRef.current.innerHTML)
      if (value !== currentMd && value !== lastEmittedRef.current) {
        editorRef.current.innerHTML = markdownToHtml(value)
        lastEmittedRef.current = value
      }
    }
  }, [value])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(value)
      lastEmittedRef.current = value
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current) return
    const md = htmlToMarkdown(editorRef.current.innerHTML)
    lastEmittedRef.current = md
    onChange(md)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase()
      if (key === 'b') {
        e.preventDefault()
        document.execCommand('bold', false)
        handleInput()
        return
      }
      if (key === 'i') {
        e.preventDefault()
        document.execCommand('italic', false)
        handleInput()
        return
      }
      if (key === 'u') {
        e.preventDefault()
        document.execCommand('underline', false)
        handleInput()
        return
      }
    }

    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const clean = multiline ? text : text.replace(/[\r\n]+/g, ' ')
    document.execCommand('insertText', false, clean)
    handleInput()
  }

  const isEmpty = !value || value.trim() === ''

  return (
    <div
      ref={editorRef}
      contentEditable
      role="textbox"
      aria-multiline={multiline}
      data-placeholder={placeholder}
      data-empty={isEmpty ? 'true' : undefined}
      className={className}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onCompositionStart={() => { isComposingRef.current = true }}
      onCompositionEnd={() => { isComposingRef.current = false; handleInput() }}
    />
  )
}

/**
 * Safely renders markdown bold, italic, and underline tokens into React nodes.
 */
function renderSimpleMarkdown(text?: string): React.ReactNode {
  if (!text) return null

  function parse(input: string, keyPrefix = ''): React.ReactNode[] {
    if (!input) return []

    const regex = /(\*\*(?:[\s\S]+?)\*\*|__(?:[\s\S]+?)__|<u>[\s\S]*?<\/u>|\*(?:[^*]+?)\*|_(?:[^_]+?)_)/i
    const parts = input.split(regex)

    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`
      if (!part) return null

      if (
        (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
      ) {
        const inner = part.slice(2, -2)
        return <strong key={key}>{parse(inner, `${key}-b`)}</strong>
      }

      if (part.toLowerCase().startsWith('<u>') && part.toLowerCase().endsWith('</u>') && part.length >= 7) {
        const inner = part.slice(3, -4)
        return <u key={key}>{parse(inner, `${key}-u`)}</u>
      }

      if (
        (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
      ) {
        const inner = part.slice(1, -1)
        return <em key={key}>{parse(inner, `${key}-i`)}</em>
      }

      return part
    }).filter(Boolean)
  }

  const nodes = parse(text, 'md')
  return <>{nodes}</>
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
  onSave: (details: {
    raw: string
    sentence?: string
    language?: Language
    sourceResourceId?: string
    translation: string
    parent: string
    relationType?: WordRelationType
    partOfSpeech?: string
    pronunciation: string
    knowledge?: number
    tags?: string[]
  }) => void
  onDeleteWord?: (raw: string) => void
  onOpenWord: (raw: string) => void
}) {
  const t = readerCopy[ui]
  const findExisting = () => state.words.find((word) => word.normalized === normalizeWord(selected.raw) && word.language === language)
  const [word, setWord] = useState(() => cleanRaw(selected.raw))
  const [parent, setParent] = useState(() => findExisting()?.parent ?? '')
  const [relationType, setRelationType] = useState<WordRelationType | undefined>(() => findExisting()?.relationType)
  const [pronunciation, setPronunciation] = useState(() => findExisting()?.phonetic ?? '')
  const [translation, setTranslation] = useState(() => findExisting()?.translation ?? findExisting()?.definitions[0]?.translation ?? '')
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
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [creatingLinked, setCreatingLinked] = useState(false)

  // Reset the form whenever another word is clicked.
  useEffect(() => {
    const existing = state.words.find((item) => item.normalized === normalizeWord(selected.raw) && item.language === language)
    setWord(cleanRaw(selected.raw))
    setParent(existing?.parent ?? '')
    setRelationType(existing?.relationType ?? (existing?.parent ? 'derivative' : undefined))
    setPronunciation(existing?.phonetic ?? '')
    setTranslation(existing?.translation ?? existing?.definitions[0]?.translation ?? '')
    setTags(existing
      ? (existing.tags?.length ? existing.tags : (existing.partOfSpeech ? [(readerCopy[ui].tags as Record<string, string>)[existing.partOfSpeech] ?? existing.partOfSpeech] : []))
      : [])
    setKnowledge(existing?.knowledge)
    setSaved(false)
    setParentTyping(false)
    setViewing(Boolean(existing))
    setCreatingLinked(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.raw])

  const family = useMemo(() => resolveWordFamily(state.words, word, language), [state.words, word, language])

  const parents = knownParents(state, language)
  const query = parent.trim().toLowerCase()
  const suggestions = parentTyping && query
    ? parents.filter((item) => item.toLowerCase().includes(query) && item !== parent.trim()).slice(0, 6)
    : []

  const allTags = knownTags(state, language)

  const addTag = (value: string) => {
    const cleaned = value.trim().replace(/,+$/, '')
    if (cleaned && !tags.includes(cleaned)) { setTags([...tags, cleaned]); setSaved(false) }
  }

  const removeTag = (value: string) => { setTags(tags.filter((item) => item !== value)); setSaved(false) }

  const submit = () => {
    if (!word.trim()) return
    const existingWord = findExisting()
    onSave({
      raw: word.trim(),
      translation: translation.trim(),
      parent: parent.trim(),
      relationType: parent.trim() ? (relationType ?? existingWord?.relationType ?? 'derivative') : undefined,
      partOfSpeech: existingWord?.partOfSpeech,
      pronunciation: pronunciation.trim(),
      knowledge,
      tags,
    })
    setSaved(true)
  }

  const existing = findExisting()

  const handleDelete = () => {
    onDeleteWord?.(word)
    onClose()
  }

  const actions = <div className="wp-actions">
    {existing && !viewing && <button className="wp-icon wp-icon-delete" title="Supprimer le mot enregistré" aria-label="Supprimer le mot enregistré" onClick={handleDelete}><Trash2 size={14} /></button>}
    {viewing && <button className="wp-icon wp-icon-edit" title={t.editWord} aria-label={t.editWord} onClick={() => setViewing(false)}><Pencil size={14} /></button>}
    <button className="wp-icon" aria-label="Fermer" onClick={onClose}><X size={15} /></button>
  </div>

  const handleSaveReverse = (newDetails: WordDetails, formerRoot: string, formerRel: WordRelationType) => {
    onSave(newDetails)
    if (state) {
      const updatedState = setWordAsReference(state, newDetails.raw, formerRoot, formerRel, language)
      const formerWordObj = updatedState.words.find((w) => w.normalized === normalizeWord(formerRoot) && w.language === language)
      if (formerWordObj) {
        onSave({
          raw: formerWordObj.word,
          sentence: formerWordObj.contextSentence,
          language: formerWordObj.language,
          sourceResourceId: formerWordObj.sourceResourceId,
          translation: formerWordObj.translation ?? '',
          parent: formerWordObj.parent ?? '',
          relationType: formerWordObj.relationType,
          partOfSpeech: formerWordObj.partOfSpeech,
          pronunciation: formerWordObj.phonetic ?? '',
          knowledge: formerWordObj.knowledge,
          tags: formerWordObj.tags,
        })
      }
    }
    setCreatingLinked(false)
    setAccordionOpen(true)
  }

  const view = <>
    <div className="wp-view-head">
      <strong className="wp-view-word">{word}</strong>
      {tags.map((item) => <span key={item} className="wp-pos">{item}</span>)}
    </div>
    {knowledge !== undefined && <div className="wp-knowledge-view">
      {knowledge === 6
        ? <span className="wp-known-check"><Check size={14} /> {t.knownByHeart}</span>
        : <span className="wp-dots" title={`${knowledge} / 5`}>{[1, 2, 3, 4, 5].map((n) => <i key={n}
          style={n <= knowledge ? { background: KNOWLEDGE_COLORS[knowledge - 1] } : undefined} />)}</span>}
    </div>}
    {pronunciation && (
      <div className="wp-view-field">
        <span>{t.pronunciationLabel}</span>
        <div className="wp-pronunciation-content-row">
          <p className="wp-view-text">{renderSimpleMarkdown(pronunciation)}</p>
          <button
            type="button"
            className="wp-view-speak-btn"
            title="Écouter la prononciation"
            aria-label="Écouter la prononciation"
            onClick={(e) => {
              e.stopPropagation()
              void speak(word, language, state.settings.api)
            }}
          >
            <Volume2 size={15} />
          </button>
        </div>
      </div>
    )}
    {translation && <div className="wp-view-field"><span>{t.translationLabel}</span><p className="wp-view-text">{renderSimpleMarkdown(translation)}</p></div>}

    {/* Section Accordéon Mots Liés */}
    <div className="wp-accordion">
      <button
        type="button"
        className={`wp-accordion-header ${accordionOpen ? 'open' : ''}`}
        onClick={() => setAccordionOpen((prev) => !prev)}
      >
        <span className="wp-accordion-line-left" />
        <span className="wp-accordion-title">
          {family.totalLinkedCount <= 1 ? t.linkedWordsSingular : t.linkedWordsPlural} ({family.totalLinkedCount})
        </span>
        <span className="wp-accordion-line-right" />
        <span className={`wp-accordion-chevron ${accordionOpen ? 'open' : ''}`}>
          <ChevronDown size={14} />
        </span>
      </button>

      {accordionOpen && (
        <div className="wp-accordion-body">
          {/* 1. Mot de référence (si le mot actuel n'est pas la racine) */}
          {family.rootWord && !family.isRoot && (
            <div className="wp-family-section">
              <div className="wp-family-section-title">{t.referenceWordLabel}</div>
              <div className="wp-linked-row">
                <button
                  type="button"
                  className="wp-parent-tag root-tag"
                  title={t.openLinkedWord}
                  onClick={() => onOpenWord(family.rootWord!.word)}
                >
                  {family.rootWord.word}
                </button>
                <div className="wp-linked-details">
                  {family.rootWord.partOfSpeech && (
                    <span className="wp-pos wp-pos-pill">{family.rootWord.partOfSpeech}</span>
                  )}
                  {(('tags' in family.rootWord && family.rootWord.tags) ? family.rootWord.tags : []).map((tg) => (
                    <span key={tg} className="wp-pos">{tg}</span>
                  ))}
                  {family.rootWord.translation && (
                    <em className="wp-linked-translation">{renderSimpleMarkdown(family.rootWord.translation)}</em>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Formes grammaticales */}
          {family.grammaticalForms.length > 0 && (
            <div className="wp-family-section">
              <div className="wp-family-section-title">{t.grammaticalFormsLabel}</div>
              <div className="wp-family-list">
                {family.grammaticalForms.map((item) => (
                  <div key={item.id} className="wp-linked-row">
                    <button
                      type="button"
                      className="wp-parent-tag"
                      title={t.openLinkedWord}
                      onClick={() => onOpenWord(item.word)}
                    >
                      {item.word}
                    </button>
                    <div className="wp-linked-details">
                      {item.partOfSpeech && (
                        <span className="wp-pos wp-pos-pill">{item.partOfSpeech}</span>
                      )}
                      {(item.tags ?? []).map((tg) => (
                        <span key={tg} className="wp-pos">{tg}</span>
                      ))}
                      {item.translation && (
                        <em className="wp-linked-translation">{renderSimpleMarkdown(item.translation)}</em>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Mots dérivés */}
          {family.derivatives.length > 0 && (
            <div className="wp-family-section">
              <div className="wp-family-section-title">{t.derivedWordsLabel}</div>
              <div className="wp-family-list">
                {family.derivatives.map((item) => (
                  <div key={item.id} className="wp-linked-row">
                    <button
                      type="button"
                      className="wp-parent-tag"
                      title={t.openLinkedWord}
                      onClick={() => onOpenWord(item.word)}
                    >
                      {item.word}
                    </button>
                    <div className="wp-linked-details">
                      {item.partOfSpeech && (
                        <span className="wp-pos wp-pos-pill">{item.partOfSpeech}</span>
                      )}
                      {(item.tags ?? []).map((tg) => (
                        <span key={tg} className="wp-pos">{tg}</span>
                      ))}
                      {item.translation && (
                        <em className="wp-linked-translation">{renderSimpleMarkdown(item.translation)}</em>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bouton discret Ajouter un mot lié */}
          <button
            type="button"
            className="wp-add-linked-btn"
            onClick={() => setCreatingLinked(true)}
          >
            <Plus size={13} />
            <span>{t.addLinkedWord}</span>
          </button>
        </div>
      )}
    </div>
  </>

  const form = <>
    <div className="wp-field">
      <div className="wp-knowledge">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button"
          className={knowledge === n ? 'kl-btn active' : 'kl-btn'}
          style={{ ['--kl' as string]: KNOWLEDGE_COLORS[n - 1] }}
          onClick={() => { setKnowledge(knowledge === n ? undefined : n); setSaved(false) }}>{n}</button>)}
        <button type="button" className={knowledge === 6 ? 'kl-btn known active' : 'kl-btn known'} title={t.knownByHeart} aria-label={t.knownByHeart}
          onClick={() => { setKnowledge(knowledge === 6 ? undefined : 6); setSaved(false) }}><Check size={14} /></button>
      </div>
    </div>

    <div className="wp-field">
      <span>{t.referenceWordLabel}</span>
      {parent && !parentTyping
        ? <span className="wp-tag">{parent}<button aria-label="Supprimer" onClick={() => { setParent(''); setParentTyping(true); setSaved(false) }}><X size={12} /></button></span>
        : <>
          <input value={parent} placeholder={t.referenceWordLabel} autoFocus={parentTyping && !parent}
            onChange={(event) => { setParent(event.target.value); setParentTyping(true); setSaved(false) }}
            onFocus={() => setParentTyping(true)}
            onBlur={() => { if (parent.trim()) setParent(parent.trim()); setParentTyping(false) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { setParent(parent.trim()); setParentTyping(false) } }} />
          {suggestions.length > 0 && <div className="wp-suggest">
            {suggestions.map((item) => <button key={item} onMouseDown={(event) => { event.preventDefault(); setParent(item); setParentTyping(false); setSaved(false) }}>{item}</button>)}
          </div>}
        </>}
    </div>

    {parent.trim() && (
      <div className="wp-field">
        <span>{t.relationTypeLabel}</span>
        <div className="wp-relation-pills">
          <button
            type="button"
            className={`wp-relation-pill ${relationType === 'grammatical_form' ? 'active' : ''}`}
            onClick={() => { setRelationType('grammatical_form'); setSaved(false) }}
          >
            {t.relationGrammaticalForm}
          </button>
          <button
            type="button"
            className={`wp-relation-pill ${relationType === 'derivative' || !relationType ? 'active' : ''}`}
            onClick={() => { setRelationType('derivative'); setSaved(false) }}
          >
            {t.relationDerivative}
          </button>
        </div>
      </div>
    )}

    <div className="wp-field">
      <RichInputField
        value={pronunciation}
        placeholder={t.pronunciationLabel}
        className="wp-rich-input"
        onChange={(val) => { setPronunciation(val); setSaved(false) }}
      />
    </div>

    <div className="wp-field">
      <RichInputField
        value={translation}
        placeholder={t.translationLabel}
        multiline
        className="wp-rich-textarea"
        onChange={(val) => { setTranslation(val); setSaved(false) }}
      />
    </div>

    <div className="wp-field">
      <TagInput allTags={allTags} existingTags={tags} onAdd={addTag} onRemove={removeTag} label={t.tagLabel} />
    </div>

    <div className="wp-footer">
      <button
        type="button"
        className={`wp-save-btn-full ${saved ? 'saved-deck' : 'primary'}`}
        disabled={!word.trim()}
        onClick={submit}
      >
        <span className="wp-save-btn-label">
          {saved ? <><Check size={14} /> {t.savedWord.replace('✓', '').trim()}</> : <><Plus size={14} /> {t.saveWord}</>}
        </span>
        {word && <em className="wp-save-btn-word">{word}</em>}
      </button>
    </div>
  </>

  if (docked) return (
    <div className="word-panel-wrapper docked" onContextMenu={(event) => event.stopPropagation()}>
      <div className="word-panel docked" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
        {actions}
        {viewing ? view : form}
      </div>
      {creatingLinked && (
        <CompanionWordPanel
          ui={ui}
          language={language}
          state={state}
          referenceWord={family.rootWord?.word ?? word}
          docked
          onClose={() => setCreatingLinked(false)}
          onSave={(details) => {
            onSave(details)
            setCreatingLinked(false)
            setAccordionOpen(true)
          }}
          onSaveReverse={handleSaveReverse}
        />
      )}
    </div>
  )

  const panelWidth = 320
  const panelMaxHeight = Math.min(540, window.innerHeight - 24)
  const left = Math.max(12, Math.min((selected.x ?? 40) - 20, window.innerWidth - panelWidth - 12))
  let top = selected.y ?? 80
  if (top + panelMaxHeight > window.innerHeight - 12) top = Math.max(12, window.innerHeight - panelMaxHeight - 12)

  const gap = 12
  let companionLeft = left + panelWidth + gap
  if (companionLeft + panelWidth > window.innerWidth - 12) {
    companionLeft = left - panelWidth - gap
  }
  if (companionLeft < 12) {
    companionLeft = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, left + 40))
  }

  return (
    <>
      <aside className="word-panel floating" style={{ left, top, maxHeight: panelMaxHeight }} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
        {actions}
        {viewing ? view : form}
      </aside>
      {creatingLinked && (
        <CompanionWordPanel
          ui={ui}
          language={language}
          state={state}
          referenceWord={family.rootWord?.word ?? word}
          left={companionLeft}
          top={top}
          onClose={() => setCreatingLinked(false)}
          onSave={(details) => {
            onSave(details)
            setCreatingLinked(false)
            setAccordionOpen(true)
          }}
          onSaveReverse={handleSaveReverse}
        />
      )}
    </>
  )
}

/**
 * Secondary companion panel to create a linked word side-by-side with the active word.
 */
function CompanionWordPanel({
  ui,
  language,
  state,
  referenceWord,
  docked,
  left,
  top,
  onClose,
  onSave,
  onSaveReverse,
}: {
  ui: UiLanguage
  language: Language
  state: AppState
  referenceWord: string
  docked?: boolean
  left?: number
  top?: number
  onClose: () => void
  onSave: (details: WordDetails) => void
  onSaveReverse?: (newWordDetails: WordDetails, formerRootRaw: string, formerRelationType: WordRelationType) => void
}) {
  const t = readerCopy[ui]
  const [newWord, setNewWord] = useState('')
  const [relationType, setRelationType] = useState<WordRelationType>('derivative')
  const [isReverse, setIsReverse] = useState(false)
  const [refWord, setRefWord] = useState(referenceWord)
  const [refTyping, setRefTyping] = useState(false)
  const [pronunciation, setPronunciation] = useState('')
  const [translation, setTranslation] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [knowledge, setKnowledge] = useState<number | undefined>(1)
  const [saved, setSaved] = useState(false)

  const allTags = knownTags(state, language)
  const parents = knownParents(state, language)

  const query = refWord.trim().toLowerCase()
  const suggestions = refTyping && query
    ? parents.filter((item) => item.toLowerCase().includes(query) && item !== refWord.trim()).slice(0, 6)
    : []

  const addTag = (value: string) => {
    const cleaned = value.trim().replace(/,+$/, '')
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned])
      setSaved(false)
    }
  }

  const removeTag = (value: string) => {
    setTags(tags.filter((item) => item !== value))
    setSaved(false)
  }

  const submit = () => {
    if (!newWord.trim()) return
    const wordPayload: WordDetails = {
      raw: newWord.trim(),
      sentence: '',
      language,
      sourceResourceId: '',
      translation: translation.trim(),
      parent: isReverse ? '' : refWord.trim(),
      relationType: isReverse ? undefined : relationType,
      partOfSpeech: '',
      pronunciation: pronunciation.trim(),
      knowledge,
      tags,
    }
    if (isReverse && onSaveReverse) {
      onSaveReverse(wordPayload, referenceWord, relationType)
    } else {
      onSave(wordPayload)
    }
    setSaved(true)
  }

  const actions = (
    <div className="wp-actions">
      <button className="wp-icon" aria-label="Fermer" onClick={onClose}><X size={15} /></button>
    </div>
  )

  const content = (
    <>
      <div className="wp-companion-header">
        <strong className="wp-companion-title">{t.newLinkedWordTitle}</strong>
      </div>

      {/* Champ 1 : Mot saisissable en premier (autoFocus) */}
      <div className="wp-field">
        <span>{t.wordLabel}</span>
        <input
          value={newWord}
          autoFocus
          placeholder={t.wordLabel}
          onChange={(e) => { setNewWord(e.target.value); setSaved(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newWord.trim()) {
              e.preventDefault()
            }
          }}
        />
      </div>

      {/* Champ 2 : Type de relation (Forme grammaticale vs Mot dérivé) */}
      <div className="wp-field">
        <span>{t.relationTypeLabel}</span>
        <div className="wp-relation-pills">
          <button
            type="button"
            className={`wp-relation-pill ${relationType === 'grammatical_form' ? 'active' : ''}`}
            onClick={() => { setRelationType('grammatical_form'); setSaved(false) }}
          >
            {t.relationGrammaticalForm}
          </button>
          <button
            type="button"
            className={`wp-relation-pill ${relationType === 'derivative' ? 'active' : ''}`}
            onClick={() => { setRelationType('derivative'); setSaved(false) }}
          >
            {t.relationDerivative}
          </button>
        </div>
      </div>

      {/* Champ 3 : Mot de référence avec icône reverse */}
      <div className="wp-field">
        <div className="wp-field-header-row">
          <span>{t.referenceWordLabel}</span>
          <button
            type="button"
            className={`wp-reverse-btn ${isReverse ? 'active' : ''}`}
            title={t.setAsReferenceTooltip}
            onClick={() => { setIsReverse((prev) => !prev); setSaved(false) }}
          >
            <ArrowLeftRight size={12} />
          </button>
        </div>

        {isReverse ? (
          <div className="wp-reverse-hint">
            <strong>{newWord.trim() || t.wordLabel}</strong> deviendra le mot de référence, et <strong>{referenceWord}</strong> deviendra son mot lié ({relationType === 'grammatical_form' ? t.relationGrammaticalForm.toLowerCase() : t.relationDerivative.toLowerCase()}).
          </div>
        ) : (
          refWord && !refTyping ? (
            <span className="wp-tag">
              {refWord}
              <button aria-label="Supprimer" onClick={() => { setRefWord(''); setRefTyping(true); setSaved(false) }}>
                <X size={12} />
              </button>
            </span>
          ) : (
            <>
              <input
                value={refWord}
                placeholder={t.referenceWordLabel}
                onChange={(e) => { setRefWord(e.target.value); setRefTyping(true); setSaved(false) }}
                onFocus={() => setRefTyping(true)}
                onBlur={() => { if (refWord.trim()) setRefWord(refWord.trim()); setRefTyping(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setRefWord(refWord.trim()); setRefTyping(false) } }}
              />
              {suggestions.length > 0 && (
                <div className="wp-suggest">
                  {suggestions.map((item) => (
                    <button
                      key={item}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setRefWord(item)
                        setRefTyping(false)
                        setSaved(false)
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* Champ 4 : Traduction */}
      <div className="wp-field">
        <RichInputField
          value={translation}
          placeholder={t.translationLabel}
          multiline
          className="wp-rich-textarea"
          onChange={(val) => { setTranslation(val); setSaved(false) }}
        />
      </div>

      {/* Champ 5 : Prononciation */}
      <div className="wp-field">
        <RichInputField
          value={pronunciation}
          placeholder={t.pronunciationLabel}
          className="wp-rich-input"
          onChange={(val) => { setPronunciation(val); setSaved(false) }}
        />
      </div>

      {/* Champ 6 : Tags */}
      <div className="wp-field">
        <TagInput allTags={allTags} existingTags={tags} onAdd={addTag} onRemove={removeTag} label={t.tagLabel} />
      </div>

      {/* Champ 7 : Niveau de connaissance */}
      <div className="wp-field">
        <div className="wp-knowledge">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={knowledge === n ? 'kl-btn active' : 'kl-btn'}
              style={{ ['--kl' as string]: KNOWLEDGE_COLORS[n - 1] }}
              onClick={() => { setKnowledge(knowledge === n ? undefined : n); setSaved(false) }}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={knowledge === 6 ? 'kl-btn known active' : 'kl-btn known'}
            title={t.knownByHeart}
            aria-label={t.knownByHeart}
            onClick={() => { setKnowledge(knowledge === 6 ? undefined : 6); setSaved(false) }}
          >
            <Check size={14} />
          </button>
        </div>
      </div>

      {/* Bouton d'enregistrement */}
      <div className="wp-footer">
        <button
          type="button"
          className={`wp-save-btn-full ${saved ? 'saved-deck' : 'primary'}`}
          disabled={!newWord.trim()}
          onClick={submit}
        >
          <span className="wp-save-btn-label">
            {saved ? <><Check size={14} /> {t.savedWord.replace('✓', '').trim()}</> : <><Plus size={14} /> {t.saveWord}</>}
          </span>
          {newWord && <em className="wp-save-btn-word">{newWord}</em>}
        </button>
      </div>
    </>
  )

  if (docked) {
    return (
      <div className="word-panel docked wp-companion-panel" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        {actions}
        {content}
      </div>
    )
  }

  const panelWidth = 320
  const panelMaxHeight = Math.min(540, window.innerHeight - 24)
  const companionLeft = left !== undefined ? left : Math.max(12, window.innerWidth - panelWidth - 24)
  let companionTop = top !== undefined ? top : 80
  if (companionTop + panelMaxHeight > window.innerHeight - 12) {
    companionTop = Math.max(12, window.innerHeight - panelMaxHeight - 12)
  }

  return (
    <aside
      className="word-panel floating wp-companion-panel"
      style={{ left: companionLeft, top: companionTop, maxHeight: panelMaxHeight }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {actions}
      {content}
    </aside>
  )
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
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = input.trim().toLowerCase()
  const match = (!dismissedSuggestion && query && allTags.length > 0)
    ? allTags.find((t) => t.toLowerCase().startsWith(query) && !existingTags.some((ex) => ex.toLowerCase() === t.toLowerCase()))
    : undefined

  const ghostSuffix = (match && input && match.toLowerCase().startsWith(input.toLowerCase()))
    ? match.slice(input.length)
    : ''

  const handleCommit = (tagToCommit?: string) => {
    const finalTag = tagToCommit || match || input.trim()
    if (finalTag) {
      onAdd(finalTag)
      setInput('')
      setDismissedSuggestion(false)
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
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (ghostSuffix && !dismissedSuggestion) {
        e.preventDefault()
        setDismissedSuggestion(true)
      }
    } else if (e.key === 'Escape') {
      if (ghostSuffix && !dismissedSuggestion) {
        e.preventDefault()
        setDismissedSuggestion(true)
      } else {
        setInput('')
        setDismissedSuggestion(false)
      }
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
          onChange={(e) => {
            setInput(e.target.value)
            setDismissedSuggestion(false)
          }}
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
              {item} <X size={10} style={{ marginLeft: 2, opacity: 0.7 }} />
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

  const knownPhrases = useMemo(() => {
    const fromWords = state.words
      .filter((w) => w.language === resource.language && w.word.trim().includes(' '))
      .map((w) => w.word.trim())
    const fromMarks = Object.keys(state.wordMarks)
      .filter((k) => k.startsWith(`${resource.language}:`) && k.includes(' '))
      .map((k) => k.slice(resource.language.length + 1))
    const all = Array.from(new Set([...fromWords, ...fromMarks]))
    return all.sort((a, b) => b.length - a.length)
  }, [state.words, state.wordMarks, resource.language])

  const gotoPage = (next: number) => {
    setSelected(null)
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)))
  }

  const clickWord = (raw: string, text: string, _isInstance = false, _offset = 0) => {
    const cleaned = cleanRaw(raw)
    if (!cleaned) return
    if (wikiArmed) {
      setWikiWord(wikiLookup(cleaned))
      setWikiOpen(true)
      return
    }
    setSelected({ raw: cleaned, sentence: sentenceOf(cleaned, text) })
    setWikiWord(wikiLookup(cleaned))
  }

  const handleMultiWordSelect = (phrase: string, _startOffset: number, _endOffset: number, text: string) => {
    const cleaned = cleanRaw(phrase)
    if (!cleaned) return
    if (wikiArmed) {
      setWikiWord(wikiLookup(cleaned))
      setWikiOpen(true)
      return
    }
    setSelected({ raw: cleaned, sentence: sentenceOf(cleaned, text) })
    setWikiWord(wikiLookup(cleaned))
  }

  const toggleWiki = () => {
    if (wikiOpen || wikiArmed) {
      setWikiOpen(false)
      setWikiArmed(false)
    } else {
      setWikiArmed(true)
      setWikiOpen(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input, textarea, [contenteditable="true"]'))
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'w') {
        event.preventDefault()
        toggleWiki()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wikiOpen, wikiArmed])

  return <div className="focus-reader" onClick={() => {
    if (Date.now() - lastMultiWordDragTimestamp < 500) return
    setSelected(null); if (wikiArmed) setWikiArmed(false)
  }}>
    <header className="focus-top">
      <strong className="focus-title">{resource.title}</strong>
      <div className="focus-nav">
        <button aria-label={t.previous} disabled={safePage === 0} onClick={() => gotoPage(safePage - 1)}><ChevronLeft size={18} /></button>
        <span>{safePage + 1} / {pages.length}</span>
        <button aria-label={t.next} disabled={safePage >= pages.length - 1} onClick={() => gotoPage(safePage + 1)}><ChevronRight size={18} /></button>
      </div>
      <button className="focus-exit" onClick={onClose}><Minimize2 size={15} /> {t.focusExit}</button>
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
              <Paragraph
                text={entry.text}
                fontSize={settings.readerFontSize + 1}
                language={resource.language}
                state={state}
                markMode={null}
                green={greenChars}
                resourceId={resource.id}
                chapterIndex={entry.chapterIndex}
                paragraphIndex={entry.paragraphIndex}
                knownPhrases={knownPhrases}
                onWordClick={(raw, _target, isInstance, offset) => clickWord(raw, entry.text, isInstance, offset)}
                onMultiWordSelect={(phrase, startOffset, endOffset) => handleMultiWordSelect(phrase, startOffset, endOffset, entry.text)}
                onLetterClick={() => { }}
              />
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

    <WikiFab label={t.wikiOpen} armed={wikiArmed} onToggle={toggleWiki} />
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
            <Plus size={14} />
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
            <ArrowLeft size={13} /> {t.back.replace('←', '').trim()}
          </button>
        </div>}
      </div>
    </div>
    <button className="mark-menu-close" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
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
          <button onClick={onClose} aria-label={t.cancel}><X size={16} /></button>
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
            <button type="submit" className="primary" disabled={!label.trim()}><Plus size={15} /> {t.createMarking}</button>
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

function tokenizeParagraph(text: string, knownPhrases: string[] = []) {
  if (!knownPhrases || knownPhrases.length === 0) {
    const tokens: { raw: string; isWhitespace: boolean; offset: number; isMultiWord?: boolean }[] = []
    let offset = 0
    text.split(/(\s+)/).forEach((part) => {
      if (part.length > 0) {
        const isWhitespace = /^\s+$/.test(part)
        tokens.push({ raw: part, isWhitespace, offset, isMultiWord: false })
        offset += part.length
      }
    })
    return tokens
  }

  type Match = { start: number; end: number; phrase: string }
  const matches: Match[] = []

  for (const phrase of knownPhrases) {
    const normPhrase = normalizeWord(phrase)
    if (!normPhrase.includes(' ')) continue
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const regex = new RegExp(`(^|[^a-zà-ÿ0-9'-])(${escaped})([^a-zà-ÿ0-9'-]|$)`, 'gi')
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const matchStart = m.index + m[1].length
      const matchText = m[2]
      const matchEnd = matchStart + matchText.length
      const overlaps = matches.some((ex) => matchStart < ex.end && matchEnd > ex.start)
      if (!overlaps) {
        matches.push({ start: matchStart, end: matchEnd, phrase: matchText })
      }
      regex.lastIndex = matchStart + 1
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const tokens: { raw: string; isWhitespace: boolean; offset: number; isMultiWord?: boolean }[] = []
  let cursor = 0

  matches.forEach((match) => {
    if (match.start > cursor) {
      const segment = text.slice(cursor, match.start)
      let segmentOffset = cursor
      segment.split(/(\s+)/).forEach((part) => {
        if (part.length > 0) {
          const isWhitespace = /^\s+$/.test(part)
          tokens.push({ raw: part, isWhitespace, offset: segmentOffset, isMultiWord: false })
          segmentOffset += part.length
        }
      })
    }
    tokens.push({ raw: text.slice(match.start, match.end), isWhitespace: false, offset: match.start, isMultiWord: true })
    cursor = match.end
  })

  if (cursor < text.length) {
    const segment = text.slice(cursor)
    let segmentOffset = cursor
    segment.split(/(\s+)/).forEach((part) => {
      if (part.length > 0) {
        const isWhitespace = /^\s+$/.test(part)
        tokens.push({ raw: part, isWhitespace, offset: segmentOffset, isMultiWord: false })
        segmentOffset += part.length
      }
    })
  }

  return tokens
}

function Paragraph({
  text,
  fontSize,
  language,
  state,
  markMode,
  green,
  resourceId,
  chapterIndex,
  paragraphIndex,
  knownPhrases,
  onWordClick,
  onMultiWordSelect,
  onWordContextMenu,
  onLetterClick,
}: {
  text: string
  fontSize: number
  language: Language
  state: AppState
  markMode: MarkMode
  green?: Set<number>
  resourceId?: string
  chapterIndex?: number
  paragraphIndex?: number
  knownPhrases?: string[]
  onWordClick: (raw: string, target: HTMLElement, isInstance: boolean, offset: number) => void
  onMultiWordSelect?: (phrase: string, startOffset: number, endOffset: number, isInstance: boolean, event: MouseEvent) => void
  onWordContextMenu?: (raw: string, event: React.MouseEvent) => void
  onLetterClick: (raw: string, letterIndex: number) => void
}) {
  const [selectionRange, setSelectionRange] = useState<{ startOffset: number; endOffset: number } | null>(null)
  const selectionRangeRef = useRef<{ startOffset: number; endOffset: number } | null>(null)
  const dragStartRef = useRef<{ offset: number; length: number; raw: string } | null>(null)
  const isSelectingRef = useRef(false)

  const tokens = useMemo(() => tokenizeParagraph(text, knownPhrases), [text, knownPhrases])

  const handleTokenMouseDown = (token: { offset: number; raw: string }) => {
    dragStartRef.current = { offset: token.offset, length: token.raw.length, raw: token.raw }
    isSelectingRef.current = true
    setSelectionRange(null)
    selectionRangeRef.current = null

    const handleWindowMouseUp = (e: MouseEvent) => {
      window.removeEventListener('mouseup', handleWindowMouseUp)
      if (isSelectingRef.current && dragStartRef.current) {
        isSelectingRef.current = false
        const currentDragStart = dragStartRef.current
        const currentRange = selectionRangeRef.current
        dragStartRef.current = null
        selectionRangeRef.current = null
        setSelectionRange(null)

        if (currentRange && (currentRange.endOffset - currentRange.startOffset > currentDragStart.length)) {
          const phrase = text.slice(currentRange.startOffset, currentRange.endOffset).trim()
          if (phrase) {
            lastMultiWordDragTimestamp = Date.now()
            const isInstance = e.altKey || e.ctrlKey
            onMultiWordSelect?.(phrase, currentRange.startOffset, currentRange.endOffset, isInstance, e)
          }
        }
      }
    }

    window.addEventListener('mouseup', handleWindowMouseUp)
  }

  const handleTokenMouseEnter = (token: { offset: number; raw: string }) => {
    if (isSelectingRef.current && dragStartRef.current) {
      const minOff = Math.min(dragStartRef.current.offset, token.offset)
      const maxOff = Math.max(dragStartRef.current.offset + dragStartRef.current.length, token.offset + token.raw.length)
      const newRange = { startOffset: minOff, endOffset: maxOff }
      selectionRangeRef.current = newRange
      setSelectionRange(newRange)
    }
  }

  return (
    <p className="paragraph" style={{ fontSize }}>
      {tokens.map((token, index) => {
        if (token.isWhitespace) {
          return <span key={index}>{token.raw}</span>
        }
        const isSelected = Boolean(
          selectionRange &&
          token.offset >= selectionRange.startOffset &&
          token.offset + token.raw.length <= selectionRange.endOffset
        )
        return (
          <Word
            key={`${token.raw}-${token.offset}-${index}`}
            raw={token.raw}
            language={language}
            state={state}
            markMode={markMode}
            green={green}
            offset={token.offset}
            resourceId={resourceId}
            chapterIndex={chapterIndex}
            paragraphIndex={paragraphIndex}
            isSelected={isSelected}
            onMouseDown={() => handleTokenMouseDown(token)}
            onMouseEnter={() => handleTokenMouseEnter(token)}
            onClick={onWordClick}
            onContextMenu={onWordContextMenu}
            onLetterClick={onLetterClick}
          />
        )
      })}
    </p>
  )
}

function Word({
  raw,
  language,
  state,
  markMode,
  green,
  offset = 0,
  resourceId,
  chapterIndex,
  paragraphIndex,
  isSelected,
  onMouseDown,
  onMouseEnter,
  onClick,
  onContextMenu,
  onLetterClick,
}: {
  raw: string
  language: Language
  state: AppState
  markMode: MarkMode
  green?: Set<number>
  offset?: number
  resourceId?: string
  chapterIndex?: number
  paragraphIndex?: number
  isSelected?: boolean
  onMouseDown?: (event: React.MouseEvent<HTMLElement>) => void
  onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void
  onClick: (raw: string, target: HTMLElement, isInstance: boolean, offset: number) => void
  onContextMenu?: (raw: string, event: React.MouseEvent) => void
  onLetterClick: (raw: string, letterIndex: number) => void
}) {
  const normalized = normalizeWord(raw)
  const genericKey = markKey(language, normalized)
  const instKey = (resourceId && chapterIndex !== undefined && paragraphIndex !== undefined)
    ? `inst:${resourceId}:${chapterIndex}:${paragraphIndex}:${offset}`
    : undefined
  const mark = (instKey ? state.wordMarks[instKey] : undefined) ?? state.wordMarks[genericKey]
  const grayed = state.silentMarks[genericKey] ?? []
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
      return (
        <span
          key={index}
          className={`letter-cell ${cls}`}
          onClick={(event) => {
            event.stopPropagation()
            if (isAlpha) onLetterClick(raw, myAlpha)
          }}
        >
          {letter}
        </span>
      )
    }
    return <span key={index} className={cls || undefined}>{letter}</span>
  })

  const markClass = mark ? `marked-${mark.style}` : ''
  const selectedClass = isSelected ? 'word-drag-selected' : ''
  const style = mark ? ({ ['--mark-color' as string]: mark.color } as React.CSSProperties) : undefined
  const deckClass = !savedWord || savedWord.knowledge === 6
    ? ''
    : savedWord.knowledge ? `word-known kl-${savedWord.knowledge}` : 'word-known'

  if (markMode === 'silent') {
    return (
      <span
        className={`word as-span ${markClass} ${deckClass} ${selectedClass}`}
        style={style}
        onContextMenu={(event) => { if (onContextMenu) { onContextMenu(raw, event) } }}
      >
        {spans}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`word ${markClass} ${deckClass} ${selectedClass}`}
      style={style}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={(event) => {
        event.stopPropagation()
        if (Date.now() - lastMultiWordDragTimestamp < 500) {
          event.preventDefault()
          return
        }
        const isInstance = event.altKey || event.ctrlKey
        onClick(raw, event.currentTarget, isInstance, offset)
      }}
      onContextMenu={(event) => { if (onContextMenu) { onContextMenu(raw, event) } }}
    >
      {spans}
    </button>
  )
}