/**
 * Utility functions for handling AI responses from OpenRouter and various LLM providers,
 * especially reasoning models (Nemotron, DeepSeek R1, QwQ, etc.) that output thoughts
 * into separate fields or markdown tags and may fail if response_format is enforced.
 */

/**
 * Checks if a model name corresponds to a reasoning / thinking model.
 */
export function isReasoningModel(modelName?: string): boolean {
  if (!modelName) return false
  const lower = modelName.toLowerCase()
  return (
    lower.includes('reasoning') ||
    lower.includes('reasoner') ||
    lower.includes('r1') ||
    lower.includes('qwq') ||
    lower.includes('nemotron') ||
    lower.includes('deepseek-r1') ||
    lower.includes('thinking') ||
    lower.includes('o1') ||
    lower.includes('o3')
  )
}

/**
 * Extracts raw textual content from an OpenAI/OpenRouter-compatible completion response data object.
 * Checks `message.content`, `choice.text`, `message.reasoning`, `message.reasoning_content`, `message.thought`.
 */
export function extractAiContent(data: any): string {
  if (!data) return ''

  const choice = data.choices?.[0]
  if (!choice) {
    if (typeof data.text === 'string') return data.text
    if (typeof data.content === 'string') return data.content
    return ''
  }

  const message = choice.message

  // 1. Direct message.content (string or array of text parts)
  if (message) {
    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim()
    }
    if (Array.isArray(message.content)) {
      const joined = message.content
        .map((p: any) => (typeof p === 'string' ? p : p?.text || ''))
        .join('\n')
        .trim()
      if (joined) return joined
    }

    // 2. OpenRouter reasoning fields (common when content is empty or model outputs thought)
    if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
      return message.reasoning.trim()
    }
    if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
      return message.reasoning_content.trim()
    }
    if (typeof message.thought === 'string' && message.thought.trim()) {
      return message.thought.trim()
    }
  }

  // 3. Fallback to choice.text (used by some completion APIs)
  if (typeof choice.text === 'string' && choice.text.trim()) {
    return choice.text.trim()
  }

  return ''
}

/**
 * Robustly parses a JSON object or array from raw AI output.
 * Handles:
 * - Markdown codeblocks (```json ... ``` or ``` ...)
 * - <think>...</think> reasoning blocks
 * - Trailing commentary or leading notes
 * - Embedded JSON substring { ... } or [ ... ]
 */
export function extractCleanJson<T = any>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error('Réponse vide retournée par l’IA')
  }

  let text = rawText.trim()

  // If text contains reasoning <think> tags:
  // First try extracting after </think> if non-empty, else keep the whole text
  if (text.includes('</think>')) {
    const afterThink = text.slice(text.indexOf('</think>') + 8).trim()
    if (afterThink && (afterThink.includes('{') || afterThink.includes('['))) {
      text = afterThink
    } else {
      // JSON might be inside the thinking tag
      text = text.replace(/<\/?think>/gi, '').trim()
    }
  }

  // Strip markdown code fences
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // Direct parse attempt
  try {
    return JSON.parse(text) as T
  } catch {
    // 1. Try finding outermost object { ... }
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1)
      try {
        return JSON.parse(candidate) as T
      } catch {
        // Try sanitized candidate (replace non-standard quotes/linebreaks if needed)
      }
    }

    // 2. Try finding outermost array [ ... ]
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const candidate = text.slice(firstBracket, lastBracket + 1)
      try {
        return JSON.parse(candidate) as T
      } catch {
        // Continue to final throw
      }
    }

    throw new Error('Impossible de décoder la structure JSON dans la réponse de l’IA.')
  }
}
