import { useEffect, useRef } from 'react'

const TICK_SECONDS = 30
/** Without input for this long, the learner is considered away. */
const IDLE_SECONDS = 90

/**
 * Counts active practice time: the tab must be visible and the learner must
 * have interacted recently (reading counts: scrolling and clicks are inputs).
 */
export function useActivityTimer(enabled: boolean, onTick: (seconds: number) => void) {
  const lastInput = useRef(Date.now())
  const callback = useRef(onTick)
  callback.current = onTick

  useEffect(() => {
    if (!enabled) return
    const touch = () => { lastInput.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'] as const
    events.forEach((name) => window.addEventListener(name, touch, { passive: true, capture: true }))
    const timer = window.setInterval(() => {
      const idle = (Date.now() - lastInput.current) / 1000
      if (document.visibilityState === 'visible' && idle < IDLE_SECONDS) callback.current(TICK_SECONDS)
    }, TICK_SECONDS * 1000)
    return () => {
      window.clearInterval(timer)
      events.forEach((name) => window.removeEventListener(name, touch, { capture: true }))
    }
  }, [enabled])
}
