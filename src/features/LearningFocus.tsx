import { useEffect, useMemo, useRef, useState } from 'react'
import type { Language, Resource } from '../domain'
import { normalizeWord } from '../domain'
import { isVerbLike, silentLettersFor } from '../phonetics'

/**
 * Learning Focus grammar — plein écran pour projeter un texte en classe.
 * Barre d'annotation en bas : stylos, surligneur, formes (rectangle, ellipse,
 * ligne, flèche), gomme, arcs de liaison entre mots, et grisage lettre par
 * lettre (lettres muettes, vraies prononciations…).
 */

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'liaison' | 'gray'

type Point = { x: number; y: number }
type Stroke = {
  id: string
  kind: 'pen' | 'highlighter' | 'rect' | 'ellipse' | 'line' | 'arrow'
  color: string
  width: number
  points: Point[]
}
type Liaison = { id: string; x1: number; x2: number; y: number; color: string }
type PageAnnotations = { strokes: Stroke[]; liaisons: Liaison[]; grayed: string[] }
type AnnotationMap = Record<string, PageAnnotations>

const emptyPage = (): PageAnnotations => ({ strokes: [], liaisons: [], grayed: [] })

const TOOL_LABELS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: '➤', label: 'Sélection' },
  { id: 'pen', icon: '✏', label: 'Stylo' },
  { id: 'highlighter', icon: '🖊', label: 'Surligneur' },
  { id: 'rect', icon: '▭', label: 'Rectangle' },
  { id: 'ellipse', icon: '◯', label: 'Ellipse' },
  { id: 'line', icon: '╱', label: 'Ligne' },
  { id: 'arrow', icon: '→', label: 'Flèche' },
  { id: 'liaison', icon: '‿', label: 'Liaison' },
  { id: 'gray', icon: 'Aa', label: 'Griser une lettre' },
  { id: 'eraser', icon: '⌫', label: 'Gomme' },
]

const COLORS = ['#d64545', '#2563eb', '#16a34a', '#f59e0b', '#20201e', '#7c3aed']
const WIDTHS = [2, 4, 7]

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function flattenParagraphs(resource: Resource) {
  return resource.chapters.flatMap((chapter, chapterIndex) =>
    chapter.paragraphs.map((text, paragraphIndex) => ({
      key: `${chapterIndex}:${paragraphIndex}`,
      chapterTitle: chapter.title,
      isChapterStart: paragraphIndex === 0,
      text,
    })),
  )
}

function paginate(paragraphs: { key: string; text: string; chapterTitle: string; isChapterStart: boolean }[], wordsPerPage: number) {
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

export function LearningFocus({ resources, initialResourceId, silentOverrides, onClose }: {
  resources: Resource[]
  initialResourceId: string
  silentOverrides: Record<string, string[]>
  onClose: () => void
}) {
  const [resourceId, setResourceId] = useState(initialResourceId)
  const resource = resources.find((item) => item.id === resourceId) ?? resources[0]
  const [pageIndex, setPageIndex] = useState(0)
  const [fontSize, setFontSize] = useState(30)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])
  const [annotations, setAnnotations] = useState<AnnotationMap>(() => {
    try { return JSON.parse(localStorage.getItem(`vivre-focus-${initialResourceId}`) || '{}') } catch { return {} }
  })
  const [pendingLiaison, setPendingLiaison] = useState<Point | null>(null)

  const boardRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<Stroke | null>(null)
  const [, forceRedraw] = useState(0)

  const paragraphs = useMemo(() => flattenParagraphs(resource), [resource])
  const pages = useMemo(() => paginate(paragraphs, 190), [paragraphs])
  const safePage = Math.min(pageIndex, pages.length - 1)
  const page = pages[safePage] ?? []
  const pageKey = `${resource.id}#${safePage}`
  const current = annotations[pageKey] ?? emptyPage()

  // persist per resource
  useEffect(() => {
    localStorage.setItem(`vivre-focus-${resource.id}`, JSON.stringify(annotations))
  }, [annotations, resource.id])

  useEffect(() => {
    try { setAnnotations(JSON.parse(localStorage.getItem(`vivre-focus-${resource.id}`) || '{}')) } catch { setAnnotations({}) }
    setPageIndex(0)
    setPendingLiaison(null)
  }, [resource.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const updatePage = (updater: (page: PageAnnotations) => PageAnnotations) => {
    setAnnotations((map) => ({ ...map, [pageKey]: updater(map[pageKey] ?? emptyPage()) }))
  }

  const boardPoint = (event: React.PointerEvent): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  const isDrawTool = tool === 'pen' || tool === 'highlighter' || tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow'
  const isInteractive = isDrawTool || tool === 'eraser'

  const onPointerDown = (event: React.PointerEvent) => {
    if (!isDrawTool) return
    const point = boardPoint(event)
    const kind = tool === 'highlighter' ? 'highlighter' : tool === 'pen' ? 'pen' : tool
    drawingRef.current = {
      id: uid(), kind: kind as Stroke['kind'],
      color,
      width: tool === 'highlighter' ? Math.max(width * 4, 16) : width,
      points: [point],
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const draft = drawingRef.current
    if (!draft) return
    const point = boardPoint(event)
    if (draft.kind === 'pen' || draft.kind === 'highlighter') draft.points.push(point)
    else draft.points = [draft.points[0], point]
    forceRedraw((n) => n + 1)
  }

  const onPointerUp = () => {
    const draft = drawingRef.current
    drawingRef.current = null
    if (!draft || draft.points.length < 2) { forceRedraw((n) => n + 1); return }
    updatePage((p) => ({ ...p, strokes: [...p.strokes, draft] }))
  }

  const eraseAt = (event: React.MouseEvent) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const near = (a: Point) => Math.hypot(a.x - point.x, a.y - point.y) < 24
    updatePage((p) => ({
      ...p,
      strokes: p.strokes.filter((stroke) => !stroke.points.some(near)),
      liaisons: p.liaisons.filter((liaison) => Math.hypot((liaison.x1 + liaison.x2) / 2 - point.x, liaison.y - 8 - point.y) > 30),
    }))
  }

  // letter graying + liaison via event delegation (text stays clickable)
  const onTextClick = (event: React.MouseEvent) => {
    const target = (event.target as HTMLElement).closest('[data-letter],[data-word]') as HTMLElement | null
    if (!target) return
    if (tool === 'gray') {
      const letterKey = target.dataset.letter
      if (!letterKey) return
      updatePage((p) => ({
        ...p,
        grayed: p.grayed.includes(letterKey) ? p.grayed.filter((key) => key !== letterKey) : [...p.grayed, letterKey],
      }))
    } else if (tool === 'liaison') {
      const rect = target.getBoundingClientRect()
      const board = boardRef.current?.getBoundingClientRect()
      if (!board) return
      const point = { x: rect.left + rect.width / 2 - board.left, y: rect.bottom - board.top + 4 }
      if (!pendingLiaison) setPendingLiaison(point)
      else {
        const [x1, x2] = [pendingLiaison.x, point.x].sort((a, b) => a - b)
        if (Math.abs(x2 - x1) > 4) updatePage((p) => ({ ...p, liaisons: [...p.liaisons, { id: uid(), x1, x2, y: Math.max(pendingLiaison.y, point.y), color }] }))
        setPendingLiaison(null)
      }
    }
  }

  const undo = () => updatePage((p) => {
    if (p.strokes.length) return { ...p, strokes: p.strokes.slice(0, -1) }
    if (p.liaisons.length) return { ...p, liaisons: p.liaisons.slice(0, -1) }
    return { ...p, grayed: p.grayed.slice(0, -1) }
  })
  const clearPage = () => updatePage(() => emptyPage())

  const draft = drawingRef.current

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
      <div className="focus-board" ref={boardRef} onClick={onTextClick}>
        {page.map((paragraph) => <div key={paragraph.key}>
          {paragraph.isChapterStart && <h3 className="focus-chapter">{paragraph.chapterTitle}</h3>}
          <p className="focus-paragraph" style={{ fontSize }}>
            {paragraph.text.split(/(\s+)/).map((part, index) => {
              if (/\s+/.test(part)) return <span key={index}>{part}</span>
              const wordKey = `${paragraph.key}:${index}`
              return <FocusWord key={wordKey} wordKey={wordKey} raw={part} language={resource.language} overrides={silentOverrides} grayed={current.grayed} interactive={tool === 'gray' || tool === 'liaison'} />
            })}
          </p>
        </div>)}

        <svg className={`focus-ink ${isInteractive ? 'drawing' : ''}`}
          onPointerDown={isDrawTool ? onPointerDown : undefined} onPointerMove={isDrawTool ? onPointerMove : undefined} onPointerUp={isDrawTool ? onPointerUp : undefined}
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

    <footer className="focus-toolbar">
      <div className="focus-tools">
        {TOOL_LABELS.map((item) => <button key={item.id} className={tool === item.id ? 'ftool active' : 'ftool'} title={item.label}
          onClick={() => { setTool(item.id); setPendingLiaison(null) }}>
          <b>{item.icon}</b><span>{item.label}</span>
        </button>)}
      </div>
      <div className="focus-options">
        <div className="focus-colors">
          {COLORS.map((value) => <button key={value} className={color === value ? 'fcolor active' : 'fcolor'} style={{ background: value }} onClick={() => setColor(value)} />)}
        </div>
        <div className="focus-widths">
          {WIDTHS.map((value) => <button key={value} className={width === value ? 'fwidth active' : 'fwidth'} onClick={() => setWidth(value)}><i style={{ height: value }} /></button>)}
        </div>
        <button className="fchip" onClick={undo}>↩ Annuler</button>
        <button className="fchip" onClick={clearPage}>🗑 Effacer la page</button>
        <div className="focus-pager">
          <button disabled={safePage === 0} onClick={() => { setPageIndex(safePage - 1); setPendingLiaison(null) }}>←</button>
          <span>{safePage + 1} / {pages.length}</span>
          <button disabled={safePage >= pages.length - 1} onClick={() => { setPageIndex(safePage + 1); setPendingLiaison(null) }}>→</button>
        </div>
      </div>
    </footer>
  </div>
}

function FocusWord({ raw, wordKey, language, overrides, grayed, interactive }: {
  raw: string
  wordKey: string
  language: Language
  overrides: Record<string, string[]>
  grayed: string[]
  interactive: boolean
}) {
  const normalized = normalizeWord(raw)
  const verb = isVerbLike(normalized, language)
  const silent = silentLettersFor(normalized, language, overrides)
  const remaining = [...silent]
  return <span className={`focus-word ${verb ? 'grammar-mark' : ''} ${interactive ? 'clickable' : ''}`} data-word={wordKey}>
    {[...raw].map((letter, index) => {
      const lower = letter.toLowerCase()
      let autoSilent = false
      const at = remaining.indexOf(lower)
      if (at >= 0 && /[a-zà-ÿ]/i.test(letter)) { autoSilent = true; remaining.splice(at, 1) }
      const letterKey = `${wordKey}.${index}`
      const userGray = grayed.includes(letterKey)
      return <span key={index} data-letter={letterKey}
        className={`focus-letter ${userGray ? 'user-gray' : autoSilent ? 'silent' : ''}`}>{letter}</span>
    })}
  </span>
}

function StrokeShape({ stroke, draft }: { stroke: Stroke; draft?: boolean }) {
  const common = {
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    opacity: stroke.kind === 'highlighter' ? 0.35 : 1,
    ...(draft ? { pointerEvents: 'none' as const } : {}),
  }
  const [first, ...rest] = stroke.points
  if (!first) return null
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
