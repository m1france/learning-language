import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Resource } from '../domain'

/**
 * Learning Focus grammar — plein écran pour projeter un texte en classe.
 * Toolbar glass opaque (icônes seules), couleurs/épaisseur en panneau vertical
 * bas-droite, navigation ↑/↓ à droite, annuler/gomme/effacer à gauche.
 * Notes manuscrites déplaçables et redimensionnables.
 * Mode édition : textarea transparente + miroir coloré — les lettres ajoutées
 * passent en vert en temps réel (diff caractère par caractère contre le texte
 * d'origine), les lettres grisées restent visibles pendant la saisie.
 * Cmd/Ctrl+Z = annuler la dernière annotation.
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
type TextNote = { id: string; x: number; y: number; text: string; size: number; color: string }
type ActionRef = { kind: 'stroke' | 'liaison' | 'gray' | 'text'; id: string }
type PageAnnotations = { strokes: Stroke[]; liaisons: Liaison[]; texts: TextNote[]; grayed: string[]; order: ActionRef[] }
type AnnotationMap = Record<string, PageAnnotations>

const emptyPage = (): PageAnnotations => ({ strokes: [], liaisons: [], texts: [], grayed: [], order: [] })

const normalizePage = (raw: Partial<PageAnnotations> | undefined): PageAnnotations => ({
  strokes: raw?.strokes ?? [],
  liaisons: raw?.liaisons ?? [],
  texts: raw?.texts ?? [],
  grayed: raw?.grayed ?? [],
  order: raw?.order ?? [],
})

const TOOLS: { id: Tool; icon: string; label: string; color?: boolean; width?: boolean }[] = [
  { id: 'select', icon: '➤', label: 'Sélection' },
  { id: 'pen', icon: '✏', label: 'Stylo', color: true, width: true },
  { id: 'highlighter', icon: '🖊', label: 'Surligneur', color: true, width: true },
  { id: 'text', icon: 'T', label: 'Texte', color: true },
  { id: 'edit', icon: '✎', label: 'Édition' },
  { id: 'rect', icon: '▭', label: 'Rectangle', color: true, width: true },
  { id: 'ellipse', icon: '◯', label: 'Ellipse', color: true, width: true },
  { id: 'line', icon: '╱', label: 'Ligne', color: true, width: true },
  { id: 'arrow', icon: '→', label: 'Flèche', color: true, width: true },
  { id: 'liaison', icon: '‿', label: 'Liaison', color: true },
  { id: 'gray', icon: 'Aa', label: 'Griser une lettre' },
]

const COLORS = ['#d64545', '#2563eb', '#16a34a', '#f59e0b', '#20201e', '#7c3aed']
const WIDTHS = [2, 4, 7]

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
 * absents du texte d'origine. Pré/suffixe commun ignorés, LCS sur le milieu —
 * seules les lettres réellement ajoutées/remplacées ressortent en vert.
 */
function modifiedCharIndices(original: string, current: string): Set<number> {
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
    else if (dp[i + 1][j] >= dp[i][j + 1]) { i++ }
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

const loadOriginals = (resourceId: string): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(`vivre-focus-originals-${resourceId}`) || '{}') } catch { return {} }
}

const loadLegacyEdited = (resourceId: string): string[] => {
  try { return JSON.parse(localStorage.getItem(`vivre-focus-edited-${resourceId}`) || '[]') } catch { return [] }
}

export function LearningFocus({ resources, initialResourceId, onUpdateResource, onClose }: {
  resources: Resource[]
  initialResourceId: string
  onUpdateResource: (resource: Resource) => void
  onClose: () => void
}) {
  const [resourceId, setResourceId] = useState(initialResourceId)
  const resource = resources.find((item) => item.id === resourceId) ?? resources[0]
  const [pageIndex, setPageIndex] = useState(0)
  const [fontSize, setFontSize] = useState(30)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [textSize, setTextSize] = useState(24)
  const [annotations, setAnnotations] = useState<AnnotationMap>(() => loadMap(initialResourceId))
  const [originals, setOriginals] = useState<Record<string, string>>(() => loadOriginals(initialResourceId))
  const [legacyEdited, setLegacyEdited] = useState<string[]>(() => loadLegacyEdited(initialResourceId))
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [pendingLiaison, setPendingLiaison] = useState<Point | null>(null)
  const [draftNote, setDraftNote] = useState<{ x: number; y: number; id?: string; value: string } | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<Stroke | null>(null)
  const dragNoteRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const [, forceRedraw] = useState(0)

  const paragraphs = useMemo(() => flattenParagraphs(resource), [resource])
  const pages = useMemo(() => paginate(paragraphs, 190), [paragraphs])
  const safePage = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePage] ?? []
  const pageKey = `${resource.id}#${safePage}`
  const current = annotations[pageKey] ?? emptyPage()

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
    setAnnotations(loadMap(resource.id))
    setOriginals(loadOriginals(resource.id))
    setLegacyEdited(loadLegacyEdited(resource.id))
    setEditValues({})
    setPageIndex(0)
    setPendingLiaison(null)
    setDraftNote(null)
  }, [resource.id])

  // en quittant le mode édition, on oublie les brouillons (le blur a déjà commité)
  useEffect(() => {
    if (tool !== 'edit') setEditValues({})
  }, [tool])

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

  const clearPage = () => updatePage(() => emptyPage())

  // Cmd/Ctrl+Z → annuler la dernière annotation (sauf pendant la saisie de texte)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      const target = event.target as HTMLElement | null
      const typing = target?.closest('input, textarea, [contenteditable="true"]')
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, pageKey, annotations])

  const boardPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  const isDrawTool = tool === 'pen' || tool === 'highlighter' || tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow'
  const isInteractive = isDrawTool || tool === 'eraser'

  // --- dessin ---------------------------------------------------------------
  const onPointerDown = (event: React.PointerEvent) => {
    if (!isDrawTool) return
    const point = boardPoint(event)
    drawingRef.current = {
      id: uid(),
      kind: tool === 'pen' || tool === 'highlighter' ? tool : tool,
      color,
      width: tool === 'highlighter' ? Math.max(width * 4, 16) : width,
      points: [point],
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    forceRedraw((n) => n + 1)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const draft = drawingRef.current
    if (!draft) return
    // échantillonnage fin (trackpad) : récupère tous les points coalescés
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
    const samples = native.getCoalescedEvents?.() ?? []
    const last = samples.length ? samples[samples.length - 1] : null
    if (draft.kind === 'pen') {
      if (samples.length) samples.forEach((sample) => draft.points.push(boardPoint(sample)))
      else draft.points.push(boardPoint(event))
    } else if (draft.kind === 'highlighter') {
      // ligne droite forcée, verrouillée sur la hauteur de départ
      const point = boardPoint(last ?? event)
      draft.points = [draft.points[0], { x: point.x, y: draft.points[0].y }]
    } else {
      let point = boardPoint(last ?? event)
      if (draft.kind === 'line' && event.shiftKey) {
        // Shift : aimantation par pas de 15°
        const start = draft.points[0]
        const dx = point.x - start.x
        const dy = point.y - start.y
        const length = Math.hypot(dx, dy)
        const snap = Math.PI / 12
        const angle = Math.round(Math.atan2(dy, dx) / snap) * snap
        point = { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) }
      }
      draft.points = [draft.points[0], point]
    }
    forceRedraw((n) => n + 1)
  }

  const onPointerUp = () => {
    const draft = drawingRef.current
    drawingRef.current = null
    if (!draft) { forceRedraw((n) => n + 1); return }
    const span = draft.points.reduce((max, point) => Math.max(max, Math.hypot(point.x - draft.points[0].x, point.y - draft.points[0].y)), 0)
    // un simple toucher = un point (le point unique est rendu comme un rond)
    if (draft.points.length < 2 && span < 3 && (draft.kind === 'rect' || draft.kind === 'ellipse' || draft.kind === 'line' || draft.kind === 'arrow')) {
      forceRedraw((n) => n + 1)
      return
    }
    updatePage((p) => ({ ...p, strokes: [...p.strokes, draft], order: [...p.order, { kind: 'stroke', id: draft.id }] }))
  }

  const eraseAt = (event: React.MouseEvent) => {
    const point = boardPoint(event)
    const near = (a: Point) => Math.hypot(a.x - point.x, a.y - point.y) < 24
    updatePage((p) => {
      const removedStrokes = p.strokes.filter((s) => s.points.some(near)).map((s) => s.id)
      const removedLiaisons = p.liaisons.filter((l) => Math.hypot((l.x1 + l.x2) / 2 - point.x, l.y - 8 - point.y) <= 30).map((l) => l.id)
      const removedTexts = p.texts.filter((t) => Math.hypot(t.x - point.x, t.y - point.y) < 60).map((t) => t.id)
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

  // --- clics sur le texte (grisage, liaison, note) ---------------------------
  const onBoardClick = (event: React.MouseEvent) => {
    if (tool === 'text') {
      if ((event.target as HTMLElement).closest('.focus-text-note, .focus-text-input')) return
      const point = boardPoint(event)
      setDraftNote({ x: point.x, y: point.y, value: '' })
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
      const rect = target.getBoundingClientRect()
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

  // --- notes texte : création, édition, déplacement ---------------------------
  const commitNote = () => {
    if (!draftNote) return
    const value = draftNote.value.trim()
    if (value) {
      updatePage((p) => {
        if (draftNote.id) {
          return { ...p, texts: p.texts.map((note) => (note.id === draftNote.id ? { ...note, text: value, size: textSize, color } : note)) }
        }
        const note: TextNote = { id: uid(), x: draftNote.x, y: draftNote.y, text: value, size: textSize, color }
        return { ...p, texts: [...p.texts, note], order: [...p.order, { kind: 'text', id: note.id }] }
      })
    } else if (draftNote.id) {
      const removedId = draftNote.id
      updatePage((p) => ({ ...p, texts: p.texts.filter((note) => note.id !== removedId), order: p.order.filter((action) => action.id !== removedId) }))
    }
    setDraftNote(null)
  }

  const onNotePointerDown = (event: React.PointerEvent, note: TextNote) => {
    if (tool !== 'text' && tool !== 'select') return
    event.stopPropagation()
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
    if (!drag.moved && tool === 'text') {
      setTextSize(note.size)
      setColor(note.color)
      setDraftNote({ x: note.x, y: note.y, id: note.id, value: note.text })
    }
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

  return <div className="focus-overlay">
    <header className="focus-top">
      <div className="focus-brand"><span className="brand-mark">V</span><strong>Learning Focus <em>grammar</em></strong></div>
      <select className="focus-resource" value={resource.id} onChange={(event) => setResourceId(event.target.value)}>
        {resources.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select>
      <div className="focus-top-actions">
        <button className="focus-chip" onClick={() => setFontSize(Math.min(46, fontSize + 2))}>A+</button>
        <button className="focus-chip" onClick={() => setFontSize(Math.max(20, fontSize - 2))}>A−</button>
        <button className="focus-chip focus-quit" onClick={onClose}>✕ Quitter</button>
      </div>
    </header>

    <div className="focus-stage">
      <div className="focus-board" ref={boardRef} onClick={onBoardClick}>
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
                    interactive={tool === 'gray' || tool === 'liaison'} />
                })}
              </p>
            })()
          )}
        </div>)}

        {current.texts.map((note) => <div key={note.id} className="focus-text-note"
          style={{ left: note.x, top: note.y, fontSize: note.size, color: note.color }}
          onPointerDown={(event) => onNotePointerDown(event, note)}
          onPointerMove={onNotePointerMove}
          onPointerUp={(event) => onNotePointerUp(event, note)}>
          {note.text}
        </div>)}

        {draftNote && <textarea className="focus-text-input" autoFocus rows={2}
          style={{ left: draftNote.x, top: draftNote.y, fontSize: textSize, color }}
          value={draftNote.value}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraftNote({ ...draftNote, value: event.target.value })}
          onBlur={commitNote}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitNote() } if (event.key === 'Escape') setDraftNote(null) }} />}

        <svg className={`focus-ink ${isInteractive ? 'drawing' : ''}`}
          onPointerDown={isDrawTool ? onPointerDown : undefined}
          onPointerMove={isDrawTool ? onPointerMove : undefined}
          onPointerUp={isDrawTool ? onPointerUp : undefined}
          onClick={tool === 'eraser' ? eraseAt : undefined}>
          {current.strokes.map((stroke) => <StrokeShape stroke={stroke} key={stroke.id} />)}
          {draft && <StrokeShape stroke={draft} draft />}
          {current.liaisons.map((liaison) => {
            const midX = (liaison.x1 + liaison.x2) / 2
            return <path key={liaison.id} d={`M ${liaison.x1} ${liaison.y} Q ${midX} ${liaison.y + 22}, ${liaison.x2} ${liaison.y}`}
              fill="none" stroke={liaison.color} strokeWidth="2.5" strokeLinecap="round" />
          })}
          {pendingLiaison && <circle cx={pendingLiaison.x} cy={pendingLiaison.y} r="5" fill={color} />}
        </svg>
      </div>
    </div>

    {/* annuler / gomme / effacer — bord gauche, centré verticalement */}
    <div className="focus-side-pill left glass">
      <button title="Annuler (⌘Z)" onClick={undo}>↩</button>
      <button title="Gomme" className={tool === 'eraser' ? 'active' : ''}
        onClick={() => { setTool(tool === 'eraser' ? 'select' : 'eraser'); setPendingLiaison(null); setDraftNote(null) }}>⌫</button>
      <button title="Effacer la page" onClick={clearPage}>🗑</button>
    </div>

    {/* navigation pages — bord droit, centré verticalement */}
    <div className="focus-side-pill right glass">
      <button title="Page précédente" disabled={safePage === 0} onClick={() => { setPageIndex(safePage - 1); setPendingLiaison(null); setDraftNote(null) }}>↑</button>
      <span>{safePage + 1} / {pages.length}</span>
      <button title="Page suivante" disabled={safePage >= pages.length - 1} onClick={() => { setPageIndex(safePage + 1); setPendingLiaison(null); setDraftNote(null) }}>↓</button>
    </div>

    {/* couleurs + épaisseur — panneau vertical bas-droite, sous la navigation */}
    {showPanel && <div className="focus-panel glass">
      {activeTool.color && COLORS.map((value) => <button key={value}
        className={color === value ? 'panel-swatch active' : 'panel-swatch'}
        style={{ background: value }} title={value} onClick={() => setColor(value)} />)}
      {activeTool.color && (activeTool.width || tool === 'text') && <span className="panel-sep" />}
      {activeTool.width && WIDTHS.map((value) => <button key={value}
        className={width === value ? 'panel-width active' : 'panel-width'}
        title={`Épaisseur ${value}`} onClick={() => setWidth(value)}><i style={{ height: value }} /></button>)}
      {tool === 'text' && <>
        <button className="panel-size" title="Réduire le texte" onClick={() => setTextSize(Math.max(14, textSize - 2))}>A−</button>
        <button className="panel-size" title="Agrandir le texte" onClick={() => setTextSize(Math.min(44, textSize + 2))}>A+</button>
      </>}
    </div>}

    {/* barre d'outils — icônes seules */}
    <footer className="focus-toolbar glass">
      {TOOLS.map((item) => <button key={item.id} title={item.label}
        className={tool === item.id ? 'ftool active' : 'ftool'}
        onClick={() => { setTool(item.id); setPendingLiaison(null); if (item.id !== 'text') setDraftNote(null) }}>
        <b>{item.icon}</b>
      </button>)}
    </footer>
  </div>
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
