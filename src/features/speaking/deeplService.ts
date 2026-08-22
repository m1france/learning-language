import type { ApiSettings } from '../../domain'
import { getAgentConfig } from './wordAiService'

export type DeepLTranslationResult = {
  translatedText: string
  sourceText: string
  detectedSourceLang?: string
  targetLang: string
  provider: 'deepl' | 'ai' | 'fallback'
  error?: string
}

export function getDeepLWebUrl(text: string, targetLang: string = 'EN'): string {
  const target = targetLang.toLowerCase().slice(0, 2)
  return `https://www.deepl.com/translator#fr/${target}/${encodeURIComponent(text)}`
}

/**
 * Traduit un texte avec l'API officielle DeepL (Free ou Pro).
 * Supporte le proxy Vite de dev pour éviter les blocages CORS du navigateur.
 * En cas d'indisponibilité, utilise l'Agent IA configuré ou le fallback Google Translate.
 */
export async function translateText(
  text: string,
  apiOrKey?: ApiSettings | string,
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

  const apiKey = typeof apiOrKey === 'string' ? apiOrKey : apiOrKey?.deepLKey
  const apiSettings = typeof apiOrKey === 'object' ? apiOrKey : undefined
  const preferAi = apiSettings?.speakingTranslationProvider === 'ai'

  const tryAiTranslate = async (): Promise<DeepLTranslationResult | null> => {
    if (!apiSettings) return null
    const agent = getAgentConfig(apiSettings, apiSettings.taskModelSpeakingTranslation)
    if (!agent || !agent.key) return null
    try {
      const prompt = `Translate the following ${sourceLang} text into ${targetLang}. Return ONLY the translation, without any quote marks, markdown or commentary.\n\n"${trimmed}"`
      const response = await fetch(agent.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agent.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://learning-language.app',
          'X-Title': 'Language Learning App',
        },
        body: JSON.stringify({
          model: agent.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 150,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const translation = data.choices?.[0]?.message?.content?.trim()?.replace(/^["'«»]+|["'«»]+$/g, '')
        if (translation) {
          return {
            translatedText: translation,
            sourceText: trimmed,
            targetLang,
            provider: 'ai',
          }
        }
      }
    } catch (aiErr) {
      console.warn('[AI Translation] Échec de l’agent IA:', aiErr)
    }
    return null
  }

  const tryDeepLTranslate = async (): Promise<DeepLTranslationResult | null> => {
    if (!apiKey || !apiKey.trim()) return null
    const key = apiKey.trim()
    const isFreeKey = key.endsWith(':fx')
    
    const isLocalhost = typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0'
    )
    const proxyEndpoint = isFreeKey ? '/api-deepl-free/v2/translate' : '/api-deepl-pro/v2/translate'
    const directEndpoint = isFreeKey ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate'

    const endpointsToTry = isLocalhost ? [proxyEndpoint, directEndpoint] : [directEndpoint, proxyEndpoint]

    for (const endpoint of endpointsToTry) {
      try {
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
          console.warn(`[DeepL API] Erreur ${response.status} sur ${endpoint}: ${errBody}`)
        }
      } catch (e) {
        console.warn(`[DeepL API] Requête réseau impossible sur ${endpoint} (CORS ou hors-ligne):`, e)
      }
    }
    return null
  }

  // 1. Essai selon la préférence utilisateur (AI ou DeepL)
  if (preferAi) {
    const aiRes = await tryAiTranslate()
    if (aiRes) return aiRes
    const deeplRes = await tryDeepLTranslate()
    if (deeplRes) return deeplRes
  } else {
    const deeplRes = await tryDeepLTranslate()
    if (deeplRes) return deeplRes
    const aiRes = await tryAiTranslate()
    if (aiRes) return aiRes
  }

  // 3. Fallback gratuit ultra-rapide (Google Translate public)
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

/** Teste la clé API DeepL avec un mot simple. */
export async function testDeepLConnection(
  apiKey: string,
): Promise<{ ok: boolean; provider: 'deepl' | 'fallback'; translation: string; error?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, provider: 'fallback', translation: '', error: 'Veuillez saisir une clé API DeepL.' }
  }
  const result = await translateText('Bonjour', apiKey.trim(), 'EN-US', 'FR')
  if (result.provider === 'deepl') {
    return { ok: true, provider: 'deepl', translation: result.translatedText }
  }
  return {
    ok: false,
    provider: 'fallback',
    translation: result.translatedText,
    error: 'La requête vers l’API DeepL a échoué (CORS navigateur ou clé invalide). Le service de secours a répondu : ' + result.translatedText,
  }
}

