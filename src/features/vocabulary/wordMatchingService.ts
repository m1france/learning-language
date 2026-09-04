import type { Language, LearnedWord } from '../../domain'
import { cleanWordRaw, getInflectionVariants, normalizeWord } from '../../domain'

export { cleanWordRaw }

/**
 * Vérifie si deux chaînes normalisées correspondent par inflexion / déclinaison.
 */
export function matchesInflection(normA: string, normB: string): boolean {
  if (!normA || !normB) return false
  if (normA === normB) return true

  const variantsA = getInflectionVariants(normA)
  if (variantsA.includes(normB)) return true

  const variantsB = getInflectionVariants(normB)
  if (variantsB.includes(normA)) return true

  // Suffixes réguliers anglais (-ed, -ing, -s, -es, -d) et français
  const commonSuffixes = ['s', 'es', 'ed', 'ing', 'd', 'e', 'er', 'est', 'ly', 'ment', 'ons', 'ent', 'ait', 'ais', 'aient', 'era', 'eront']
  for (const suf of commonSuffixes) {
    if (normA === normB + suf || normB === normA + suf) {
      return true
    }
  }

  return false
}

/**
 * Trouve le mot enregistré dans le vocabulaire qui correspond le mieux à une forme
 * de surface cliquée ou affichée dans le texte.
 *
 * Résout :
 * 1. Correspondance exacte normalisée (ex: "cat" -> "cat")
 * 2. Correspondance exacte sur le mot brut nettoyé (casse insensible)
 * 3. Inflexions morphologiques (pluriel, conjugaison : "cats" / "walked" -> lemme "cat" / "walk")
 * 4. Rattachement au lemme parent (ex: mot dans le texte = "went", mot enregistré parent = "go")
 * 5. Recherche inverse (si un mot cliqué est la forme canonique d'une forme dérivée)
 */
export function findMatchingLearnedWord(
  words: LearnedWord[] | undefined,
  rawOrNorm: string,
  language: Language,
): LearnedWord | undefined {
  if (!words || words.length === 0 || !rawOrNorm) return undefined

  const cleaned = cleanWordRaw(rawOrNorm)
  if (!cleaned) return undefined

  const norm = normalizeWord(cleaned)
  const langWords = words.filter((w) => w.language === language)

  // 1. Correspondance exacte normalisée
  const exactNormalized = langWords.find((w) => w.normalized === norm)
  if (exactNormalized) return exactNormalized

  // 2. Correspondance exacte sur le mot brut nettoyé (casse insensible)
  const lowerCleaned = cleaned.toLowerCase()
  const exactWord = langWords.find((w) => w.word.toLowerCase() === lowerCleaned)
  if (exactWord) return exactWord

  // 3. Correspondance via variantes d'inflexion (pluriels réguliers, 3e personne, etc.)
  const variants = getInflectionVariants(norm)
  const inflectionMatch = langWords.find((w) => {
    if (variants.includes(w.normalized)) return true
    const wVariants = getInflectionVariants(w.normalized)
    return wVariants.includes(norm)
  })
  if (inflectionMatch) return inflectionMatch

  // 4. Correspondance avec le lemme parent (ex: mot dans le texte = "went", mot enregistré parent = "go")
  const parentMatch = langWords.find((w) => {
    if (!w.parent) return false
    const parentNorm = normalizeWord(w.parent)
    return parentNorm === norm || variants.includes(parentNorm)
  })
  if (parentMatch) return parentMatch

  // 5. Inflexion étendue (suffixes verbaux courants en anglais et français)
  const suffixMatch = langWords.find((w) => matchesInflection(norm, w.normalized))
  if (suffixMatch) return suffixMatch

  return undefined
}
