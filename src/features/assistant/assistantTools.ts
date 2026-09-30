import type { AppState, LearnedWord } from '../../domain'
import { getInflectionVariants, normalizeWord } from '../../domain'
import type { ToolDefinition } from '../../lib/llm'
import { dayKey } from '../srs/fsrs'
import { buildReviewQueue, computeStreak, isDue, learningSettings, maturityCounts, retentionRate, strugglingWords } from '../srs/srsStore'
import { listSpeakingTranscripts } from '../speaking/speakingStorage'

/**
 * Tools the assistant can call to ground its answers in the learner's own
 * material: their imported texts, vocabulary, writings and spoken takes.
 */

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_my_texts',
      description: "Find real example sentences in the learner's own imported texts (library). Use it whenever you explain a word, expression or grammar point, to quote examples the learner has actually read.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A word, an expression, or a /regex/ (e.g. "have been", "/\\bwould have \\w+ed\\b/").' },
          limit: { type: 'number', description: 'Maximum sentences (default 8, max 20).' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_my_texts',
      description: "List the texts in the learner's library (id, title, level, length, reading progress).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_my_text',
      description: 'Read one text from the library, by id (from list_my_texts) or by title.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Text id or title.' },
          from_paragraph: { type: 'number', description: 'First paragraph to return (default 0).' },
          max_chars: { type: 'number', description: 'Default 6000.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_vocabulary',
      description: "The learner's saved words with translation, knowledge level (1–5, 6 = known), lapses and the sentence where they met the word.",
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', enum: ['struggling', 'due', 'recent', 'new', 'learning', 'known', 'all'], description: 'struggling = often forgotten; due = to review today.' },
          query: { type: 'string', description: 'Optional search in words / translations.' },
          tag: { type: 'string', description: 'Optional tag filter.' },
          limit: { type: 'number', description: 'Default 30, max 80.' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_learning_overview',
      description: 'Progress snapshot: words by maturity, reviews due, retention, streak, minutes this week, recent activity.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_writings',
      description: "The learner's own recent writings (journal entries) — useful to spot recurring mistakes.",
      parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Default 3.' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_speaking',
      description: "Transcripts and notes of the learner's recent recorded speaking sessions.",
      parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Default 3.' } } },
    },
  },
]

export const TOOL_LABELS: Record<string, { fr: string; en: string }> = {
  search_my_texts: { fr: 'Recherche dans tes textes', en: 'Searching your texts' },
  list_my_texts: { fr: 'Lecture de ta bibliothèque', en: 'Reading your library' },
  read_my_text: { fr: 'Lecture du texte', en: 'Reading the text' },
  get_my_vocabulary: { fr: 'Consultation de ton vocabulaire', en: 'Checking your vocabulary' },
  get_learning_overview: { fr: 'Analyse de ta progression', en: 'Looking at your progress' },
  get_my_writings: { fr: 'Lecture de tes écrits', en: 'Reading your writings' },
  get_my_speaking: { fr: 'Écoute de tes sessions orales', en: 'Reviewing your speaking' },
}

type Sentence = { text: string; resourceId: string; title: string }

const sentenceCache = new WeakMap<AppState['resources'], Sentence[]>()

/** Every sentence of every non-archived text in the learning language. */
function librarySentences(state: AppState): Sentence[] {
  const cached = sentenceCache.get(state.resources)
  if (cached) return cached
  const out: Sentence[] = []
  for (const resource of state.resources) {
    if (resource.archived || resource.language !== state.settings.learningLanguage) continue
    for (const chapter of resource.chapters) {
      for (const paragraph of chapter.paragraphs) {
        const parts = paragraph.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+["'”»)]*|[^.!?…]+$/g) ?? []
        for (const part of parts) {
          const text = part.trim()
          if (text.length > 8) out.push({ text, resourceId: resource.id, title: resource.title })
        }
      }
    }
  }
  sentenceCache.set(state.resources, out)
  return out
}

/** Sentences of the library matching a word (with inflections), a phrase or a /regex/. */
export function findExamples(state: AppState, query: string, limit = 8): Sentence[] {
  const sentences = librarySentences(state)
  const trimmed = query.trim()
  if (!trimmed) return []
  let test: (text: string) => boolean
  const regex = trimmed.match(/^\/(.+)\/([gimsuy]*)$/)
  if (regex) {
    try {
      const pattern = new RegExp(regex[1], regex[2].includes('i') ? regex[2] : `${regex[2]}i`)
      test = (text) => pattern.test(text)
    } catch {
      return []
    }
  } else if (/\s/.test(trimmed)) {
    const needle = normalizeWord(trimmed)
    test = (text) => normalizeWord(text).includes(needle)
  } else {
    const variants = new Set(getInflectionVariants(trimmed))
    test = (text) => normalizeWord(text).split(' ').some((word) => variants.has(word))
  }
  const hits: Sentence[] = []
  const seen = new Set<string>()
  for (const sentence of sentences) {
    if (hits.length >= limit) break
    if (seen.has(sentence.text)) continue
    if (test(sentence.text)) { hits.push(sentence); seen.add(sentence.text) }
  }
  return hits
}

const STOP = new Set('the and for that with this from have what when where which your you are was were can could would should about into than then them they their there these those will just like more some very also only been being does did done make made give take into over such other want need learn explain lesson exercise exemple exemples leçon explique moi mon mes dans pour avec une des les est sur pas que qui quoi comment pourquoi faire fais cette cet ces entre veux peux mots mot texte textes'.split(' '))

/** Without tool support: pull a few relevant sentences from the library for the prompt. */
export function autoExamples(state: AppState, message: string, limit = 6): Sentence[] {
  const quoted = [...message.matchAll(/[«"“']([^»"”']{2,40})[»"”']/g)].map((match) => match[1])
  const words = (message.match(/[\p{L}'’-]{4,}/gu) ?? []).map((word) => word.toLowerCase()).filter((word) => !STOP.has(word))
  const candidates = [...new Set([...quoted, ...words])].slice(0, 12)
  const out: Sentence[] = []
  for (const candidate of candidates) {
    for (const hit of findExamples(state, candidate, 2)) {
      if (!out.some((item) => item.text === hit.text)) out.push(hit)
      if (out.length >= limit) return out
    }
  }
  return out
}

const wordLine = (word: LearnedWord) => ({
  word: word.word,
  translation: word.translation || word.definitions?.[0]?.translation || '',
  ipa: word.phonetic || undefined,
  level: word.knowledge ?? null,
  lapses: word.srs?.lapses || undefined,
  due: word.srs?.due,
  context: word.contextSentence ? word.contextSentence.slice(0, 160) : undefined,
  tags: word.tags?.length ? word.tags : undefined,
})

function vocabulary(state: AppState, args: { filter?: string; query?: string; tag?: string; limit?: number }) {
  const limit = Math.min(80, Math.max(1, Number(args.limit) || 30))
  const today = dayKey()
  let words = state.words.filter((word) => word.language === state.settings.learningLanguage)
  switch (args.filter) {
    case 'struggling': words = strugglingWords(state, limit).length ? strugglingWords(state, limit) : words.filter((w) => (w.knowledge ?? 1) <= 2); break
    case 'due': words = words.filter((word) => word.srs && isDue(word, today)); break
    case 'recent': words = [...words].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break
    case 'new': words = words.filter((word) => !word.srs || word.srs.state === 'new'); break
    case 'learning': words = words.filter((word) => (word.knowledge ?? 1) < 5); break
    case 'known': words = words.filter((word) => (word.knowledge ?? 0) >= 5); break
  }
  if (args.tag) words = words.filter((word) => word.tags?.some((tag) => tag.toLowerCase() === String(args.tag).toLowerCase()))
  if (args.query) {
    const needle = normalizeWord(String(args.query))
    words = words.filter((word) => word.normalized.includes(needle) || normalizeWord(word.translation || '').includes(needle))
  }
  return { total: words.length, words: words.slice(0, limit).map(wordLine) }
}

export function learningOverview(state: AppState) {
  const settings = learningSettings(state)
  const words = state.words.filter((word) => word.language === state.settings.learningLanguage)
  const week = Object.entries(state.activity ?? {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)
  const retention = retentionRate(state)
  return {
    learning_language: state.settings.learningLanguage,
    saved_words: words.length,
    maturity: maturityCounts(state),
    reviews_due_today: buildReviewQueue(state).ids.length,
    retention_30d: retention.rate === null ? null : Math.round(retention.rate * 100) + '%',
    streak_days: computeStreak(state.activity, settings.dailyMinutes).current,
    daily_goal_minutes: settings.dailyMinutes,
    last_7_days: week.map(([day, activity]) => ({ day, minutes: Math.round(activity.seconds / 60), reviews: activity.reviews, words_written: activity.writtenWords ?? 0 })),
    texts_in_library: state.resources.filter((resource) => !resource.archived).length,
    writings: state.writings.length,
    top_tags: Object.entries(words.flatMap((word) => word.tags ?? []).reduce<Record<string, number>>((acc, tag) => ({ ...acc, [tag]: (acc[tag] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => `${tag} (${count})`),
  }
}

const clip = (value: unknown, max = 9000) => {
  const text = JSON.stringify(value)
  return text.length > max ? `${text.slice(0, max)}…(truncated)` : text
}

export type ToolOutcome = { content: string; summary: string }

/** Runs a tool call against the current state. Never throws: errors go back to the model. */
export async function executeTool(state: AppState, name: string, rawArgs: string, ui: 'fr' | 'en'): Promise<ToolOutcome> {
  let args: Record<string, unknown> = {}
  try { args = rawArgs ? JSON.parse(rawArgs) : {} } catch { /* tolerate */ }
  const fr = ui === 'fr'
  try {
    switch (name) {
      case 'search_my_texts': {
        const hits = findExamples(state, String(args.query ?? ''), Math.min(20, Number(args.limit) || 8))
        return {
          content: clip({ query: args.query, found: hits.length, sentences: hits.map((hit) => ({ sentence: hit.text, text: hit.title })) }),
          summary: fr ? `${hits.length} phrase${hits.length > 1 ? 's' : ''} trouvée${hits.length > 1 ? 's' : ''} pour « ${args.query} »` : `${hits.length} sentence(s) for “${args.query}”`,
        }
      }
      case 'list_my_texts': {
        const texts = state.resources.filter((resource) => !resource.archived).map((resource) => ({
          id: resource.id,
          title: resource.title,
          level: resource.difficulty,
          type: resource.type,
          words: resource.chapters.reduce((sum, chapter) => sum + chapter.paragraphs.join(' ').split(/\s+/).length, 0),
          language: resource.language,
        }))
        return { content: clip({ texts }), summary: fr ? `${texts.length} texte${texts.length > 1 ? 's' : ''}` : `${texts.length} text(s)` }
      }
      case 'read_my_text': {
        const key = String(args.id ?? '').toLowerCase()
        const resource = state.resources.find((item) => item.id.toLowerCase() === key) ?? state.resources.find((item) => item.title.toLowerCase().includes(key))
        if (!resource) return { content: clip({ error: 'Text not found. Call list_my_texts first.' }), summary: fr ? 'Texte introuvable' : 'Text not found' }
        const paragraphs = resource.chapters.flatMap((chapter) => chapter.paragraphs)
        const from = Math.max(0, Number(args.from_paragraph) || 0)
        const max = Math.min(16000, Number(args.max_chars) || 6000)
        let text = ''
        let index = from
        while (index < paragraphs.length && text.length + paragraphs[index].length < max) { text += `${paragraphs[index]}\n\n`; index += 1 }
        return {
          content: clip({ title: resource.title, paragraphs_total: paragraphs.length, from_paragraph: from, next_paragraph: index < paragraphs.length ? index : null, text: text.trim() }, max + 500),
          summary: `« ${resource.title} »`,
        }
      }
      case 'get_my_vocabulary': {
        const result = vocabulary(state, args as { filter?: string })
        return { content: clip(result), summary: fr ? `${result.words.length} mot${result.words.length > 1 ? 's' : ''}` : `${result.words.length} word(s)` }
      }
      case 'get_learning_overview':
        return { content: clip(learningOverview(state)), summary: fr ? 'Progression analysée' : 'Progress checked' }
      case 'get_my_writings': {
        const writings = [...state.writings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, Math.min(8, Number(args.limit) || 3))
        return {
          content: clip({ writings: writings.map((entry) => ({ title: entry.title, date: entry.date, text: entry.content.slice(0, 2500) })) }),
          summary: fr ? `${writings.length} écrit${writings.length > 1 ? 's' : ''}` : `${writings.length} writing(s)`,
        }
      }
      case 'get_my_speaking': {
        const sessions = await listSpeakingTranscripts(Math.min(8, Number(args.limit) || 3))
        return {
          content: clip({ sessions: sessions.map((session) => ({ title: session.title, date: session.createdAt.slice(0, 10), seconds: session.duration, transcript: session.text.slice(0, 3000), notes: session.notes.slice(0, 800) })) }),
          summary: fr ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} orale${sessions.length > 1 ? 's' : ''}` : `${sessions.length} session(s)`,
        }
      }
      default:
        return { content: clip({ error: `Unknown tool ${name}` }), summary: name }
    }
  } catch (error) {
    return { content: clip({ error: error instanceof Error ? error.message : 'Tool failed' }), summary: fr ? 'Échec de l’outil' : 'Tool failed' }
  }
}

/**
 * Does the message refer to the learner's own material? Tools (and the cost
 * and latency they add) are offered only then.
 */
const OWN_DATA = /\b(mes|mon|ma|my|mis|meus|minhas|мои|мой)\s+(propres\s+)?(textes?|texts?|mots|words?|vocabulaire|vocabulary|vocabulario|vocabulário|écrits?|writings?|journal|sessions?|enregistrements?|recordings?|prises|progr[eè]s(sion)?|progress|lectures?|livres?|books?|articles?|erreurs|mistakes|textos|palavras|palabras)\b|\b(dans|de|from|in|en|de)\s+(mes|my|mis|meus)\b|biblioth[eè]que|library|à réviser|to review|mots difficiles|tricky words|struggl|\bdue\b/i

export function wantsLearnerData(message: string, hasAttachments: boolean): boolean {
  return !hasAttachments && OWN_DATA.test(message)
}

/** Full lessons deserve more thinking; everything else stays quick. */
export function effortFor(message: string): 'low' | 'medium' {
  return /leçon compl[eè]te|full lesson|lección completa|lição completa|полный урок|完整课程/i.test(message) ? 'medium' : 'low'
}
