import { type ApiSettings, type AppState, type Resource, type UserSettings, type WordMark, id, normalizeWord, todayKey } from './domain'

const stateKey = 'vivre-la-langue:state:v2'

export const defaultSettings: UserSettings = {
  name: '',
  learningLanguage: 'en',
  uiLanguage: 'fr',
  theme: 'light',
  readerFontSize: 19,
  readerWidth: 'comfortable',
  readerPageSize: 220,
  showGrammar: true,
  markColors: {},
  api: {
    openRouterKey: '',
    openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    agentModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    openAiKey: '',
    unsplashKey: '',
    pexelsKey: '',
    ttsVoice: '',
    ttsProvider: 'google',
    ttsModel: 'openai/gpt-4o-audio-preview',
    elevenLabsKey: '',
    elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
    fishKey: '',
    fishReferenceId: '',
  },
}

export const createState = (settings: Partial<UserSettings> = {}): AppState => ({
  version: 3,
  settings: { ...defaultSettings, ...settings, api: { ...defaultSettings.api, ...settings.api } },
  // No bundled resources: the library starts empty, the user imports their own texts.
  resources: [],
  progress: {},
  words: [],
  writings: [],
  sessions: [],
  completedScenarios: [],
  wordMarks: {},
  silentMarks: {},
  customTools: [],
  removedTools: [],
  customCategories: [],
  customTags: [],
})

export const loadState = (): AppState | null => {
  try {
    const raw = localStorage.getItem(stateKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Omit<AppState, 'version'> & { version: number }
    if ((parsed.version !== 2 && parsed.version !== 3) || !parsed.settings || !Array.isArray(parsed.resources)) return null
    const api = parsed.settings.api as Partial<ApiSettings> | undefined
    // Migration : déduire ttsProvider de l'ancien réglage ttsModel (fish-audio ne produit pas d'audio via OpenRouter).
    if (api && !api.ttsProvider) {
      api.ttsProvider = api.ttsModel === 'browser' ? 'browser' : api.ttsModel === 'openai/gpt-4o-audio-preview' ? 'openrouter' : 'google'
    }
    if (api?.ttsModel?.startsWith('fish-audio')) api.ttsModel = 'openai/gpt-4o-audio-preview'
    return {
      ...createState(parsed.settings),
      ...parsed,
      version: 3,
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        // v2 → v3 : l'interface suivait l'inverse de la langue apprise ; elle devient un choix libre.
        uiLanguage: parsed.settings.uiLanguage ?? (parsed.settings.learningLanguage === 'en' ? 'fr' : 'en'),
        markColors: parsed.settings.markColors ?? {},
        api: { ...defaultSettings.api, ...api },
      },
      progress: parsed.progress ?? {},
      words: parsed.words ?? [],
      writings: parsed.writings ?? [],
      sessions: parsed.sessions ?? [],
      completedScenarios: parsed.completedScenarios ?? [],
      wordMarks: parsed.wordMarks ?? {},
      silentMarks: parsed.silentMarks ?? {},
      customTools: parsed.customTools ?? [],
      removedTools: parsed.removedTools ?? [],
      customCategories: parsed.customCategories ?? [],
      customTags: parsed.customTags ?? [],
    }
  } catch { return null }
}

export const saveState = (state: AppState) => localStorage.setItem(stateKey, JSON.stringify(state))

export const resetState = () => localStorage.removeItem(stateKey)

/** Save or update a word the user annotated while reading (own translation, parent, pronunciation). */
export const upsertWordDetails = (state: AppState, args: {
  raw: string
  sentence: string
  language: 'en' | 'fr'
  sourceResourceId?: string
  translation: string
  parent: string
  pronunciation: string
  knowledge?: number
  tags?: string[]
}): AppState => {
  const cleaned = args.raw.replace(/[.,!?;:()"“”]/g, '').trim()
  if (!cleaned) return state
  const normalized = normalizeWord(cleaned)
  const existing = state.words.find((word) => word.normalized === normalized && word.language === args.language)
  if (existing) {
    return {
      ...state,
      words: state.words.map((word) => word.id === existing.id
        ? {
            ...word,
            word: cleaned,
            translation: args.translation,
            parent: args.parent || undefined,
            phonetic: args.pronunciation || undefined,
            knowledge: args.knowledge,
            tags: args.tags ?? [],
            definitions: args.translation ? [{ definition: '', translation: args.translation }] : word.definitions,
          }
        : word),
    }
  }
  const now = new Date().toISOString()
  return {
    ...state,
    words: [...state.words, {
      id: id('word'),
      word: cleaned,
      normalized,
      language: args.language,
      phonetic: args.pronunciation || undefined,
      translation: args.translation,
      parent: args.parent || undefined,
      partOfSpeech: '',
      knowledge: args.knowledge,
      definitions: args.translation ? [{ definition: '', translation: args.translation }] : [],
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

/** All distinct custom tags already used, for the tag suggestions. */
export const knownTags = (state: AppState, language?: 'en' | 'fr'): string[] => {
  const set = new Set<string>(state.customTags ?? [])
  state.words.forEach((word) => {
    if (!language || word.language === language) {
      word.tags?.forEach((tag) => {
        if (tag && tag.trim()) set.add(tag.trim())
      })
    }
  })
  return [...set].sort((a, b) => a.localeCompare(b))
}

export const addCustomTag = (state: AppState, tag: string): AppState => {
  const cleaned = tag.trim()
  if (!cleaned) return state
  const customTags = state.customTags ?? []
  if (customTags.includes(cleaned)) return state
  return { ...state, customTags: [...customTags, cleaned] }
}

export const renameCustomTag = (state: AppState, oldTag: string, newTag: string): AppState => {
  const cleanOld = oldTag.trim()
  const cleanNew = newTag.trim()
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return state
  const currentCustom = state.customTags ?? []
  const customTags = currentCustom.map((t) => (t === cleanOld ? cleanNew : t))
  if (!customTags.includes(cleanNew) && currentCustom.includes(cleanOld)) {
    customTags.push(cleanNew)
  }
  const words = state.words.map((word) => {
    if (!word.tags?.includes(cleanOld)) return word
    const updatedTags = [...new Set(word.tags.map((t) => (t === cleanOld ? cleanNew : t)))]
    return { ...word, tags: updatedTags }
  })
  return { ...state, customTags: [...new Set(customTags)], words }
}

export const deleteCustomTag = (state: AppState, tagToDelete: string): AppState => {
  const cleaned = tagToDelete.trim()
  const customTags = (state.customTags ?? []).filter((t) => t !== cleaned)
  const words = state.words.map((word) => {
    if (!word.tags?.includes(cleaned)) return word
    return { ...word, tags: word.tags.filter((t) => t !== cleaned) }
  })
  return { ...state, customTags, words }
}

/** All distinct parent words already used, for the autocomplete suggestions. */
export const knownParents = (state: AppState, language: 'en' | 'fr'): string[] => {
  const set = new Set<string>()
  state.words.forEach((word) => { if (word.language === language && word.parent) set.add(word.parent) })
  return [...set].sort((a, b) => a.localeCompare(b))
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

/** Set or clear a user grammar mark on a word (`null` removes it). */
export const setWordMark = (state: AppState, key: string, mark: WordMark | null): AppState => {
  const wordMarks = { ...state.wordMarks }
  if (mark === null) delete wordMarks[key]
  else wordMarks[key] = mark
  return { ...state, wordMarks }
}

/** Toggle a greyed letter (alpha-order index) for a word. */
export const toggleSilentMark = (state: AppState, key: string, letterIndex: number): AppState => {
  const silentMarks = { ...state.silentMarks }
  const current = silentMarks[key] ?? []
  const next = current.includes(letterIndex) ? current.filter((value) => value !== letterIndex) : [...current, letterIndex]
  if (next.length === 0) delete silentMarks[key]
  else silentMarks[key] = next
  return { ...state, silentMarks }
}
