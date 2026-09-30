import type { AppState, DayActivity, LearnedWord, LearningSettings, ReviewLogEntry, ReviewMode } from '../../domain'
import { id } from '../../domain'
import { type Rating, type SrsCard, addDays, dayKey, daysBetween, previewAll, retrievability, schedule } from './fsrs'

/**
 * Spaced-repetition state operations. Every function is pure (state in, state out)
 * so it can be used inside `change((prev) => …)` without side effects.
 */

export const DEFAULT_LEARNING: LearningSettings = {
  dailyMinutes: 15,
  newCardsPerDay: 10,
  maxReviewsPerDay: 150,
  retention: 0.9,
  maximumInterval: 365,
  reviewMode: 'auto',
  autoPlayAudio: true,
  typeAnswer: true,
  sessionReviewCap: 40,
  sessionSteps: { review: true, reading: true, writing: true, speaking: true },
}

const REVIEW_LOG_CAP = 20_000
/** Lapses after which a word is flagged as "résistant" (a leech in Anki terms). */
export const LEECH_LAPSES = 4

export const learningSettings = (state: AppState): LearningSettings => {
  const custom = state.settings.learning ?? {}
  return { ...DEFAULT_LEARNING, ...custom, sessionSteps: { ...DEFAULT_LEARNING.sessionSteps, ...custom.sessionSteps } }
}

export const schedulerOptions = (settings: LearningSettings, seed?: string) => ({
  retention: settings.retention,
  maximumInterval: settings.maximumInterval,
  fuzzSeed: seed,
})

// ---------------------------------------------------------------------------
// Card classification
// ---------------------------------------------------------------------------

/** Words set to "connu par cœur" (knowledge 6) are known: they leave the review cycle. */
export const isReviewable = (word: LearnedWord) => word.knowledge !== 6

export const isNewCard = (word: LearnedWord) => !word.srs || word.srs.state === 'new'

export const isDue = (word: LearnedWord, today: string) => !isNewCard(word) && word.srs!.due <= today

/** Reader highlight level (1 … 5) derived from memory stability. */
export function knowledgeFromStability(stability: number): number {
  if (stability < 1.5) return 1
  if (stability < 4) return 2
  if (stability < 10) return 3
  if (stability < 30) return 4
  return 5
}

export type Maturity = 'new' | 'learning' | 'young' | 'mature' | 'known'

export function maturityOf(word: LearnedWord): Maturity {
  if (word.knowledge === 6) return 'known'
  if (isNewCard(word)) return 'new'
  const card = word.srs!
  if (card.state === 'learning' || card.state === 'relearning') return 'learning'
  return card.scheduledDays >= 21 ? 'mature' : 'young'
}

/**
 * Presentation for a card. In "auto", difficulty grows with the memory:
 * fresh words are recognised (English → meaning), settled ones must be
 * produced (meaning → English), strong ones are also heard without text.
 */
export function pickReviewMode(word: LearnedWord, preference: LearningSettings['reviewMode']): ReviewMode {
  if (preference !== 'auto') {
    if (preference === 'recall' && !hasMeaning(word)) return 'recognition'
    return preference
  }
  const stability = word.srs?.stability ?? 0
  const reps = word.srs?.reps ?? 0
  if (isNewCard(word) || stability < 3 || !hasMeaning(word)) return 'recognition'
  if (stability < 12) return reps % 2 === 0 ? 'recall' : 'recognition'
  return (['recall', 'listening', 'recognition'] as const)[reps % 3]
}

export const hasMeaning = (word: LearnedWord) => Boolean(word.translation?.trim() || word.definitions?.some((d) => d.translation?.trim()))

export const meaningOf = (word: LearnedWord) =>
  word.translation?.trim() || word.definitions?.map((d) => d.translation).filter(Boolean).join(' · ') || ''

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export type ReviewQueue = {
  /** Cards to study, in order (new cards interleaved with reviews). */
  ids: string[]
  dueCount: number
  newCount: number
  learningCount: number
  /** Due cards left out because of the daily cap. */
  overflow: number
}

export function activityFor(state: AppState, day: string): DayActivity {
  return state.activity?.[day] ?? { seconds: 0, reviews: 0, correct: 0, newCards: 0 }
}

export function buildReviewQueue(
  state: AppState,
  now: Date = new Date(),
  options: { cap?: number; includeNew?: boolean } = {},
): ReviewQueue {
  const settings = learningSettings(state)
  const today = dayKey(now)
  const language = state.settings.learningLanguage
  const words = state.words.filter((word) => word.language === language && isReviewable(word))
  const doneToday = activityFor(state, today)

  const learning = words
    .filter((word) => isDue(word, today) && (word.srs!.state === 'learning' || word.srs!.state === 'relearning'))
  // Most-at-risk first, so a short session protects the weakest memories.
  const due = words
    .filter((word) => isDue(word, today) && word.srs!.state === 'review')
    .sort((a, b) => retrievability(a.srs, now) - retrievability(b.srs, now))

  const reviewBudget = Math.max(0, settings.maxReviewsPerDay - (doneToday.reviews - doneToday.newCards))
  const cap = options.cap ?? Number.POSITIVE_INFINITY
  const reviews = [...learning, ...due]
  const keptReviews = reviews.slice(0, Math.min(reviewBudget, cap))

  const newBudget = options.includeNew === false ? 0 : Math.max(0, settings.newCardsPerDay - doneToday.newCards)
  // Freshest words first: their reading context is still in mind.
  const fresh = words
    .filter(isNewCard)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(0, Math.min(newBudget, cap - keptReviews.length)))

  // One new card after every three reviews keeps sessions varied.
  const ids: string[] = []
  let r = 0
  let n = 0
  while (r < keptReviews.length || n < fresh.length) {
    for (let k = 0; k < 3 && r < keptReviews.length; k += 1) ids.push(keptReviews[r++].id)
    if (n < fresh.length) ids.push(fresh[n++].id)
  }

  return {
    ids,
    dueCount: keptReviews.filter((word) => word.srs!.state === 'review').length,
    learningCount: keptReviews.filter((word) => word.srs!.state !== 'review').length,
    newCount: fresh.length,
    overflow: reviews.length - keptReviews.length,
  }
}

/** Words for the free "practice" mode — never rescheduled. */
export type PracticeFilter =
  | { kind: 'all' }
  | { kind: 'tag'; tag: string }
  | { kind: 'resource'; resourceId: string }
  | { kind: 'struggling' }
  | { kind: 'recent'; days: number }

export function practiceWords(state: AppState, filter: PracticeFilter, now: Date = new Date()): LearnedWord[] {
  const language = state.settings.learningLanguage
  const words = state.words.filter((word) => word.language === language && isReviewable(word))
  switch (filter.kind) {
    case 'tag': return words.filter((word) => word.tags?.includes(filter.tag))
    case 'resource': return words.filter((word) => word.sourceResourceId === filter.resourceId)
    case 'struggling': return words
      .filter((word) => (word.srs?.lapses ?? 0) > 0 || (word.knowledge ?? 1) <= 2)
      .sort((a, b) => (b.srs?.lapses ?? 0) - (a.srs?.lapses ?? 0))
    case 'recent': {
      const since = now.getTime() - filter.days * 86_400_000
      return words.filter((word) => new Date(word.createdAt).getTime() >= since)
    }
    default: return words
  }
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/** Everything needed to take a review back ("Annuler"). */
export type ReviewUndo = {
  word: LearnedWord
  logId: string
  day: string
  wasNew: boolean
  wasCorrect: boolean
}

function bumpActivity(state: AppState, day: string, patch: (current: DayActivity) => DayActivity): AppState {
  return { ...state, activity: { ...(state.activity ?? {}), [day]: patch(activityFor(state, day)) } }
}

/** Word fields that mirror the FSRS card, kept for the older screens that still read them. */
function withCard(word: LearnedWord, card: SrsCard): LearnedWord {
  const knowledge = word.knowledge === 6 ? 6 : knowledgeFromStability(card.stability)
  return {
    ...word,
    srs: card,
    knowledge,
    status: card.scheduledDays >= 21 ? 'learned' : 'learning',
    intervalDays: card.scheduledDays,
    nextReview: card.due,
    reviewCount: card.reps,
  }
}

export function applyReview(
  state: AppState,
  args: { wordId: string; rating: Rating; mode: ReviewLogEntry['mode']; durationMs: number; now: Date; logId: string },
): AppState {
  const word = state.words.find((item) => item.id === args.wordId)
  if (!word) return state
  const settings = learningSettings(state)
  const result = schedule(word.srs, args.rating, args.now, schedulerOptions(settings, word.id))
  const entry: ReviewLogEntry = {
    id: args.logId,
    wordId: word.id,
    rating: args.rating,
    mode: args.mode,
    reviewedAt: args.now.toISOString(),
    day: dayKey(args.now),
    elapsedDays: result.elapsedDays,
    scheduledDays: result.card.scheduledDays,
    previousState: result.previousState,
    durationMs: Math.min(args.durationMs, 120_000),
  }
  const log = [...(state.reviewLog ?? []), entry]
  const next: AppState = {
    ...state,
    words: state.words.map((item) => (item.id === word.id ? withCard(item, result.card) : item)),
    reviewLog: log.length > REVIEW_LOG_CAP ? log.slice(log.length - REVIEW_LOG_CAP) : log,
  }
  return bumpActivity(next, entry.day, (current) => ({
    ...current,
    reviews: current.reviews + 1,
    correct: current.correct + (args.rating > 1 ? 1 : 0),
    newCards: current.newCards + (result.previousState === 'new' ? 1 : 0),
  }))
}

export function undoReview(state: AppState, undo: ReviewUndo): AppState {
  const next: AppState = {
    ...state,
    words: state.words.map((item) => (item.id === undo.word.id ? undo.word : item)),
    reviewLog: (state.reviewLog ?? []).filter((entry) => entry.id !== undo.logId),
  }
  return bumpActivity(next, undo.day, (current) => ({
    ...current,
    reviews: Math.max(0, current.reviews - 1),
    correct: Math.max(0, current.correct - (undo.wasCorrect ? 1 : 0)),
    newCards: Math.max(0, current.newCards - (undo.wasNew ? 1 : 0)),
  }))
}

export const newLogId = () => id('review')

/**
 * Using a word correctly while writing is a genuine recall: counts as "Bien"
 * for cards already in review. Never-reviewed words simply gain a knowledge
 * level (their first real review stays in the review screen).
 */
export function recordWritingRecall(state: AppState, wordIds: string[], now: Date = new Date()): AppState {
  if (!wordIds.length) return state
  const today = dayKey(now)
  const used = new Set(wordIds)
  let next = state
  for (const word of state.words) {
    if (!used.has(word.id)) continue
    if (isNewCard(word)) {
      if (word.knowledge === 6) continue
      next = { ...next, words: next.words.map((item) => item.id === word.id ? { ...item, knowledge: Math.min(5, (item.knowledge ?? 1) + 1) } : item) }
      continue
    }
    if (word.srs!.lastReviewDay === today) continue
    next = applyReview(next, { wordId: word.id, rating: 3, mode: 'writing', durationMs: 0, now, logId: newLogId() })
  }
  return next
}

export function updateWordFields(state: AppState, wordId: string, patch: Partial<Pick<LearnedWord, 'translation' | 'knowledge' | 'phonetic'>>): AppState {
  return {
    ...state,
    words: state.words.map((word) => {
      if (word.id !== wordId) return word
      const updated = { ...word, ...patch }
      if (patch.translation !== undefined) updated.definitions = patch.translation ? [{ definition: '', translation: patch.translation }] : []
      if (patch.knowledge === 6) updated.status = 'mastered'
      return updated
    }),
  }
}

/** Forget the spaced-repetition history of a word (it becomes a new card again). */
export function resetCard(state: AppState, wordId: string): AppState {
  return { ...state, words: state.words.map((word) => (word.id === wordId ? { ...word, srs: undefined, reviewCount: 0, intervalDays: 1 } : word)) }
}

export function addActivitySeconds(state: AppState, seconds: number, now: Date = new Date()): AppState {
  return bumpActivity(state, dayKey(now), (current) => ({ ...current, seconds: current.seconds + seconds }))
}

export function patchActivity(state: AppState, patch: Partial<DayActivity>, now: Date = new Date()): AppState {
  return bumpActivity(state, dayKey(now), (current) => ({
    ...current,
    ...patch,
    writtenWords: (current.writtenWords ?? 0) + (patch.writtenWords ?? 0),
    spokenSentences: (current.spokenSentences ?? 0) + (patch.spokenSentences ?? 0),
  }))
}

export { previewAll }

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** A day counts toward the streak once the guided session is done or the time goal is met. */
export const isDayDone = (activity: DayActivity | undefined, goalMinutes: number) =>
  Boolean(activity && (activity.sessionDone || activity.seconds >= goalMinutes * 60))

export type StreakDay = { day: string; status: 'done' | 'joker' | 'missed' | 'today' | 'future'; minutes: number }

export type Streak = {
  current: number
  best: number
  /** Rest days available (earned every 7 days of streak, max 2). */
  jokers: number
  todayDone: boolean
  /** Monday → Sunday of the current week. */
  week: StreakDay[]
}

/**
 * Streak with forgiving rest days: every 7 consecutive days earn a "joker"
 * (max 2) that silently covers a missed day. Recomputed from history, so it
 * needs no extra stored state.
 */
export function computeStreak(activity: Record<string, DayActivity> | undefined, goalMinutes: number, now: Date = new Date()): Streak {
  const today = dayKey(now)
  const days = Object.keys(activity ?? {}).filter((day) => isDayDone(activity![day], goalMinutes)).sort()
  const covered = new Map<string, StreakDay['status']>()
  let current = 0
  let best = 0
  let jokers = 0
  let earnedAt = 0

  if (days.length) {
    for (let day = days[0]; day <= today; day = addDays(day, 1)) {
      if (isDayDone(activity?.[day], goalMinutes)) {
        current += 1
        covered.set(day, 'done')
        if (current - earnedAt >= 7) { jokers = Math.min(2, jokers + 1); earnedAt = current }
      } else if (day === today) {
        // Today is not over yet.
      } else if (jokers > 0) {
        jokers -= 1
        covered.set(day, 'joker')
      } else {
        current = 0
        earnedAt = 0
      }
      best = Math.max(best, current)
    }
  }

  const shifted = new Date(`${today}T12:00:00`)
  const monday = addDays(today, -((shifted.getDay() + 6) % 7))
  const week: StreakDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index)
    const minutes = Math.round((activity?.[day]?.seconds ?? 0) / 60)
    if (day > today) return { day, status: 'future', minutes }
    if (covered.get(day) === 'done') return { day, status: 'done', minutes }
    if (covered.get(day) === 'joker') return { day, status: 'joker', minutes }
    return { day, status: day === today ? 'today' : 'missed', minutes }
  })

  return { current, best, jokers, todayDone: isDayDone(activity?.[today], goalMinutes), week }
}

export function maturityCounts(state: AppState): Record<Maturity, number> {
  const counts: Record<Maturity, number> = { new: 0, learning: 0, young: 0, mature: 0, known: 0 }
  for (const word of state.words) {
    if (word.language === state.settings.learningLanguage) counts[maturityOf(word)] += 1
  }
  return counts
}

/** Due reviews for each of the next `days` days (overdue cards count today). */
export function forecast(state: AppState, days = 14, now: Date = new Date()): { day: string; count: number }[] {
  const today = dayKey(now)
  const buckets = Array.from({ length: days }, (_, index) => ({ day: addDays(today, index), count: 0 }))
  for (const word of state.words) {
    if (word.language !== state.settings.learningLanguage || !isReviewable(word) || isNewCard(word)) continue
    const offset = Math.max(0, daysBetween(today, word.srs!.due))
    if (offset < days) buckets[offset].count += 1
  }
  return buckets
}

/** Share of mature-ish reviews (not first sightings) answered correctly. */
export function retentionRate(state: AppState, days = 30, now: Date = new Date()): { rate: number | null; count: number } {
  const since = addDays(dayKey(now), -days)
  const relevant = (state.reviewLog ?? []).filter((entry) => entry.day > since && entry.previousState === 'review')
  if (!relevant.length) return { rate: null, count: 0 }
  return { rate: relevant.filter((entry) => entry.rating > 1).length / relevant.length, count: relevant.length }
}

export function strugglingWords(state: AppState, limit = 8): LearnedWord[] {
  return state.words
    .filter((word) => word.language === state.settings.learningLanguage && isReviewable(word) && (word.srs?.lapses ?? 0) >= 2)
    .sort((a, b) => (b.srs?.lapses ?? 0) - (a.srs?.lapses ?? 0))
    .slice(0, limit)
}

/** Next day (after today) with something due, and how much. */
export function nextDue(state: AppState, now: Date = new Date()): { day: string; count: number } | null {
  const today = dayKey(now)
  let best: string | null = null
  for (const word of state.words) {
    if (word.language !== state.settings.learningLanguage || !isReviewable(word) || isNewCard(word)) continue
    if (word.srs!.due > today && (!best || word.srs!.due < best)) best = word.srs!.due
  }
  if (!best) return null
  const day = best
  return { day, count: state.words.filter((word) => word.srs?.due === day && isReviewable(word) && word.language === state.settings.learningLanguage).length }
}
