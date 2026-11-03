import type { Conversation } from './assistantTypes'
import { getScopedDatabaseName, getStorageScope, notifyStorageChange } from '../auth/storageScope'

/** Conversations live in IndexedDB (they can hold images and long lessons). */

const DB_NAME = 'vivre_assistant_db'
const STORE = 'conversations'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return }
    const request = indexedDB.open(getScopedDatabaseName(DB_NAME), 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const scope = getStorageScope()
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = action(tx.objectStore(STORE))
    tx.oncomplete = () => {
      db.close()
      if (mode === 'readwrite') notifyStorageChange(scope)
      resolve(request.result)
    }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Conversation transaction failed')) }
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
