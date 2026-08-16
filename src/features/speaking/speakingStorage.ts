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
}

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

export async function updateSpeakingSession(
  id: string,
  updates: Partial<Omit<SpeakingSessionRecord, 'id' | 'blob' | 'mediaUrl'>>,
): Promise<void> {
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
