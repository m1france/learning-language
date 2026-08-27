import type { Language } from './domain'

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

export const DEFAULT_PROMPTS_DATA: DefaultPromptWord[] = [
  {
    id: 'def-neighborhood',
    word: 'neighborhood',
    normalized: 'neighborhood',
    language: 'en',
    translation: 'quartier, voisinage',
    phonetic: 'ˈneɪ.bər.hʊd',
    contextSentence: 'It is a quiet and friendly neighborhood with lots of green trees.',
    knowledge: 2,
  },
  {
    id: 'def-glow',
    word: 'glow',
    normalized: 'glow',
    language: 'en',
    translation: 'lueur, briller doucement',
    phonetic: 'ɡloʊ',
    contextSentence: 'The warm glow of the morning sun lit up the entire room.',
    knowledge: 2,
  },
  {
    id: 'def-usual',
    word: 'usual',
    normalized: 'usual',
    language: 'en',
    translation: 'habituel, ordinaire',
    phonetic: 'ˈjuː.ʒu.əl',
    contextSentence: 'As usual, she was the first person to arrive at the meeting.',
    knowledge: 3,
  },
  {
    id: 'def-corner',
    word: 'corner',
    normalized: 'corner',
    language: 'en',
    translation: 'coin, angle',
    phonetic: 'ˈkɔːr.nər',
    contextSentence: 'There is a cozy little coffee shop right around the corner.',
    knowledge: 2,
  },
  {
    id: 'def-exhibit',
    word: 'exhibit',
    normalized: 'exhibit',
    language: 'en',
    translation: 'exposer, pièce d’exposition',
    phonetic: 'ɪɡˈzɪb.ɪt',
    contextSentence: 'The gallery will exhibit modern paintings and sculptures next week.',
    knowledge: 2,
  },
  {
    id: 'def-awake',
    word: 'awake',
    normalized: 'awake',
    language: 'en',
    translation: 'éveillé, réveillé',
    phonetic: 'əˈweɪk',
    contextSentence: 'I stayed awake late into the night, listening to the calm rain.',
    knowledge: 2,
  },
  {
    id: 'def-friendly',
    word: 'friendly',
    normalized: 'friendly',
    language: 'en',
    translation: 'amical, chaleureux',
    phonetic: 'ˈfrend.li',
    contextSentence: 'The locals were extremely welcoming and friendly to all visitors.',
    knowledge: 3,
  },
  {
    id: 'def-remember',
    word: 'remember',
    normalized: 'remember',
    language: 'en',
    translation: 'se souvenir, se rappeler',
    phonetic: 'rɪˈmem.bər',
    contextSentence: 'I still remember the first day I started learning this language.',
    knowledge: 3,
  },
]

export const prompts = DEFAULT_PROMPTS_DATA.map((p) => p.word)
