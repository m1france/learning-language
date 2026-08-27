import type { UiLanguage } from './domain'

export type LearningLanguageInfo = {
  id: string
  flag: string
  name: string
  englishName: string
  deepLCode?: string
  bcp47: string
}

/**
 * The 30 most learned and spoken languages worldwide with their metadata.
 */
export const TOP_LEARNING_LANGUAGES: LearningLanguageInfo[] = [
  { id: 'en', flag: '🇬🇧', name: 'Anglais (English)', englishName: 'English', deepLCode: 'EN-US', bcp47: 'en-US' },
  { id: 'es', flag: '🇪🇸', name: 'Espagnol (Español)', englishName: 'Spanish', deepLCode: 'ES', bcp47: 'es-ES' },
  { id: 'fr', flag: '🇫🇷', name: 'Français', englishName: 'French', deepLCode: 'FR', bcp47: 'fr-FR' },
  { id: 'de', flag: '🇩🇪', name: 'Allemand (Deutsch)', englishName: 'German', deepLCode: 'DE', bcp47: 'de-DE' },
  { id: 'it', flag: '🇮🇹', name: 'Italien (Italiano)', englishName: 'Italian', deepLCode: 'IT', bcp47: 'it-IT' },
  { id: 'pt', flag: '🇵🇹', name: 'Portugais (Português)', englishName: 'Portuguese', deepLCode: 'PT-PT', bcp47: 'pt-PT' },
  { id: 'zh', flag: '🇨🇳', name: 'Chinois mandarin (中文)', englishName: 'Chinese (Mandarin)', deepLCode: 'ZH', bcp47: 'zh-CN' },
  { id: 'ja', flag: '🇯🇵', name: 'Japonais (日本語)', englishName: 'Japanese', deepLCode: 'JA', bcp47: 'ja-JP' },
  { id: 'ru', flag: '🇷🇺', name: 'Russe (Русский)', englishName: 'Russian', deepLCode: 'RU', bcp47: 'ru-RU' },
  { id: 'ar', flag: '🇸🇦', name: 'Arabe (العربية)', englishName: 'Arabic', deepLCode: 'AR', bcp47: 'ar-SA' },
  { id: 'ko', flag: '🇰🇷', name: 'Coréen (한국어)', englishName: 'Korean', deepLCode: 'KO', bcp47: 'ko-KR' },
  { id: 'hi', flag: '🇮🇳', name: 'Hindi (हिन्दी)', englishName: 'Hindi', deepLCode: 'HI', bcp47: 'hi-IN' },
  { id: 'tr', flag: '🇹🇷', name: 'Turc (Türkçe)', englishName: 'Turkish', deepLCode: 'TR', bcp47: 'tr-TR' },
  { id: 'nl', flag: '🇳🇱', name: 'Néerlandais (Nederlands)', englishName: 'Dutch', deepLCode: 'NL', bcp47: 'nl-NL' },
  { id: 'pl', flag: '🇵🇱', name: 'Polonais (Polski)', englishName: 'Polish', deepLCode: 'PL', bcp47: 'pl-PL' },
  { id: 'sv', flag: '🇸🇪', name: 'Suédois (Svenska)', englishName: 'Swedish', deepLCode: 'SV', bcp47: 'sv-SE' },
  { id: 'el', flag: '🇬🇷', name: 'Grec (Ελληνικά)', englishName: 'Greek', deepLCode: 'EL', bcp47: 'el-GR' },
  { id: 'vi', flag: '🇻🇳', name: 'Vietnamien (Tiếng Việt)', englishName: 'Vietnamese', deepLCode: 'VI', bcp47: 'vi-VN' },
  { id: 'id', flag: '🇮🇩', name: 'Indonésien (Bahasa Indonesia)', englishName: 'Indonesian', deepLCode: 'ID', bcp47: 'id-ID' },
  { id: 'th', flag: '🇹🇭', name: 'Thaï (ไทย)', englishName: 'Thai', deepLCode: 'TH', bcp47: 'th-TH' },
  { id: 'cs', flag: '🇨🇿', name: 'Tchèque (Čeština)', englishName: 'Czech', deepLCode: 'CS', bcp47: 'cs-CZ' },
  { id: 'uk', flag: '🇺🇦', name: 'Ukrainien (Українська)', englishName: 'Ukrainian', deepLCode: 'UK', bcp47: 'uk-UA' },
  { id: 'ro', flag: '🇷🇴', name: 'Roumain (Română)', englishName: 'Romanian', deepLCode: 'RO', bcp47: 'ro-RO' },
  { id: 'hu', flag: '🇭🇺', name: 'Hongrois (Magyar)', englishName: 'Hungarian', deepLCode: 'HU', bcp47: 'hu-HU' },
  { id: 'da', flag: '🇩🇰', name: 'Danois (Dansk)', englishName: 'Danish', deepLCode: 'DA', bcp47: 'da-DK' },
  { id: 'fi', flag: '🇫🇮', name: 'Finnois (Suomi)', englishName: 'Finnish', deepLCode: 'FI', bcp47: 'fi-FI' },
  { id: 'no', flag: '🇳🇴', name: 'Norvégien (Norsk)', englishName: 'Norwegian', deepLCode: 'NB', bcp47: 'nb-NO' },
  { id: 'he', flag: '🇮🇱', name: 'Hébreu (עברית)', englishName: 'Hebrew', deepLCode: 'HE', bcp47: 'he-IL' },
  { id: 'tl', flag: '🇵🇭', name: 'Tagalog (Filipino)', englishName: 'Tagalog (Filipino)', deepLCode: 'TL', bcp47: 'fil-PH' },
  { id: 'fa', flag: '🇮🇷', name: 'Persan / Farsi (فارسی)', englishName: 'Persian (Farsi)', deepLCode: 'FA', bcp47: 'fa-IR' },
]

export function getLanguageInfo(idOrCode: string): LearningLanguageInfo {
  const match = TOP_LEARNING_LANGUAGES.find((l) => l.id.toLowerCase() === idOrCode?.toLowerCase())
  return (
    match || {
      id: idOrCode || 'en',
      flag: '🌐',
      name: (idOrCode || 'en').toUpperCase(),
      englishName: idOrCode || 'English',
      bcp47: idOrCode || 'en-US',
    }
  )
}

export function getLanguageName(idOrCode: string): string {
  return getLanguageInfo(idOrCode).englishName
}

export function getLanguageBcp47(idOrCode: string): string {
  return getLanguageInfo(idOrCode).bcp47
}

export function getDeepLTargetLang(idOrCode: string): string {
  const info = getLanguageInfo(idOrCode)
  return info.deepLCode || (idOrCode ? idOrCode.toUpperCase() : 'EN-US')
}

export function getUiLanguageName(ui: UiLanguage): string {
  const map: Record<UiLanguage, string> = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    zh: 'Chinese',
    ru: 'Russian',
    pt: 'Portuguese',
  }
  return map[ui] || 'French'
}
