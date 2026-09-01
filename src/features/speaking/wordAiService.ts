import type { ApiSettings, Language, UiLanguage } from '../../domain'
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
 * Analyzes a word using the main AI agent configured in Settings (or taskModelWordAnalysis override).
 * Generates US IPA pronunciation (with bold markdown on stressed syllable and ' · ' separators),
 * accurate translations in the user's interface language (up to 3 comma-separated meanings),
 * and matches applicable tags strictly from the user's existing tags list.
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
3. "pronunciation": provide standard IPA transcription for ${targetLangName} enclosed in slashes. Represent syllable boundaries with " · " and the primary stressed syllable formatted in markdown bold (**syllable**), without the "'" or "ˈ" stress marker (e.g. "/**taɪ** · tən/", "/kəm · **pjuː** · tər/", "/**wɔː** · tər/").
4. "parent": if "${clean}" is an inflected/conjugated form (e.g. "went" -> "go", "speaking" -> "speak"), provide the base lemma; otherwise empty string "".
5. "partOfSpeech": noun, verb, adjective, adverb, expression, or phrase.
6. "tags": an array of tags. IMPORTANT: ONLY include tags that strictly exist in the User's existing vocabulary tags list (${JSON.stringify(existingTags)}). If none match or the list is empty, return an empty array [].

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
          const validTags = Array.isArray(parsed.tags)
            ? parsed.tags.filter((t) => typeof t === 'string' && existingTags.includes(t))
            : []

          const formattedPronunciation = formatIpaPronunciation(parsed.pronunciation || '')

          return {
            word: parsed.word || clean,
            translation: parsed.translation || fallbackTranslation || clean,
            pronunciation: formattedPronunciation,
            parent: parsed.parent || '',
            partOfSpeech: parsed.partOfSpeech || '',
            tags: validTags,
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
 * - Strictly ignores words/expressions that the user has already saved.
 * - Extracts all new words/expressions with contextual translation, IPA pronunciation, root lemma, and tags.
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

2. DO NOT SAVE ALREADY RECORDED WORDS (MANDATORY):
   The user already has the following words/expressions in their vocabulary dictionary:
   ${JSON.stringify(sampleExisting)}
   DO NOT extract or include any word, expression, or direct inflections of items in this list.

3. INDIVIDUAL WORDS:
   Extract all other non-trivial, meaningful words from the text that are not part of multi-word expressions and not in the already recorded list. Ignore pure numbers or single-letter punctuation noise.

4. REQUIRED JSON STRUCTURE FOR EACH ITEM:
   For every extracted word or expression, provide:
   - "word": exact word or expression in base or contextual form (e.g. "far end", "platform", "stand out").
   - "translation": concise and accurate translation in ${uiLangName} adapted to this specific context. If there are multiple common nuances, provide up to 3 translations separated by commas (e.g. "au bout, à l'extrémité").
   - "pronunciation": standard IPA transcription for ${targetLangName} enclosed in slashes, with syllable boundaries marked by " · " and the primary stressed syllable in bold markdown (e.g. "/ˌfɑːr **end**/", "/ˈplæt · fɔːrm/").
   - "parent": base lemma/infinitive if inflected (e.g. "standing" -> "stand", "went" -> "go"), or empty string "".
   - "partOfSpeech": "expression", "phrasal verb", "idiom", "noun", "verb", "adjective", "adverb", etc.
   - "contextSentence": the exact sentence from the text containing this word or expression.
   - "tags": an array of tags strictly matching the User's existing vocabulary tags: ${JSON.stringify(existingTags)}. If none match, return [].

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

    const validExistingTags = new Set(existingTags)

    return parsed
      .filter((item) => item && typeof item.word === 'string' && item.word.trim().length > 0)
      .map((item) => {
        const cleanWord = item.word.trim().replace(/^[.,!?;:()"“”«»'’\s]+|[.,!?;:()"“”«»'’\s]+$/g, '')
        const rawTags = Array.isArray(item.tags) ? item.tags : []
        const filteredTags = rawTags.filter((t) => typeof t === 'string' && validExistingTags.has(t))

        return {
          word: cleanWord,
          translation: (item.translation || cleanWord).trim(),
          pronunciation: formatIpaPronunciation(item.pronunciation || ''),
          parent: (item.parent || '').trim(),
          partOfSpeech: (item.partOfSpeech || '').trim(),
          contextSentence: (item.contextSentence || '').trim(),
          tags: filteredTags,
        }
      })
  } catch (err) {
    console.warn('[wordAiService] Batch vocabulary extraction error:', err)
    return []
  }
}

