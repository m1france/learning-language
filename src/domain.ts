export type Language = string
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
  archived?: boolean
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
  /** Custom AI model override for speaking video analysis and pronunciation/rhythm/structure coaching */
  taskModelSpeakingAnalysis?: string
  /** Custom AI model override for resource writing / story generation */
  taskModelResourceGeneration?: string
  /** Custom AI model override for saved words analysis and translation */
  taskModelWordAnalysis?: string
  /** Custom AI model override for URL web text extraction */
  taskModelUrlExtraction?: string
  /** Custom AI model override for writing correction and pedagogical teacher annotations */
  taskModelWritingCorrection?: string
  /** Custom AI model override for Exercise Builder interactive exercise generation */
  taskModelExerciseBuilder?: string
  /** Custom AI model override for Teacher Mode annotation alignment and fidelity optimization */
  taskModelTeacherAlignment?: string
  /** Enable dynamic advanced formatting for handwriting AI annotations */
  writingCorrectionAdvancedFormatting?: boolean
  /** Gemini model for cover image generation via Google AI Studio (e.g. gemini-2.5-flash-image) */
  googleImageModel?: string
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
  /** Nom d'utilisateur personnalisé utilisé pour les liens d'export : share.mathisbnl.info/{teacherUsername}/... */
  teacherUsername?: string
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

export const normalizeWord = (value: string): string => {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nettoie une chaîne de mot brute en supprimant la ponctuation et les guillemets
 * en bordure de mot de façon cohérente et robuste.
 */
export function cleanWordRaw(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/^[\s.,!?;:()"“”«»'’‘`—–[\]{}/*\\<>~|#№…]+/gu, '')
    .replace(/[\s.,!?;:()"“”«»'’‘`—–[\]{}/*\\<>~|#№…]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generates singular/base lemmas and regular inflection variants (e.g. plural -s/-es/-ies, 3rd person singular -s/-es,
 * regular past -ed, progressive -ing) for a word or lemma. Used to prevent redundant duplicate vocabulary entries
 * and enable seamless matching between text surface forms and recorded lemmas.
 */
export function getInflectionVariants(rawOrNorm: string): string[] {
  const norm = normalizeWord(rawOrNorm)
  if (!norm || norm.length <= 1) return norm ? [norm] : []

  const variants = new Set<string>([norm])

  // 1. Déclinaisons depuis les formes plurielles ou 3e personne en -s
  if (norm.endsWith('s') && norm.length > 2) {
    // e.g. "trains" -> "train", "books" -> "book", "walks" -> "walk", "coats" -> "coat"
    if (norm.length > 3) {
      variants.add(norm.slice(0, -1))
    }

    // e.g. "watches" -> "watch", "boxes" -> "box", "glasses" -> "glass", "buses" -> "bus"
    if (norm.endsWith('es') && norm.length > 3) {
      variants.add(norm.slice(0, -2))
      variants.add(norm.slice(0, -1))
    }

    // e.g. "cities" -> "city", "countries" -> "country", "tries" -> "try"
    if (norm.endsWith('ies') && norm.length > 4) {
      variants.add(norm.slice(0, -3) + 'y')
    }
  } else {
    // Si singulier/base, générer les formes régulières pluriel / 3e personne :
    variants.add(norm + 's')

    if (/(ch|sh|ss|x|z|o)$/i.test(norm)) {
      variants.add(norm + 'es')
    }

    if (/[^aeiou]y$/i.test(norm) && norm.length > 2) {
      variants.add(norm.slice(0, -1) + 'ies')
    }
  }

  // 2. Déclinaisons du passé régulier en -ed / -d
  if (norm.endsWith('ed') && norm.length > 3) {
    // "walked" -> "walk", "played" -> "play"
    variants.add(norm.slice(0, -2))
    // "liked" -> "like", "hated" -> "hate"
    variants.add(norm.slice(0, -1))
    // "stopped" -> "stop"
    if (norm.length > 5 && norm[norm.length - 3] === norm[norm.length - 4]) {
      variants.add(norm.slice(0, -3))
    }
  } else if (!norm.endsWith('s')) {
    variants.add(norm + 'ed')
    variants.add(norm + 'd')
  }

  // 3. Déclinaisons en -ing
  if (norm.endsWith('ing') && norm.length > 4) {
    // "walking" -> "walk", "playing" -> "play"
    variants.add(norm.slice(0, -3))
    // "living" -> "live", "making" -> "make"
    variants.add(norm.slice(0, -3) + 'e')
    // "stopping" -> "stop"
    if (norm.length > 6 && norm[norm.length - 4] === norm[norm.length - 5]) {
      variants.add(norm.slice(0, -4))
    }
  } else if (!norm.endsWith('s')) {
    variants.add(norm + 'ing')
  }

  return Array.from(variants)
}
