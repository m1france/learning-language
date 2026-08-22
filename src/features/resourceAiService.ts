import type { ApiSettings, Difficulty, Language, Resource } from '../domain'
import { id } from '../domain'
import { paragraphsToResource, autoDifficulty } from '../importer'
import { getAgentConfig } from './speaking/wordAiService'

export type GeneratedResourceResult = {
  title: string
  author: string
  paragraphs: string[]
  difficulty: Difficulty
  category: string
}

const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  beginner: 'Beginner (A1-A2 level): Short, clear sentences, essential vocabulary, simple verb tenses, easy to understand.',
  intermediate: 'Intermediate (B1-B2 level): Natural narrative flow, varied vocabulary, common idiomatic expressions, engaging paragraphs.',
  advanced: 'Advanced (C1 level): Sophisticated vocabulary, complex sentence structures, nuance, literary or professional depth.',
  native: 'Native (C2 level): Authentic, unconstrained native literary/journalistic style, rich idioms and phrasing.',
}

/**
 * Generates an original story or article tailored to the learner's chosen level
 * using the configured AI agent (or taskModelResourceGeneration override).
 */
export async function generateResourceWithAi(args: {
  prompt?: string
  isRandom?: boolean
  difficulty: Difficulty
  language: Language
  existingCategories?: string[]
  api: ApiSettings
}): Promise<{ ok: true; resourceData: GeneratedResourceResult } | { ok: false; error: string }> {
  const { prompt, isRandom, difficulty, language, existingCategories = [], api } = args

  const agentConfig = getAgentConfig(api, api.taskModelResourceGeneration)
  if (!agentConfig || !agentConfig.key) {
    return {
      ok: false,
      error: 'Aucune clé API configurée pour l’agent IA. Renseigne ta clé dans les Paramètres (section Connexions).',
    }
  }

  const langName = language === 'fr' ? 'French' : 'English (US)'
  const levelInfo = DIFFICULTY_DESCRIPTIONS[difficulty] || DIFFICULTY_DESCRIPTIONS.intermediate

  const validCategoriesList = [
    'story',
    'article',
    'culture',
    'script',
    'book',
    'news',
    'scientific',
    ...existingCategories,
  ]

  const userInstruction = isRandom || !prompt?.trim()
    ? 'Invent a creative, captivating, and original topic (e.g. a mystery, an adventure, a slice of life, a cultural exploration, or a fascinating science story).'
    : `The user wants a story/article with this specific prompt / instructions: "${prompt.trim()}".`

  const systemPrompt = `You are a master creative writer and language learning author.
Target Language for the text: ${langName}.
Target Difficulty Level: ${levelInfo}
Available Categories: ${JSON.stringify(validCategoriesList)}.

Your mission:
Write an engaging, well-crafted, beautifully written text in ${langName} adapted perfectly to the target level.
- Length: 4 to 8 substantial paragraphs (approx. 250 - 600 words).
- Format: Return ONLY a valid JSON object (no markdown surrounding, no conversational intro).

JSON Schema:
{
  "title": "A captivating title in ${langName}",
  "author": "Author name or 'AI Storyteller'",
  "category": "one category strictly from the Available Categories list",
  "paragraphs": [
    "First paragraph...",
    "Second paragraph...",
    "Third paragraph..."
  ]
}`

  try {
    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentConfig.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App',
      },
      body: JSON.stringify({
        model: agentConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInstruction },
        ],
        temperature: isRandom ? 0.85 : 0.7,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      return {
        ok: false,
        error: `Erreur API IA (${response.status}): ${errText.slice(0, 150)}`,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        ok: false,
        error: 'L’IA n’a pas retourné de format JSON valide. Réessaie avec un autre modèle.',
      }
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedResourceResult>
    const title = (parsed.title || 'Nouvelle ressource').trim()
    const author = (parsed.author || 'IA Storyteller').trim()
    const paragraphs = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs.map((p) => String(p).trim()).filter((p) => p.length > 5)
      : []

    if (paragraphs.length === 0) {
      return { ok: false, error: 'Le texte généré est vide. Réessaie.' }
    }

    let category = (parsed.category || 'story').trim()
    if (!validCategoriesList.includes(category)) {
      category = 'story'
    }

    return {
      ok: true,
      resourceData: {
        title,
        author,
        paragraphs,
        difficulty,
        category,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur de communication avec l’IA.',
    }
  }
}

/**
 * Extracts and cleans the essential article/story content from raw webpage HTML or text
 * using the AI agent, stripping out ads, menus, cookies, and footers.
 */
export async function extractUrlWithAi(args: {
  rawHtmlOrText: string
  url: string
  language: Language
  existingCategories?: string[]
  api: ApiSettings
}): Promise<GeneratedResourceResult | null> {
  const { rawHtmlOrText, url, language, existingCategories = [], api } = args

  const agentConfig = getAgentConfig(api, api.taskModelUrlExtraction)
  if (!agentConfig || !agentConfig.key) return null

  // Strip excessive whitespace and truncate to reasonable context window size
  const sanitizedInput = rawHtmlOrText.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 14000)

  if (sanitizedInput.length < 50) return null

  const validCategoriesList = [
    'story',
    'article',
    'culture',
    'script',
    'book',
    'news',
    'scientific',
    ...existingCategories,
  ]

  const prompt = `You are an expert web text extractor and content cleaner for language learners.
Source URL: ${url}
Target Language: ${language === 'fr' ? 'French' : 'English'}
Available Categories: ${JSON.stringify(validCategoriesList)}

Input Page Content:
"""${sanitizedInput}"""

Your task:
1. Extract the actual main article, news or story text from the page content.
2. Completely remove all navigation links, cookie notices, sidebars, advertisement text, footers, author bios, and unrelated noise.
3. Split the cleaned text into coherent paragraphs.
4. Detect the appropriate title, author, difficulty ('beginner', 'intermediate', 'advanced', or 'native') and best fitting category.

Return ONLY a JSON object:
{
  "title": "...",
  "author": "...",
  "category": "...",
  "difficulty": "intermediate",
  "paragraphs": ["...", "..."]
}`

  try {
    const response = await fetch(agentConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentConfig.key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
        'X-Title': 'Language Learning App',
      },
      body: JSON.stringify({
        model: agentConfig.model,
        messages: [
          {
            role: 'system',
            content: 'You are a precise article extraction engine. You output pure JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content?.trim() || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedResourceResult>
        if (Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0) {
          const validDifficulty: Difficulty =
            parsed.difficulty === 'beginner' ||
            parsed.difficulty === 'intermediate' ||
            parsed.difficulty === 'advanced' ||
            parsed.difficulty === 'native'
              ? parsed.difficulty
              : 'intermediate'

          const validCategory = validCategoriesList.includes(parsed.category || '')
            ? (parsed.category as string)
            : 'article'

          return {
            title: parsed.title?.trim() || 'Article importé',
            author: parsed.author?.trim() || new URL(url.startsWith('http') ? url : `https://${url}`).hostname,
            paragraphs: parsed.paragraphs.map((p) => String(p).trim()).filter((p) => p.length > 10),
            difficulty: validDifficulty,
            category: validCategory,
          }
        }
      }
    }
  } catch (err) {
    console.warn('[extractUrlWithAi] AI extraction failed, fallback to standard parser:', err)
  }

  return null
}
