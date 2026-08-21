import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { LearnedWord } from '../../domain'
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, Search, Sparkles } from 'lucide-react'

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
  type: 'parent' | 'family' | 'tag'
  label?: string
}

type ObsidianWordGraphProps = {
  words: LearnedWord[]
  selectedWordId?: string | null
  onSelectWord?: (word: LearnedWord) => void
  compact?: boolean
}

const KNOWLEDGE_COLORS: Record<number, string> = {
  1: '#ef4444', // Red
  2: '#f97316', // Orange
  3: '#eab308', // Yellow
  4: '#3b82f6', // Blue
  5: '#8b5cf6', // Violet
  6: '#10b981', // Emerald
}

export function ObsidianWordGraph({
  words,
  selectedWordId,
  onSelectWord,
  compact = false,
}: ObsidianWordGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [physicsActive, setPhysicsActive] = useState(true)

  // Camera transform state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 })
  const isDraggingCameraRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const draggedNodeRef = useRef<Node | null>(null)

  // Build nodes and edges
  const { nodes, edges, nodeMap } = useMemo(() => {
    const nodeMap = new Map<string, Node>()
    const nList: Node[] = []
    const eList: Edge[] = []
    const edgeSet = new Set<string>()

    const addEdge = (src: string, tgt: string, type: 'parent' | 'family' | 'tag', label?: string) => {
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
      const radiusDist = 80 + Math.sqrt(i) * 35 + (Math.random() * 40 - 20)
      const k = w.knowledge ?? 1
      const color = KNOWLEDGE_COLORS[k] || '#8b5cf6'

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
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.max(5, 4 + Math.min(10, (w.tags?.length || 0) * 1.5 + (w.parent ? 3 : 0))),
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

    // 3. Connect words with same parent
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

    // 4. Connect words sharing specific tags
    const tagGroups = new Map<string, string[]>()
    words.forEach((w) => {
      (w.tags || []).forEach((t) => {
        if (!tagGroups.has(t)) tagGroups.set(t, [])
        tagGroups.get(t)!.push(w.normalized || w.word.toLowerCase().trim())
      })
    })
    tagGroups.forEach((taggedWords) => {
      if (taggedWords.length > 1 && taggedWords.length <= 8) {
        for (let i = 0; i < taggedWords.length - 1; i++) {
          addEdge(taggedWords[i], taggedWords[i + 1], 'tag')
        }
      }
    })

    return { nodes: nList, edges: eList, nodeMap }
  }, [words])

  // Reset Camera
  const resetCamera = () => {
    cameraRef.current = { x: 0, y: 0, scale: compact ? 0.85 : 1 }
  }

  // Handle Canvas Drawing and Physics Loop
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

    // Physics Simulation step
    const stepPhysics = () => {
      if (!physicsActive) return

      const repulsion = 450
      const springLength = 70
      const springK = 0.04
      const centerGravity = 0.008
      const damping = 0.85

      // 1. Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j]
          const dx = n2.x - n1.x
          const dy = n2.y - n1.y
          const distSq = dx * dx + dy * dy || 1
          const dist = Math.sqrt(distSq)
          if (dist < 320) {
            const force = repulsion / distSq
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            n1.vx -= fx
            n1.vy -= fy
            n2.vx += fx
            n2.vy += fy
          }
        }
      }

      // 2. Spring attraction on edges
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

      // 3. Center gravity and update positions
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

    // Render step
    const render = () => {
      stepPhysics()

      const dpr = window.devicePixelRatio || 1
      const width = canvas.width / dpr
      const height = canvas.height / dpr

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = '#0f1117'
      ctx.fillRect(0, 0, width, height)

      // Subtle grid dots (Obsidian feel)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
      const gridStep = 40
      for (let gx = 0; gx < width; gx += gridStep) {
        for (let gy = 0; gy < height; gy += gridStep) {
          ctx.beginPath()
          ctx.arc(gx, gy, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Apply camera pan & zoom
      const cam = cameraRef.current
      ctx.save()
      ctx.translate(width / 2 + cam.x, height / 2 + cam.y)
      ctx.scale(cam.scale, cam.scale)

      const activeSearch = searchQuery.trim().toLowerCase()
      const hoveredId = hoveredNode?.id
      const selectedId = selectedWordId

      // Draw Edges
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
          ctx.strokeStyle = '#a855f7'
          ctx.lineWidth = 1.8
          ctx.shadowColor = '#a855f7'
          ctx.shadowBlur = 8
        } else {
          ctx.strokeStyle = edge.type === 'parent' ? 'rgba(168, 85, 247, 0.28)' : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = edge.type === 'parent' ? 1.2 : 0.8
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
          ctx.fillStyle = '#22d3ee'
          ctx.shadowColor = '#22d3ee'
          ctx.shadowBlur = 15
        } else if (isHovered || isSelected) {
          ctx.fillStyle = '#f43f5e'
          ctx.shadowColor = '#f43f5e'
          ctx.shadowBlur = 16
        } else {
          ctx.fillStyle = node.color
          ctx.shadowBlur = 0
        }

        ctx.fill()
        ctx.shadowBlur = 0

        // Outer ring for selected or hovered
        if (isHovered || isSelected || isMatchSearch) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Draw label text
        const showLabel = cam.scale > 0.65 || isHovered || isSelected || isMatchSearch || node.radius > 7
        if (showLabel) {
          ctx.font = `${isHovered || isSelected ? 'bold 12px' : '10px'} -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          ctx.fillStyle = isHovered || isSelected ? '#ffffff' : isMatchSearch ? '#22d3ee' : 'rgba(255, 255, 255, 0.75)'
          ctx.textAlign = 'center'
          ctx.fillText(node.word, node.x, node.y + node.radius + 12)
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

  // Mouse / Pointer Events on Canvas
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

    // Check if clicked a node
    let hit: Node | null = null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      const dx = worldX - n.x
      const dy = worldY - n.y
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
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
      dragStartRef.current = { x: clientX - cameraRef.current.x, y: clientY - cameraRef.current.y }
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
      cameraRef.current.x = clientX - dragStartRef.current.x
      cameraRef.current.y = clientY - dragStartRef.current.y
      return
    }

    // Check hover
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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const nextScale = Math.max(0.2, Math.min(3.0, cameraRef.current.scale * zoomFactor))
    cameraRef.current.scale = nextScale
  }

  return (
    <div
      ref={containerRef}
      className={`obsidian-graph-wrapper ${compact ? 'compact' : ''} ${isFullscreen ? 'fullscreen' : ''}`}
    >
      {/* Top Floating Controls Bar */}
      <div className="graph-top-controls">
        <div className="graph-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Rechercher un mot dans le graphe..."
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
          <span>{nodes.length} mots</span>
          <span>·</span>
          <span>{edges.length} liens</span>
        </div>

        <div className="graph-action-buttons">
          <button
            type="button"
            className="graph-btn"
            onClick={() => (cameraRef.current.scale = Math.min(3, cameraRef.current.scale * 1.25))}
            title="Zoom avant"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="graph-btn"
            onClick={() => (cameraRef.current.scale = Math.max(0.2, cameraRef.current.scale * 0.8))}
            title="Zoom arrière"
          >
            <ZoomOut size={14} />
          </button>
          <button type="button" className="graph-btn" onClick={resetCamera} title="Recentrer la vue">
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="graph-btn"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
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
            {hoveredNode.phonetic && <span className="phonetic">[{hoveredNode.phonetic}]</span>}
          </div>
          {hoveredNode.translation && (
            <p className="tooltip-trans">{hoveredNode.translation}</p>
          )}
          {hoveredNode.parent && (
            <span className="tooltip-parent">Racine : {hoveredNode.parent}</span>
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
