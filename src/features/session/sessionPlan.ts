import type { AppState, DailySession, LearnedWord, Resource, SessionStep, SessionStepId } from '../../domain'
import { dayKey } from '../srs/fsrs'
import { buildReviewQueue, isReviewable, learningSettings, patchActivity } from '../srs/srsStore'

/**
 * The guided daily session: a short, fixed path through every skill —
 * review → read → today's new words → write → speak. Pure state helpers.
 */

export const WRITING_SENTENCES = 3
export const SPEAKING_SENTENCES = 3
const WRITING_WORDS = 3

/** The text the learner is currently reading (latest progress), else the first unread one. */
export function pickReadingResource(state: AppState): Resource | undefined {
  const active = state.resources.filter((resource) => !resource.archived && resource.language === state.settings.learningLanguage)
  const inProgress = active
    .filter((resource) => state.progress[resource.id] && !state.progress[resource.id].completed)
    .sort((a, b) => state.progress[b.id].updatedAt.localeCompare(state.progress[a.id].updatedAt))
  return inProgress[0] ?? active.find((resource) => !state.progress[resource.id]?.completed) ?? active[0]
}

export function planDailySession(state: AppState, now: Date = new Date()): DailySession {
  const settings = learningSettings(state)
  const steps: SessionStep[] = []
  const queue = buildReviewQueue(state, now, { cap: settings.sessionReviewCap })
  const resource = pickReadingResource(state)
  if (settings.sessionSteps.review && queue.ids.length > 0) steps.push({ id: 'review', status: 'pending' })
  if (settings.sessionSteps.reading && resource) steps.push({ id: 'reading', status: 'pending' })
  if (settings.sessionSteps.writing) steps.push({ id: 'writing', status: 'pending' })
  if (settings.sessionSteps.speaking) steps.push({ id: 'speaking', status: 'pending' })
  return {
    day: dayKey(now),
    startedAt: now.toISOString(),
    steps,
    currentStep: 0,
    resourceId: resource?.id,
    struggledIds: [],
    newWordIds: [],
  }
}

/** Today's session if it exists, otherwise a preview of what it would be (not saved). */
export function sessionForToday(state: AppState, now: Date = new Date()): { session: DailySession; started: boolean } {
  const existing = state.dailySession
  if (existing && existing.day === dayKey(now)) return { session: existing, started: true }
  return { session: planDailySession(state, now), started: false }
}

export function startSession(state: AppState, now: Date = new Date()): AppState {
  const { session, started } = sessionForToday(state, now)
  return started ? state : { ...state, dailySession: session }
}

const updateSession = (state: AppState, patch: (session: DailySession) => DailySession): AppState =>
  state.dailySession ? { ...state, dailySession: patch(state.dailySession) } : state

export const currentStepId = (session: DailySession): SessionStepId | undefined =>
  session.completedAt ? undefined : session.steps[session.currentStep]?.id

/** Closes the current step (done or skipped) and moves to the next pending one. */
export function closeStep(state: AppState, status: 'done' | 'skipped', stats?: Record<string, number>, now: Date = new Date()): AppState {
  const session = state.dailySession
  if (!session || session.completedAt) return state
  const steps = session.steps.map((step, index) =>
    index === session.currentStep ? { ...step, status, stats: sumStats(step.stats, stats), completedAt: now.toISOString() } : step)
  const nextIndex = steps.findIndex((step, index) => index > session.currentStep && step.status === 'pending')
  if (nextIndex === -1) {
    const done = { ...state, dailySession: { ...session, steps, currentStep: steps.length, completedAt: now.toISOString() } }
    return patchActivity(done, { sessionDone: true }, now)
  }
  return { ...state, dailySession: { ...session, steps, currentStep: nextIndex } }
}

const sumStats = (current: Record<string, number> = {}, extra: Record<string, number> = {}) => {
  const next = { ...current }
  for (const [key, value] of Object.entries(extra)) next[key] = (next[key] ?? 0) + value
  return next
}

/** Adds figures to the current step without closing it (e.g. a review paused midway). */
export function addStepStats(state: AppState, stats: Record<string, number>): AppState {
  return updateSession(state, (session) => ({
    ...session,
    steps: session.steps.map((step, index) => (index === session.currentStep ? { ...step, stats: sumStats(step.stats, stats) } : step)),
  }))
}

export function rememberStruggled(state: AppState, wordIds: string[]): AppState {
  if (!wordIds.length) return state
  return updateSession(state, (session) => ({ ...session, struggledIds: [...new Set([...session.struggledIds, ...wordIds])] }))
}

export function beginReading(state: AppState, now: Date = new Date()): AppState {
  return updateSession(state, (session) => (session.readingStartedAt ? session : { ...session, readingStartedAt: now.toISOString() }))
}

/** Words saved since the reading step began. */
export function wordsSavedWhileReading(state: AppState, session: DailySession): LearnedWord[] {
  if (!session.readingStartedAt) return []
  return state.words.filter((word) => word.language === state.settings.learningLanguage && word.createdAt >= session.readingStartedAt! && isReviewable(word))
}

/** Ends the reading step; if new words were saved, a "Mots du jour" step is inserted right after. */
export function finishReading(state: AppState, now: Date = new Date()): AppState {
  const session = state.dailySession
  if (!session || currentStepId(session) !== 'reading') return state
  const saved = wordsSavedWhileReading(state, session).map((word) => word.id)
  let steps = session.steps
  if (saved.length && !steps.some((step) => step.id === 'newWords')) {
    steps = [...steps.slice(0, session.currentStep + 1), { id: 'newWords', status: 'pending' }, ...steps.slice(session.currentStep + 1)]
  }
  const next = { ...state, dailySession: { ...session, steps, newWordIds: saved } }
  return closeStep(next, 'done', { words: saved.length }, now)
}

/** Words to reuse when writing: the ones that resisted today, then today's new ones, then recent reviews. */
export function pickWritingWords(state: AppState, session: DailySession, now: Date = new Date()): string[] {
  const byId = new Map(state.words.map((word) => [word.id, word]))
  const today = dayKey(now)
  const reviewedToday = [...(state.reviewLog ?? [])].reverse().filter((entry) => entry.day === today).map((entry) => entry.wordId)
  const fallback = state.words
    .filter((word) => word.language === state.settings.learningLanguage && isReviewable(word) && (word.knowledge ?? 1) <= 4)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((word) => word.id)
  const picked: string[] = []
  for (const wordId of [...session.struggledIds, ...session.newWordIds, ...reviewedToday, ...fallback]) {
    const word = byId.get(wordId)
    if (!word || !isReviewable(word) || picked.includes(wordId)) continue
    // Single words and short expressions only: long phrases make awkward prompts.
    if (word.word.split(/\s+/).length > 4) continue
    picked.push(wordId)
    if (picked.length >= WRITING_WORDS) break
  }
  return picked
}

const splitSentences = (text: string) =>
  (text.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean)

const speakable = (sentence: string) => {
  const count = sentence.split(/\s+/).length
  return count >= 4 && count <= 22
}

/** Sentences to shadow: the original context of today's words, else the page being read. */
export function pickSpeakingSentences(state: AppState, session: DailySession): string[] {
  const byId = new Map(state.words.map((word) => [word.id, word]))
  const ids = [...(session.writingWordIds ?? []), ...session.struggledIds, ...session.newWordIds]
  const sentences: string[] = []
  const add = (sentence: string) => {
    const clean = sentence.replace(/\s+/g, ' ').trim()
    const key = clean.toLowerCase().replace(/[^\p{L}\s]/gu, '')
    // Skip repeats, including a sentence that is part of one already chosen.
    const repeated = sentences.some((other) => {
      const otherKey = other.toLowerCase().replace(/[^\p{L}\s]/gu, '')
      return otherKey.includes(key) || key.includes(otherKey)
    })
    if (clean && speakable(clean) && !repeated) sentences.push(clean)
  }
  for (const wordId of ids) {
    const context = byId.get(wordId)?.contextSentence
    if (context) splitSentences(context).forEach(add)
    if (sentences.length >= SPEAKING_SENTENCES) return sentences.slice(0, SPEAKING_SENTENCES)
  }
  const resource = state.resources.find((item) => item.id === session.resourceId) ?? pickReadingResource(state)
  if (resource) {
    const progress = state.progress[resource.id]
    const chapter = resource.chapters[progress?.chapterIndex ?? 0] ?? resource.chapters[0]
    const start = progress?.paragraphIndex ?? 0
    for (const paragraph of chapter?.paragraphs.slice(start, start + 6) ?? []) {
      splitSentences(paragraph).forEach(add)
      if (sentences.length >= SPEAKING_SENTENCES) break
    }
  }
  if (sentences.length < SPEAKING_SENTENCES) {
    for (const word of state.words.filter((item) => item.language === state.settings.learningLanguage && item.contextSentence)) {
      splitSentences(word.contextSentence).forEach(add)
      if (sentences.length >= SPEAKING_SENTENCES) break
    }
  }
  return sentences.slice(0, SPEAKING_SENTENCES)
}

export function freezeStepContent(state: AppState, now: Date = new Date()): AppState {
  const session = state.dailySession
  if (!session) return state
  const step = currentStepId(session)
  if (step === 'writing' && !session.writingWordIds) {
    return updateSession(state, (current) => ({ ...current, writingWordIds: pickWritingWords(state, current, now) }))
  }
  if (step === 'speaking' && !session.speakingSentences) {
    return updateSession(state, (current) => ({ ...current, speakingSentences: pickSpeakingSentences(state, current) }))
  }
  return state
}

/** Rough minutes per step, for the "≈ 15 min" label. */
export function estimateMinutes(state: AppState, session: DailySession): number {
  const queue = buildReviewQueue(state, new Date(), { cap: learningSettings(state).sessionReviewCap })
  let seconds = 0
  for (const step of session.steps) {
    if (step.status !== 'pending') continue
    if (step.id === 'review') seconds += queue.ids.length * 10
    if (step.id === 'reading') seconds += (state.settings.readerPageSize / 90) * 60
    if (step.id === 'newWords') seconds += session.newWordIds.length * 12
    if (step.id === 'writing') seconds += 240
    if (step.id === 'speaking') seconds += 120
  }
  return Math.max(1, Math.round(seconds / 60))
}

export function setWritingId(state: AppState, writingId: string): AppState {
  return updateSession(state, (session) => ({ ...session, writingId }))
}
