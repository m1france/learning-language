import type { Point, Stroke, Liaison, TextNote } from '../LearningFocus'

export type DockPosition = 'above' | 'below' | 'left' | 'right' | 'relative'

export type StrokeAnchor = {
  kind: 'word' | 'letter' | 'note' | 'paragraph' | 'raw'
  key?: string
  subPosition?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  offsetX?: number
  offsetY?: number
  rawX?: number
  rawY?: number
}

/**
 * Trouve la lettre la plus proche d'un point (x, y) dans le tableau.
 */
export function findNearestLetter(
  point: Point,
  boardEl: HTMLElement | null,
): { letterEl: HTMLElement; letterKey: string; rect: DOMRect; distance: number } | null {
  if (!boardEl) return null
  const boardRect = boardEl.getBoundingClientRect()
  const letters = Array.from(boardEl.querySelectorAll<HTMLElement>('[data-letter]'))
  if (!letters.length) return null

  let nearest: { letterEl: HTMLElement; letterKey: string; rect: DOMRect; distance: number } | null = null

  for (const letterEl of letters) {
    const letterKey = letterEl.getAttribute('data-letter')
    if (!letterKey) continue
    const rect = letterEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2 - boardRect.left
    const cy = rect.top + rect.height / 2 - boardRect.top
    const distance = Math.hypot(cx - point.x, cy - point.y)

    if (!nearest || distance < nearest.distance) {
      nearest = { letterEl, letterKey, rect, distance }
    }
  }

  return nearest
}

/**
 * Trouve le mot le plus proche d'un point (x, y) dans le tableau et détermine la position relative optimale (au-dessus, en-dessous, à droite, à gauche).
 */
export function findNearestWord(
  point: Point,
  boardEl: HTMLElement | null,
): {
  wordEl: HTMLElement
  wordKey: string
  rect: DOMRect
  dock: DockPosition
  offsetX: number
  offsetY: number
  distance: number
} | null {
  if (!boardEl) return null
  const boardRect = boardEl.getBoundingClientRect()
  const words = Array.from(boardEl.querySelectorAll<HTMLElement>('[data-word]'))
  if (!words.length) return null

  let nearest: {
    wordEl: HTMLElement
    wordKey: string
    rect: DOMRect
    dock: DockPosition
    offsetX: number
    offsetY: number
    distance: number
  } | null = null

  for (const wordEl of words) {
    const wordKey = wordEl.getAttribute('data-word')
    if (!wordKey) continue
    const rect = wordEl.getBoundingClientRect()
    const left = rect.left - boardRect.left
    const right = rect.right - boardRect.left
    const top = rect.top - boardRect.top
    const bottom = rect.bottom - boardRect.top
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2

    const distance = Math.hypot(cx - point.x, cy - point.y)

    if (!nearest || distance < nearest.distance) {
      // Déterminer la position relative optimale
      let dock: DockPosition = 'relative'
      let offsetX = 0
      let offsetY = 0

      const isBelow = point.y >= bottom - 4
      const isAbove = point.y <= top + 4
      const isRight = point.x >= right
      const isLeft = point.x <= left

      if (isBelow) {
        dock = 'below'
        offsetX = point.x - left
        offsetY = point.y - bottom
      } else if (isAbove) {
        dock = 'above'
        offsetX = point.x - left
        offsetY = point.y - top
      } else if (isRight && !isBelow && !isAbove) {
        dock = 'right'
        offsetX = point.x - right
        offsetY = point.y - top
      } else if (isLeft && !isBelow && !isAbove) {
        dock = 'left'
        offsetX = point.x - left
        offsetY = point.y - top
      } else {
        dock = 'relative'
        offsetX = point.x - left
        offsetY = point.y - top
      }

      nearest = {
        wordEl,
        wordKey,
        rect,
        dock,
        offsetX,
        offsetY,
        distance,
      }
    }
  }

  return nearest
}

/**
 * Trouve le paragraphe le plus proche d'un point.
 */
export function findNearestParagraph(
  point: Point,
  boardEl: HTMLElement | null,
): { paragraphEl: HTMLElement; paragraphKey: string; rect: DOMRect; offsetY: number } | null {
  if (!boardEl) return null
  const boardRect = boardEl.getBoundingClientRect()
  const paragraphs = Array.from(boardEl.querySelectorAll<HTMLElement>('.focus-paragraph, .focus-edit-wrap'))
  if (!paragraphs.length) return null

  let nearest: { paragraphEl: HTMLElement; paragraphKey: string; rect: DOMRect; offsetY: number } | null = null
  let minDiff = Infinity

  for (const paragraphEl of paragraphs) {
    const rect = paragraphEl.getBoundingClientRect()
    const top = rect.top - boardRect.top
    const bottom = rect.bottom - boardRect.top
    const diff = Math.min(Math.abs(point.y - top), Math.abs(point.y - bottom))

    if (point.y >= top - 20 && point.y <= bottom + 20) {
      const pKey = paragraphEl.closest('[key]')?.getAttribute('key') || '0:0'
      return { paragraphEl, paragraphKey: pKey, rect, offsetY: point.y - top }
    }

    if (diff < minDiff) {
      minDiff = diff
      const pKey = paragraphEl.closest('[key]')?.getAttribute('key') || '0:0'
      nearest = { paragraphEl, paragraphKey: pKey, rect, offsetY: point.y - top }
    }
  }

  return nearest
}

/**
 * Résout la géométrie exacte d'une liaison (arc entre 2 lettres) en temps réel par rapport au DOM courant.
 */
export function resolveLiaisonGeometry(
  liaison: Liaison,
  boardEl: HTMLElement | null,
): { x1: number; x2: number; y: number; d: string } {
  if (boardEl && liaison.fromLetterKey && liaison.toLetterKey) {
    const fromEl = boardEl.querySelector<HTMLElement>(`[data-letter="${liaison.fromLetterKey}"]`)
    const toEl = boardEl.querySelector<HTMLElement>(`[data-letter="${liaison.toLetterKey}"]`)

    if (fromEl && toEl) {
      const boardRect = boardEl.getBoundingClientRect()
      const r1 = fromEl.getBoundingClientRect()
      const r2 = toEl.getBoundingClientRect()

      const p1X = r1.left + r1.width / 2 - boardRect.left
      const p2X = r2.left + r2.width / 2 - boardRect.left
      const [x1, x2] = [p1X, p2X].sort((a, b) => a - b)
      const baseBottom = Math.max(r1.bottom, r2.bottom) - boardRect.top
      const y = baseBottom + 3
      const midX = (x1 + x2) / 2
      const arcDepth = Math.min(22, Math.max(12, Math.abs(x2 - x1) * 0.45))

      return {
        x1,
        x2,
        y,
        d: `M ${x1} ${y} Q ${midX} ${y + arcDepth}, ${x2} ${y}`,
      }
    }
  }

  // Fallback si pas encore d'ancres ou élément non trouvé
  const midX = (liaison.x1 + liaison.x2) / 2
  return {
    x1: liaison.x1,
    x2: liaison.x2,
    y: liaison.y,
    d: `M ${liaison.x1} ${liaison.y} Q ${midX} ${liaison.y + 22}, ${liaison.x2} ${liaison.y}`,
  }
}

/**
 * Résout la position exacte d'une note textuelle (position absolue libre).
 */
export function resolveTextNoteGeometry(
  note: TextNote,
  _boardEl?: HTMLElement | null,
): { left: number; top: number } {
  return { left: note.x, top: note.y }
}

/**
 * Résout la géométrie d'une flèche, d'une ligne ou d'un tracé (position absolue libre).
 */
export function resolveStrokeGeometry(
  stroke: Stroke,
  _boardEl?: HTMLElement | null,
): Stroke {
  return stroke
}

