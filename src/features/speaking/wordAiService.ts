import type { ApiSettings, Language, UiLanguage } from '../../domain'
import { normalizeWord, getInflectionVariants } from '../../domain'
import { formatIpaPronunciation } from '../vocabulary/phoneticUtils'
import { getLanguageName, getUiLanguageName } from '../../languages'
import { extractAiContent, extractCleanJson } from '../aiResponseUtils'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type StagedWord = {
  id: string
  word: string
  translation: string
  pronunciation: string
  parent: string
  partOfSpeech: string
  tags: string[]
  contextSentence?: string
  language: Language
  timestamp: string
}

export type AiWordAnalysisResult = {
  word: string
  translation: string
  pronunciation: string
  parent: string
  partOfSpeech: string
  tags: string[]
}

export function getAgentConfig(
  api: ApiSettings,
  overrideModel?: string,
): { endpoint: string; key: string; model: string } | null {
  const provider = api.agentProvider || 'openrouter'
  const customModel = overrideModel?.trim()

  switch (provider) {
    case 'openrouter': {
      const key = api.openRouterKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'nvidia/nemotron-3-ultra-550b-a55b:free',
      }
    }
    case 'nvidia': {
      const key = api.nvidiaKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'meta/llama-3.3-70b-instruct',
      }
    }
    case 'kimi': {
      const key = api.kimiKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'moonshot-v1-8k',
      }
    }
    case 'google': {
      const key = api.googleKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'gemini-2.0-flash',
      }
    }
    case 'openai': {
      const key = api.openAiKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'gpt-4o-mini',
      }
    }
    default: {
      const key = api.openRouterKey?.trim()
      if (!key) return null
      return {
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        key,
        model: customModel || api.agentModel?.trim() || 'nvidia/nemotron-3-ultra-550b-a55b:free',
      }
    }
  }
}

/**
 * Selects at most ONE best tag from candidate tags.
 * Prioritizes specific tags over generic category tags.
 * For example:
 * - For conjugated / inflected verbs ("saw", "was", "went"), chooses ONLY "verbe conjugué" / "verbe conjugé" / "conjugated verb", never "verbe".
 * - For expressions / phrasal verbs, chooses expression / phrasal tags over generic tags.
 * - Enforces that the result array has at most 1 item.
 */
export function selectBestSingleTag(args: {
  rawTags?: string[]
  word?: string
  parent?: string
  partOfSpeech?: string
  existingTags: string[]
}): string[] {
  const { rawTags, word = '', parent = '', partOfSpeech = '', existingTags } = args
  if (!rawTags || rawTags.length === 0 || !existingTags || existingTags.length === 0) {
    return []
  }

  const existingSet = new Set(existingTags.map((t) => t.trim()))
  const validCandidates = rawTags
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t && existingSet.has(t))

  if (validCandidates.length === 0) return []
  if (validCandidates.length === 1) return [validCandidates[0]]

  const isInflected = Boolean(
    (parent && parent.trim().toLowerCase() !== word.trim().toLowerCase()) ||
    /conjug|past|inflect|participle|plur/i.test(partOfSpeech)
  )

  const isExpression = Boolean(
    /\s+/.test(word.trim()) ||
    /expression|idiom|phrasal|locution|collocation/i.test(partOfSpeech)
  )

  const getTagScore = (tag: string): number => {
    const t = tag.toLowerCase()

    // 1. Conjugated verb tags
    const isConjugatedTag = /conjugu|conjug|irrégulier|irregular/i.test(t)
    if (isConjugatedTag) {
      return isInflected ? 100 : 80
    }

    // 2. Expression / phrasal tags
    const isExpressionTag = /phrasal|expression|idiom|locution|colloc/i.test(t)
    if (isExpressionTag) {
      return isExpression ? 95 : 75
    }

    // 3. Generic single-word category tags like "verbe", "nom", "verb", "noun", etc.
    const isGeneric = /^(verbe|verb|verbo|nom|noun|sustantivo|adjectif|adjective|adjetivo|adverbe|adverb|adverbio|autre|other)$/i.test(t)
    if (isGeneric) {
      return 10
    }

    // 4. Other custom tags: prefer longer/more specific tags
    return 30 + Math.min(tag.length, 20)
  }

  const sorted = [...validCandidates].sort((a, b) => getTagScore(b) - getTagScore(a))
  return [sorted[0]]
}

/**
 * Checks if a word or item represents a universal entity or proper noun (e.g. person names, cities, countries, brands)
 * that should not be extracted as vocabulary to study/translate.
 */
export function isUniversalProperNoun(item: {
  word: string
  translation?: string
  partOfSpeech?: string
}): boolean {
  const { word, translation = '', partOfSpeech = '' } = item
  const cleanWord = word.trim()
  if (!cleanWord) return true

  const pos = partOfSpeech.toLowerCase()
  if (
    pos.includes('proper noun') ||
    pos.includes('proper name') ||
    pos.includes('nom propre') ||
    pos.includes('nombre propio') ||
    pos.includes('person') ||
    pos.includes('city') ||
    pos.includes('country') ||
    pos.includes('location')
  ) {
    return true
  }

  // Check if word is capitalized (like "Harry", "London", "France") and translation is identical or nearly identical
  const cleanTrans = translation.trim()
  if (/^[A-Z][a-z]+$/.test(cleanWord) && cleanTrans.toLowerCase() === cleanWord.toLowerCase()) {
    const isDayOrMonth = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(cleanWord)
    if (!isDayOrMonth) {
      return true
    }
  }

  return false
}

/**
 * Analyzes a word using the main AI agent configured in Settings (or taskModelWordAnalysis override).
 * Generates US IPA pronunciation (with bold markdown on stressed syllable and ' · ' separators for multi-syllables,
 * clean IPA for single syllables), accurate translations in the user's interface language (up to 3 comma-separated meanings),
 * and matches at most ONE applicable tag strictly from the user's existing tags list (prioritizing specific tags like "verbe conjugué").
 */
export async function analyzeWordWithAi(args: {
  word: string
  targetLang: Language
  uiLang: string
  existingTags: string[]
  api: ApiSettings
  contextSentence?: string
  fallbackTranslation?: string
}): Promise<AiWordAnalysisResult> {
  const { word, targetLang, uiLang, existingTags, api, contextSentence, fallbackTranslation } = args
  const clean = word.trim().replace(/^[.,!?;:()"“”«»\s]+|[.,!?;:()"“”«»\s]+$/g, '')

  if (!clean) {
    return {
      word: '',
      translation: fallbackTranslation || '',
      pronunciation: '',
      parent: '',
      partOfSpeech: '',
      tags: [],
    }
  }

  const agentConfig = getAgentConfig(api, api.taskModelWordAnalysis)

  if (agentConfig) {
    try {
      const targetLangName = getLanguageName(targetLang)
      const uiLangName = getUiLanguageName(uiLang as UiLanguage)
      const prompt = `You are a linguistics and language learning dictionary assistant.
Target language: ${targetLangName}.
Learner interface language: ${uiLangName}.
Word to analyze: "${clean}".
Context: "${contextSentence || ''}".
User's existing vocabulary tags: ${JSON.stringify(existingTags)}.

Tasks:
1. "word": provide the exact word or canonical form "${clean}".
2. "translation": provide the concise and accurate translation in ${uiLangName}. If the word has multiple common meanings or nuances, provide up to 3 translations separated by commas and a space (e.g. "serrer, resserrer, tendre").
3. "pronunciation": provide standard IPA transcription for ${targetLangName} enclosed in slashes.
   - For single-syllable words (e.g. "coat", "train", "was", "saw"), provide clean IPA without bold or stress markers (e.g. "/koʊt/", "/treɪn/", "/wɒz/", "/sɔː/").
   - For multi-syllable words, mark syllable boundaries with " · " and the primary stressed syllable formatted in markdown bold (**syllable**), without "'" or "ˈ" stress markers (e.g. "/**taɪ** · tən/", "/kəm · **pjuː** · tər/").
   - CRITICAL: Never output unclosed bold asterisks like "/**word/".
4. "parent": if "${clean}" is an inflected/conjugated form (e.g. "went" -> "go", "was" -> "be", "speaking" -> "speak"), provide the base lemma; otherwise empty string "".
5. "partOfSpeech": noun, verb, adjective, adverb, expression, or phrase.
6. "tags": an array containing AT MOST ONE tag strictly from the User's existing vocabulary tags list (${JSON.stringify(existingTags)}).
   CRITICAL RULES FOR TAGS:
   - NEVER return more than 1 tag. Limit the array to ["tag"] or [].
   - Pick the single most specific tag that applies:
     - If the word is a conjugated verb (e.g. "saw", "was", "went"), select ONLY "verbe conjugué" / "verbe conjugé" / "conjugated verb" (if present in the list) and NEVER "verbe" / "verb".
     - If the item is an expression or phrasal verb, choose the expression/phrasal tag over a generic tag.
     - If no specific tag matches, choose the single best category tag or [] if none match.

Return ONLY a JSON object with this exact structure (no other markdown or commentary):
{
  "word": "${clean}",
  "translation": "...",
  "pronunciation": "/.../",
  "parent": "...",
  "partOfSpeech": "...",
  "tags": []
}`

      const response = await fetch(agentConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agentConfig.key}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
          'X-Title': 'Language Learning App - Word AI',
        },
        body: JSON.stringify({
          model: agentConfig.model,
          messages: [
            {
              role: 'system',
              content: 'You are a precise linguistics AI helper. You output pure JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const content = extractAiContent(data)
        if (content) {
          const parsed = extractCleanJson<Partial<AiWordAnalysisResult>>(content)
          const formattedPronunciation = formatIpaPronunciation(parsed.pronunciation || '')
          const singleBestTag = selectBestSingleTag({
            rawTags: parsed.tags,
            word: clean,
            parent: parsed.parent || '',
            partOfSpeech: parsed.partOfSpeech || '',
            existingTags,
          })

          return {
            word: parsed.word || clean,
            translation: parsed.translation || fallbackTranslation || clean,
            pronunciation: formattedPronunciation,
            parent: parsed.parent || '',
            partOfSpeech: parsed.partOfSpeech || '',
            tags: singleBestTag,
          }
        }
      }
    } catch (err) {
      console.warn('[wordAiService] AI word analysis failed, using fallback:', err)
    }
  }

  // Graceful fallback when no key or network issue
  return {
    word: clean,
    translation: fallbackTranslation || clean,
    pronunciation: '',
    parent: '',
    partOfSpeech: '',
    tags: [],
  }
}

/** Tests an AI Agent connection by sending a lightweight prompt. */
export async function testAgentConnection(
  api: ApiSettings,
  overrideModel?: string,
): Promise<{ ok: boolean; model: string; error?: string }> {
  const config = getAgentConfig(api, overrideModel)
  if (!config || !config.key) {
    return { ok: false, model: '', error: 'Aucune clé API renseignée pour ce fournisseur' }
  }
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Say "OK" in one single word.' }],
        max_tokens: 300,
        temperature: 0.1,
      }),
    })
    if (!response.ok) {
      const err = await response.text().catch(() => '')
      return { ok: false, model: config.model, error: `HTTP ${response.status}: ${err.slice(0, 180)}` }
    }
    const data = await response.json()
    const reply = extractAiContent(data) || 'OK'
    return { ok: true, model: config.model, error: reply ? undefined : 'Réponse vide' }
  } catch (caught) {
    return { ok: false, model: config.model, error: caught instanceof Error ? caught.message : 'Erreur réseau' }
  }
}

export type PageVocabularyItem = {
  word: string
  translation: string
  pronunciation: string
  parent: string
  partOfSpeech: string
  contextSentence: string
  tags: string[]
}

/**
 * Intelligently analyzes a reading page or text in full context using the configured AI agent.
 * - Identifies multi-word expressions, idioms, phrasal verbs, and collocations (e.g. "far end", "look forward to")
 *   so they are saved as a single unit without separate constituent words.
 * - Strictly ignores universal proper nouns (person first/last names, cities, countries, landmarks, brand names).
 * - Strictly ignores words/expressions that the user has already saved.
 * - Extracts all new words/expressions with contextual translation, clean IPA pronunciation, root lemma, and at most 1 tag.
 */
export async function extractAndAnalyzePageVocabularyWithAi(args: {
  text: string
  targetLang: Language
  uiLang: string
  existingWords: string[]
  existingTags: string[]
  api: ApiSettings
}): Promise<PageVocabularyItem[]> {
  const { text, targetLang, uiLang, existingWords, existingTags, api } = args
  const cleanText = text.trim()
  if (!cleanText) return []

  const agentConfig = getAgentConfig(api, api.taskModelWordAnalysis)
  if (!agentConfig || !agentConfig.key) {
    return []
  }

  const targetLangName = getLanguageName(targetLang)
  const uiLangName = getUiLanguageName(uiLang as UiLanguage)

  // Pass a concise sample or slice of existing words if large to keep within prompt limits
  const sampleExisting = existingWords.slice(0, 600)

  const systemPrompt = `You are an expert linguistics and language learning dictionary assistant.
Target language: ${targetLangName}.
Learner UI language: ${uiLangName}.

The user is reading a text and wants to automatically record all new vocabulary words and expressions from this page into their personal dictionary.

CRITICAL LINGUISTIC RULES:
1. CONTEXTUAL EXPRESSIONS & LINKED WORDS (MANDATORY):
   Analyze the context of every sentence. Whenever words together form a multi-word expression, phrasal verb, idiomatic phrase, collocation, or compound unit that has a distinct combined meaning (e.g. "far end", "waiting for", "look forward to", "take care of", "as well as", "at all costs", "stand out", "on purpose"), extract the ENTIRE expression as a single item.
   Example: In "She saw him standing at the far end of the platform", "far end" is a linked expression forming a distinct meaning ("far end" = extremity/furthest point). Save "far end" as a single expression.
   CRITICAL: When you extract a multi-word expression (e.g. "far end"), NEVER extract its individual constituent words ("far", "end") separately! The expression takes precedence.

2. DO NOT EXTRACT OR TRANSLATE UNIVERSAL WORDS & PROPER NOUNS (MANDATORY):
   - NEVER extract, translate, or save proper names, person names (first names, surnames, e.g. "Harry", "John", "Smith", "Potter", "Marie", "Dupont"), fictional character names, or real people.
   - NEVER extract, translate, or save names of cities, towns, regions, countries, geographical places, or landmarks (e.g. "London", "Paris", "New York", "Tokyo", "England", "France", "Thames").
   - NEVER extract brand names, company names, or universal proper nouns that are identical or untranslated across languages.
   - ONLY extract meaningful vocabulary words, contextual expressions, idioms, and phrasal verbs that a language learner needs to study.

3. LEMMATIZATION, NO REDUNDANT PLURALS OR 3RD-PERSON "-S" (MANDATORY):
   - Always extract the CANONICAL BASE / SINGULAR form of regular words (e.g. extract "train", NOT "trains"; "coat", NOT "coats"; "car", NOT "cars"; "door", NOT "doors"; "walk", NOT "walks").
   - NEVER extract both the singular and the plural form of the same word (e.g. if the text contains both "train" and "trains", extract ONLY "train").
   - NEVER extract simple regular plurals ending in "-s", "-es", "-ies" as distinct separate words when the singular base word is already recorded or being recorded.
   - NEVER extract regular 3rd-person singular present verbs ending in "-s" / "-es" (e.g. "walks", "looks", "runs", "says") as separate words; always use the base infinitive/lemma form ("walk", "look", "run", "say").
   - Distinct irregular inflections (like irregular past tense "saw" -> "see", "went" -> "go", "was" -> "be", or irregular plurals like "children" -> "child") can be recorded with their base parent lemma, but standard regular "-s" plurals and "-s" 3rd person forms MUST be avoided.

4. DO NOT SAVE ALREADY RECORDED WORDS (MANDATORY):
   The user already has the following words/expressions in their vocabulary dictionary:
   ${JSON.stringify(sampleExisting)}
   DO NOT extract or include any word, expression, regular plurals (-s), or direct inflections of items in this list. (For example, if "train" is in the list, do NOT extract "train" or "trains").

5. INDIVIDUAL WORDS:
   Extract all other non-trivial, meaningful vocabulary words from the text that are not part of multi-word expressions, not universal proper nouns, and not in the already recorded list. Ignore pure numbers or single-letter punctuation noise.

6. REQUIRED JSON STRUCTURE FOR EACH ITEM:
   For every extracted word or expression, provide:
   - "word": exact word or expression in canonical base / singular form (e.g. "train", "far end", "platform", "stand out").
   - "translation": concise and accurate translation in ${uiLangName} adapted to this specific context. If there are multiple common nuances, provide up to 3 translations separated by commas (e.g. "au bout, à l'extrémité").
   - "pronunciation": standard IPA transcription for ${targetLangName} enclosed in slashes.
     * For single-syllable words (e.g. "coat", "train", "was", "saw"), provide clean IPA without bold or stress markers (e.g. "/koʊt/", "/treɪn/", "/wɒz/", "/sɔː/").
     * For multi-syllable words, mark syllable boundaries with " · " and the primary stressed syllable in bold markdown (**syllable**), e.g. "/**taɪ** · tən/", "/ˌfɑːr · **end**/", "/ˈplæt · fɔːrm/".
     * NEVER output unclosed asterisks like "/**word/".
   - "parent": base lemma/infinitive if inflected (e.g. "standing" -> "stand", "saw" -> "see", "went" -> "go"), or empty string "".
   - "partOfSpeech": "expression", "phrasal verb", "idiom", "noun", "verb", "adjective", "adverb", etc.
   - "contextSentence": the exact sentence from the text containing this word or expression.
   - "tags": an array of AT MOST ONE tag strictly matching the User's existing vocabulary tags: ${JSON.stringify(existingTags)}.
     CRITICAL: NEVER include more than 1 tag. If the word is a conjugated verb (e.g. "saw", "was", "went"), select ONLY "verbe conjugué" / "verbe conjugé" / "conjugated verb" (if in the user's tags) and NEVER "verbe" or "verb". If none match, return [].

Return ONLY a valid JSON array of objects with no surrounding commentary or markdown code blocks:`

  const userPrompt = `Text to analyze:\n"""\n${cleanText}\n"""`

  try {
    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentConfig.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App - Batch Reader Word AI',
      },
      body: JSON.stringify({
        model: agentConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 3500,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.warn('[wordAiService] Batch vocabulary AI failed with status:', response.status, errText)
      return []
    }

    const data = await response.json()
    const content = extractAiContent(data)
    if (!content) return []

    const parsed = extractCleanJson<PageVocabularyItem[]>(content)
    if (!Array.isArray(parsed)) return []

    const seenBatchVariants = new Set<string>()

    return parsed
      .filter((item) => {
        if (!item || typeof item.word !== 'string' || item.word.trim().length === 0) return false
        // Filter out universal proper nouns / names / cities
        if (isUniversalProperNoun(item)) return false

        const norm = normalizeWord(item.word)
        if (!norm) return false
        const parentNorm = item.parent ? normalizeWord(item.parent) : ''
        const variants = getInflectionVariants(norm)
        const parentVariants = parentNorm ? getInflectionVariants(parentNorm) : []

        // If any singular/plural variant was already seen in this batch response, drop the duplicate
        if (
          variants.some((v) => seenBatchVariants.has(v)) ||
          parentVariants.some((v) => seenBatchVariants.has(v))
        ) {
          return false
        }

        // Register all variants as seen for this batch
        for (const v of variants) seenBatchVariants.add(v)
        for (const v of parentVariants) seenBatchVariants.add(v)

        return true
      })
      .map((item) => {
        const cleanWord = item.word.trim().replace(/^[.,!?;:()"“”«»'’\s]+|[.,!?;:()"“”«»'’\s]+$/g, '')
        const singleBestTag = selectBestSingleTag({
          rawTags: item.tags,
          word: cleanWord,
          parent: item.parent || '',
          partOfSpeech: item.partOfSpeech || '',
          existingTags,
        })

        return {
          word: cleanWord,
          translation: (item.translation || cleanWord).trim(),
          pronunciation: formatIpaPronunciation(item.pronunciation || ''),
          parent: (item.parent || '').trim(),
          partOfSpeech: (item.partOfSpeech || '').trim(),
          contextSentence: (item.contextSentence || '').trim(),
          tags: singleBestTag,
        }
      })
  } catch (err) {
    console.warn('[wordAiService] Batch vocabulary extraction error:', err)
    return []
  }
}

