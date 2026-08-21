import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Resource } from '../domain'
import {
  MousePointer2,
  Pen,
  Highlighter,
  Type,
  Pencil,
  Square,
  Circle,
  Slash,
  ArrowRight,
  Spline,
  Eraser,
  Undo2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react'

/**
 * Teacher Mode — plein écran pour projeter un texte en classe.
 * Pas de barre supérieure : navigation pages en pillule haut-centre,
 * A+/A−/zoom/Quitter en pillule haut-droite, annuler/gomme/effacer à gauche.
 * Couleurs + épaisseur repliées derrière une flèche discrète à droite.
 * Dessin possible sur toute la surface de l'écran.
 * Surligneur : clic sur un mot (Shift+clic = plage de mots) → surlignage droit.
 * Texte : clic = nouvelle note, clic ailleurs = terminer la saisie (sans en
 * ouvrir une autre), double-clic = modifier, texte multicouleur en direct,
 * coins pour redimensionner (idem rectangles/ellipses après sélection).
 * Liaisons lettre à lettre, grisage de lettres muettes, sans survol jaune.
 * Cmd/Ctrl+Z = annuler la dernière annotation. Échap = quitter.
 */

type Tool = 'select' | 'pen' | 'highlighter' | 'text' | 'edit' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'liaison' | 'gray' | 'eraser'

type Point = { x: number; y: number }
type Stroke = {
  id: string
  kind: 'pen' | 'highlighter' | 'rect' | 'ellipse' | 'line' | 'arrow'
  color: string
  width: number
  points: Point[]
}
type Liaison = { id: string; x1: number; x2: number; y: number; color: string }
/** Un segment de texte + sa couleur — permet plusieurs couleurs dans une note. */
type TextRun = { t: string; c: string }
type TextNote = { id: string; x: number; y: number; runs: TextRun[]; size: number; color: string }
type ActionRef = { kind: 'stroke' | 'liaison' | 'gray' | 'text'; id: string }
type PageAnnotations = { strokes: Stroke[]; liaisons: Liaison[]; texts: TextNote[]; grayed: string[]; order: ActionRef[] }
type AnnotationMap = Record<string, PageAnnotations>
type DraftNote = { x: number; y: number; id?: string; size: number; baseColor: string }

const emptyPage = (): PageAnnotations => ({ strokes: [], liaisons: [], texts: [], grayed: [], order: [] })

const normalizePage = (raw: Partial<PageAnnotations> | undefined): PageAnnotations => ({
  strokes: raw?.strokes ?? [],
  liaisons: raw?.liaisons ?? [],
  // migration : les anciennes notes mono-couleur (text/color) deviennent des runs
  texts: (raw?.texts ?? []).map((note) =>
    Array.isArray(note.runs) ? note : { ...note, runs: [{ t: (note as unknown as { text?: string }).text ?? '', c: note.color }] }),
  grayed: raw?.grayed ?? [],
  order: raw?.order ?? [],
})

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; color?: boolean; width?: boolean }[] = [
  { id: 'select', icon: <MousePointer2 size={16} />, label: 'Sélection' },
  { id: 'pen', icon: <Pen size={16} />, label: 'Stylo', color: true, width: true },
  { id: 'highlighter', icon: <Highlighter size={16} />, label: 'Surligneur (clique sur un mot)', color: true },
  { id: 'text', icon: <Type size={16} />, label: 'Texte', color: true },
  { id: 'edit', icon: <Pencil size={16} />, label: 'Édition' },
  { id: 'rect', icon: <Square size={16} />, label: 'Rectangle', color: true, width: true },
  { id: 'ellipse', icon: <Circle size={16} />, label: 'Ellipse', color: true, width: true },
  { id: 'line', icon: <Slash size={16} />, label: 'Ligne', color: true, width: true },
  { id: 'arrow', icon: <ArrowRight size={16} />, label: 'Flèche', color: true, width: true },
  { id: 'liaison', icon: <Spline size={16} />, label: 'Liaison (lettre à lettre)', color: true },
  { id: 'gray', icon: <span style={{ fontSize: 13, fontWeight: 700 }}>Aa</span>, label: 'Griser une lettre' },
]

const COLORS = ['#d64545', '#2563eb', '#16a34a', '#f59e0b', '#20201e', '#7c3aed']
const WIDTHS = [2, 4, 7]
const BASE_FONT = 30

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function flattenParagraphs(resource: Resource) {
  return resource.chapters.flatMap((chapter, chapterIndex) =>
    chapter.paragraphs.map((text, paragraphIndex) => ({
      key: `${chapterIndex}:${paragraphIndex}`,
      chapterIndex,
      paragraphIndex,
      chapterTitle: chapter.title,
      isChapterStart: paragraphIndex === 0,
      text,
    })),
  )
}

function paginate(paragraphs: ReturnType<typeof flattenParagraphs>, wordsPerPage: number) {
  const pages: typeof paragraphs[] = []
  let current: typeof paragraphs = []
  let count = 0
  for (const paragraph of paragraphs) {
    const words = paragraph.text.split(/\s+/).length
    if ((count > 0 && count + words > wordsPerPage) || (paragraph.isChapterStart && current.length > 0)) {
      pages.push(current)
      current = []
      count = 0
    }
    current.push(paragraph)
    count += words
  }
  if (current.length) pages.push(current)
  return pages.length ? pages : [[]]
}

/**
 * Diff caractère par caractère : indices (dans le texte actuel) des caractères
 * absents du texte d'origine. Pré/suffixe commun ignorés, LCS sur le milieu.
 * En cas d'égalité dans le LCS, on préfère marquer le caractère courant comme
 * nouveau : ainsi une lettre déplacée (« faim » → « fian ») ressort en vert,
 * pas seulement les lettres ajoutées.
 */
export function modifiedCharIndices(original: string, current: string): Set<number> {
  const modified = new Set<number>()
  if (original === current) return modified
  let p = 0
  const minLength = Math.min(original.length, current.length)
  while (p < minLength && original[p] === current[p]) p++
  let s = 0
  while (s < minLength - p && original[original.length - 1 - s] === current[current.length - 1 - s]) s++
  const midA = original.slice(p, original.length - s)
  const midB = current.slice(p, current.length - s)
  if (!midA) {
    for (let j = 0; j < midB.length; j++) modified.add(p + j)
    return modified
  }
  if (!midB) return modified
  if (midA.length * midB.length > 250000) {
    for (let j = 0; j < midB.length; j++) modified.add(p + j)
    return modified
  }
  const m = midA.length
  const n = midB.length
  const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (midA[i] === midB[j]) { i++; j++ }
    else if (dp[i + 1][j] > dp[i][j + 1]) { i++ }
    else { modified.add(p + j); j++ }
  }
  while (j < n) { modified.add(p + j); j++ }
  return modified
}

/** Rendu caractère par caractère du miroir d'édition : vert (ajouté) + gris (lettre grisée). */
function renderMirrorChars(text: string, green: Set<number>, grayed: string[], paragraphKey: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const parts = text.split(/(\s+)/)
  let offset = 0
  let nodeKey = 0
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex]
    if (/\s+/.test(part)) {
      nodes.push(<span key={nodeKey++}>{part}</span>)
      offset += part.length
      continue
    }
    for (let letterIndex = 0; letterIndex < part.length; letterIndex++) {
      const globalIndex = offset + letterIndex
      const letterKey = `${paragraphKey}:${partIndex}.${letterIndex}`
      const cls = green.has(globalIndex)
        ? 'focus-letter edited-char'
        : grayed.includes(letterKey) ? 'focus-letter user-gray' : 'focus-letter'
      nodes.push(<span key={nodeKey++} className={cls}>{part[letterIndex]}</span>)
    }
    offset += part.length
  }
  return nodes
}

const loadMap = (resourceId: string): AnnotationMap => {
  try {
    const raw = JSON.parse(localStorage.getItem(`vivre-focus-${resourceId}`) || '{}') as Record<string, Partial<PageAnnotations>>
    return Object.fromEntries(Object.entries(raw).map(([key, page]) => [key, normalizePage(page)]))
  } catch { return {} }
}

export const loadOriginals = (resourceId: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(`vivre-focus-originals-${resourceId}`) || '{}') } catch { return {} }
}

const loadLegacyEdited = (resourceId: string): string[] => {
  try { return JSON.parse(localStorage.getItem(`vivre-focus-edited-${resourceId}`) || '[]') } catch { return [] }
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const runsToHtml = (runs: TextRun[]) =>
  runs.map((run) => `<span style="color:${run.c}">${escapeHtml(run.t).replace(/\n/g, '<br>')}</span>`).join('')

/** Sérialise le DOM du contenteditable en segments texte+couleur (fusionne les voisins de même couleur). */
function serializeEditor(root: HTMLElement, baseColor: string): TextRun[] {
  const runs: TextRun[] = []
  const push = (text: string, color: string) => {
    if (!text) return
    const last = runs[runs.length - 1]
    if (last && last.c === color) last.t += text
    else runs.push({ t: text, c: color })
  }
  const walk = (node: Node, color: string) => {
    if (node.nodeType === Node.TEXT_NODE) { push(node.textContent ?? '', color); return }
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'BR') { push('\n', color); return }
    const nextColor = node.style.color || (node.tagName === 'FONT' ? (node.getAttribute('color') ?? color) : color)
    if ((node.tagName === 'DIV' || node.tagName === 'P') && runs.length && !runs[runs.length - 1].t.endsWith('\n')) push('\n', color)
    node.childNodes.forEach((child) => walk(child, nextColor))
  }
  root.childNodes.forEach((child) => walk(child, baseColor))
  // retire les sauts de ligne vides en fin de note
  while (runs.length) {
    const last = runs[runs.length - 1]
    const stripped = last.t.replace(/\n+$/, '')
    if (stripped === last.t) break
    if (stripped) last.t = stripped
    else runs.pop()
  }
  return runs
}

const DEFAULT_SHORTCUTS: Record<Tool, string> = {
  select: 'v',
  pen: 'p',
  highlighter: 'h',
  text: 't',
  edit: 'e',
  rect: 'r',
  ellipse: 'c',
  line: 'l',
  arrow: 'a',
  liaison: 'b',
  gray: 'g',
  eraser: 'x',
}

const distToSegment = (p: Point, v: Point, w: Point) => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y)
  const t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2))
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)))
}

const distToStroke = (p: Point, stroke: Stroke) => {
  if (!stroke.points || stroke.points.length === 0) return Infinity
  if (stroke.points.length === 1) return Math.hypot(p.x - stroke.points[0].x, p.y - stroke.points[0].y)
  if (stroke.kind === 'pen' || stroke.kind === 'highlighter') {
    let minD = Infinity
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const d = distToSegment(p, stroke.points[i], stroke.points[i + 1])
      if (d < minD) minD = d
      if (minD <= 24) return minD
    }
    return minD
  }
  if (stroke.kind === 'line' || stroke.kind === 'arrow') {
    const [a, b] = stroke.points
    return distToSegment(p, a, b ?? a)
  }
  if (stroke.kind === 'rect') {
    const [a, b] = stroke.points
    const p2 = b ?? a
    const x1 = Math.min(a.x, p2.x), x2 = Math.max(a.x, p2.x)
    const y1 = Math.min(a.y, p2.y), y2 = Math.max(a.y, p2.y)
    const d1 = distToSegment(p, { x: x1, y: y1 }, { x: x2, y: y1 })
    const d2 = distToSegment(p, { x: x2, y: y1 }, { x: x2, y: y2 })
    const d3 = distToSegment(p, { x: x2, y: y2 }, { x: x1, y: y2 })
    const d4 = distToSegment(p, { x: x1, y: y2 }, { x: x1, y: y1 })
    return Math.min(d1, d2, d3, d4)
  }
  if (stroke.kind === 'ellipse') {
    const [a, b] = stroke.points
    const p2 = b ?? a
    const cx = (a.x + p2.x) / 2, cy = (a.y + p2.y) / 2
    const rx = Math.abs(p2.x - a.x) / 2, ry = Math.abs(p2.y - a.y) / 2
    if (rx === 0 || ry === 0) return Math.hypot(p.x - cx, p.y - cy)
    let minD = Infinity
    for (let i = 0; i < 16; i++) {
      const ang = (i * Math.PI * 2) / 16
      const px = cx + rx * Math.cos(ang)
      const py = cy + ry * Math.sin(ang)
      const d = Math.hypot(p.x - px, p.y - py)
      if (d < minD) minD = d
      if (minD <= 24) return minD
    }
    return minD
  }
  return Infinity
}

export function LearningFocus({ resources, initialResourceId, shortcuts, onUpdateResource, onClose }: {
  resources: Resource[]
  initialResourceId: string
  shortcuts?: Record<string, string>
  onUpdateResource: (resource: Resource) => void
  onClose: () => void
}) {
  const resource = resources.find((item) => item.id === initialResourceId) ?? resources[0]
  const [pageIndex, setPageIndex] = useState(0)
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('vivre-focus-zoom')) || BASE_FONT)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [textSize, setTextSize] = useState(24)
  const [annotations, setAnnotations] = useState<AnnotationMap>(() => loadMap(initialResourceId))
  const [originals, setOriginals] = useState<Record<string, string>>(() => loadOriginals(initialResourceId))
  const [legacyEdited, setLegacyEdited] = useState<string[]>(() => loadLegacyEdited(initialResourceId))
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [pendingLiaison, setPendingLiaison] = useState<Point | null>(null)
  const [draftNote, setDraftNote] = useState<DraftNote | null>(null)
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const [selectedStroke, setSelectedStroke] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [eraserPos, setEraserPos] = useState<Point | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<Stroke | null>(null)
  const isErasingRef = useRef(false)
  const dragNoteRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const noteResizeRef = useRef<{ id: string; opposite: Point; startDist: number; origSize: number } | null>(null)
  const strokeResizeRef = useRef<{ id: string; opposite: Point } | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const highlightAnchorRef = useRef<string | null>(null)
  const [, forceRedraw] = useState(0)

  const paragraphs = useMemo(() => flattenParagraphs(resource), [resource])
  const pages = useMemo(() => paginate(paragraphs, 190), [paragraphs])
  const safePage = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePage] ?? []
  const pageKey = `${resource.id}#${safePage}`
  const current = annotations[pageKey] ?? emptyPage()
  const zoom = Math.round((fontSize / BASE_FONT) * 100)

  const effectiveShortcuts = useMemo<Record<Tool, string>>(() => {
    const res = { ...DEFAULT_SHORTCUTS }
    if (shortcuts) {
      Object.entries(shortcuts).forEach(([tId, k]) => {
        if (k && tId in res) {
          res[tId as Tool] = k.toLowerCase()
        }
      })
    }
    return res
  }, [shortcuts])

  const keyToTool = useMemo(() => {
    const map: Record<string, Tool> = {}
    Object.entries(effectiveShortcuts).forEach(([tId, k]) => {
      if (k) map[k.toLowerCase()] = tId as Tool
    })
    return map
  }, [effectiveShortcuts])

  // caractères modifiés (vert) par paragraphe, calculés contre le texte d'origine
  const modifiedChars = useMemo(() => {
    const map: Record<string, Set<number>> = {}
    for (const paragraph of paragraphs) {
      const original = originals[paragraph.key]
      if (original !== undefined) {
        if (original !== paragraph.text) map[paragraph.key] = modifiedCharIndices(original, paragraph.text)
      } else if (legacyEdited.includes(paragraph.key)) {
        map[paragraph.key] = new Set(Array.from({ length: paragraph.text.length }, (_, index) => index))
      }
    }
    return map
  }, [paragraphs, originals, legacyEdited])

  useEffect(() => {
    localStorage.setItem(`vivre-focus-${resource.id}`, JSON.stringify(annotations))
  }, [annotations, resource.id])

  useEffect(() => {
    localStorage.setItem(`vivre-focus-originals-${resource.id}`, JSON.stringify(originals))
  }, [originals, resource.id])

  useEffect(() => {
    localStorage.setItem('vivre-focus-zoom', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    setAnnotations(loadMap(resource.id))
    setOriginals(loadOriginals(resource.id))
    setLegacyEdited(loadLegacyEdited(resource.id))
    setEditValues({})
    setPageIndex(0)
    setPendingLiaison(null)
    setDraftNote(null)
    setSelectedNote(null)
    setSelectedStroke(null)
  }, [resource.id])

  // en quittant le mode édition, on oublie les brouillons (le blur a déjà commité)
  useEffect(() => {
    if (tool !== 'edit') setEditValues({})
  }, [tool])

  // nettoie les écouteurs de redimensionnement au démontage
  useEffect(() => () => {
    window.removeEventListener('pointermove', onNoteResizeMove)
    window.removeEventListener('pointermove', onStrokeResizeMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updatePage = (updater: (page: PageAnnotations) => PageAnnotations) => {
    setAnnotations((map) => ({ ...map, [pageKey]: updater(normalizePage(map[pageKey])) }))
  }

  const undo = () => updatePage((p) => {
    const order = [...p.order]
    const last = order.pop()
    if (!last) return p
    if (last.kind === 'stroke') return { ...p, order, strokes: p.strokes.filter((s) => s.id !== last.id) }
    if (last.kind === 'liaison') return { ...p, order, liaisons: p.liaisons.filter((l) => l.id !== last.id) }
    if (last.kind === 'text') return { ...p, order, texts: p.texts.filter((t) => t.id !== last.id) }
    return { ...p, order, grayed: p.grayed.filter((g) => g !== last.id) }
  })

  const clearPage = () => {
    setSelectedNote(null)
    setSelectedStroke(null)
    updatePage(() => emptyPage())
    // Restaure aussi le texte d'origine des paragraphes modifiés avec l'outil Édition.
    const restorable = page.filter((paragraph) => originals[paragraph.key] !== undefined && originals[paragraph.key] !== paragraph.text)
    if (restorable.length) {
      const chapters = resource.chapters.map((chapter, chapterIndex) => ({
        ...chapter,
        paragraphs: chapter.paragraphs.map((text, paragraphIndex) => {
          const entry = restorable.find((paragraph) => paragraph.chapterIndex === chapterIndex && paragraph.paragraphIndex === paragraphIndex)
          return entry ? originals[entry.key] : text
        }),
      }))
      onUpdateResource({ ...resource, chapters })
      setOriginals((map) => {
        const next = { ...map }
        restorable.forEach((paragraph) => { delete next[paragraph.key] })
        return next
      })
      setLegacyEdited((keys) => {
        const next = keys.filter((key) => !restorable.some((paragraph) => paragraph.key === key))
        localStorage.setItem(`vivre-focus-edited-${resource.id}`, JSON.stringify(next))
        return next
      })
    }
    setEditValues({})
  }

  // --- notes texte : validation de la saisie en cours -------------------------
  const commitNote = () => {
    if (!draftNote) return
    const noteDraft = draftNote
    const el = editorRef.current
    const runs = el ? serializeEditor(el, noteDraft.baseColor) : []
    const total = runs.map((run) => run.t).join('').trim()
    if (runs.length && total) {
      updatePage((p) => {
        if (noteDraft.id) {
          return { ...p, texts: p.texts.map((note) => (note.id === noteDraft.id ? { ...note, runs, size: noteDraft.size, color: runs[0]?.c ?? note.color } : note)) }
        }
        const note: TextNote = { id: uid(), x: noteDraft.x, y: noteDraft.y, runs, size: noteDraft.size, color: runs[0]?.c ?? noteDraft.baseColor }
        return { ...p, texts: [...p.texts, note], order: [...p.order, { kind: 'text', id: note.id }] }
      })
    } else if (noteDraft.id) {
      // contenu entièrement vidé → supprimer la note
      const removedId = noteDraft.id
      updatePage((p) => ({ ...p, texts: p.texts.filter((note) => note.id !== removedId), order: p.order.filter((action) => action.id !== removedId) }))
    }
    setDraftNote(null)
  }

  const quitAll = () => { commitNote(); onClose() }

  const goto = (next: number) => {
    commitNote()
    setPendingLiaison(null)
    setSelectedNote(null)
    setSelectedStroke(null)
    highlightAnchorRef.current = null
    setPageIndex(Math.max(0, Math.min(pages.length - 1, next)))
  }

  // Échap : termine la saisie en cours, sinon quitte. Delete/Backspace : supprime l'élément sélectionné. Cmd/Ctrl+Z = annuler. Raccourcis outils.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (draftNote) { commitNote(); return }
        quitAll()
        return
      }
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input, textarea, [contenteditable="true"]'))

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault()
        undo()
        return
      }

      // Touche Delete / Backspace sur élément sélectionné
      if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
        if (selectedNote) {
          event.preventDefault()
          const idToDelete = selectedNote
          setSelectedNote(null)
          updatePage((p) => ({
            ...p,
            texts: p.texts.filter((t) => t.id !== idToDelete),
            order: p.order.filter((a) => a.id !== idToDelete),
          }))
          return
        }
        if (selectedStroke) {
          event.preventDefault()
          const idToDelete = selectedStroke
          setSelectedStroke(null)
          updatePage((p) => ({
            ...p,
            strokes: p.strokes.filter((s) => s.id !== idToDelete),
            order: p.order.filter((a) => a.id !== idToDelete),
          }))
          return
        }
      }

      // Raccourcis clavier pour changer d'outil
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const k = event.key.toLowerCase()
        const targetTool = keyToTool[k]
        if (targetTool) {
          event.preventDefault()
          commitNote()
          setTool(targetTool)
          setPendingLiaison(null)
          setSelectedNote(null)
          setSelectedStroke(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, pageKey, annotations, draftNote, selectedNote, selectedStroke, keyToTool])

  const boardPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  const isDrawTool = tool === 'pen' || tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow'
  const isInteractive = isDrawTool || tool === 'eraser'

  const eraseAtPoint = (point: Point) => {
    const ERASER_RADIUS = 26
    updatePage((p) => {
      const removedStrokes = p.strokes.filter((s) => distToStroke(point, s) <= ERASER_RADIUS).map((s) => s.id)
      const removedLiaisons = p.liaisons.filter((l) => {
        const d1 = Math.hypot(l.x1 - point.x, l.y - point.y)
        const d2 = Math.hypot(l.x2 - point.x, l.y - point.y)
        const dMid = Math.hypot((l.x1 + l.x2) / 2 - point.x, l.y + 11 - point.y)
        return Math.min(d1, d2, dMid) <= ERASER_RADIUS
      }).map((l) => l.id)
      const removedTexts = p.texts.filter((t) => Math.hypot(t.x - point.x, t.y - point.y) <= 55).map((t) => t.id)
      if (!removedStrokes.length && !removedLiaisons.length && !removedTexts.length) return p
      const removed = new Set([...removedStrokes, ...removedLiaisons, ...removedTexts])
      return {
        ...p,
        strokes: p.strokes.filter((s) => !removed.has(s.id)),
        liaisons: p.liaisons.filter((l) => !removed.has(l.id)),
        texts: p.texts.filter((t) => !removed.has(t.id)),
        order: p.order.filter((action) => !removed.has(action.id)),
      }
    })
  }

  // --- dessin libre, formes et gomme continue ----------------------------------
  const onPointerDown = (event: React.PointerEvent) => {
    const point = boardPoint(event)
    if (tool === 'eraser') {
      isErasingRef.current = true
      setEraserPos(point)
      eraseAtPoint(point)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      return
    }
    if (!isDrawTool) return
    drawingRef.current = { id: uid(), kind: tool, color, width, points: [point] }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    forceRedraw((n) => n + 1)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const point = boardPoint(event)
    if (tool === 'eraser') {
      setEraserPos(point)
      if (isErasingRef.current) {
        const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
        const samples = native.getCoalescedEvents?.() ?? []
        if (samples.length) {
          samples.forEach((s) => eraseAtPoint(boardPoint(s)))
        } else {
          eraseAtPoint(point)
        }
      }
      return
    }
    const draft = drawingRef.current
    if (!draft) return
    // échantillonnage fin (trackpad) : récupère tous les points coalescés
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
    const samples = native.getCoalescedEvents?.() ?? []
    const last = samples.length ? samples[samples.length - 1] : null
    if (draft.kind === 'pen') {
      if (samples.length) samples.forEach((sample) => draft.points.push(boardPoint(sample)))
      else draft.points.push(boardPoint(event))
    } else {
      let p = boardPoint(last ?? event)
      if (draft.kind === 'line' && event.shiftKey) {
        // Shift : aimantation par pas de 15°
        const start = draft.points[0]
        const dx = p.x - start.x
        const dy = p.y - start.y
        const length = Math.hypot(dx, dy)
        const snap = Math.PI / 12
        const angle = Math.round(Math.atan2(dy, dx) / snap) * snap
        p = { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }
      }
      draft.points = [draft.points[0], p]
    }
    forceRedraw((n) => n + 1)
  }

  const onPointerUp = () => {
    if (tool === 'eraser') {
      isErasingRef.current = false
      return
    }
    const draft = drawingRef.current
    drawingRef.current = null
    if (!draft) { forceRedraw((n) => n + 1); return }
    const span = draft.points.reduce((max, point) => Math.max(max, Math.hypot(point.x - draft.points[0].x, point.y - draft.points[0].y)), 0)
    // un simple toucher de forme ne crée rien
    if (draft.points.length < 2 && span < 3 && draft.kind !== 'pen') {
      forceRedraw((n) => n + 1)
      return
    }
    updatePage((p) => ({ ...p, strokes: [...p.strokes, draft], order: [...p.order, { kind: 'stroke', id: draft.id }] }))
  }

  const onPointerLeave = () => {
    isErasingRef.current = false
    setEraserPos(null)
  }

  // --- surligneur : clic sur un mot, Shift+clic = plage de mots ----------------
  const wordHighlightStroke = (el: Element): Stroke => {
    const rect = el.getBoundingClientRect()
    const board = boardRef.current?.getBoundingClientRect()
    const y = rect.top - (board?.top ?? 0) + rect.height * 0.58
    return {
      id: uid(),
      kind: 'highlighter',
      color,
      width: rect.height * 0.88,
      points: [
        { x: rect.left - (board?.left ?? 0) + 1, y },
        { x: rect.right - (board?.left ?? 0) - 1, y },
      ],
    }
  }

  /** Id du surlignage couvrant déjà ce mot, s'il existe. */
  const highlightHit = (el: Element, strokes: Stroke[]): string | null => {
    const rect = el.getBoundingClientRect()
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return null
    const cx = rect.left - board.left + rect.width / 2
    const cy = rect.top - board.top + rect.height * 0.58
    const hit = strokes.find((s) => s.kind === 'highlighter' && s.points.length >= 2
      && Math.abs(s.points[0].y - cy) < Math.max(7, s.width / 2)
      && cx >= Math.min(s.points[0].x, s.points[1].x) - 4
      && cx <= Math.max(s.points[0].x, s.points[1].x) + 4)
    return hit?.id ?? null
  }

  const highlightWordAt = (wordEl: Element, shiftKey: boolean) => {
    const board = boardRef.current
    if (!board) return
    const wordKey = wordEl.getAttribute('data-word') ?? ''
    // Shift+clic : surligne toute la plage depuis le dernier mot cliqué
    if (shiftKey && highlightAnchorRef.current && highlightAnchorRef.current !== wordKey) {
      const words = Array.from(board.querySelectorAll('[data-word]'))
      const from = words.findIndex((el) => el.getAttribute('data-word') === highlightAnchorRef.current)
      const to = words.findIndex((el) => el.getAttribute('data-word') === wordKey)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const targets = words.slice(start, end + 1)
        updatePage((p) => {
          const strokes = [...p.strokes]
          const order = [...p.order]
          targets.forEach((el) => {
            if (!highlightHit(el, strokes)) {
              const stroke = wordHighlightStroke(el)
              strokes.push(stroke)
              order.push({ kind: 'stroke', id: stroke.id })
            }
          })
          return { ...p, strokes, order }
        })
        highlightAnchorRef.current = wordKey
        return
      }
    }
    // clic simple : bascule le surlignage du mot
    updatePage((p) => {
      const existing = highlightHit(wordEl, p.strokes)
      if (existing) {
        return { ...p, strokes: p.strokes.filter((s) => s.id !== existing), order: p.order.filter((action) => action.id !== existing) }
      }
      const stroke = wordHighlightStroke(wordEl)
      return { ...p, strokes: [...p.strokes, stroke], order: [...p.order, { kind: 'stroke', id: stroke.id }] }
    })
    highlightAnchorRef.current = wordKey
  }

  // --- sélection de formes (rectangle / ellipse) -------------------------------
  const hitStroke = (point: Point): string | null => {
    for (const stroke of [...current.strokes].reverse()) {
      if (stroke.kind !== 'rect' && stroke.kind !== 'ellipse') continue
      const [a, b] = stroke.points
      const x1 = Math.min(a.x, b.x)
      const x2 = Math.max(a.x, b.x)
      const y1 = Math.min(a.y, b.y)
      const y2 = Math.max(a.y, b.y)
      const m = 9
      const insideX = point.x > x1 - m && point.x < x2 + m
      const insideY = point.y > y1 - m && point.y < y2 + m
      const nearBorder = insideX && insideY && (point.x < x1 + m || point.x > x2 - m || point.y < y1 + m || point.y > y2 - m)
      if (nearBorder) return stroke.id
    }
    return null
  }

  const startStrokeResize = (event: React.PointerEvent, stroke: Stroke, corner: string) => {
    event.stopPropagation()
    event.preventDefault()
    const [a, b] = stroke.points
    const x1 = Math.min(a.x, b.x)
    const x2 = Math.max(a.x, b.x)
    const y1 = Math.min(a.y, b.y)
    const y2 = Math.max(a.y, b.y)
    const opposite = ({ nw: { x: x2, y: y2 }, ne: { x: x1, y: y2 }, sw: { x: x2, y: y1 }, se: { x: x1, y: y1 } } as Record<string, Point>)[corner]
    if (!opposite) return
    strokeResizeRef.current = { id: stroke.id, opposite }
    window.addEventListener('pointermove', onStrokeResizeMove)
    window.addEventListener('pointerup', endStrokeResize, { once: true })
  }

  const onStrokeResizeMove = (event: PointerEvent) => {
    const resize = strokeResizeRef.current
    if (!resize) return
    const point = boardPoint(event)
    updatePage((p) => ({
      ...p,
      strokes: p.strokes.map((s) => (s.id === resize.id ? { ...s, points: [resize.opposite, point] } : s)),
    }))
  }

  const endStrokeResize = () => {
    strokeResizeRef.current = null
    window.removeEventListener('pointermove', onStrokeResizeMove)
  }

  // --- clics sur le texte (grisage, liaison, note, surlignage, sélection) ------
  const onBoardClick = (event: React.MouseEvent) => {
    if (tool === 'text') {
      if ((event.target as HTMLElement).closest('.focus-text-note, .focus-text-editor, .note-handle')) return
      // saisie en cours : un clic ailleurs la termine SANS ouvrir une nouvelle note
      if (draftNote) { commitNote(); return }
      const point = boardPoint(event)
      setSelectedNote(null)
      setSelectedStroke(null)
      setDraftNote({ x: point.x, y: point.y, size: textSize, baseColor: color })
      return
    }
    if (tool === 'select') {
      if ((event.target as HTMLElement).closest('.focus-text-note')) return
      setSelectedNote(null)
      setSelectedStroke(hitStroke(boardPoint(event)))
      return
    }
    if (tool === 'highlighter') {
      const wordEl = (event.target as HTMLElement).closest('[data-word]')
      if (!wordEl) return
      highlightWordAt(wordEl, event.shiftKey)
      return
    }
    const target = (event.target as HTMLElement).closest('[data-letter],[data-word]') as HTMLElement | null
    if (!target) return
    if (tool === 'gray') {
      const letterKey = target.dataset.letter
      if (!letterKey) return
      updatePage((p) => ({
        ...p,
        grayed: p.grayed.includes(letterKey) ? p.grayed.filter((key) => key !== letterKey) : [...p.grayed, letterKey],
        order: [...p.order, { kind: 'gray', id: letterKey }],
      }))
    } else if (tool === 'liaison') {
      // liaison lettre à lettre : si le clic tombe entre deux lettres, on prend la plus proche
      let letterEl = (event.target as HTMLElement).closest('[data-letter]') as HTMLElement | null
      if (!letterEl) {
        const wordEl = (event.target as HTMLElement).closest('[data-word]')
        if (!wordEl) return
        let bestDist = Infinity
        wordEl.querySelectorAll('[data-letter]').forEach((el) => {
          const rect = el.getBoundingClientRect()
          const dist = Math.abs(rect.left + rect.width / 2 - event.clientX)
          if (dist < bestDist) { bestDist = dist; letterEl = el as HTMLElement }
        })
      }
      if (!letterEl) return
      const rect = letterEl.getBoundingClientRect()
      const board = boardRef.current?.getBoundingClientRect()
      if (!board) return
      const point = { x: rect.left + rect.width / 2 - board.left, y: rect.bottom - board.top + 4 }
      if (!pendingLiaison) setPendingLiaison(point)
      else {
        const [x1, x2] = [pendingLiaison.x, point.x].sort((a, b) => a - b)
        if (Math.abs(x2 - x1) > 4) {
          const liaison: Liaison = { id: uid(), x1, x2, y: Math.max(pendingLiaison.y, point.y), color }
          updatePage((p) => ({ ...p, liaisons: [...p.liaisons, liaison], order: [...p.order, { kind: 'liaison', id: liaison.id }] }))
        }
        setPendingLiaison(null)
      }
    }
  }

  // --- notes texte : déplacement, sélection, édition, redimension --------------
  const onNotePointerDown = (event: React.PointerEvent, note: TextNote) => {
    if (tool !== 'text' && tool !== 'select') return
    event.stopPropagation()
    if (draftNote && draftNote.id !== note.id) commitNote()
    dragNoteRef.current = { id: note.id, startX: event.clientX, startY: event.clientY, origX: note.x, origY: note.y, moved: false }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onNotePointerMove = (event: React.PointerEvent) => {
    const drag = dragNoteRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    updatePage((p) => ({ ...p, texts: p.texts.map((note) => (note.id === drag.id ? { ...note, x: drag.origX + dx, y: drag.origY + dy } : note)) }))
  }

  const onNotePointerUp = (event: React.PointerEvent, note: TextNote) => {
    const drag = dragNoteRef.current
    dragNoteRef.current = null
    if (!drag) return
    event.stopPropagation()
    // clic simple (sans déplacement) → sélectionne la note et ses poignées
    if (!drag.moved) {
      setSelectedStroke(null)
      setSelectedNote(note.id)
    }
  }

  const openNoteEditor = (note: TextNote) => {
    setSelectedNote(null)
    setSelectedStroke(null)
    setDraftNote({ x: note.x, y: note.y, id: note.id, size: note.size, baseColor: note.color })
  }

  const startNoteResize = (event: React.PointerEvent, note: TextNote, corner: string) => {
    event.stopPropagation()
    event.preventDefault()
    const el = (event.currentTarget as HTMLElement).closest('.focus-text-note') as HTMLElement | null
    const board = boardRef.current?.getBoundingClientRect()
    if (!el || !board) return
    const rect = el.getBoundingClientRect()
    const left = rect.left - board.left
    const top = rect.top - board.top
    const opposite = ({
      nw: { x: left + rect.width, y: top + rect.height },
      ne: { x: left, y: top + rect.height },
      sw: { x: left + rect.width, y: top },
      se: { x: left, y: top },
    } as Record<string, Point>)[corner]
    if (!opposite) return
    const start = boardPoint(event)
    noteResizeRef.current = { id: note.id, opposite, startDist: Math.max(10, Math.hypot(start.x - opposite.x, start.y - opposite.y)), origSize: note.size }
    window.addEventListener('pointermove', onNoteResizeMove)
    window.addEventListener('pointerup', endNoteResize, { once: true })
  }

  const onNoteResizeMove = (event: PointerEvent) => {
    const resize = noteResizeRef.current
    if (!resize) return
    const point = boardPoint(event)
    const dist = Math.hypot(point.x - resize.opposite.x, point.y - resize.opposite.y)
    const size = Math.max(12, Math.min(84, Math.round((resize.origSize * (dist / resize.startDist)) * 10) / 10))
    updatePage((p) => ({ ...p, texts: p.texts.map((note) => (note.id === resize.id ? { ...note, size } : note)) }))
  }

  const endNoteResize = () => {
    noteResizeRef.current = null
    window.removeEventListener('pointermove', onNoteResizeMove)
  }

  // --- couleurs / tailles pendant la saisie de texte ---------------------------
  /** Changer de couleur en cours de saisie colore la suite, sans quitter l'éditeur. */
  const pickColor = (value: string) => {
    setColor(value)
    if (draftNote && editorRef.current) {
      editorRef.current.focus()
      try { document.execCommand('foreColor', false, value) } catch { /* noop */ }
    }
  }

  const bumpTextSize = (delta: number) => {
    if (draftNote) setDraftNote({ ...draftNote, size: Math.max(12, Math.min(84, draftNote.size + delta)) })
    else setTextSize(Math.max(12, Math.min(84, textSize + delta)))
  }

  // --- mode édition : commit au blur, vert en temps réel pendant la saisie ----
  const commitParagraph = (key: string, chapterIndex: number, paragraphIndex: number, text: string) => {
    setEditValues((values) => {
      const next = { ...values }
      delete next[key]
      return next
    })
    const before = resource.chapters[chapterIndex]?.paragraphs[paragraphIndex]
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean || clean === before) return
    setOriginals((map) => (key in map ? map : { ...map, [key]: before ?? '' }))
    const chapters = resource.chapters.map((chapter, index) =>
      index === chapterIndex
        ? { ...chapter, paragraphs: chapter.paragraphs.map((paragraph, pIndex) => (pIndex === paragraphIndex ? clean : paragraph)) }
        : chapter,
    )
    onUpdateResource({ ...resource, chapters })
  }

  const activeTool = TOOLS.find((item) => item.id === tool) ?? TOOLS[0]
  const draft = drawingRef.current
  const showPanel = activeTool.color || activeTool.width || tool === 'text'

  const selectionOverlay = (() => {
    if (!selectedStroke || tool !== 'select') return null
    const stroke = current.strokes.find((s) => s.id === selectedStroke)
    if (!stroke || stroke.points.length < 2) return null
    const [a, b] = stroke.points
    const x1 = Math.min(a.x, b.x)
    const x2 = Math.max(a.x, b.x)
    const y1 = Math.min(a.y, b.y)
    const y2 = Math.max(a.y, b.y)
    const corners = [
      { id: 'nw', cx: x1, cy: y1, cursor: 'nwse-resize' },
      { id: 'ne', cx: x2, cy: y1, cursor: 'nesw-resize' },
      { id: 'sw', cx: x1, cy: y2, cursor: 'nesw-resize' },
      { id: 'se', cx: x2, cy: y2, cursor: 'nwse-resize' },
    ]
    return <g>
      <rect x={x1 - 5} y={y1 - 5} width={x2 - x1 + 10} height={y2 - y1 + 10} fill="none"
        stroke="var(--ink)" strokeOpacity=".45" strokeDasharray="5 4" pointerEvents="none" />
      {corners.map((corner) => <rect key={corner.id} x={corner.cx - 6} y={corner.cy - 6} width={12} height={12} rx={3}
        fill="var(--white)" stroke="var(--ink)" strokeWidth="1.5"
        style={{ cursor: corner.cursor, pointerEvents: 'all' }}
        onPointerDown={(event) => startStrokeResize(event, stroke, corner.id)} />)}
    </g>
  })()

  const eraserShortcut = (effectiveShortcuts.eraser || '').toUpperCase()
  const eraserTitle = eraserShortcut ? `Gomme (${eraserShortcut})` : 'Gomme'

  return <div className="focus-overlay">
    <div className={`focus-stage ${tool !== 'edit' ? 'no-text-select' : ''}`}>
      <div className={`focus-board ${tool !== 'edit' ? 'no-text-select' : ''}`} ref={boardRef} onClick={onBoardClick}>
        <div className={`focus-text-col ${tool !== 'edit' ? 'no-text-select' : ''}`}>
          {page.map((paragraph) => <div key={paragraph.key}>
            {paragraph.isChapterStart && <h3 className="focus-chapter">{paragraph.chapterTitle}</h3>}
            {tool === 'edit' ? (
              (() => {
                const value = editValues[paragraph.key] ?? paragraph.text
                const original = originals[paragraph.key] ?? paragraph.text
                const green = modifiedCharIndices(original, value)
                return <div className="focus-paragraph editing focus-edit-wrap" style={{ fontSize }}
                  onClick={(event) => event.stopPropagation()}>
                  <span className="focus-edit-mirror" aria-hidden>
                    {renderMirrorChars(value, green, current.grayed, paragraph.key)}
                  </span>
                  <textarea className="focus-edit-area" value={value} spellCheck={false}
                    onChange={(event) => setEditValues((values) => ({ ...values, [paragraph.key]: event.target.value }))}
                    onBlur={(event) => commitParagraph(paragraph.key, paragraph.chapterIndex, paragraph.paragraphIndex, event.target.value)} />
                </div>
              })()
            ) : (
              (() => {
                const modified = modifiedChars[paragraph.key]
                let offset = 0
                return <p className="focus-paragraph" style={{ fontSize }}>
                  {paragraph.text.split(/(\s+)/).map((part, index) => {
                    const start = offset
                    offset += part.length
                    if (/\s+/.test(part)) return <span key={index}>{part}</span>
                    const wordKey = `${paragraph.key}:${index}`
                    return <FocusWord key={wordKey} wordKey={wordKey} raw={part} grayed={current.grayed}
                      green={modified} offset={start}
                      interactive={tool === 'gray' || tool === 'liaison' || tool === 'highlighter'} />
                  })}
                </p>
              })()
            )}
          </div>)}
        </div>

        {current.texts.filter((note) => note.id !== draftNote?.id).map((note) => <div key={note.id}
          className={`focus-text-note ${selectedNote === note.id ? 'selected' : ''}`}
          style={{ left: note.x, top: note.y, fontSize: note.size }}
          onPointerDown={(event) => onNotePointerDown(event, note)}
          onPointerMove={onNotePointerMove}
          onPointerUp={(event) => onNotePointerUp(event, note)}
          onDoubleClick={(event) => { event.stopPropagation(); if (tool === 'text' || tool === 'select') openNoteEditor(note) }}>
          {note.runs.map((run, index) => <span key={index} style={{ color: run.c }}>{run.t}</span>)}
          {selectedNote === note.id && ['nw', 'ne', 'sw', 'se'].map((corner) => <button key={corner}
            className={`note-handle ${corner}`} aria-label={corner}
            onPointerDown={(event) => startNoteResize(event, note, corner)} />)}
        </div>)}

        {draftNote && <NoteEditor key={draftNote.id ?? 'new'} x={draftNote.x} y={draftNote.y}
          size={draftNote.size} baseColor={draftNote.baseColor}
          initialRuns={draftNote.id ? (current.texts.find((note) => note.id === draftNote.id)?.runs ?? []) : []}
          editorRef={editorRef} onCancel={commitNote} />}

        <svg className={`focus-ink ${isInteractive ? 'drawing' : ''} ${tool === 'eraser' ? 'eraser-active' : ''}`}
          onPointerDown={isInteractive ? onPointerDown : undefined}
          onPointerMove={isInteractive ? onPointerMove : undefined}
          onPointerUp={isInteractive ? onPointerUp : undefined}
          onPointerLeave={isInteractive ? onPointerLeave : undefined}>
          {current.strokes.map((stroke) => <StrokeShape stroke={stroke} key={stroke.id} />)}
          {draft && <StrokeShape stroke={draft} draft />}
          {current.liaisons.map((liaison) => {
            const midX = (liaison.x1 + liaison.x2) / 2
            return <path key={liaison.id} d={`M ${liaison.x1} ${liaison.y} Q ${midX} ${liaison.y + 22}, ${liaison.x2} ${liaison.y}`}
              fill="none" stroke={liaison.color} strokeWidth="2.5" strokeLinecap="round" />
          })}
          {pendingLiaison && <circle cx={pendingLiaison.x} cy={pendingLiaison.y} r="5" fill={color} />}
          {selectionOverlay}
          {tool === 'eraser' && eraserPos && (
            <g className="focus-eraser-indicator" pointerEvents="none">
              <circle cx={eraserPos.x} cy={eraserPos.y} r={26} fill="rgba(239, 68, 68, 0.14)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={eraserPos.x} cy={eraserPos.y} r={3} fill="#ef4444" />
            </g>
          )}
        </svg>
      </div>
    </div>

    {/* navigation pages — haut centre */}
    <div className="focus-nav-pill glass">
      <button title="Page précédente" disabled={safePage === 0} onClick={() => goto(safePage - 1)} aria-label="Page précédente"><ChevronLeft size={16} /></button>
      <span>{safePage + 1} / {pages.length}</span>
      <button title="Page suivante" disabled={safePage >= pages.length - 1} onClick={() => goto(safePage + 1)} aria-label="Page suivante"><ChevronRight size={16} /></button>
    </div>

    {/* zoom + quitter — haut droite */}
    <div className="focus-actions-pill glass">
      <button title="Agrandir le texte" onClick={() => setFontSize(Math.min(46, fontSize + 2))}>A+</button>
      <button title="Réduire le texte" onClick={() => setFontSize(Math.max(20, fontSize - 2))}>A−</button>
      <button className="focus-zoom" title="Revenir à 100 %" onClick={() => setFontSize(BASE_FONT)}>{zoom} %</button>
      <button className="focus-quit-btn" onClick={quitAll}><X size={14} /><span>Quitter</span></button>
    </div>

    {/* annuler / gomme / effacer — bord gauche, centré verticalement */}
    <div className="focus-side-pill left glass">
      <button title="Annuler (⌘Z)" onClick={undo} aria-label="Annuler"><Undo2 size={16} /></button>
      <button title={eraserTitle} className={tool === 'eraser' ? 'active' : ''}
        onClick={() => { commitNote(); setTool(tool === 'eraser' ? 'select' : 'eraser'); setPendingLiaison(null); setSelectedNote(null); setSelectedStroke(null) }} aria-label="Gomme"><Eraser size={16} /></button>
      <button title="Nettoyer la page" onClick={clearPage} aria-label="Nettoyer la page"><Trash2 size={16} /></button>
    </div>

    {/* couleurs + épaisseur : repliées derrière une flèche discrète à droite */}
    {showPanel && (toolsOpen
      ? <div className="focus-panel glass">
        {activeTool.color && COLORS.map((value) => <button key={value}
          className={color === value ? 'panel-swatch active' : 'panel-swatch'}
          style={{ background: value }} title={value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pickColor(value)} />)}
        {activeTool.color && (activeTool.width || tool === 'text') && <span className="panel-sep" />}
        {activeTool.width && WIDTHS.map((value) => <button key={value}
          className={width === value ? 'panel-width active' : 'panel-width'}
          title={`Épaisseur ${value}`} onClick={() => setWidth(value)}><i style={{ height: value }} /></button>)}
        {tool === 'text' && <>
          <button className="panel-size" title="Réduire le texte" onMouseDown={(event) => event.preventDefault()} onClick={() => bumpTextSize(-2)}>A−</button>
          <button className="panel-size" title="Agrandir le texte" onMouseDown={(event) => event.preventDefault()} onClick={() => bumpTextSize(2)}>A+</button>
        </>}
        <button className="panel-collapse" title="Replier" onClick={() => setToolsOpen(false)} aria-label="Replier"><ChevronDown size={14} /></button>
      </div>
      : <button className="focus-tools-toggle glass" title="Couleurs et épaisseur" onClick={() => setToolsOpen(true)} aria-label="Ouvrir les outils"><ChevronUp size={14} /></button>)}

    {/* barre d'outils — icônes seules avec raccourcis dans les infobulles */}
    <footer className="focus-toolbar glass">
      {TOOLS.map((item) => {
        const shortcutKey = (effectiveShortcuts[item.id] || '').toUpperCase()
        const titleWithShortcut = shortcutKey ? `${item.label} (${shortcutKey})` : item.label
        return (
          <button key={item.id} title={titleWithShortcut}
            className={tool === item.id ? 'ftool active' : 'ftool'}
            onClick={() => { commitNote(); setTool(item.id); setPendingLiaison(null); setSelectedNote(null); setSelectedStroke(null) }}>
            <b>{item.icon}</b>
          </button>
        )
      })}
    </footer>
  </div>
}

/** Éditeur de note : contenteditable non contrôlé, sérialisé en runs à la validation. */
function NoteEditor({ x, y, size, baseColor, initialRuns, editorRef, onCancel }: {
  x: number
  y: number
  size: number
  baseColor: string
  initialRuns: TextRun[]
  editorRef: React.MutableRefObject<HTMLDivElement | null>
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    editorRef.current = el
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* noop */ }
    if (initialRuns.length) el.innerHTML = runsToHtml(initialRuns)
    el.focus()
    // curseur en fin de texte
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return () => { editorRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div ref={ref} className="focus-text-editor" contentEditable suppressContentEditableWarning spellCheck={false}
    style={{ left: x, top: y, fontSize: size, color: baseColor }}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() } }} />
}

function FocusWord({ raw, wordKey, grayed, green, offset, interactive }: {
  raw: string
  wordKey: string
  grayed: string[]
  green?: Set<number>
  offset: number
  interactive: boolean
}) {
  return <span className={`focus-word ${interactive ? 'clickable' : ''}`} data-word={wordKey}>
    {raw.split('').map((letter, index) => {
      const letterKey = `${wordKey}.${index}`
      const userGray = grayed.includes(letterKey)
      const isGreen = green?.has(offset + index) ?? false
      return <span key={index} data-letter={letterKey}
        className={`focus-letter ${isGreen ? 'edited-char' : ''} ${userGray ? 'user-gray' : ''}`}>{letter}</span>
    })}
  </span>
}

function StrokeShape({ stroke, draft }: { stroke: Stroke; draft?: boolean }) {
  const opacity = stroke.kind === 'highlighter' ? 0.35 : 1
  const common = {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    opacity,
    ...(draft ? { pointerEvents: 'none' as const } : {}),
  }
  const [first, ...rest] = stroke.points
  if (!first) return null
  // un point unique (simple toucher) = un rond
  const span = stroke.points.reduce((max, point) => Math.max(max, Math.hypot(point.x - first.x, point.y - first.y)), 0)
  if (span < 3 && (stroke.kind === 'pen' || stroke.kind === 'highlighter')) {
    return <circle cx={first.x} cy={first.y} r={stroke.width / 2} fill={stroke.color} stroke="none" opacity={opacity} />
  }
  if (stroke.kind === 'pen' || stroke.kind === 'highlighter') {
    const d = `M ${first.x} ${first.y} ` + rest.map((point) => `L ${point.x} ${point.y}`).join(' ')
    return <path d={d} {...common} />
  }
  const last = stroke.points[stroke.points.length - 1] ?? first
  const x = Math.min(first.x, last.x)
  const y = Math.min(first.y, last.y)
  const w = Math.abs(last.x - first.x)
  const h = Math.abs(last.y - first.y)
  if (stroke.kind === 'rect') return <rect x={x} y={y} width={w} height={h} rx={4} {...common} />
  if (stroke.kind === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  if (stroke.kind === 'line') return <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} {...common} />
  // arrow: line + head
  const angle = Math.atan2(last.y - first.y, last.x - first.x)
  const head = 10 + stroke.width
  const a1 = angle + Math.PI * 0.82
  const a2 = angle - Math.PI * 0.82
  return <g {...common}>
    <line x1={first.x} y1={first.y} x2={last.x} y2={last.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
    <path d={`M ${last.x} ${last.y} L ${last.x + head * Math.cos(a1)} ${last.y + head * Math.sin(a1)} M ${last.x} ${last.y} L ${last.x + head * Math.cos(a2)} ${last.y + head * Math.sin(a2)}`}
      stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" fill="none" />
  </g>
}
