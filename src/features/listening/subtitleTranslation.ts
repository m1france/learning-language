import type { ApiSettings } from '../../domain'
import { translateText } from '../speaking/deeplService'

/**
 * Batch subtitle translation for the listening theater.
 * Reuses the app's proven translation chain (DeepL → configured AI agent →
 * Google Translate fallback) and wraps it in a small batch layer:
 * - one request per chunk of lines (fewer round-trips),
 * - limited concurrency (no rate-limit storm on long videos),
 * - a Map cache so scrubbing back never refetches a line.
 */

const CHUNK_SIZE = 8 // lines per batch request
const MAX_CONCURRENT_BATCHES = 4 // batches translated at the same time

/** Translates every cue line to the user's language. Reports each completed batch so the UI can render progressively. */
export async function translateCueLines(
  lines: string[],
  uiLang: 'fr' | 'en',
  api: ApiSettings,
  onBatch?: (batch: { done: number; total: number; start: number; items: string[] }) => void,
): Promise<Map<number, string>> {
  const target = uiLang === 'fr' ? 'FR' : 'EN-US'
  const source = uiLang === 'fr' ? 'EN' : 'FR'
  const results = new Map<number, string>()
  if (!lines.length) return results

  const chunks: number[] = []
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) chunks.push(i)

  let cursor = 0
  let done = 0
  const nextChunk = () => (cursor < chunks.length ? chunks[cursor++] : null)

  const runWorker = async () => {
    for (;;) {
      const start = nextChunk()
      if (start === null) return
      const items = lines.slice(start, start + CHUNK_SIZE)
      try {
        const joined = items.map((line, index) => `${start + index + 1}. ${line}`).join('\n')
        const outcome = await translateText(joined, api, target, source)
        const pieces = outcome.translatedText.split('\n')
        const resolved = items.map((original, index) => pieces[index]?.replace(/^\s*\d+\.\s*/, '').trim() || original)
        resolved.forEach((value, index) => results.set(start + index, value))
        onBatch?.({ done: Math.min(done + items.length, lines.length), total: lines.length, start, items: resolved })
      } catch {
        // Whole chunk lost — keep the original line rather than breaking the session.
        items.forEach((_, index) => results.set(start + index, lines[start + index]))
      }
      done += items.length
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_BATCHES, chunks.length) }, runWorker)
  await Promise.all(workers)
  return results
}
