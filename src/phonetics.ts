import type { Language } from './domain'

/**
 * Phonetic helpers used by the reader:
 * - part-of-speech heuristics (fallback for the word popup)
 * - syllable estimation and a native-like intonation profile for the rhythm view
 */

// ---------------------------------------------------------------------------
// Part-of-speech heuristics (used when no dictionary/IA answer is available)
// ---------------------------------------------------------------------------

const EN_AUX = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
])

const FR_COMMON_VERBS = new Set([
  'suis', 'es', 'est', 'sommes', 'etes', 'sont', 'etait', 'etaient', 'sera', 'seront', 'ete',
  'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avait', 'avaient', 'aura', 'auront', 'eu',
  'vais', 'va', 'allons', 'allez', 'vont', 'fais', 'fait', 'font', 'faites',
  'viens', 'vient', 'viennent', 'vois', 'voit', 'voient', 'peux', 'peut', 'peuvent',
  'veux', 'veut', 'veulent', 'dois', 'doit', 'doivent', 'sais', 'sait', 'savent',
  'prends', 'prend', 'prennent', 'dis', 'dit', 'disent', 'pars', 'part', 'partent',
])

export function guessPartOfSpeech(normalized: string, language: Language): string {
  if (!normalized) return language === 'en' ? 'word' : 'mot'
  if (language === 'en') {
    if (EN_AUX.has(normalized)) return 'verb'
    if (/ing$/.test(normalized) && normalized.length > 4) return 'verb'
    if (/ed$/.test(normalized) && normalized.length > 4) return 'verb / past participle'
    if (/ly$/.test(normalized) && normalized.length > 3) return 'adverb'
    if (/(ous|ful|less|able|ible|ive|al|ic|ish)$/.test(normalized)) return 'adjective'
    if (/(tion|sion|ment|ness|ity|ism|ist|ship|hood)$/.test(normalized)) return 'noun'
    return 'noun / adjective'
  }
  if (FR_COMMON_VERBS.has(normalized)) return 'verbe'
  if (normalized.length > 4 && /(er|ir|re|ez|ent|ais|ait|aient|ons)$/.test(normalized)) return 'verbe'
  if (/ment$/.test(normalized) && normalized.length > 5) return 'adverbe'
  if (/(eux|euse|if|ive|able|ible|al|ale|el|elle)$/.test(normalized)) return 'adjectif'
  if (/(tion|sion|té|ure|ence|ance|isme|iste)$/.test(normalized)) return 'nom'
  return 'nom / adjectif'
}

// ---------------------------------------------------------------------------
// Syllables & intonation (rhythm view)
// ---------------------------------------------------------------------------

/** Rough syllable count for display purposes (not a dictionary). */
export function syllableCount(raw: string, language: Language): number {
  const word = raw.toLowerCase().replace(/[^a-zà-ÿ']/g, '')
  if (!word) return 0
  if (language === 'fr') {
    const withoutFinalE = word.replace(/e(s|nt)?$/, (match) => (match.includes('é') ? match : ''))
    const groups = withoutFinalE.match(/[aeiouyàâäéèêëîïôöùûü]+/g)
    return Math.max(1, groups ? groups.length : 1)
  }
  // English heuristic: vowel groups minus silent-e and common one-syllable endings
  let working = word.replace(/(?:[^laeiouy]e|ed|es)$/, '')
  working = working.replace(/^y/, '')
  const groups = working.match(/[aeiouy]+/g)
  const count = groups ? groups.length : 0
  return Math.max(1, count)
}

const EN_FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'as', 'of', 'at', 'by', 'for',
  'with', 'about', 'into', 'to', 'from', 'in', 'on', 'off', 'out', 'up', 'down', 'over', 'under',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'do', 'does', 'did', 'has', 'have', 'had',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'there', 'here', 'not', 'no',
])

const FR_FUNCTION_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'et', 'ou', 'mais', 'donc',
  'or', 'ni', 'car', 'que', 'qui', 'quoi', 'dont', 'dans', 'sur', 'sous', 'chez', 'pour', 'par',
  'avec', 'sans', 'vers', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me',
  'te', 'se', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cet', 'cette',
  'ces', 'ne', 'pas', 'plus', 'tres', 'y', 'en',
])

export type IntonationPoint = {
  /** 0 = unstressed, 1 = fully stressed (content-word nucleus). */
  stress: number
  /** Whether the native melody rises on this word (questions, lists, hesitation). */
  rise: boolean
}

/**
 * Per-word intonation profile, approximating a native melody:
 * function words stay low, content words peak, the last content word of a
 * statement falls while a yes/no question rises.
 */
export function intonationProfile(words: string[], language: Language, sentenceEnd: '.' | '?' | '!' | ''): IntonationPoint[] {
  const functions = language === 'fr' ? FR_FUNCTION_WORDS : EN_FUNCTION_WORDS
  const profile = words.map((word) => {
    const normalized = word.toLowerCase().replace(/[^a-zà-ÿ'-]/g, '')
    const isFunction = functions.has(normalized)
    const syllables = syllableCount(word, language)
    const stress = isFunction ? 0.18 : Math.min(1, 0.55 + syllables * 0.12)
    return { stress, rise: false, isFunction }
  })
  // Find the last content word = intonational nucleus.
  let nucleus = -1
  for (let index = profile.length - 1; index >= 0; index -= 1) {
    if (!profile[index].isFunction) { nucleus = index; break }
  }
  if (nucleus >= 0) {
    profile[nucleus].stress = Math.min(1, profile[nucleus].stress + 0.2)
    profile[nucleus].rise = sentenceEnd === '?'
  }
  if (sentenceEnd === '?' && nucleus === -1 && profile.length > 0) profile[profile.length - 1].rise = true
  return profile.map(({ stress, rise }) => ({ stress, rise }))
}
