import React, { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react'

/**
 * Floating Position Engine — Collision-aware, anchor-based positioning.
 * Implements native-grade popover positioning (flip, shift, clamp, dynamic measurement).
 */

export type AnchorRect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export type PointOrRect =
  | { x: number; y: number }
  | AnchorRect
  | DOMRect
  | HTMLElement
  | null
  | undefined

export function toAnchorRect(target: PointOrRect): AnchorRect | null {
  if (!target) return null
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    const r = target.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
  }
  if ('getBoundingClientRect' in target && typeof (target as any).getBoundingClientRect === 'function') {
    const r = (target as any).getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
  }
  if ('top' in target && 'bottom' in target && 'left' in target && 'right' in target) {
    const top = target.top
    const bottom = target.bottom
    const left = target.left
    const right = target.right
    const width = 'width' in target && typeof (target as any).width === 'number' ? (target as any).width : Math.max(0, right - left)
    const height = 'height' in target && typeof (target as any).height === 'number' ? (target as any).height : Math.max(0, bottom - top)
    return { top, bottom, left, right, width, height }
  }
  if ('x' in target && 'y' in target) {
    return {
      top: target.y,
      bottom: target.y,
      left: target.x,
      right: target.x,
      width: 0,
      height: 0,
    }
  }
  return null
}

export type FloatingPlacementResult = {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  placement: 'bottom' | 'top'
}

export type FloatingOptions = {
  placement?: 'bottom' | 'top'
  align?: 'center' | 'start' | 'end'
  gap?: number
  padding?: number
  flip?: boolean
}

/**
 * Computes optimal position for a floating panel anchored to a word or element.
 * Never obscures the anchor element; flips to opposite side if insufficient space.
 */
export function computeAnchorPosition(
  anchor: AnchorRect,
  floating: { width: number; height: number },
  options: FloatingOptions = {}
): FloatingPlacementResult {
  const {
    placement = 'bottom',
    align = 'center',
    gap = 8,
    padding = 12,
    flip = true,
  } = options

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768

  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - padding - gap)
  const spaceAbove = Math.max(0, anchor.top - padding - gap)

  let chosenPlacement: 'bottom' | 'top' = placement

  if (flip) {
    if (placement === 'bottom') {
      const fitsBelow = floating.height <= spaceBelow
      const fitsAbove = floating.height <= spaceAbove
      if (!fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) {
        chosenPlacement = 'top'
      }
    } else {
      const fitsAbove = floating.height <= spaceAbove
      const fitsBelow = floating.height <= spaceBelow
      if (!fitsAbove && (fitsBelow || spaceBelow > spaceAbove)) {
        chosenPlacement = 'bottom'
      }
    }
  }

  // Horizontal alignment
  let left: number
  if (align === 'start') {
    left = anchor.left
  } else if (align === 'end') {
    left = anchor.right - floating.width
  } else {
    // 'center'
    left = Math.round(anchor.left + anchor.width / 2 - floating.width / 2)
  }

  // Horizontal boundary clamping (shift into viewport)
  const maxLeft = Math.max(padding, viewportWidth - floating.width - padding)
  left = Math.max(padding, Math.min(maxLeft, left))

  // Vertical placement
  if (chosenPlacement === 'bottom') {
    const top = Math.round(anchor.bottom + gap)
    const maxHeight = Math.max(120, Math.floor(viewportHeight - top - padding))
    return {
      left,
      top,
      maxHeight,
      placement: 'bottom',
    }
  } else {
    // Peg to bottom of viewport so that bottom edge sits exactly gap px above anchor.top
    const bottom = Math.round(viewportHeight - anchor.top + gap)
    const maxHeight = Math.max(120, Math.floor(anchor.top - gap - padding))
    return {
      left,
      bottom,
      maxHeight,
      placement: 'top',
    }
  }
}

/**
 * Computes optimal position for context menus anchored to cursor point or element.
 * Flips upward when close to bottom screen edge, preventing clipping.
 */
export function computeContextMenuPosition(
  anchor: { x: number; y: number } | AnchorRect,
  menu: { width: number; height: number },
  options: { padding?: number; gap?: number } = {}
): { left: number; top?: number; bottom?: number; maxHeight: number } {
  const { padding = 10, gap = 4 } = options
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768

  const anchorRect: AnchorRect = 'x' in anchor
    ? { top: anchor.y, bottom: anchor.y, left: anchor.x, right: anchor.x, width: 0, height: 0 }
    : anchor

  const spaceBelow = viewportHeight - anchorRect.bottom - padding - gap
  const spaceAbove = anchorRect.top - padding - gap

  const fitsBelow = menu.height <= spaceBelow
  const fitsAbove = menu.height <= spaceAbove

  let placement: 'bottom' | 'top' = 'bottom'
  if (!fitsBelow && (fitsAbove || spaceAbove > spaceBelow)) {
    placement = 'top'
  }

  // Horizontal position: prefer anchorRect.left, flip if overflowing right edge
  let left = Math.round(anchorRect.left)
  if (left + menu.width + padding > viewportWidth) {
    left = Math.round(anchorRect.right - menu.width)
  }
  const maxLeft = Math.max(padding, viewportWidth - menu.width - padding)
  left = Math.max(padding, Math.min(maxLeft, left))

  if (placement === 'bottom') {
    const top = Math.round(anchorRect.bottom + gap)
    const maxHeight = Math.max(80, Math.floor(viewportHeight - top - padding))
    return { left, top, maxHeight }
  } else {
    const bottom = Math.round(viewportHeight - anchorRect.top + gap)
    const maxHeight = Math.max(80, Math.floor(anchorRect.top - gap - padding))
    return { left, bottom, maxHeight }
  }
}

/**
 * Reusable wrapper component for floating context menus.
 * Measures its own rendered dimensions on mount/update and positions cleanly.
 */
export function FloatingContextMenu({
  anchor,
  children,
  className = '',
  padding = 10,
  gap = 4,
  onClick,
}: {
  anchor: { x: number; y: number } | AnchorRect
  children: React.ReactNode
  className?: string
  padding?: number
  gap?: number
  onClick?: (e: React.MouseEvent) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 230, height: 250 })

  useLayoutEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setDims({ width: r.width, height: r.height })
      }
    }
  }, [])

  const [, setRerender] = useState(0)
  useEffect(() => {
    const handleRecalc = () => setRerender((v) => v + 1)
    window.addEventListener('resize', handleRecalc)
    window.addEventListener('scroll', handleRecalc, true)
    return () => {
      window.removeEventListener('resize', handleRecalc)
      window.removeEventListener('scroll', handleRecalc, true)
    }
  }, [])

  const pos = useMemo(() => {
    return computeContextMenuPosition(anchor, dims, { padding, gap })
  }, [anchor, dims, padding, gap])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        left: `${pos.left}px`,
        top: pos.top !== undefined ? `${pos.top}px` : 'auto',
        bottom: pos.bottom !== undefined ? `${pos.bottom}px` : 'auto',
        maxHeight: `${pos.maxHeight}px`,
        overflowY: 'auto',
      }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
