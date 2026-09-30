import React, { createContext, useContext } from 'react'
import { Maximize2, RotateCcw } from 'lucide-react'
import type { ApiSettings, AppState, CefrLevel, UiLanguage } from '../../../domain'
import type { AssistantCopy } from '../../../i18n/assistantCopy'
import type { BlockState } from '../assistantTypes'

export type SaveWordInput = { word: string; translation: string; ipa?: string; example?: string; pos?: string }

/** Everything a block needs from the page, provided once per message. */
export type BlockEnv = {
  /** Id of the message holding the blocks (keys background work). */
  turnId: string
  ui: UiLanguage
  c: AssistantCopy
  level: CefrLevel
  api: ApiSettings
  state: AppState
  speak: (text: string) => void
  speakAndWait: (text: string) => Promise<void>
  hasWord: (word: string) => boolean
  saveWord: (input: SaveWordInput) => void
  getBlock: (index: number) => BlockState | undefined
  setBlock: (index: number, next: BlockState) => void
  openCanvas: (index: number) => void
  inCanvas?: boolean
}

export const BlockEnvContext = createContext<BlockEnv | null>(null)

export function useBlockEnv(): BlockEnv {
  const env = useContext(BlockEnvContext)
  if (!env) throw new Error('Block rendered outside of a message')
  return env
}

export function BlockShell({
  kind,
  title,
  index,
  children,
  footer,
  onReset,
  score,
  wide,
}: {
  kind: string
  title?: string
  index: number
  children: React.ReactNode
  footer?: React.ReactNode
  onReset?: () => void
  score?: { score: number; total: number } | null
  wide?: boolean
}) {
  const env = useBlockEnv()
  return (
    <section className={`ab ab--${kind}${wide ? ' wide' : ''}${env.inCanvas ? ' in-canvas' : ''}`}>
      <header className="ab-head">
        <span className="ab-kind">{env.c.blockKinds[kind as keyof AssistantCopy['blockKinds']] ?? kind}</span>
        {title && <h4>{title}</h4>}
        <span className="ab-head-actions">
          {score && <span className={`ab-score${score.score === score.total ? ' perfect' : ''}`}>{score.score}/{score.total}</span>}
          {onReset && <button type="button" onClick={onReset} title={env.c.restart} aria-label={env.c.restart}><RotateCcw size={13} /></button>}
          {!env.inCanvas && <button type="button" onClick={() => env.openCanvas(index)} title={env.c.expand} aria-label={env.c.expand}><Maximize2 size={13} /></button>}
        </span>
      </header>
      <div className="ab-body">{children}</div>
      {footer && <footer className="ab-foot">{footer}</footer>}
    </section>
  )
}

/** Lenient comparison for typed answers (case, spaces, curly quotes, final punctuation). */
export function sameAnswer(given: string, expected: string): boolean {
  const clean = (value: string) => value
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .trim()
  return clean(given) === clean(expected)
}

export function shuffle<T>(items: T[], seed = 1): T[] {
  const out = [...items]
  let value = seed * 9301 + 49297
  for (let i = out.length - 1; i > 0; i -= 1) {
    value = (value * 9301 + 49297) % 233280
    const j = Math.floor((value / 233280) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Shuffle that never returns the original order (for scrambles). */
export function scramble<T>(items: T[], seed = 1): T[] {
  if (items.length < 2) return items
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const out = shuffle(items, seed + attempt)
    if (out.some((item, index) => item !== items[index])) return out
  }
  return [...items].reverse()
}

export const hashSeed = (text: string) => {
  let hash = 7
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000
  return hash + 1
}
