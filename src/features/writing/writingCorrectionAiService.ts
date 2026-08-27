import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { getAgentConfig } from '../speaking/wordAiService'
import { getLanguageName } from '../../languages'

export type CorrectionType =
  | 'letter_error'       // Faute d'orthographe, lettres en trop/manquantes, coquille
  | 'word_error'         // Mot incorrect, accord, préposition, temps de verbe
  | 'syntax_structure'   // Phrase mal structurée nécessitant une réécriture fluide
  | 'unnatural_phrasing' // Phrase correcte mais peu naturelle (conseil idiomatique)
  | 'punctuation'        // Ponctuation ou majuscule

export type CharDiff = {
  type: 'equal' | 'removed' | 'inserted'
  text: string
}

export type CorrectionItem = {
  id: string
  type: CorrectionType
  original: string
  corrected: string
  explanation: string
  charDiffs?: CharDiff[]
  rotation?: number
  displaySize?: 'normal' | 'large'
  severity: 'error' | 'warning' | 'style'
  startIndex?: number
  endIndex?: number
}

export type WritingCorrectionResult = {
  originalText: string
  correctedFullText: string
  overallFeedback: string
  score?: number
  corrections: CorrectionItem[]
}

/**
 * Computes a character-level diff between original and corrected snippets
 * so that errors can be displayed with red strikethroughs and green insertions.
 */
export function computeCharDiff(orig: string, corr: string): CharDiff[] {
  if (orig === corr) {
    return [{ type: 'equal', text: orig }]
  }

  // Longest Common Subsequence based diff for accurate letter-by-letter matching
  const n = orig.length
  const m = corr.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (orig[i] === corr[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  let i = n
  let j = m
  const rawDiffs: CharDiff[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === corr[j - 1]) {
      rawDiffs.unshift({ type: 'equal', text: orig[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiffs.unshift({ type: 'inserted', text: corr[j - 1] })
      j--
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiffs.unshift({ type: 'removed', text: orig[i - 1] })
      i--
    }
  }

  // Merge contiguous tokens of the same type
  const merged: CharDiff[] = []
  for (const token of rawDiffs) {
    const prev = merged[merged.length - 1]
    if (prev && prev.type === token.type) {
      prev.text += token.text
    } else {
      merged.push({ ...token })
    }
  }

  return merged
}

const UI_LANG_NAMES: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  zh: 'Chinois',
  ru: 'Russe',
  pt: 'Portugais',
}

/**
 * Analyzes writing text with AI to generate rich pedagogical teacher annotations.
 */
export async function analyzeWritingWithAi(args: {
  text: string
  learningLanguage: Language
  uiLanguage: UiLanguage
  api: ApiSettings
}): Promise<{ ok: true; result: WritingCorrectionResult } | { ok: false; error: string }> {
  const { text, learningLanguage, uiLanguage, api } = args
  const clean = text.trim()

  if (!clean) {
    return {
      ok: false,
      error: 'Le texte est vide. Écris quelques phrases avant de lancer la correction IA.',
    }
  }

  const agentConfig = getAgentConfig(api, api.taskModelWritingCorrection)
  if (!agentConfig || !agentConfig.key) {
    return {
      ok: false,
      error: 'Aucune clé API configurée pour l’agent IA. Configure ta clé dans les Paramètres (section Connexions).',
    }
  }

  const targetLangName = getLanguageName(learningLanguage)
  const explanationLang = UI_LANG_NAMES[uiLanguage] || 'Français'

  const systemPrompt = `You are a helpful, expert language teacher correcting a student's writing in ${targetLangName}.
Your explanations and advice MUST BE WRITTEN IN ${explanationLang}.

CRITICAL RULES FOR ACCURACY AND CONCISENESS:
1. STRICT LOCAL TARGETING (DO NOT SELECT FULL SENTENCES):
   - "original" MUST target ONLY the exact specific word(s) or characters that contain the mistake (e.g., "play soccer" instead of the whole clause "listening to Brazilian music, play soccer, and hanging with friends"; "stop" instead of "I stop school"; "definitly" instead of "I definitly love").
   - NEVER select surrounding correct words or full sentences unless the entire sentence is genuinely scrambled.
2. DO NOT BOTHER WITH PUNCTUATION OR VULGARITY:
   - Ignore minor punctuation (missing final periods, commas, quotation marks).
   - Ignore vulgar, curse, or slang words used by the student (do not attempt to censor or replace them).
3. CASUAL & INFORMAL TOLERANCE:
   - Accept informal English/French, modern abbreviations, age formats (e.g. "I'm 18", "18yo", "18 yo"), contractions ("I'm", "wanna", "gonna", "cool").
4. CATEGORIES:
   - "letter_error": Spelling mistakes, typos, missing/extra letters, accents (e.g. "definitly" -> "definitely", "stop" -> "stopped").
   - "word_error": Wrong word, wrong preposition, wrong tense, false friend (e.g. "play soccer" -> "playing soccer", "good in math" -> "good at math").
   - "syntax_structure": Awkward word order or missing small grammatical particle (e.g. "go I" -> "I go", missing "to", "of", "n" to form "an").
   - "unnatural_phrasing": Phrases that sound non-native (e.g. "make a walk" -> "go for a walk", "take a decision" -> "make a decision").

- Provide "correctedFullText": The complete text with all corrections applied smoothly.
- Provide "overallFeedback": 1 concise encouraging sentence in ${explanationLang}.
- Provide "score": Estimated accuracy score (0-100).

Return STRICTLY valid JSON matching:
{
  "overallFeedback": "Bon travail ! Fais attention au parallélisme des verbes en -ing.",
  "score": 85,
  "correctedFullText": "Full text...",
  "corrections": [
    {
      "id": "c1",
      "type": "word_error",
      "original": "play soccer",
      "corrected": "playing soccer",
      "explanation": "Parallélisme : après 'listening to...', les verbes coordonnés doivent être au gérondif (-ing).",
      "severity": "error"
    }
  ]
}`

  try {
    const isFish = agentConfig.model.toLowerCase().includes('fish')
    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentConfig.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App - Writing AI Correction',
      },
      body: JSON.stringify({
        model: agentConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Student's text to analyze and correct:\n\n"""\n${clean}\n"""` },
        ],
        temperature: 0.2,
        ...(!isFish && !agentConfig.endpoint.includes('moonshot') ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Erreur API IA (HTTP ${response.status}): ${errText.slice(0, 180) || response.statusText}`,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    if (!content) {
      return { ok: false, error: 'L’IA a renvoyé une réponse vide.' }
    }

    // Clean JSON markdown codeblocks if returned
    const jsonCleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: any
    try {
      parsed = JSON.parse(jsonCleaned)
    } catch {
      // Fallback: search for first { and last }
      const start = jsonCleaned.indexOf('{')
      const end = jsonCleaned.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(jsonCleaned.slice(start, end + 1))
      } else {
        return { ok: false, error: 'Impossible de décoder la réponse JSON de l’IA.' }
      }
    }

    const rawCorrections = Array.isArray(parsed.corrections) ? parsed.corrections : []

    // Enrich corrections with character diffs, random handwritten rotation, and validate original text occurrences
    const corrections: CorrectionItem[] = rawCorrections
      .map((c: any, idx: number) => {
        const orig = String(c.original || '').trim()
        const corr = String(c.corrected || '').trim()
        if (!orig && !corr) return null

        const charDiffs = (c.type === 'letter_error' || c.type === 'word_error' || c.type === 'punctuation')
          ? computeCharDiff(orig, corr)
          : undefined

        // Subtle/straight rotation
        const pseudoRandomRotation = 0

        return {
          id: String(c.id || `corr_${idx + 1}`),
          type: (['letter_error', 'word_error', 'syntax_structure', 'unnatural_phrasing', 'punctuation'].includes(c.type)
            ? c.type
            : 'word_error') as CorrectionType,
          original: orig,
          corrected: corr,
          explanation: String(c.explanation || ''),
          charDiffs,
          rotation: pseudoRandomRotation,
          displaySize: c.displaySize === 'large' ? 'large' : 'normal',
          severity: (['error', 'warning', 'style'].includes(c.severity) ? c.severity : 'error') as 'error' | 'warning' | 'style',
        }
      })
      .filter(Boolean) as CorrectionItem[]

    return {
      ok: true,
      result: {
        originalText: text,
        correctedFullText: parsed.correctedFullText || text,
        overallFeedback: parsed.overallFeedback || 'Analyse terminée avec succès.',
        score: typeof parsed.score === 'number' ? parsed.score : undefined,
        corrections,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Une erreur inattendue est survenue lors de l’appel IA.',
    }
  }
}
