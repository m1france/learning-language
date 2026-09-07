import type { AppState, Language, LearnedWord, Resource } from '../domain'
import { normalizeWord } from '../domain'
import { findMatchingLearnedWord } from './vocabulary/wordMatchingService'
import { buildPhraseRegex } from './vocabulary/phraseMatchingService'

/**
 * Strips punctuation and returns clean word token.
 */
export function cleanWordToken(raw: string): string {
  return raw.replace(/^[.,!?;:()"“”«»'’\s]+|[.,!?;:()"“”«»'’\s]+$/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Extracts all unique normalized words from a complete resource.
 */
export function extractResourceUniqueWords(
  resource: Resource,
  knownPhrases: string[] = [],
  language: Language = 'en'
): string[] {
  const set = new Set<string>()
  const phraseRegexes = (knownPhrases || [])
    .map((p) => ({ phrase: p, regex: buildPhraseRegex(p, language) }))
    .filter((x) => x.regex !== null)

  for (const chapter of resource.chapters) {
    for (const p of chapter.paragraphs) {
      let remaining = p
      for (const { regex } of phraseRegexes) {
        if (!regex) continue
        regex.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = regex.exec(p)) !== null) {
          const matched = m[1]
          const norm = normalizeWord(matched)
          if (norm) set.add(norm)
          remaining = remaining.replace(matched, ' '.repeat(matched.length))
        }
      }
      const tokens = remaining.split(/\s+/)
      for (const t of tokens) {
        const cleaned = cleanWordToken(t)
        if (cleaned && /[a-zà-ÿ0-9]/i.test(cleaned)) {
          const norm = normalizeWord(cleaned)
          if (norm) set.add(norm)
        }
      }
    }
  }
  return Array.from(set)
}

/**
 * Determines whether a normalized word or expression is considered "known" in the learner's vocabulary.
 * Accounts for inflections and multi-word phrases.
 * A word is known if:
 * - It has knowledge level 6 ("connu par cœur" / well known) OR >= 4
 * - Or status is 'learned' or 'mastered'
 */
export function isWordKnown(words: LearnedWord[], language: Language, normalized: string): boolean {
  const norm = normalizeWord(normalized)
  const matched = findMatchingLearnedWord(words, norm, language)
  if (matched) {
    return (
      matched.knowledge === 6 ||
      (matched.knowledge !== undefined && matched.knowledge >= 4) ||
      matched.status === 'learned' ||
      matched.status === 'mastered'
    )
  }
  return false
}

export type ResourceWordStats = {
  totalUnique: number
  knownCount: number
  percentage: number
}

/**
 * Computes the reading progress of a resource based on the ratio of known unique words to total unique words.
 */
export function getResourceWordStats(state: AppState, resource: Resource): ResourceWordStats {
  const knownPhrases = state.words
    .filter((w) => w.language === resource.language && (w.word.includes(' ') || w.word.includes('-')))
    .map((w) => w.word.trim())
    .sort((a, b) => b.length - a.length)

  const uniqueWords = extractResourceUniqueWords(resource, knownPhrases, resource.language)
  const totalUnique = uniqueWords.length
  if (totalUnique === 0) {
    return { totalUnique: 0, knownCount: 0, percentage: 0 }
  }

  const langWords = state.words.filter((w) => w.language === resource.language)
  let knownCount = 0
  for (const norm of uniqueWords) {
    if (isWordKnown(langWords, resource.language, norm)) {
      knownCount++
    }
  }

  const percentage = Math.min(100, Math.round((knownCount / totalUnique) * 100))
  return { totalUnique, knownCount, percentage }
}

/**
 * Extracts unique words with their context sentences from a list of paragraphs or page entries.
 */
export function extractPageUniqueWords(
  entries: { text: string; chapterIndex: number; paragraphIndex: number }[],
): { raw: string; normalized: string; sentence: string }[] {
  const list: { raw: string; normalized: string; sentence: string }[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const sentences = entry.text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [entry.text]
    const tokens = entry.text.split(/\s+/)

    for (const t of tokens) {
      const cleaned = cleanWordToken(t)
      if (cleaned && /[a-zà-ÿ0-9]/i.test(cleaned)) {
        const norm = normalizeWord(cleaned)
        if (norm && !seen.has(norm)) {
          seen.add(norm)
          const matchedSentence = sentences.find((s) => s.includes(t)) || entry.text
          list.push({
            raw: cleaned,
            normalized: norm,
            sentence: matchedSentence,
          })
        }
      }
    }
  }

  return list
}
