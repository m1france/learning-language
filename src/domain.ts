export type Language = 'en' | 'fr'
/** Interface language (everything except imported content). */
export type UiLanguage = 'en' | 'fr' | 'es' | 'zh' | 'ru' | 'pt'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'native'
/** Built-in category ids. Users can add their own categories (free-form ids). */
export const BUILTIN_CATEGORIES = ['story', 'article', 'culture', 'script', 'book', 'news', 'scientific'] as const
export type CustomCategory = { id: string; label: string }
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
  /** Category id — built-in (see BUILTIN_CATEGORIES) or a user-created one. */
  type: string
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
  isAiGenerated?: boolean
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

export type WordRelationType = 'grammatical_form' | 'derivative'

export type LearnedWord = {
  id: string
  word: string
  normalized: string
  language: Language
  /** User-written pronunciation (IPA or mother-tongue approximation). */
  phonetic?: string
  /** User-written translation. */
  translation?: string
  /** Lemma / parent word chosen by the user (e.g. "avoir" for "ai"). */
  parent?: string
  /** Type of relationship to the canonical / parent word: grammatical form (inflection) or derivative. */
  relationType?: WordRelationType
  partOfSpeech: string
  /** Niveau de connaissance : 1 (découvert) à 5 (presque acquis), 6 = connu par cœur (plus de surlignage). */
  knowledge?: number
  definitions: DictionarySense[]
  contextSentence: string
  sourceResourceId?: string
  sourceSkill: 'reading' | 'speaking' | 'writing' | 'listening' | 'impromptu' | 'monologue'
  status: 'new' | 'learning' | 'learned' | 'mastered'
  intervalDays: number
  nextReview: string
  easeFactor: number
  reviewCount: number
  tags: string[]
  createdAt: string
}

export type WritingMode = 'reactivation' | 'guided' | 'sprint' | 'free'

export type WritingEntry = {
  id: string
  title: string
  date: string
  mode: WritingMode
  promptWords: string[]
  wordsUsed: string[]
  content: string
  published: boolean
  cosignCount: number
  coSigned: boolean
  tags?: string[]
  wordCount: number
  timeSpentSeconds?: number
  topicId?: string
  topicTitle?: string
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
export type AgentProvider = 'openrouter' | 'nvidia' | 'kimi' | 'google' | 'openai'

export type ApiSettings = {
  agentProvider?: AgentProvider
  agentModel: string
  openRouterKey: string
  openRouterModel: string
  openAiKey: string
  nvidiaKey?: string
  kimiKey?: string
  googleKey?: string
  unsplashKey?: string
  pexelsKey?: string
  ttsVoice: string
  /** TTS provider currently selected in Settings. */
  ttsProvider: TtsProvider
  /** OpenRouter audio model id, used when ttsProvider === 'openrouter'. */
  ttsModel: string
  elevenLabsKey: string
  elevenLabsVoice: string
  fishKey: string
  fishReferenceId: string
  /** DeepL API key (Free or Pro) */
  deepLKey?: string
  /** DeepL target translation language (e.g. EN-US, EN-GB, ES, DE, IT...) */
  deepLTargetLang?: string
  /** API token for youtube-transcript.io (https://www.youtube-transcript.io/api) */
  youtubeTranscriptApiKey?: string
  /** Provider for translation in speaking sessions: 'deepl' (default) or 'ai' */
  speakingTranslationProvider?: 'deepl' | 'ai'
  /** Custom AI model override for speaking translation (when speakingTranslationProvider === 'ai') */
  taskModelSpeakingTranslation?: string
  /** Custom AI model override for resource writing / story generation */
  taskModelResourceGeneration?: string
  /** Custom AI model override for saved words analysis and translation */
  taskModelWordAnalysis?: string
  /** Custom AI model override for URL web text extraction */
  taskModelUrlExtraction?: string
  /** Custom AI model override for writing correction and pedagogical teacher annotations */
  taskModelWritingCorrection?: string
  /** Enable dynamic advanced formatting for handwriting AI annotations */
  writingCorrectionAdvancedFormatting?: boolean
}

export type CustomTool = {
  id: string
  name: string
  description: string
  category: string
  url?: string
}



export type GrammarMarkType = 'verb' | 'noun' | 'adjective' | 'adverb' | 'expression' | string
export type GrammarMarkStyle = 'highlight' | 'underline' | 'overlay'

export type MarkingDefinition = {
  id: string
  label: string
  color: string
}

export type ReaderToolbarStyle = 'liquid' | 'opaque' | 'solid'

export type WordMark = {
  type: GrammarMarkType
  style: GrammarMarkStyle
  color: string
}

export type UserSettings = {
  name: string
  learningLanguage: Language
  /** Language of every interface text (never touches imported content). */
  uiLanguage: UiLanguage
  theme: 'light' | 'dark'
  readerFontSize: number
  readerWidth: 'comfortable' | 'wide'
  /** Approximate number of words per reader page. */
  readerPageSize: number
  showGrammar: boolean
  readerToolbarStyle?: ReaderToolbarStyle
  /** Default color per grammar mark type, overridden when the user picks one. */
  markColors: Partial<Record<string, string>>
  /** Custom keyboard shortcuts for Teacher Mode tools (tool id -> key). */
  teacherShortcuts?: Record<string, string>
  api: ApiSettings
}

export type AppState = {
  version: 3
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
  /** User-defined grammar and semantic markings in display order. */
  markings?: MarkingDefinition[]
  /** Legacy user-added tools from the former "Vivre" section. */
  customTools: CustomTool[]
  /** Tool names removed by the user from the recommended list. */
  removedTools: string[]
  customCategories: CustomCategory[]
  /** User-defined or global custom tags. */
  customTags?: string[]
}

export const todayKey = () => new Date().toISOString().slice(0, 10)

export const id = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

export const normalizeWord = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-zà-ÿ' -]/gi, '').replace(/\s+/g, ' ').trim()
