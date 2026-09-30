/**
 * FSRS-5 spaced-repetition scheduler (Free Spaced Repetition Scheduler).
 *
 * Pure functions only — no React, no app state — so the maths can be tested in
 * isolation. Each card tracks two memory variables:
 * - stability (S): number of days after which recall probability drops to 90 %;
 * - difficulty (D): 1 (easy) … 10 (hard), how fast stability grows.
 *
 * Due dates are "learning days" (YYYY-MM-DD) that roll over at 4 a.m. local time,
 * so a late-night review still counts for the evening it happened in.
 */

export type Rating = 1 | 2 | 3 | 4
export const RATINGS: Rating[] = [1, 2, 3, 4]
export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export type SrsCard = {
  state: CardState
  /** Days until recall probability falls to 90 %. */
  stability: number
  /** 1 … 10. */
  difficulty: number
  /** Learning day on which the card is due (YYYY-MM-DD). */
  due: string
  /** Exact time of the last graded review (ISO). */
  lastReview?: string
  /** Learning day of the last graded review — drives elapsed-days maths. */
  lastReviewDay?: string
  reps: number
  lapses: number
  /** Interval (days) chosen at the last review. */
  scheduledDays: number
}

export type SchedulerOptions = {
  /** Target probability of recall when a card comes due (0.8 … 0.97). */
  retention: number
  maximumInterval: number
  /** Stable seed (e.g. the word id) so the interval fuzz is deterministic. */
  fuzzSeed?: string
}

export type ScheduleResult = {
  card: SrsCard
  elapsedDays: number
  /** Recall probability at the moment of review (undefined for new cards). */
  retrievability?: number
  previousState: CardState
}

export const DEFAULT_SCHEDULER: SchedulerOptions = { retention: 0.9, maximumInterval: 36500 }

/** Published FSRS-5 default weights (trained on ~20k Anki collections). */
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const DECAY = -0.5
const FACTOR = 19 / 81
const MIN_STABILITY = 0.01
export const ROLLOVER_HOUR = 4

// ---------------------------------------------------------------------------
// Learning-day helpers
// ---------------------------------------------------------------------------

const pad = (value: number) => String(value).padStart(2, '0')

/** Local learning day (YYYY-MM-DD) for a moment, rolling over at 4 a.m. */
export function dayKey(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - ROLLOVER_HOUR * 3600_000)
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`
}

const keyToUtc = (key: string) => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

export function addDays(key: string, days: number): string {
  const date = new Date(keyToUtc(key) + days * 86_400_000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Memory model
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Probability of recall after `elapsedDays` for a given stability. */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(stability, MIN_STABILITY), DECAY)
}

const initStability = (rating: Rating) => Math.max(W[rating - 1], 0.1)

const initDifficulty = (rating: Rating) => clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10)

function nextDifficulty(difficulty: number, rating: Rating): number {
  const delta = -W[6] * (rating - 3)
  // Linear damping: the closer to 10, the smaller the step.
  const damped = difficulty + (delta * (10 - difficulty)) / 9
  // Mean reversion towards the difficulty of an "Easy" first answer.
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * damped, 1, 10)
}

function recallStability(difficulty: number, stability: number, retrievability: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? W[15] : 1
  const easyBonus = rating === 4 ? W[16] : 1
  return stability * (
    Math.exp(W[8]) * (11 - difficulty) * Math.pow(stability, -W[9]) *
    (Math.exp(W[10] * (1 - retrievability)) - 1) * hardPenalty * easyBonus + 1
  )
}

function forgetStability(difficulty: number, stability: number, retrievability: number): number {
  const next = W[11] * Math.pow(difficulty, -W[12]) * (Math.pow(stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - retrievability))
  // A lapse can never leave the memory stronger than it was.
  return Math.min(next, stability)
}

/** Same-day review (e.g. a card failed then seen again a few minutes later). */
const shortTermStability = (stability: number, rating: Rating) => stability * Math.exp(W[17] * (rating - 3 + W[18]))

/** Days to wait so that recall probability decays to the target retention. */
export function intervalFor(stability: number, retention: number, maximumInterval: number): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)
  return clamp(Math.round(raw), 1, maximumInterval)
}

/** Small deterministic ±5 % jitter so words learned together don't all come back together. */
function fuzz(interval: number, seed: string | undefined, maximumInterval: number): number {
  if (interval < 3 || !seed) return interval
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  const unit = ((hash >>> 0) % 10_000) / 10_000
  const delta = Math.max(1, Math.round(interval * 0.05))
  return clamp(interval + Math.floor(unit * (2 * delta + 1)) - delta, 2, maximumInterval)
}

export function newCard(today: string): SrsCard {
  return { state: 'new', stability: 0, difficulty: 0, due: today, reps: 0, lapses: 0, scheduledDays: 0 }
}

/** Current probability of recalling the card (1 for cards never reviewed). */
export function retrievability(card: SrsCard | undefined, now: Date = new Date()): number {
  if (!card || card.state === 'new' || !card.lastReviewDay) return 1
  return forgettingCurve(daysBetween(card.lastReviewDay, dayKey(now)), card.stability)
}

/**
 * Outcome of each of the four answers — used both to schedule and to label
 * the answer buttons ("1 j", "4 j", "2 sem."…).
 */
export function previewAll(card: SrsCard | undefined, now: Date, options: SchedulerOptions = DEFAULT_SCHEDULER): Record<Rating, ScheduleResult> {
  const today = dayKey(now)
  const current = card ?? newCard(today)
  const isNew = current.state === 'new'
  const elapsedDays = isNew || !current.lastReviewDay ? 0 : Math.max(0, daysBetween(current.lastReviewDay, today))
  const r = isNew ? undefined : forgettingCurve(elapsedDays, current.stability)

  const memory = (rating: Rating) => {
    if (isNew) return { stability: initStability(rating), difficulty: initDifficulty(rating) }
    const difficulty = nextDifficulty(current.difficulty, rating)
    if (elapsedDays === 0) return { stability: Math.max(shortTermStability(current.stability, rating), MIN_STABILITY), difficulty }
    const stability = rating === 1
      ? forgetStability(current.difficulty, current.stability, r!)
      : recallStability(current.difficulty, current.stability, r!, rating)
    return { stability: Math.max(stability, MIN_STABILITY), difficulty }
  }

  const memories = { 1: memory(1), 2: memory(2), 3: memory(3), 4: memory(4) } as Record<Rating, { stability: number; difficulty: number }>
  const seed = options.fuzzSeed ? `${options.fuzzSeed}:${current.reps}` : undefined
  let hard = fuzz(intervalFor(memories[2].stability, options.retention, options.maximumInterval), seed, options.maximumInterval)
  let good = fuzz(intervalFor(memories[3].stability, options.retention, options.maximumInterval), seed, options.maximumInterval)
  let easy = fuzz(intervalFor(memories[4].stability, options.retention, options.maximumInterval), seed, options.maximumInterval)
  hard = Math.min(hard, good)
  good = Math.max(good, hard + 1)
  easy = Math.max(easy, good + 1)
  const intervals: Record<Rating, number> = { 1: 0, 2: hard, 3: good, 4: easy }

  const build = (rating: Rating): ScheduleResult => {
    const failed = rating === 1
    const wasReviewing = current.state === 'review'
    const state: CardState = failed ? (wasReviewing || current.state === 'relearning' ? 'relearning' : 'learning') : 'review'
    return {
      previousState: current.state,
      elapsedDays,
      retrievability: r,
      card: {
        state,
        stability: memories[rating].stability,
        difficulty: memories[rating].difficulty,
        due: addDays(today, intervals[rating]),
        lastReview: now.toISOString(),
        lastReviewDay: today,
        reps: current.reps + 1,
        lapses: current.lapses + (failed && wasReviewing ? 1 : 0),
        scheduledDays: intervals[rating],
      },
    }
  }

  return { 1: build(1), 2: build(2), 3: build(3), 4: build(4) }
}

export function schedule(card: SrsCard | undefined, rating: Rating, now: Date, options: SchedulerOptions = DEFAULT_SCHEDULER): ScheduleResult {
  return previewAll(card, now, options)[rating]
}

/** Short human label for an interval, e.g. "10 min", "3 j", "2 sem.", "4 mois". */
export function formatInterval(days: number, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr'
  if (days <= 0) return fr ? '< 10 min' : '< 10 min'
  if (days < 7) return fr ? `${days} j` : `${days}d`
  if (days < 30) { const weeks = Math.round(days / 7); return fr ? `${weeks} sem.` : `${weeks}w` }
  if (days < 365) { const months = Math.round(days / 30); return fr ? `${months} mois` : `${months}mo` }
  const years = Math.round((days / 365) * 10) / 10
  return fr ? `${years} an${years >= 2 ? 's' : ''}` : `${years}y`
}
