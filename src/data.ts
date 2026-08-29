import type { Language, UiLanguage } from './domain'
import { vocabCopy } from './i18n'

export type DefaultPromptWord = {
  id: string
  word: string
  normalized: string
  language: Language
  translation: string
  phonetic: string
  contextSentence: string
  knowledge: number
}

export function getDefaultPrompts(ui: UiLanguage = 'fr'): DefaultPromptWord[] {
  const t = vocabCopy[ui]?.defaultPrompts || vocabCopy.fr.defaultPrompts
  return [
    {
      id: 'def-neighborhood',
      word: 'neighborhood',
      normalized: 'neighborhood',
      language: 'en',
      translation: t.neighborhood.translation,
      phonetic: 'ˈneɪ.bər.hʊd',
      contextSentence: t.neighborhood.context,
      knowledge: 2,
    },
    {
      id: 'def-glow',
      word: 'glow',
      normalized: 'glow',
      language: 'en',
      translation: t.glow.translation,
      phonetic: 'ɡloʊ',
      contextSentence: t.glow.context,
      knowledge: 2,
    },
    {
      id: 'def-usual',
      word: 'usual',
      normalized: 'usual',
      language: 'en',
      translation: t.usual.translation,
      phonetic: 'ˈjuː.ʒu.əl',
      contextSentence: t.usual.context,
      knowledge: 3,
    },
    {
      id: 'def-corner',
      word: 'corner',
      normalized: 'corner',
      language: 'en',
      translation: t.corner.translation,
      phonetic: 'ˈkɔːr.nər',
      contextSentence: t.corner.context,
      knowledge: 2,
    },
    {
      id: 'def-exhibit',
      word: 'exhibit',
      normalized: 'exhibit',
      language: 'en',
      translation: t.exhibit.translation,
      phonetic: 'ɪɡˈzɪb.ɪt',
      contextSentence: t.exhibit.context,
      knowledge: 2,
    },
    {
      id: 'def-awake',
      word: 'awake',
      normalized: 'awake',
      language: 'en',
      translation: t.awake.translation,
      phonetic: 'əˈweɪk',
      contextSentence: t.awake.context,
      knowledge: 2,
    },
    {
      id: 'def-friendly',
      word: 'friendly',
      normalized: 'friendly',
      language: 'en',
      translation: t.friendly.translation,
      phonetic: 'ˈfrend.li',
      contextSentence: t.friendly.context,
      knowledge: 3,
    },
    {
      id: 'def-remember',
      word: 'remember',
      normalized: 'remember',
      language: 'en',
      translation: t.remember.translation,
      phonetic: 'rɪˈmem.bər',
      contextSentence: t.remember.context,
      knowledge: 3,
    },
  ]
}

export const DEFAULT_PROMPTS_DATA: DefaultPromptWord[] = getDefaultPrompts('fr')

export const prompts = DEFAULT_PROMPTS_DATA.map((p) => p.word)
