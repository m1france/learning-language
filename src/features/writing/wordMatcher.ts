import { normalizeWord } from '../../domain'

/**
 * Checks if a target word (or its common inflected forms) is present in the given text.
 * Handles English and French plurals and regular verb suffixes.
 */
export function isWordInText(targetWord: string, text: string): boolean {
  if (!targetWord || !text) return false
  const normTarget = normalizeWord(targetWord)
  if (!normTarget) return false

  // Tokenize the text into normalized words
  const words = text
    .split(/[\s,.;:!?'"«»()[\]{}…/\\]+/)
    .map((w) => normalizeWord(w))
    .filter(Boolean)

  if (words.includes(normTarget)) return true

  // Check simple common inflections for French & English
  // English: target + s, es, ed, ing, d
  // French: target (if ending with er, ir, re, etc.) or simple suffixes + s, e, es, ent, ait, aient, ons, ez
  for (const token of words) {
    if (token === normTarget) return true

    // Target is a prefix with common suffix
    if (token.startsWith(normTarget)) {
      const suffix = token.slice(normTarget.length)
      if (['s', 'es', 'ed', 'ing', 'd', 'e', 'er', 'ez', 'ons', 'ont', 'ent', 'ait', 'ais', 'aient', 'era', 'eront', 'ie', 'ies'].includes(suffix)) {
        return true
      }
    }

    // Token without trailing letters matches target (e.g. target="learns", token="learn")
    if (normTarget.startsWith(token) && normTarget.length - token.length <= 3) {
      const diff = normTarget.slice(token.length)
      if (['s', 'es', 'ed', 'ing', 'd', 'e', 'er'].includes(diff)) {
        return true
      }
    }
  }

  return false
}

/**
 * Finds all used words and their frequency in the given text.
 */
export function checkUsedWords(
  targetWords: string[],
  text: string,
): { used: string[]; missing: string[]; usageCounts: Record<string, number> } {
  const used: string[] = []
  const missing: string[] = []
  const usageCounts: Record<string, number> = {}

  for (const word of targetWords) {
    if (isWordInText(word, text)) {
      used.push(word)
      usageCounts[word] = (usageCounts[word] || 0) + 1
    } else {
      missing.push(word)
      usageCounts[word] = 0
    }
  }

  return { used, missing, usageCounts }
}
