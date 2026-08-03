export type Language = 'en' | 'fr'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'native'
export type ResourceType = 'story' | 'article' | 'culture' | 'script' | 'book' | 'news' | 'scientific'
export type CoverTone = 'coral' | 'blue' | 'gold' | 'green'

export type Chapter = {
  id: string
  title: string
  paragraphs: string[]
}

export type Resource = {
  id: string
  title: string
  author: string
  type: ResourceType
  difficulty: Difficulty
  minutes: number
  cover: CoverTone
  /** Optional user-uploaded cover image (data URL). Overrides the tone cover when present. */
  coverImage?: string
  language: Language
  chapters: Chapter[]
  sourceUrl?: string
  createdAt: string
  imported?: boolean
}

export type ReadingProgress = {
  resourceId: string
  chapterIndex: number
  paragraphIndex: number
  completed: boolean
  updatedAt: string
}

export type DictionarySense = {
  definition: string
  translation: string
  example?: string
}

export type LearnedWord = {
  id: string
  word: string
  normalized: string
  language: Language
  phonetic?: string
  partOfSpeech: string
  definitions: DictionarySense[]
  contextSentence: string
  sourceResourceId?: string
  sourceSkill: 'reading' | 'speaking' | 'writing' | 'impromptu' | 'monologue'
  status: 'new' | 'learning' | 'learned' | 'mastered'
  intervalDays: number
  nextReview: string
  easeFactor: number
  reviewCount: number
  tags: string[]
  createdAt: string
}

export type WritingEntry = {
  id: string
  date: string
  promptWords: string[]
  wordsUsed: string[]
  content: string
  published: boolean
  cosignCount: number
  coSigned: boolean
  createdAt: string
  updatedAt: string
}

export type MediaSession = {
  id: string
  kind: 'speaking' | 'monologue' | 'impromptu'
  title: string
  referenceText?: string
  scenarioId?: string
  durationSeconds: number
  createdAt: string
  mediaUrl?: string
  transcript?: string
}

export type TtsProvider = 'google' | 'openrouter' | 'elevenlabs' | 'fish' | 'browser'

export type ApiSettings = {
  dictionaryProvider: 'local' | 'wiktionary' | 'ai'
  dictionaryEndpoint: string
  openRouterKey: string
  openRouterModel: string
  /** Main agent model (free-form OpenRouter model id), reserved for upcoming AI features. */
  agentModel: string
  openAiKey: string
  unsplashKey: string
  pexelsKey: string
  ttsVoice: string
  /** TTS provider currently selected in Settings. */
  ttsProvider: TtsProvider
  /** OpenRouter audio model id, used when ttsProvider === 'openrouter'. */
  ttsModel: string
  elevenLabsKey: string
  elevenLabsVoice: string
  fishKey: string
  fishReferenceId: string
}

export type CustomTool = {
  id: string
  name: string
  description: string
  category: string
  url?: string
}

export type GrammarMarkType = 'verb' | 'noun' | 'adjective' | 'adverb' | 'expression'
export type GrammarMarkStyle = 'highlight' | 'underline' | 'overlay'

export type WordMark = {
  type: GrammarMarkType
  style: GrammarMarkStyle
  color: string
}

export type UserSettings = {
  name: string
  learningLanguage: Language
  theme: 'light' | 'dark'
  readerFontSize: number
  readerWidth: 'comfortable' | 'wide'
  /** Approximate number of words per reader page. */
  readerPageSize: number
  showGrammar: boolean
  api: ApiSettings
}

export type AppState = {
  version: 2
  settings: UserSettings
  resources: Resource[]
  progress: Record<string, ReadingProgress>
  words: LearnedWord[]
  writings: WritingEntry[]
  sessions: MediaSession[]
  completedScenarios: string[]
  /** User grammar marks: `${language}:${normalized}` → mark (type, style, color). */
  wordMarks: Record<string, WordMark>
  /** User-grayed letters: `${language}:${normalized}` → indices of letters (alpha order) greyed by the user. */
  silentMarks: Record<string, number[]>
  /** User-added tools shown in the "Vivre" section. */
  customTools: CustomTool[]
  /** Tool names removed by the user from the recommended list. */
  removedTools: string[]
}

export const todayKey = () => new Date().toISOString().slice(0, 10)

export const id = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

export const normalizeWord = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-zà-ÿ'-]/gi, '')
