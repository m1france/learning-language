import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useCamera } from './CameraContext'
import { Mic, MicOff, Maximize2, X, Square, Play, Pause, GripHorizontal } from 'lucide-react'

type FloatingMiniCamProps = {
  onNavigateToSpeaking: () => void
}

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function FloatingMiniCam({ onNavigateToSpeaking }: FloatingMiniCamProps) {
  const {
    stream,
    cameraActive,
    cameraDisabled,
    micMuted,
    recording,
    isPaused,
    elapsed,
    toggleMicTrack,
    startRecordingWithCountdown,
    stopRecording,
    pauseRecording,
    resumeRecording,
    stopAllMedia,
  } = useCamera()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('vivre-pip-width')
    return saved ? Math.min(600, Math.max(220, parseInt(saved, 10))) : 340
  })
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(340)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream])

  // Mouse / Pointer resize handler (dragging from left or top-left border)
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = width

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isResizingRef.current) return
      // Since PiP is anchored at bottom-right, moving mouse left (smaller clientX) increases width!
      const deltaX = startXRef.current - moveEvent.clientX
      const newWidth = Math.min(650, Math.max(220, startWidthRef.current + deltaX))
      setWidth(newWidth)
    }

    const onPointerUp = () => {
      isResizingRef.current = false
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setWidth((w) => {
        localStorage.setItem('vivre-pip-width', String(w))
        return w
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }, [width])

  if (!cameraActive || !stream) return null

  return (
    <div
      className="floating-pip-container"
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle at Top-Left */}
      <div
        className="pip-resize-handle"
        onPointerDown={handleResizeStart}
        title="Glisser pour redimensionner"
      >
        <GripHorizontal size={12} />
      </div>

      <div className="floating-pip-video-box">
        <video
          ref={videoRef}
          className={`floating-pip-video ${cameraDisabled ? 'disabled' : ''}`}
          autoPlay
          muted
          playsInline
        />

        {/* Minimalist Floating Dark Contrast Toolbar */}
        <div className="floating-pip-toolbar">
          <div className="pip-left-actions">
            <button
              className={`pip-icon-btn ${micMuted ? 'muted' : ''}`}
              onClick={toggleMicTrack}
              title={micMuted ? 'Activer micro' : 'Couper micro'}
            >
              {micMuted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>

            {recording ? (
              <div className="pip-rec-pill">
                <span className="pip-rec-dot" />
                <span className="pip-rec-time">{formatTimer(elapsed)}</span>
                <button
                  className="pip-control-micro-btn"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  title={isPaused ? 'Reprendre' : 'Pause'}
                >
                  {isPaused ? <Play size={11} /> : <Pause size={11} />}
                </button>
                <button
                  className="pip-control-micro-btn stop"
                  onClick={stopRecording}
                  title="Arrêter"
                >
                  <Square size={11} />
                </button>
              </div>
            ) : (
              <button
                className="pip-icon-btn record"
                onClick={() => void startRecordingWithCountdown()}
                title="Enregistrer"
              >
                <span className="pip-rec-red-circle" />
              </button>
            )}
          </div>

          <div className="pip-right-actions">
            <button
              className="pip-icon-btn"
              onClick={onNavigateToSpeaking}
              title="Agrandir / Ouvrir le Studio Parler"
            >
              <Maximize2 size={13} />
            </button>
            <button
              className="pip-icon-btn close"
              onClick={stopAllMedia}
              title="Fermer la caméra"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
