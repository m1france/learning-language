import type { Difficulty, Language, UiLanguage } from '../../domain'
import { exercisesCopy } from '../../i18n/exercisesCopy'

export type ExerciseMode =
  | 'auto'
  | 'fill_in_blanks'
  | 'crossword'
  | 'match_pairs'
  | 'sentence_scramble'
  | 'image_association'
  | 'error_hunter'
  | 'dialogue_roleplay'
  | 'handwritten_mastery'
  | 'grammar_deepdive'

export type ExerciseModeInfo = {
  id: ExerciseMode
  labelFr: string
  labelEn: string
  descFr: string
  descEn: string
  icon: string
  badgeColor: string
}

export function getExerciseModeInfo(mode: ExerciseMode, ui: UiLanguage = 'fr') {
  const fallback = EXERCISE_MODES_INFO.find((m) => m.id === mode) || EXERCISE_MODES_INFO[0]
  const copy = exercisesCopy[ui]?.modes?.[mode]
  return {
    id: mode,
    label: copy?.label || fallback.labelFr,
    desc: copy?.desc || fallback.descFr,
    icon: fallback.icon,
    badgeColor: fallback.badgeColor,
  }
}

export const EXERCISE_MODES_INFO: ExerciseModeInfo[] = [
  {
    id: 'auto',
    labelFr: '✨ Mode Intelligent (IA)',
    labelEn: '✨ Smart Auto (AI)',
    descFr: 'L’IA choisit le format le plus percutant pour ta difficulté',
    descEn: 'AI selects the most effective exercise format for your needs',
    icon: '✨',
    badgeColor: '#ee775d',
  },
  {
    id: 'fill_in_blanks',
    labelFr: 'Textes à trous',
    labelEn: 'Fill in the blanks',
    descFr: 'Complète les phrases avec les bons accords et temps',
    descEn: 'Complete sentences with correct verb forms & prepositions',
    icon: '✍️',
    badgeColor: '#3b82f6',
  },
  {
    id: 'crossword',
    labelFr: 'Mots croisés',
    labelEn: 'Crossword Puzzle',
    descFr: 'Grille interactive avec indices thématiques',
    descEn: 'Interactive grid with clues & letters validation',
    icon: '🧩',
    badgeColor: '#8b5cf6',
  },
  {
    id: 'match_pairs',
    labelFr: 'Relier les paires',
    labelEn: 'Match Pairs',
    descFr: 'Associe les mots, synonymes ou structures correspondantes',
    descEn: 'Connect matching words, synonyms, or structures',
    icon: '🔗',
    badgeColor: '#10b981',
  },
  {
    id: 'sentence_scramble',
    labelFr: 'Remise en ordre',
    labelEn: 'Sentence Scramble',
    descFr: 'Assemble les briques de mots dans l’ordre grammatical exact',
    descEn: 'Reorder word tiles into correct grammatical sentences',
    icon: '🧱',
    badgeColor: '#f59e0b',
  },
  {
    id: 'error_hunter',
    labelFr: 'Chasse aux erreurs',
    labelEn: 'Error Hunter',
    descFr: 'Repère les pièges et fautes dissimulés dans le texte',
    descEn: 'Find and fix tricky mistakes embedded in a passage',
    icon: '🔍',
    badgeColor: '#ef4444',
  },
  {
    id: 'dialogue_roleplay',
    labelFr: 'Mise en situation',
    labelEn: 'Dialogue & Roleplay',
    descFr: 'Choisis les meilleures répliques en contexte réel',
    descEn: 'Choose natural responses in interactive real-life dialogues',
    icon: '🎭',
    badgeColor: '#06b6d4',
  },
  {
    id: 'handwritten_mastery',
    labelFr: 'Leçon & Style manuscrit',
    labelEn: 'Handwritten Mastery',
    descFr: 'Explications visuelles vert/rouge : pourquoi ceci et pas cela',
    descEn: 'Visual red/green cursive markup: why write this and not that',
    icon: '🖋️',
    badgeColor: '#16a34a',
  },
  {
    id: 'grammar_deepdive',
    labelFr: 'Grammaire & Quiz',
    labelEn: 'Grammar Deep Dive',
    descFr: 'Règle synthétique, tableau comparatif et quiz progressif',
    descEn: 'Concise rule summary, comparison table & quiz',
    icon: '📐',
    badgeColor: '#6366f1',
  },
  {
    id: 'image_association',
    labelFr: 'Cartes visuelles',
    labelEn: 'Visual Cards',
    descFr: 'Associe des situations illustrées aux bonnes expressions',
    descEn: 'Match illustrated scenarios with accurate expressions',
    icon: '🖼️',
    badgeColor: '#ec4899',
  },
]

// ==========================================
// 1. Fill in Blanks Types
// ==========================================
export type BlankItem = {
  id: string
  beforeText: string
  expectedAnswer: string
  acceptableAlternatives?: string[]
  afterText: string
  hint?: string
  explanation: string
  wrongExamplesWithWhy?: { wrong: string; why: string }[]
}

export type FillInBlanksData = {
  items: BlankItem[]
  wordBank?: string[]
}

// ==========================================
// 2. Crossword Puzzle Types
// ==========================================
export type CrosswordClue = {
  number: number
  direction: 'across' | 'down'
  clue: string
  answer: string
  row: number // 0-indexed starting row in grid
  col: number // 0-indexed starting col in grid
  hint?: string
  explanation?: string
}

export type CrosswordData = {
  gridRows: number
  gridCols: number
  clues: CrosswordClue[]
  theme: string
}

// ==========================================
// 3. Match Pairs Types
// ==========================================
export type MatchPairItem = {
  id: string
  left: string
  right: string
  leftContext?: string
  rightContext?: string
  explanation: string
}

export type MatchPairsData = {
  pairs: MatchPairItem[]
  leftCategoryLabel?: string
  rightCategoryLabel?: string
}

// ==========================================
// 4. Sentence Scramble Types
// ==========================================
export type ScrambleItem = {
  id: string
  scrambledTokens: string[]
  correctSentence: string
  frenchTranslation?: string
  grammarRuleTip: string
  explanation: string
}

export type SentenceScrambleData = {
  items: ScrambleItem[]
}

// ==========================================
// 5. Image / Card Association Types
// ==========================================
export type ImageCardItem = {
  id: string
  emojiOrIcon: string
  visualScenario: string
  imageSearchQuery?: string
  correctExpression: string
  distractorExpressions: string[]
  explanation: string
}

export type ImageAssociationData = {
  items: ImageCardItem[]
}

// ==========================================
// 6. Error Hunter Types
// ==========================================
export type ErrorHunterSegment = {
  text: string
  isError: boolean
  errorId?: string
  wrongWord?: string
  correctedWord?: string
  explanation?: string
  ruleTip?: string
}

export type ErrorHunterData = {
  storyText: string
  segments: ErrorHunterSegment[]
  totalErrorsCount: number
}

// ==========================================
// 7. Dialogue & Roleplay Types
// ==========================================
export type DialogueChoice = {
  id: string
  text: string
  isOptimal: boolean
  feedback: string
  handwritingNote?: string
}

export type DialogueTurn = {
  speaker: string
  speakerAvatar?: string
  text: string
  userChoices: DialogueChoice[]
}

export type DialogueRoleplayData = {
  scenarioTitle: string
  contextSetting: string
  turns: DialogueTurn[]
}

// ==========================================
// 8. Handwritten Mastery Lesson Types
// ==========================================
export type HandwrittenAnnotationItem = {
  id: string
  badSentence: string
  wrongSnippet: string
  goodSnippet: string
  correctedSentence: string
  whyExplanation: string
  ruleBox: string
  practiceQuestion?: {
    prompt: string
    options: string[]
    correctIndex: number
    handwritingTip: string
  }
}

export type HandwrittenQuizQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  handwritingTip: string
}

export type HandwrittenMasteryData = {
  coreTopic: string
  goldenRule: string
  lessonIntroduction?: string
  examples: HandwrittenAnnotationItem[]
  quizQuestions?: HandwrittenQuizQuestion[]
}

// ==========================================
// 9. Grammar Deep Dive Types
// ==========================================
export type GrammarQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
  handwritingAdvice: string
}

export type GrammarDeepdiveData = {
  ruleTitle: string
  ruleExplanation: string
  summaryTable?: { headers: string[]; rows: string[][] }
  commonMistakes: { mistake: string; correction: string; why: string }[]
  questions: GrammarQuestion[]
}



// ==========================================
// Complete Exercise Definition & History
// ==========================================
export type ExerciseDefinition = {
  id: string
  title: string
  targetProblem: string
  mode: ExerciseMode
  difficulty: Difficulty
  instructions: string
  ruleReminder?: string
  targetLanguage: Language
  createdAt: string

  // Mode specific datasets
  fillInBlanksData?: FillInBlanksData
  crosswordData?: CrosswordData
  matchPairsData?: MatchPairsData
  sentenceScrambleData?: SentenceScrambleData
  imageAssociationData?: ImageAssociationData
  errorHunterData?: ErrorHunterData
  dialogueRoleplayData?: DialogueRoleplayData
  handwrittenMasteryData?: HandwrittenMasteryData
  grammarDeepdiveData?: GrammarDeepdiveData
}

export type ExerciseHistoryRecord = {
  id: string
  title: string
  targetProblem: string
  mode: ExerciseMode
  targetLanguage: Language
  score?: number
  maxScore?: number
  completedAt: string
  exerciseData: ExerciseDefinition
  userAnswers?: Record<string, any>
  notes?: string
}
