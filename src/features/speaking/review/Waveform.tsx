import React, { useRef, useState } from 'react'
import { formatClock } from './notesMarkdown'

export type WaveMarker = { time: number; kind: 'note' | 'tip' | 'warning' | 'error'; label: string }

type Props = {
  peaks?: number[]
  duration: number
  currentTime: number
  markers: WaveMarker[]
  loop?: { start: number; end: number } | null
  onSeek: (seconds: number) => void
  label: string
}

/** Clickable waveform: scrub, see where notes and coach remarks sit on the timeline. */
export function Waveform({ peaks, duration, currentTime, markers, loop, onSeek, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dragging = useRef(false)
  const safeDuration = duration > 0 ? duration : 1
  const progress = Math.max(0, Math.min(1, currentTime / safeDuration))
  const bars = peaks?.length ? peaks : null

  const timeAt = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * safeDuration
  }

  return (
    <div
      ref={ref}
      className={`sr-wave${bars ? '' : ' is-loading'}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={formatClock(currentTime)}
      onPointerDown={(event) => {
        dragging.current = true
        ref.current?.setPointerCapture(event.pointerId)
        onSeek(timeAt(event.clientX))
      }}
      onPointerMove={(event) => {
        const time = timeAt(event.clientX)
        setHover(time)
        if (dragging.current) onSeek(time)
      }}
      onPointerUp={() => { dragging.current = false }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); onSeek(Math.min(safeDuration, currentTime + 5)) }
        if (event.key === 'ArrowLeft') { event.preventDefault(); onSeek(Math.max(0, currentTime - 5)) }
      }}
    >
      {loop && (
        <span className="sr-wave-loop" style={{ left: `${(loop.start / safeDuration) * 100}%`, width: `${((loop.end - loop.start) / safeDuration) * 100}%` }} />
      )}
      <div className="sr-wave-bars">
        {bars
          ? bars.map((value, index) => (
            <i key={index} className={index / bars.length < progress ? 'played' : ''} style={{ height: `${Math.max(8, value * 100)}%` }} />
          ))
          : <span className="sr-wave-line"><b style={{ width: `${progress * 100}%` }} /></span>}
      </div>
      <span className="sr-wave-head" style={{ left: `${progress * 100}%` }} />
      {markers.map((marker, index) => (
        <button
          key={`${marker.kind}-${index}`}
          type="button"
          className={`sr-wave-marker ${marker.kind}`}
          style={{ left: `${Math.min(100, (marker.time / safeDuration) * 100)}%` }}
          title={`${formatClock(marker.time)} · ${marker.label}`}
          onPointerDown={(event) => { event.stopPropagation(); onSeek(marker.time) }}
        />
      ))}
      {hover !== null && (
        <span className="sr-wave-tip" style={{ left: `${(hover / safeDuration) * 100}%` }}>{formatClock(hover)}</span>
      )}
    </div>
  )
}
