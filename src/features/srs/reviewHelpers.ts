import type { Language, LearnedWord } from '../../domain'
import { getInflectionVariants, normalizeWord } from '../../domain'
import { buildPhraseRegex } from '../vocabulary/phraseMatchingService'

export type SentencePart = { text: string; target: boolean }

const TOKEN = /(\p{L}[\p{L}\p{M}\p{N}'’-]*)/u

/** Splits a sentence so the studied word (or any of its forms) can be highlighted or blanked out. */
export function splitAroundWord(sentence: string, word: Pick<LearnedWord, 'word' | 'normalized' | 'parent'>, language: Language): SentencePart[] {
  if (!sentence) return []
  if (/[\s-]/.test(word.word.trim())) {
    const regex = buildPhraseRegex(word.word, language)
    if (regex) {
      const parts: SentencePart[] = []
      let last = 0
      for (const match of sentence.matchAll(regex)) {
        const found = match[1]
        const start = (match.index ?? 0) + match[0].indexOf(found)
        if (start > last) parts.push({ text: sentence.slice(last, start), target: false })
        parts.push({ text: found, target: true })
        last = start + found.length
      }
      if (parts.length) {
        if (last < sentence.length) parts.push({ text: sentence.slice(last), target: false })
        return parts
      }
    }
  }
  const forms = new Set([
    ...getInflectionVariants(word.normalized),
    ...(word.parent ? getInflectionVariants(word.parent) : []),
  ])
  return sentence
    .split(TOKEN)
    .filter((text) => text !== '')
    .map((text) => ({ text, target: TOKEN.test(text) && forms.has(normalizeWord(text)) }))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

export type AnswerCheck = 'correct' | 'close' | 'wrong'

/**
 * Compares a typed answer with the card. Only the exact form is "correct";
 * another form of the same word (seem ↔ seemed) or a small typo is "close".
 */
export function checkAnswer(input: string, word: Pick<LearnedWord, 'word' | 'normalized' | 'parent'>): AnswerCheck {
  const typed = normalizeWord(input)
  if (!typed) return 'wrong'
  if (typed === word.normalized || typed === normalizeWord(word.word)) return 'correct'
  const relatedForms = new Set([
    ...getInflectionVariants(word.normalized),
    ...(word.parent ? getInflectionVariants(word.parent) : []),
  ])
  const target = word.normalized
  const tolerance = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0
  return relatedForms.has(typed) || levenshtein(typed, target) <= tolerance ? 'close' : 'wrong'
}

/** Word-level comparison of a spoken transcript with the reference sentence (for shadowing). */
export function compareSpoken(reference: string, spoken: string): { parts: { text: string; ok: boolean }[]; score: number } {
  const tokens = reference.split(/(\s+)/)
  const heard = spoken.split(/\s+/).map(normalizeWord).filter(Boolean)
  const pool = new Map<string, number>()
  heard.forEach((token) => pool.set(token, (pool.get(token) ?? 0) + 1))
  let total = 0
  let ok = 0
  const parts = tokens.map((text) => {
    const norm = normalizeWord(text)
    if (!norm) return { text, ok: true }
    total += 1
    const left = pool.get(norm) ?? 0
    if (left > 0) {
      pool.set(norm, left - 1)
      ok += 1
      return { text, ok: true }
    }
    return { text, ok: false }
  })
  return { parts, score: total ? Math.round((ok / total) * 100) : 0 }
}
