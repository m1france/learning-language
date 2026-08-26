import type { ExerciseHistoryRecord } from './exercisesDomain'

const DB_NAME = 'vivre_exercises_db'
const DB_VERSION = 1
const STORE_NAME = 'exercise_history'

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
        store.createIndex('completedAt', 'completedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveExerciseRecord(record: ExerciseHistoryRecord): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('[exerciseStorage] Failed to save record to IndexedDB:', err)
  }
}

export async function getAllExerciseRecords(): Promise<ExerciseHistoryRecord[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const list = (req.result as ExerciseHistoryRecord[]) || []
        list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
        resolve(list)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[exerciseStorage] Failed to load records from IndexedDB:', err)
    return []
  }
}

export async function deleteExerciseRecord(id: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('[exerciseStorage] Failed to delete record:', err)
  }
}
