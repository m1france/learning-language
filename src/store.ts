import { type ApiSettings, type AppState, type Language, type MarkingDefinition, type Resource, type UserSettings, type WordMark, id, normalizeWord, todayKey } from './domain'

const stateKey = 'vivre-la-langue:state:v2'

export const DEFAULT_MARKINGS: MarkingDefinition[] = [
  { id: 'verb', label: 'Verbe', color: '#16a34a' },
  { id: 'noun', label: 'Nom', color: '#2563eb' },
  { id: 'adjective', label: 'Adjectif', color: '#d97706' },
  { id: 'adverb', label: 'Adverbe', color: '#dc2626' },
  { id: 'expression', label: 'Expression', color: '#7c3aed' },
]

export const DEFAULT_TEACHER_SHORTCUTS: Record<string, string> = {
  select: 'v',
  pen: 'p',
  highlighter: 'h',
  text: 't',
  edit: 'e',
  rect: 'r',
  ellipse: 'c',
  line: 'l',
  arrow: 'a',
  liaison: 'b',
  gray: 'g',
  eraser: 'x',
}

export const defaultSettings: UserSettings = {
  name: '',
  learningLanguage: 'en',
  uiLanguage: 'fr',
  theme: 'light',
  readerFontSize: 19,
  readerWidth: 'comfortable',
  readerPageSize: 220,
  showGrammar: true,
  readerToolbarStyle: 'liquid',
  markColors: {},
  teacherShortcuts: DEFAULT_TEACHER_SHORTCUTS,
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
  markings: DEFAULT_MARKINGS,
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
        readerToolbarStyle: parsed.settings.readerToolbarStyle ?? 'liquid',
        markColors: parsed.settings.markColors ?? {},
        teacherShortcuts: { ...DEFAULT_TEACHER_SHORTCUTS, ...(parsed.settings.teacherShortcuts ?? {}) },
        api: { ...defaultSettings.api, ...api },
      },
      progress: parsed.progress ?? {},
      words: parsed.words ?? [],
      writings: parsed.writings ?? [],
      sessions: parsed.sessions ?? [],
      completedScenarios: parsed.completedScenarios ?? [],
      wordMarks: parsed.wordMarks ?? {},
      silentMarks: parsed.silentMarks ?? {},
      markings: parsed.markings && parsed.markings.length > 0 ? parsed.markings : DEFAULT_MARKINGS,
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
  const cleaned = args.raw.replace(/^[.,!?;:()"“”\s]+|[.,!?;:()"“”\s]+$/g, '').replace(/\s+/g, ' ').trim()
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

/** Delete a word from the user's learned/annotated words. */
export const deleteWord = (state: AppState, rawOrNormalized: string, language: 'en' | 'fr'): AppState => {
  const norm = normalizeWord(rawOrNormalized)
  return {
    ...state,
    words: state.words.filter((w) => !(w.normalized === norm && w.language === language)),
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

/** Reset all word markings and silent marks for a given language (or all marks). */
export const resetResourceMarks = (state: AppState, language?: Language, resourceId?: string): AppState => {
  if (!language && !resourceId) return { ...state, wordMarks: {}, silentMarks: {} }
  const wordMarks = { ...state.wordMarks }
  const silentMarks = { ...state.silentMarks }
  const prefix = language ? `${language}:` : ''
  const instPrefix = resourceId ? `inst:${resourceId}:` : 'inst:'
  Object.keys(wordMarks).forEach((key) => {
    if (prefix && key.startsWith(prefix)) delete wordMarks[key]
    if (key.startsWith(instPrefix)) {
      if (resourceId) {
        delete wordMarks[key]
      } else if (language) {
        const targetResId = key.split(':')[1]
        const res = state.resources.find((r) => r.id === targetResId)
        if (!res || res.language === language) delete wordMarks[key]
      }
    }
  })
  Object.keys(silentMarks).forEach((key) => {
    if (prefix && key.startsWith(prefix)) delete silentMarks[key]
  })
  return { ...state, wordMarks, silentMarks }
}

/** Add a new marking definition. */
export const addMarking = (state: AppState, label: string, color: string): AppState => {
  const cleaned = label.trim()
  if (!cleaned) return state
  const markings = [...(state.markings ?? DEFAULT_MARKINGS)]
  const newMarking: MarkingDefinition = {
    id: id('mark'),
    label: cleaned,
    color: color || '#2563eb',
  }
  markings.push(newMarking)
  return {
    ...state,
    markings,
    settings: {
      ...state.settings,
      markColors: { ...state.settings.markColors, [newMarking.id]: newMarking.color },
    },
  }
}

/** Rename an existing marking. */
export const renameMarking = (state: AppState, markingId: string, newLabel: string): AppState => {
  const cleaned = newLabel.trim()
  if (!cleaned) return state
  const current = state.markings ?? DEFAULT_MARKINGS
  const markings = current.map((m) => (m.id === markingId ? { ...m, label: cleaned } : m))
  return { ...state, markings }
}

/** Delete a marking definition and clean up associated wordMarks. */
export const deleteMarking = (state: AppState, markingId: string): AppState => {
  const current = state.markings ?? DEFAULT_MARKINGS
  const markings = current.filter((m) => m.id !== markingId)
  const wordMarks = { ...state.wordMarks }
  Object.keys(wordMarks).forEach((key) => {
    if (wordMarks[key]?.type === markingId) {
      delete wordMarks[key]
    }
  })
  const markColors = { ...state.settings.markColors }
  delete markColors[markingId]
  return {
    ...state,
    markings,
    wordMarks,
    settings: { ...state.settings, markColors },
  }
}

/** Reorder markings array from one index to another. */
export const reorderMarkings = (state: AppState, fromIndex: number, toIndex: number): AppState => {
  const current = [...(state.markings ?? DEFAULT_MARKINGS)]
  if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) {
    return state
  }
  const [moved] = current.splice(fromIndex, 1)
  current.splice(toIndex, 0, moved)
  return { ...state, markings: current }
}

/** Update default color for a marking. */
export const setMarkingColor = (state: AppState, markingId: string, color: string): AppState => {
  const current = state.markings ?? DEFAULT_MARKINGS
  const markings = current.map((m) => (m.id === markingId ? { ...m, color } : m))
  return {
    ...state,
    markings,
    settings: {
      ...state.settings,
      markColors: { ...state.settings.markColors, [markingId]: color },
    },
  }
}

