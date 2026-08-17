import React, { useEffect, useRef } from 'react'
import { useCamera } from './CameraContext'
import { Mic, MicOff, Maximize2, X, Square, Play, Pause } from 'lucide-react'

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

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => undefined)
    }
  }, [stream])

  if (!cameraActive || !stream) return null

  return (
    <div className="floating-pip-container">
      <div className="floating-pip-video-box">
        <video
          ref={videoRef}
          className={`floating-pip-video ${cameraDisabled ? 'disabled' : ''}`}
          autoPlay
          muted
          playsInline
        />

        {/* Minimalist Floating Controls Bar */}
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
