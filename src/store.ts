import { type AppState, type DictionarySense, type LearnedWord, type Resource, type UserSettings, id, normalizeWord, todayKey } from './domain'
import { seedResources } from './seed'

const stateKey = 'vivre-la-langue:state:v2'

export const defaultSettings: UserSettings = {
  name: '',
  learningLanguage: 'en',
  theme: 'light',
  readerFontSize: 19,
  readerWidth: 'comfortable',
  readerPageSize: 220,
  showGrammar: true,
  api: {
    dictionaryProvider: 'local',
    dictionaryEndpoint: 'https://en.wiktionary.org/w/api.php',
    openRouterKey: '',
    openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    openAiKey: '',
    unsplashKey: '',
    pexelsKey: '',
    ttsVoice: '',
    ttsModel: 'fish-audio/s2.1-pro-free:free',
  },
}

export const createState = (settings: Partial<UserSettings> = {}): AppState => ({
  version: 2,
  settings: { ...defaultSettings, ...settings, api: { ...defaultSettings.api, ...settings.api } },
  resources: seedResources,
  progress: {},
  words: [],
  writings: [],
  sessions: [],
  completedScenarios: [],
  silentOverrides: {},
  customTools: [],
  removedTools: [],
})

export const loadState = (): AppState | null => {
  try {
    const raw = localStorage.getItem(stateKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    if (parsed.version !== 2 || !parsed.settings || !Array.isArray(parsed.resources)) return null
    return {
      ...createState(parsed.settings),
      ...parsed,
      settings: { ...defaultSettings, ...parsed.settings, api: { ...defaultSettings.api, ...parsed.settings.api } },
      progress: parsed.progress ?? {},
      words: parsed.words ?? [],
      writings: parsed.writings ?? [],
      sessions: parsed.sessions ?? [],
      completedScenarios: parsed.completedScenarios ?? [],
      silentOverrides: parsed.silentOverrides ?? {},
      customTools: parsed.customTools ?? [],
      removedTools: parsed.removedTools ?? [],
    }
  } catch { return null }
}

export const saveState = (state: AppState) => localStorage.setItem(stateKey, JSON.stringify(state))

export const resetState = () => localStorage.removeItem(stateKey)

const builtinDictionary: Record<string, { phonetic: string; pos: string; senses: DictionarySense[] }> = {
  awake: { phonetic: 'əˈweɪk', pos: 'adjective', senses: [{ definition: 'not sleeping', translation: 'réveillé·e', example: 'The city was fully awake.' }] },
  avenue: { phonetic: 'ˈævənuː', pos: 'noun', senses: [{ definition: 'a wide street in a town or city', translation: 'avenue' }] },
  barista: { phonetic: 'bəˈriːstə', pos: 'noun', senses: [{ definition: 'a person who prepares and serves coffee', translation: 'barista' }] },
  brunch: { phonetic: 'brʌntʃ', pos: 'noun', senses: [{ definition: 'a late morning meal that combines breakfast and lunch', translation: 'brunch' }] },
  corner: { phonetic: 'ˈkɔːrnər', pos: 'noun', senses: [{ definition: 'the point where two streets meet', translation: 'coin de rue' }, { definition: 'a part of a room or area away from the center', translation: 'coin' }] },
  exhibit: { phonetic: 'ɪɡˈzɪbɪt', pos: 'noun', senses: [{ definition: 'an object or collection shown in a museum', translation: 'exposition' }] },
  friendly: { phonetic: 'ˈfrendli', pos: 'adjective', senses: [{ definition: 'kind and pleasant toward other people', translation: 'amical·e' }] },
  glow: { phonetic: 'ɡloʊ', pos: 'verb', senses: [{ definition: 'to shine with a soft, steady light', translation: 'briller doucement' }] },
  neighborhood: { phonetic: 'ˈneɪbərhʊd', pos: 'noun', senses: [{ definition: 'the area near where someone lives', translation: 'quartier' }] },
  order: { phonetic: 'ˈɔːrdər', pos: 'noun', senses: [{ definition: 'a request for food or drinks in a restaurant', translation: 'commande' }] },
  remember: { phonetic: 'rɪˈmembər', pos: 'verb', senses: [{ definition: 'to keep information in your mind', translation: 'se souvenir' }] },
  sidewalk: { phonetic: 'ˈsaɪdwɔːk', pos: 'noun', senses: [{ definition: 'a paved path beside a road for people walking', translation: 'trottoir' }] },
  small: { phonetic: 'smɔːl', pos: 'adjective', senses: [{ definition: 'little in size, amount, or degree', translation: 'petit·e' }] },
  talk: { phonetic: 'tɔːk', pos: 'verb', senses: [{ definition: 'to speak with someone', translation: 'parler' }] },
  usual: { phonetic: 'ˈjuːʒuəl', pos: 'adjective', senses: [{ definition: 'happening in the normal or expected way', translation: 'habituel·le' }] },
  walked: { phonetic: 'wɔːkt', pos: 'verb', senses: [{ definition: 'moved on foot in the past', translation: 'a marché' }] },
  would: { phonetic: 'wʊd', pos: 'modal verb', senses: [{ definition: 'used to describe a possible or imagined action', translation: 'conditionnel' }] },
}

export const lookupWord = (raw: string, sentence: string, language: 'en' | 'fr'): Omit<LearnedWord, 'id' | 'contextSentence' | 'sourceSkill' | 'sourceResourceId' | 'status' | 'intervalDays' | 'nextReview' | 'easeFactor' | 'reviewCount' | 'tags' | 'createdAt'> => {
  const normalized = normalizeWord(raw)
  const item = builtinDictionary[normalized]
  const fallback = language === 'en'
    ? { phonetic: '', pos: 'word', senses: [{ definition: `“${raw.replace(/[.,!?]/g, '')}” as used in this sentence`, translation: 'à vérifier dans le dictionnaire' }] }
    : { phonetic: '', pos: 'mot', senses: [{ definition: `“${raw.replace(/[.,!?]/g, '')}” dans ce contexte`, translation: 'check the dictionary' }] }
  const selected = item ?? fallback
  return { word: raw.replace(/[.,!?;:]/g, ''), normalized, language, phonetic: selected.phonetic, partOfSpeech: selected.pos, definitions: selected.senses }
}

export const addWordToDeck = (state: AppState, args: { raw: string; sentence: string; language: 'en' | 'fr'; sourceResourceId?: string; tags?: string[] }): AppState => {
  const normalized = normalizeWord(args.raw)
  const existing = state.words.find((word) => word.normalized === normalized && word.language === args.language)
  if (existing) return state
  const dictionary = lookupWord(args.raw, args.sentence, args.language)
  const now = new Date().toISOString()
  return {
    ...state,
    words: [...state.words, {
      id: id('word'),
      ...dictionary,
      contextSentence: args.sentence,
      sourceResourceId: args.sourceResourceId,
      sourceSkill: 'reading',
      status: 'learning',
      intervalDays: 1,
      nextReview: todayKey(),
      easeFactor: 2.5,
      reviewCount: 0,
      tags: args.tags ?? [],
      createdAt: now,
    }],
  }
}

export const progressFor = (state: AppState, resource: Resource) => {
  const value = state.progress[resource.id]
  if (!value) return 0
  const total = resource.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0)
  const before = resource.chapters.slice(0, value.chapterIndex).reduce((sum, chapter) => sum + chapter.paragraphs.length, 0)
  return Math.min(100, Math.round(((before + value.paragraphIndex + (value.completed ? 1 : 0)) / Math.max(total, 1)) * 100))
}

export const upsertResource = (state: AppState, resource: Resource): AppState => {
  const exists = state.resources.some((item) => item.id === resource.id)
  return { ...state, resources: exists ? state.resources.map((item) => (item.id === resource.id ? resource : item)) : [resource, ...state.resources] }
}

export const deleteResource = (state: AppState, resourceId: string): AppState => {
  const progress = { ...state.progress }
  delete progress[resourceId]
  return { ...state, resources: state.resources.filter((item) => item.id !== resourceId), progress }
}

export const setSilentOverride = (state: AppState, normalized: string, letters: string[] | null): AppState => {
  const silentOverrides = { ...state.silentOverrides }
  if (letters === null || letters.length === 0) delete silentOverrides[normalized]
  else silentOverrides[normalized] = letters
  return { ...state, silentOverrides }
}
