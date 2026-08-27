import { type ApiSettings, type AppState, type Language, type LearnedWord, type MarkingDefinition, type Resource, type UserSettings, type WordMark, type WordRelationType, type WritingEntry, id, normalizeWord, todayKey } from './domain'

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
    agentProvider: 'openrouter',
    agentModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    openRouterKey: '',
    openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    openAiKey: '',
    nvidiaKey: '',
    kimiKey: '',
    googleKey: '',
    ttsVoice: 'alloy',
    ttsProvider: 'google',
    ttsModel: 'openai/gpt-4o-mini-tts-2025-12-15',
    elevenLabsKey: '',
    elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
    fishKey: '',
    fishReferenceId: '',
    deepLKey: '',
    deepLTargetLang: 'EN-US',
    youtubeTranscriptApiKey: '',
    taskModelSpeakingAnalysis: 'google/gemini-2.0-flash-exp:free',
    taskModelExerciseBuilder: '',
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
    // Migration : déduire ttsProvider de l'ancien réglage ttsModel.
    if (api && !api.ttsProvider) {
      api.ttsProvider = api.ttsModel === 'browser' ? 'browser' : api.ttsModel === 'openai/gpt-4o-audio-preview' ? 'openrouter' : 'google'
    }
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

export type WordFamily = {
  rootWord: LearnedWord | { word: string; normalized: string; isVirtual: boolean; translation?: string; partOfSpeech?: string; tags?: string[] } | null
  isRoot: boolean
  grammaticalForms: LearnedWord[]
  derivatives: LearnedWord[]
  totalLinkedCount: number
}

/** Part of speech ranking for derived words: Verb -> Noun -> Adjective -> Adverb -> Expression -> Other */
export const posRank = (posOrTag: string): number => {
  const norm = posOrTag.toLowerCase().trim()
  if (/^(verb|verbe|v)$/i.test(norm) || norm.includes('verb')) return 1
  if (/^(noun|nom|n|substantif)$/i.test(norm) || norm.includes('nom') || norm.includes('noun')) return 2
  if (/^(adjective|adjectif|adj|a)$/i.test(norm) || norm.includes('adj')) return 3
  if (/^(adverb|adverbe|adv)$/i.test(norm) || norm.includes('adv')) return 4
  if (/^(expression|phrase|idiom|locution)$/i.test(norm) || norm.includes('expression')) return 5
  return 6
}

export const getWordPosRank = (word: LearnedWord): number => {
  if (word.partOfSpeech) return posRank(word.partOfSpeech)
  if (word.tags && word.tags.length > 0) {
    const minRank = Math.min(...word.tags.map(posRank))
    if (minRank < 6) return minRank
  }
  return 6
}

export const resolveWordFamily = (
  words: LearnedWord[],
  currentRawOrNormalized: string,
  language: Language
): WordFamily => {
  const normCurrent = normalizeWord(currentRawOrNormalized)
  const currentWord = words.find((w) => w.normalized === normCurrent && w.language === language)

  // 1. Find the canonical root of the family
  let rootNormalized = normCurrent
  let rootWordObj: LearnedWord | undefined = currentWord

  // Trace up the parent chain (with visited set to prevent loops)
  const visited = new Set<string>()
  let walker = currentWord
  while (walker && walker.parent) {
    const parentNorm = normalizeWord(walker.parent)
    if (!parentNorm || visited.has(parentNorm) || parentNorm === walker.normalized) break
    visited.add(parentNorm)
    const parentObj = words.find((w) => w.normalized === parentNorm && w.language === language)
    rootNormalized = parentNorm
    if (parentObj) {
      rootWordObj = parentObj
      walker = parentObj
    } else {
      rootWordObj = undefined
      break
    }
  }

  const isCurrentRoot = normCurrent === rootNormalized
  let rootWord: WordFamily['rootWord'] = null

  if (rootWordObj && rootWordObj.normalized === rootNormalized) {
    rootWord = rootWordObj
  } else if (currentWord?.parent) {
    rootWord = {
      word: currentWord.parent,
      normalized: rootNormalized,
      isVirtual: true,
    }
  } else if (!isCurrentRoot) {
    rootWord = {
      word: rootNormalized,
      normalized: rootNormalized,
      isVirtual: true,
    }
  }

  // 2. Find all family members in the same language
  const familyMembers = words.filter((w) => {
    if (w.language !== language) return false
    if (w.normalized === normCurrent) return false // exclude self from lists
    if (w.normalized === rootNormalized) return true // is root
    if (w.parent && normalizeWord(w.parent) === rootNormalized) return true
    if (currentWord?.parent && w.parent && normalizeWord(w.parent) === normalizeWord(currentWord.parent)) return true
    return false
  })

  // Deduplicate by normalized
  const memberMap = new Map<string, LearnedWord>()
  familyMembers.forEach((m) => {
    if (m.normalized !== normCurrent) {
      memberMap.set(m.normalized, m)
    }
  })

  const grammaticalForms: LearnedWord[] = []
  const derivatives: LearnedWord[] = []

  memberMap.forEach((member) => {
    // If it's the root word and we are viewing a child, it's displayed in the "Mot de référence" section
    if (member.normalized === rootNormalized) {
      return
    }
    if (member.relationType === 'grammatical_form') {
      grammaticalForms.push(member)
    } else {
      derivatives.push(member)
    }
  })

  // Sort grammatical forms alphabetically
  grammaticalForms.sort((a, b) => a.word.localeCompare(b.word))

  // Sort derivatives by POS rank first, then alphabetically
  derivatives.sort((a, b) => {
    const rankA = getWordPosRank(a)
    const rankB = getWordPosRank(b)
    if (rankA !== rankB) return rankA - rankB
    return a.word.localeCompare(b.word)
  })

  const totalLinkedCount = (rootWord && !isCurrentRoot ? 1 : 0) + grammaticalForms.length + derivatives.length

  return {
    rootWord: isCurrentRoot ? null : rootWord,
    isRoot: isCurrentRoot,
    grammaticalForms,
    derivatives,
    totalLinkedCount,
  }
}

/** Save or update a word the user annotated while reading (own translation, parent, pronunciation). */
export const upsertWordDetails = (state: AppState, args: {
  raw: string
  sentence?: string
  language: Language
  sourceResourceId?: string
  translation: string
  parent?: string
  pronunciation?: string
  knowledge?: number
  tags?: string[]
  relationType?: WordRelationType
  partOfSpeech?: string
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
            relationType: args.relationType ?? word.relationType,
            partOfSpeech: args.partOfSpeech ?? word.partOfSpeech ?? '',
            phonetic: args.pronunciation || undefined,
            knowledge: args.knowledge,
            tags: args.tags ?? word.tags ?? [],
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
      relationType: args.relationType,
      partOfSpeech: args.partOfSpeech ?? '',
      knowledge: args.knowledge,
      definitions: args.translation ? [{ definition: '', translation: args.translation }] : [],
      contextSentence: args.sentence ?? '',
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

/** Reverse / reassign reference word for a word family */
export const setWordAsReference = (
  state: AppState,
  newRootRaw: string,
  formerRootRaw: string,
  formerRelationType: WordRelationType,
  language: Language
): AppState => {
  const normNewRoot = normalizeWord(newRootRaw)
  const normFormerRoot = normalizeWord(formerRootRaw)
  const updatedWords = state.words.map((w) => {
    if (w.language !== language) return w
    // If it's the former root, make it a child of the new root
    if (w.normalized === normFormerRoot) {
      return {
        ...w,
        parent: newRootRaw.trim(),
        relationType: formerRelationType,
      }
    }
    // If it was pointing to the former root, repoint it to the new root
    if (w.parent && normalizeWord(w.parent) === normFormerRoot && w.normalized !== normNewRoot) {
      return {
        ...w,
        parent: newRootRaw.trim(),
      }
    }
    return w
  })
  return { ...state, words: updatedWords }
}

/** Delete a word from the user's learned/annotated words. */
export const deleteWord = (state: AppState, rawOrNormalized: string, language: Language): AppState => {
  const norm = normalizeWord(rawOrNormalized)
  return {
    ...state,
    words: state.words.filter((w) => !(w.normalized === norm && w.language === language)),
  }
}

/** All distinct custom tags already used, for the tag suggestions. */
export const knownTags = (state: AppState, language?: Language): string[] => {
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
export const knownParents = (state: AppState, language: Language): string[] => {
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

/** Save or update a writing entry */
export const upsertWriting = (state: AppState, entry: WritingEntry): AppState => {
  const writings = state.writings ?? []
  const exists = writings.some((item) => item.id === entry.id)
  return {
    ...state,
    writings: exists
      ? writings.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...writings],
  }
}

/** Delete a writing entry */
export const deleteWriting = (state: AppState, entryId: string): AppState => {
  const writings = (state.writings ?? []).filter((item) => item.id !== entryId)
  return { ...state, writings }
}

/** Record active usage of words during a writing session to boost SRS/knowledge */
export const recordWordUsageInWriting = (state: AppState, usedWords: string[], language: Language): AppState => {
  if (!usedWords.length) return state
  const normalizedSet = new Set(usedWords.map((w) => normalizeWord(w)))
  const now = new Date()
  
  const updatedWords = (state.words ?? []).map((word) => {
    if (word.language !== language || !normalizedSet.has(word.normalized)) return word
    
    // Boost knowledge level towards active mastery (max 5 from writing, 6 is fully mastered)
    const currentKnowledge = word.knowledge ?? 1
    const nextKnowledge = Math.min(5, currentKnowledge + 1)
    const nextReviewCount = (word.reviewCount ?? 0) + 1
    const nextInterval = Math.max(1, Math.round((word.intervalDays ?? 1) * 1.6))
    const nextDate = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    
    return {
      ...word,
      knowledge: nextKnowledge,
      reviewCount: nextReviewCount,
      intervalDays: nextInterval,
      nextReview: nextDate,
      status: nextKnowledge >= 4 ? ('learned' as const) : ('learning' as const),
    }
  })
  
  return { ...state, words: updatedWords }
}
