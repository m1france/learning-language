export type SpeakingSessionTimestamp = {
  id: string
  time: number // in seconds
  text: string
}

export type SpeakingSessionRating = {
  fluency: number // 1 to 5
  pronunciation: number // 1 to 5
  confidence: number // 1 to 5
}

export type SpeakingVideoAdviceCategory =
  | 'pronunciation'
  | 'rhythm'
  | 'grammar_structure'
  | 'vocabulary'
  | 'fluency'

export type SpeakingVideoAdviceItem = {
  id: string
  timestamp: number // in seconds
  category: SpeakingVideoAdviceCategory
  severity: 'tip' | 'warning' | 'error'
  title: string
  originalSnippet?: string
  improvedSnippet?: string
  explanation: string
  ipa?: string
}

export type SpeakingVideoAnalysis = {
  overallFeedback: string
  overallScore?: number
  pronunciationSummary: string
  rhythmSummary: string
  structureSummary: string
  items: SpeakingVideoAdviceItem[]
  modelUsed?: string
  analyzedAt: string
}

export type TranscriptWord = { text: string; start: number; end: number }

export type TranscriptSegment = {
  id: string
  start: number // seconds
  end: number // seconds
  text: string
  words?: TranscriptWord[]
}

export type TranscriptEngine = 'browser' | 'groq' | 'openai' | 'google' | 'openrouter'

export type SessionTranscript = {
  segments: TranscriptSegment[]
  engine: TranscriptEngine
  model?: string
  language: string
  createdAt: string
  /** The learner corrected some segments by hand. */
  edited?: boolean
}

export type SpeakingSessionRecord = {
  id: string
  title: string
  mode: 'free' | 'guided' | 'challenge'
  topicId?: string
  topicName?: string
  duration: number
  createdAt: string
  kind: 'video' | 'audio'
  notes: string
  timestamps: SpeakingSessionTimestamp[]
  tags: string[]
  ratings: SpeakingSessionRating
  blob?: Blob
  mediaUrl?: string // ephemeral object URL
  analysis?: SpeakingVideoAnalysis
  analysisStatus?: 'idle' | 'analyzing' | 'completed' | 'error' | 'too_long'
  analysisError?: string
  /** Learning language when the take was recorded. */
  language?: string
  transcript?: SessionTranscript
  transcriptStatus?: 'idle' | 'transcribing' | 'done' | 'error'
  transcriptError?: string
  /** 0 → 1 while a long recording is transcribed chunk by chunk. */
  transcriptProgress?: number
  /** Cached waveform (0–1 values) so the review page draws instantly. */
  peaks?: number[]
}

/** Fields that live in IndexedDB (everything except the blob and its object URL). */
export type SpeakingSessionPatch = Partial<Omit<SpeakingSessionRecord, 'id' | 'blob' | 'mediaUrl'>>

const DB_NAME = 'vivre_parler_db'
const DB_VERSION = 1
const STORE_NAME = 'sessions'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported'))
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveSpeakingSession(
  session: Omit<SpeakingSessionRecord, 'mediaUrl'> & { blob: Blob },
): Promise<SpeakingSessionRecord> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(session)
    req.onsuccess = () => {
      const mediaUrl = URL.createObjectURL(session.blob)
      resolve({ ...session, mediaUrl })
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getAllSpeakingSessions(): Promise<SpeakingSessionRecord[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const results = (req.result as (Omit<SpeakingSessionRecord, 'mediaUrl'> & { blob?: Blob })[]) || []
        // Sort descending by createdAt
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        const formatted = results.map((item) => {
          const mediaUrl = item.blob ? URL.createObjectURL(item.blob) : ''
          return {
            ...item,
            mediaUrl,
            timestamps: item.timestamps || [],
            tags: item.tags || [],
            ratings: item.ratings || { fluency: 4, pronunciation: 4, confidence: 4 },
            analysis: item.analysis,
            // A reload interrupts background work: don't leave a spinner forever.
            analysisStatus: item.analysisStatus === 'analyzing' ? (item.analysis ? 'completed' : 'idle') : item.analysisStatus || (item.analysis ? 'completed' : 'idle'),
            analysisError: item.analysisError,
            transcriptStatus: item.transcriptStatus === 'transcribing' ? (item.transcript ? 'done' : 'idle') : item.transcriptStatus,
          }
        })
        resolve(formatted)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('Failed to load speaking sessions from IndexedDB', err)
    return []
  }
}

export async function updateSpeakingSession(id: string, updates: SpeakingSessionPatch): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result
      if (!existing) {
        resolve()
        return
      }
      const merged = { ...existing, ...updates }
      const putReq = store.put(merged)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

export async function deleteSpeakingSession(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Transcripts only (no blobs, no object URLs) — for the assistant's context. */
export async function listSpeakingTranscripts(limit = 5): Promise<{ id: string; title: string; createdAt: string; duration: number; text: string; notes: string }[]> {
  try {
    const db = await openDB()
    const all = await new Promise<SpeakingSessionRecord[]>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
      req.onsuccess = () => resolve(req.result as SpeakingSessionRecord[])
      req.onerror = () => reject(req.error)
    })
    return all
      .filter((session) => session.transcript?.segments.length || session.notes?.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((session) => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        duration: session.duration,
        text: session.transcript?.segments.map((segment) => segment.text).join(' ') ?? '',
        notes: session.notes ?? '',
      }))
  } catch {
    return []
  }
}
