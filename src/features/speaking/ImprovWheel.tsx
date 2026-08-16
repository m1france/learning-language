import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { Language } from '../../domain'
import { IMPROV_CHALLENGES, getChallengeText } from './speakingTopics'
import { Sparkles, RotateCcw, Play, X, Zap, Volume2, VolumeX } from 'lucide-react'

type ImprovWheelProps = {
  ui: 'fr' | 'en'
  language: Language
  onSelectChallenge: (challenge: typeof IMPROV_CHALLENGES[0]) => void
  onClose: () => void
}

// Color palette for the wheel slices
const SLICE_COLORS = [
  '#ee775d', '#6287bb', '#e8ae48', '#85a891', '#9b5de5',
  '#f15bb5', '#00bbf9', '#00f5d4', '#fb5607', '#ff006e',
  '#8338ec', '#3a86ff', '#38b000', '#70e000', '#d90429',
]

function playTickSound(audioCtxRef: React.MutableRefObject<AudioContext | null>, soundEnabled: boolean) {
  if (!soundEnabled) return
  try {
    const ctx = audioCtxRef.current || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    audioCtxRef.current = ctx
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(440, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.03)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.035)
  } catch {
    // AudioContext blocked or not supported
  }
}

export function ImprovWheel({ ui, language, onSelectChallenge, onClose }: ImprovWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [selected, setSelected] = useState<typeof IMPROV_CHALLENGES[0] | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const currentAngleRef = useRef(0)
  const lastTickSegmentRef = useRef(-1)

  const challenges = IMPROV_CHALLENGES
  const total = challenges.length
  const sliceAngle = (2 * Math.PI) / total

  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const size = canvas.width / dpr
    const radius = size / 2 - 12
    const cx = size / 2
    const cy = size / 2

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    // Outer glow
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 6, 0, 2 * Math.PI)
    ctx.strokeStyle = 'rgba(238, 119, 93, 0.4)'
    ctx.lineWidth = 4
    ctx.shadowColor = 'rgba(238, 119, 93, 0.8)'
    ctx.shadowBlur = 18
    ctx.stroke()
    ctx.restore()

    // Outer rim
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
    ctx.fillStyle = '#14171a'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()

    // Slices
    for (let i = 0; i < total; i++) {
      const startAngle = angle + i * sliceAngle
      const endAngle = startAngle + sliceAngle

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius - 4, startAngle, endAngle)
      ctx.closePath()

      // Gradient fill per slice
      const color = SLICE_COLORS[i % SLICE_COLORS.length]
      ctx.fillStyle = i % 2 === 0 ? color : `${color}cc`
      ctx.fill()
      ctx.strokeStyle = 'rgba(20, 23, 26, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Slice label / number
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(startAngle + sliceAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 10px "DM Sans", sans-serif'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
      ctx.shadowBlur = 4
      // Short label (number + category snippet)
      const text = `#${challenges[i].id}`
      ctx.fillText(text, radius - 16, 3.5)
      ctx.restore()

      ctx.restore()
    }

    // Center hub (metallic glassmorphism)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, 38, 0, 2 * Math.PI)
    ctx.fillStyle = '#1e2329'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
    ctx.shadowBlur = 12
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(238, 119, 93, 0.15)'
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }, [challenges, total, sliceAngle])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const size = 360
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    drawWheel(currentAngleRef.current)
  }, [drawWheel])

  const spin = () => {
    if (spinning) return
    setSpinning(true)
    setSelected(null)

    // Pick random target challenge
    const targetIndex = Math.floor(Math.random() * total)
    // 5 to 7 full rotations + angle to land target at top (pointer is at -PI/2)
    const extraSpins = 5 + Math.floor(Math.random() * 3)
    const targetSliceAngle = targetIndex * sliceAngle + sliceAngle / 2
    // Top pointer is at 3*PI/2 (or -PI/2). To align target slice with top:
    const targetTotalAngle = currentAngleRef.current + extraSpins * 2 * Math.PI + (3 * Math.PI / 2 - (currentAngleRef.current % (2 * Math.PI)) - targetSliceAngle + 4 * Math.PI) % (2 * Math.PI)

    const startAngle = currentAngleRef.current
    const deltaAngle = targetTotalAngle - startAngle
    const duration = 4500 // 4.5 seconds
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(1, elapsed / duration)
      // Custom easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4)
      const current = startAngle + deltaAngle * ease
      currentAngleRef.current = current
      drawWheel(current)

      // Audio tick on each segment passed
      const currentSegment = Math.floor((current % (2 * Math.PI)) / sliceAngle)
      if (currentSegment !== lastTickSegmentRef.current) {
        playTickSound(audioCtxRef, soundEnabled)
        lastTickSegmentRef.current = currentSegment
      }

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setSpinning(false)
        const chosen = challenges[targetIndex]
        setSelected(chosen)
      }
    }

    requestAnimationFrame(animate)
  }

  return (
    <div className="improv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="improv-modal-card">
        <header className="improv-modal-header">
          <div className="improv-modal-title">
            <span className="improv-badge"><Zap size={14} /> {ui === 'fr' ? 'DÉFI IMPROVISÉ' : 'IMPROV CHALLENGE'}</span>
            <h3>{ui === 'fr' ? 'La Roue aux 55 Sujets' : 'The 55-Topic Wheel'}</h3>
          </div>
          <div className="improv-header-actions">
            <button
              className="improv-sound-toggle"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Couper le son' : 'Activer le son'}
              aria-label="Toggle sound"
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button className="improv-close-btn" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="improv-wheel-container">
          <div className="wheel-pointer">
            <div className="pointer-needle" />
          </div>
          <canvas ref={canvasRef} className="wheel-canvas" />
          <button
            className={`wheel-center-btn ${spinning ? 'spinning' : ''}`}
            onClick={spin}
            disabled={spinning}
          >
            <Sparkles size={18} />
            <span>{spinning ? (ui === 'fr' ? '...' : '...') : (ui === 'fr' ? 'TOURNER' : 'SPIN')}</span>
          </button>
        </div>

        {selected && (
          <div className="improv-result-card">
            <div className="result-category-tag">
              <span className="cat-chip">{selected.category}</span>
              <span className="num-chip">#{selected.id} / 55</span>
            </div>
            <p className="result-challenge-text">
              “{getChallengeText(selected, language)}”
            </p>
            <div className="result-actions">
              <button className="improv-btn-outline" onClick={spin} disabled={spinning}>
                <RotateCcw size={14} /> {ui === 'fr' ? 'Relancer la roue' : 'Spin again'}
              </button>
              <button
                className="improv-btn-primary"
                onClick={() => {
                  onSelectChallenge(selected)
                  onClose()
                }}
              >
                <Play size={15} /> {ui === 'fr' ? 'Relever ce défi' : 'Accept challenge'}
              </button>
            </div>
          </div>
        )}

        {!selected && (
          <p className="improv-hint">
            {ui === 'fr'
              ? 'Clique sur "Tourner" pour tirer au sort un sujet parmi 55 défis amusants et captivants !'
              : 'Click "Spin" to draw a random prompt among 55 fun and exciting challenges!'}
          </p>
        )}
      </div>
    </div>
  )
}
