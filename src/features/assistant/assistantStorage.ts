import type { Conversation } from './assistantTypes'

/** Conversations live in IndexedDB (they can hold images and long lessons). */

const DB_NAME = 'vivre_assistant_db'
const STORE = 'conversations'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { dbPromise = null; reject(request.error) }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const all = await run<Conversation[]>('readonly', (store) => store.getAll())
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export const saveConversation = (conversation: Conversation) =>
  run('readwrite', (store) => store.put(conversation)).catch((error) => console.error('[assistant] save failed', error))

export const deleteConversation = (id: string) =>
  run('readwrite', (store) => store.delete(id)).catch((error) => console.error('[assistant] delete failed', error))
