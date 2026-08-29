import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { LearnedWord, UiLanguage } from '../../domain'
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, Search, Sparkles } from 'lucide-react'
import { renderPhoneticFormatted } from './phoneticUtils'
import { vocabCopy } from '../../i18n'

type Node = {
  id: string
  word: string
  translation?: string
  phonetic?: string
  knowledge: number
  parent?: string
  tags: string[]
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
}

type Edge = {
  source: string
  target: string
  type: 'parent' | 'family'
  label?: string
}

type ObsidianWordGraphProps = {
  words: LearnedWord[]
  selectedWordId?: string | null
  onSelectWord?: (word: LearnedWord) => void
  compact?: boolean
  ui?: UiLanguage
}

const KNOWLEDGE_COLORS: Record<number, string> = {
  1: '#e11d48', // Rose / Red
  2: '#ea580c', // Orange
  3: '#d97706', // Amber
  4: '#2563eb', // Royal Blue
  5: '#7c3aed', // Purple
  6: '#059669', // Emerald
}

export function ObsidianWordGraph({
  words,
  selectedWordId,
  onSelectWord,
  compact = false,
  ui = 'fr',
}: ObsidianWordGraphProps) {
  const t = vocabCopy[ui] || vocabCopy.fr
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [physicsActive, setPhysicsActive] = useState(true)

  // Camera transform state with target for smooth progressive zoom & pan (lerp)
  const cameraRef = useRef({ x: 0, y: 0, scale: compact ? 0.85 : 1 })
  const targetCameraRef = useRef({ x: 0, y: 0, scale: compact ? 0.85 : 1 })
  const isDraggingCameraRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const draggedNodeRef = useRef<Node | null>(null)

  // Build nodes and strictly link roots / derivatives (NO tag-based links)
  const { nodes, edges, nodeMap } = useMemo(() => {
    const nodeMap = new Map<string, Node>()
    const nList: Node[] = []
    const eList: Edge[] = []
    const edgeSet = new Set<string>()

    const addEdge = (src: string, tgt: string, type: 'parent' | 'family', label?: string) => {
      if (src === tgt) return
      const key = src < tgt ? `${src}---${tgt}` : `${tgt}---${src}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        eList.push({ source: src, target: tgt, type, label })
      }
    }

    // 1. Create nodes
    words.forEach((w, i) => {
      const id = w.normalized || w.word.toLowerCase().trim()
      if (nodeMap.has(id)) return

      const angle = (i / Math.max(1, words.length)) * Math.PI * 2
      const radiusDist = 80 + Math.sqrt(i) * 45 + (Math.random() * 30 - 15)
      const k = w.knowledge ?? 1
      const color = KNOWLEDGE_COLORS[k] || '#7c3aed'

      const node: Node = {
        id,
        word: w.word,
        translation: w.translation,
        phonetic: w.phonetic,
        knowledge: k,
        parent: w.parent,
        tags: w.tags || [],
        x: Math.cos(angle) * radiusDist,
        y: Math.sin(angle) * radiusDist,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.max(6, 5 + Math.min(8, (w.parent ? 3 : 1))),
        color,
      }

      nodeMap.set(id, node)
      nList.push(node)
    })

    // 2. Connect parent/root relationships
    words.forEach((w) => {
      const srcId = w.normalized || w.word.toLowerCase().trim()
      if (w.parent) {
        const parentNormalized = w.parent.toLowerCase().trim()
        if (nodeMap.has(parentNormalized)) {
          addEdge(srcId, parentNormalized, 'parent', 'racine')
        }
      }
    })

    // 3. Connect words with same parent/lemma (lexical family siblings)
    const parentGroups = new Map<string, string[]>()
    words.forEach((w) => {
      if (w.parent) {
        const p = w.parent.toLowerCase().trim()
        if (!parentGroups.has(p)) parentGroups.set(p, [])
        parentGroups.get(p)!.push(w.normalized || w.word.toLowerCase().trim())
      }
    })
    parentGroups.forEach((children) => {
      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          addEdge(children[i], children[j], 'family')
        }
      }
    })

    // Tag-based links are strictly omitted to prevent arbitrary cluttered edges

    return { nodes: nList, edges: eList, nodeMap }
  }, [words])

  // Reset Camera with smooth animation
  const resetCamera = useCallback(() => {
    targetCameraRef.current = { x: 0, y: 0, scale: compact ? 0.85 : 1 }
  }, [compact])

  // Canvas Drawing and Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number

    const handleResize = () => {
      if (!canvas || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // Physics Simulation with Obsidian impulse & anti-overlap force
    const stepPhysics = () => {
      if (!physicsActive) return

      const springLength = 110
      const springK = 0.035
      const centerGravity = 0.003
      const damping = 0.86

      // 1. Repulsion + Strong short-range anti-overlap impulse (Obsidian-like)
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j]
          const dx = n2.x - n1.x
          const dy = n2.y - n1.y
          const distSq = dx * dx + dy * dy || 1
          const dist = Math.sqrt(distSq)

          // Short-range anti-collision / label spacing impulse
          const minGap = n1.radius + n2.radius + 38
          if (dist < minGap) {
            const overlap = (minGap - dist) / minGap
            const impulse = overlap * overlap * 1.8
            const fx = (dx / dist) * impulse
            const fy = (dy / dist) * impulse
            n1.vx -= fx
            n1.vy -= fy
            n2.vx += fx
            n2.vy += fy
          }

          // General distance repulsion
          if (dist < 400) {
            const force = 950 / distSq
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            n1.vx -= fx
            n1.vy -= fy
            n2.vx += fx
            n2.vy += fy
          }
        }
      }

      // 2. Spring attraction on lexical parent / family edges
      edges.forEach((edge) => {
        const n1 = nodeMap.get(edge.source)
        const n2 = nodeMap.get(edge.target)
        if (!n1 || !n2) return

        const dx = n2.x - n1.x
        const dy = n2.y - n1.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const delta = dist - springLength
        const force = delta * springK
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        n1.vx += fx
        n1.vy += fy
        n2.vx -= fx
        n2.vy -= fy
      })

      // 3. Center gravity and damping
      nodes.forEach((n) => {
        if (n === draggedNodeRef.current) return

        n.vx -= n.x * centerGravity
        n.vy -= n.y * centerGravity

        n.vx *= damping
        n.vy *= damping

        n.x += n.vx
        n.y += n.vy
      })
    }

    // Render loop
    const render = () => {
      stepPhysics()

      // Smooth camera interpolation (lerp)
      const cam = cameraRef.current
      const targetCam = targetCameraRef.current
      const lerpFactor = 0.16
      cam.x += (targetCam.x - cam.x) * lerpFactor
      cam.y += (targetCam.y - cam.y) * lerpFactor
      cam.scale += (targetCam.scale - cam.scale) * lerpFactor

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Warm beige / cream paper background (Obsidian Light feel)
      ctx.fillStyle = '#faf8f5'
      ctx.fillRect(0, 0, width, height)

      // Subtle warm dot grid
      ctx.fillStyle = 'rgba(0, 0, 0, 0.045)'
      const gridStep = 36
      for (let gx = 0; gx < width; gx += gridStep) {
        for (let gy = 0; gy < height; gy += gridStep) {
          ctx.beginPath()
          ctx.arc(gx, gy, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Apply camera pan & zoom
      ctx.save()
      ctx.translate(width / 2 + cam.x, height / 2 + cam.y)
      ctx.scale(cam.scale, cam.scale)

      const activeSearch = searchQuery.trim().toLowerCase()
      const hoveredId = hoveredNode?.id
      const selectedId = selectedWordId

      // Draw Edges (Clean, distinct contrast for light background)
      edges.forEach((edge) => {
        const n1 = nodeMap.get(edge.source)
        const n2 = nodeMap.get(edge.target)
        if (!n1 || !n2) return

        const isHighlighted =
          n1.id === hoveredId ||
          n2.id === hoveredId ||
          n1.id === selectedId ||
          n2.id === selectedId

        ctx.beginPath()
        ctx.moveTo(n1.x, n1.y)
        ctx.lineTo(n2.x, n2.y)

        if (isHighlighted) {
          ctx.strokeStyle = '#7c3aed'
          ctx.lineWidth = 2.2
          ctx.shadowColor = 'rgba(124, 58, 237, 0.35)'
          ctx.shadowBlur = 6
        } else {
          ctx.strokeStyle = edge.type === 'parent' ? 'rgba(124, 58, 237, 0.35)' : 'rgba(100, 116, 139, 0.28)'
          ctx.lineWidth = edge.type === 'parent' ? 1.4 : 1.0
          ctx.shadowBlur = 0
        }
        ctx.stroke()
        ctx.shadowBlur = 0
      })

      // Draw Nodes
      nodes.forEach((node) => {
        const isHovered = node.id === hoveredId
        const isSelected = node.id === selectedId
        const isMatchSearch = activeSearch && node.word.toLowerCase().includes(activeSearch)

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + (isHovered || isSelected ? 3 : 0), 0, Math.PI * 2)

        if (isMatchSearch) {
          ctx.fillStyle = '#0284c7'
          ctx.shadowColor = 'rgba(2, 132, 199, 0.4)'
          ctx.shadowBlur = 10
        } else if (isHovered || isSelected) {
          ctx.fillStyle = '#e11d48'
          ctx.shadowColor = 'rgba(225, 29, 72, 0.45)'
          ctx.shadowBlur = 12
        } else {
          ctx.fillStyle = node.color
          ctx.shadowBlur = 0
        }

        ctx.fill()
        ctx.shadowBlur = 0

        // Outer focus ring for selected or hovered nodes
        if (isHovered || isSelected || isMatchSearch) {
          ctx.strokeStyle = isHovered || isSelected ? '#e11d48' : '#0284c7'
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Draw node text label with light outline for maximum readability
        const showLabel = cam.scale > 0.55 || isHovered || isSelected || isMatchSearch || node.radius > 7
        if (showLabel) {
          const fontSize = isHovered || isSelected ? 12 : 11
          ctx.font = `${isHovered || isSelected ? 'bold ' : '500 '}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          ctx.textAlign = 'center'

          const textY = node.y + node.radius + 13
          
          // Light halo contour to guarantee legibility on light beige background
          ctx.strokeStyle = '#faf8f5'
          ctx.lineWidth = 3.5
          ctx.strokeText(node.word, node.x, textY)

          // Foreground text
          ctx.fillStyle = isHovered || isSelected ? '#0f172a' : isMatchSearch ? '#0284c7' : '#334155'
          ctx.fillText(node.word, node.x, textY)
        }
      })

      ctx.restore()
      ctx.restore()

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animId)
    }
  }, [nodes, edges, nodeMap, physicsActive, hoveredNode, selectedWordId, searchQuery, compact])

  // Mouse / Pointer Events
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { worldX: 0, worldY: 0, clientX: 0, clientY: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    const cam = cameraRef.current
    const cx = rect.width / 2 + cam.x
    const cy = rect.height / 2 + cam.y

    const scale = cam.scale || 1
    const worldX = (clientX - cx) / scale
    const worldY = (clientY - cy) / scale

    return { worldX, worldY, clientX, clientY }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasCoords(e)

    let hit: Node | null = null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = worldX - n.x
      const dy = worldY - n.y
      if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) {
        hit = n
        break
      }
    }

    if (hit) {
      draggedNodeRef.current = hit
      hit.vx = 0
      hit.vy = 0
    } else {
      isDraggingCameraRef.current = true
      dragStartRef.current = { x: clientX - targetCameraRef.current.x, y: clientY - targetCameraRef.current.y }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasCoords(e)

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = worldX
      draggedNodeRef.current.y = worldY
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      return
    }

    if (isDraggingCameraRef.current) {
      targetCameraRef.current.x = clientX - dragStartRef.current.x
      targetCameraRef.current.y = clientY - dragStartRef.current.y
      return
    }

    let hit: Node | null = null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = worldX - n.x
      const dy = worldY - n.y
      if (dx * dx + dy * dy <= (n.radius + 7) * (n.radius + 7)) {
        hit = n
        break
      }
    }
    setHoveredNode(hit)
  }

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      const clickedWord = words.find(
        (w) => (w.normalized || w.word.toLowerCase().trim()) === draggedNodeRef.current?.id,
      )
      if (clickedWord && onSelectWord) {
        onSelectWord(clickedWord)
      }
      draggedNodeRef.current = null
    }
    isDraggingCameraRef.current = false
  }

  // Smooth progressive zoom on wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = Math.pow(1.0015, -e.deltaY)
    const nextScale = Math.max(0.2, Math.min(3.5, targetCameraRef.current.scale * zoomFactor))
    targetCameraRef.current.scale = nextScale
  }

  return (
    <div
      ref={containerRef}
      className={`obsidian-graph-wrapper ${compact ? 'compact' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
    >
      {/* Top Floating Controls Bar */}
      <div className="graph-top-controls">
        <div className="graph-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder={t.filterNodesPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="graph-stats-chip">
          <Sparkles size={12} />
          <span>{nodes.length} {t.wordsCount}</span>
          <span>·</span>
          <span>{edges.length} {t.linksCount}</span>
        </div>

        <div className="graph-action-buttons">
          <button
            type="button"
            className="graph-btn"
            onClick={() => {
              targetCameraRef.current.scale = Math.min(3.5, targetCameraRef.current.scale * 1.3)
            }}
            title={t.zoomIn}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="graph-btn"
            onClick={() => {
              targetCameraRef.current.scale = Math.max(0.2, targetCameraRef.current.scale * 0.7)
            }}
            title={t.zoomOut}
          >
            <ZoomOut size={14} />
          </button>
          <button type="button" className="graph-btn" onClick={resetCamera} title={t.resetView}>
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="graph-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? t.exitFullscreen : t.fullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <canvas
        ref={canvasRef}
        className="obsidian-graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Hover Card / Word Inspector Tooltip */}
      {hoveredNode && (
        <div className="graph-node-tooltip">
          <div className="tooltip-head">
            <strong>{hoveredNode.word}</strong>
            {hoveredNode.phonetic && (
              <span className="phonetic">{renderPhoneticFormatted(hoveredNode.phonetic)}</span>
            )}
          </div>
          {hoveredNode.translation && (
            <p className="tooltip-trans">{hoveredNode.translation}</p>
          )}
          {hoveredNode.parent && (
            <span className="tooltip-parent">{t.rootWord} {hoveredNode.parent}</span>
          )}
          {hoveredNode.tags && hoveredNode.tags.length > 0 && (
            <div className="tooltip-tags">
              {hoveredNode.tags.map((t) => (
                <span key={t} className="tag-micro">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

