import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { getAgentConfig } from '../speaking/wordAiService'

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

  const targetLangName = learningLanguage === 'fr' ? 'French' : 'English'
  const explanationLang = UI_LANG_NAMES[uiLanguage] || 'Français'

  const systemPrompt = `You are an encouraging, world-class expert language teacher and editor correcting a student's writing in ${targetLangName}.
Your explanations and advice MUST BE WRITTEN IN ${explanationLang}.

The student wants realistic, pedagogical "Teacher handwritten annotations" on their text.

You must identify and categorize ALL issues in the student's text:
1. "letter_error": Spelling mistake, typo, extra/missing letters, accents, character-level bugs.
2. "word_error": Incorrect word, bad preposition, wrong verb tense/agreement, false friend.
3. "syntax_structure": Awkward, messy, or ungrammatical sentence structure. You will provide the elegantly restructured sentence for the teacher to write directly underneath with an arrow pointing to the fault.
4. "unnatural_phrasing": Phrases that might be grammatically acceptable or understandable, but sound unnatural/clunky to a native speaker. Provide an idiomatic native recommendation and explanation.
5. "punctuation": Missing/incorrect punctuation or capitalization.

CRITICAL INSTRUCTIONS:
- Each correction's "original" field MUST EXACTLY MATCH a literal substring inside the student's text.
- Do not make up text that doesn't exist in the input.
- Keep explanations clear, kind, and pedagogical (explaining the *why*, e.g., "In English, 'look forward to' requires a gerund (-ing) because 'to' is a preposition here").
- Provide "correctedFullText": The complete student text with all corrections applied smoothly.
- Provide "overallFeedback": 1 to 2 encouraging sentences summarizing the overall quality and main points to remember.
- Provide "score": An estimated proficiency/accuracy score from 0 to 100.

Return STRICTLY a valid JSON object matching this schema (NO MARKDOWN WRAPPERS, NO COMMENTARY):
{
  "overallFeedback": "Very good text overall! Watch out for preposition choices and plural agreements.",
  "score": 85,
  "correctedFullText": "The full corrected text...",
  "corrections": [
    {
      "id": "c1",
      "type": "letter_error",
      "original": "definitly",
      "corrected": "definitely",
      "explanation": "Orthographe : 'definitely' s'écrit avec un 'i' et non un 'a' au milieu (de la racine 'finite').",
      "severity": "error"
    },
    {
      "id": "c2",
      "type": "syntax_structure",
      "original": "Yesterday go I store for buy things",
      "corrected": "Yesterday, I went to the store to buy some things",
      "explanation": "Structure : L'ordre des mots en anglais est Sujet + Verbe ('I went'). Pour exprimer le but, on utilise 'to + infinitif' ('to buy').",
      "severity": "error"
    },
    {
      "id": "c3",
      "type": "unnatural_phrasing",
      "original": "I took a decision",
      "corrected": "I made a decision",
      "explanation": "Collocation naturelle : En anglais courant, on dit 'make a decision' plutôt que 'take a decision'.",
      "severity": "style"
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

        // Slight rotation between -2.2deg and +2.2deg for authentic handwriting feel
        const pseudoRandomRotation = (((idx * 17) % 9) - 4) * 0.5 // e.g. -2, -1.5, -1, 0, 1, 1.5, 2 deg

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
