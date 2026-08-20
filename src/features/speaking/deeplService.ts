export type DeepLTranslationResult = {
  translatedText: string
  sourceText: string
  detectedSourceLang?: string
  targetLang: string
  provider: 'deepl' | 'fallback'
  error?: string
}

export function getDeepLWebUrl(text: string, targetLang: string = 'EN'): string {
  const target = targetLang.toLowerCase().slice(0, 2)
  return `https://www.deepl.com/translator#fr/${target}/${encodeURIComponent(text)}`
}

/**
 * Traduit un texte avec l'API officielle DeepL (Free ou Pro).
 * Si aucune clé n'est fournie ou en cas d'échec réseau, utilise un fallback gratuit instantané.
 */
export async function translateText(
  text: string,
  apiKey?: string,
  targetLang: string = 'EN-US',
  sourceLang: string = 'FR',
): Promise<DeepLTranslationResult> {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      translatedText: '',
      sourceText: '',
      targetLang,
      provider: 'deepl',
    }
  }

  // 1. Essai avec l'API officielle DeepL si une clé est configurée
  if (apiKey && apiKey.trim()) {
    try {
      const key = apiKey.trim()
      const isFreeKey = key.endsWith(':fx')
      const endpoint = isFreeKey
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [trimmed],
          target_lang: targetLang.toUpperCase(),
          source_lang: sourceLang.toUpperCase(),
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as {
          translations?: Array<{ text: string; detected_source_language?: string }>
        }
        if (data.translations && data.translations.length > 0) {
          return {
            translatedText: data.translations[0].text,
            sourceText: trimmed,
            detectedSourceLang: data.translations[0].detected_source_language,
            targetLang,
            provider: 'deepl',
          }
        }
      } else {
        const errBody = await response.text().catch(() => '')
        console.warn(`[DeepL API] Erreur ${response.status}: ${errBody}`)
      }
    } catch (e) {
      console.warn('[DeepL API] Échec de la requête réseau, passage au fallback:', e)
    }
  }

  // 2. Fallback gratuit ultra-rapide (Google Translate public)
  try {
    const tl = targetLang.toLowerCase().slice(0, 2)
    const sl = sourceLang.toLowerCase().slice(0, 2)
    const fallbackUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(trimmed)}`
    
    const response = await fetch(fallbackUrl)
    if (response.ok) {
      const data = (await response.json()) as any
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const fullTranslation = data[0]
          .map((chunk: any) => (Array.isArray(chunk) && chunk[0] ? chunk[0] : ''))
          .join('')
        if (fullTranslation) {
          return {
            translatedText: fullTranslation,
            sourceText: trimmed,
            targetLang,
            provider: 'fallback',
          }
        }
      }
    }
  } catch (e) {
    console.error('[Translation Fallback] Erreur:', e)
  }

  return {
    translatedText: trimmed,
    sourceText: trimmed,
    targetLang,
    provider: 'fallback',
    error: 'Impossible de traduire pour le moment',
  }
}
