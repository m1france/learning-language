import { getScopedDatabaseName, getStorageScope } from '../auth/storageScope'

export type AuxiliarySnapshot = Record<string, unknown[]>

type StoredRecord = Record<string, unknown> & { id: string }
type StoreSpec = { key: string; database: string; store: string; index: string }

const stores: StoreSpec[] = [
  { key: 'conversations', database: 'vivre_assistant_db', store: 'conversations', index: 'updatedAt' },
  { key: 'exercises', database: 'vivre_exercises_db', store: 'exercise_history', index: 'completedAt' },
  { key: 'speaking', database: 'vivre_parler_db', store: 'sessions', index: 'createdAt' },
]

function openDatabase(spec: StoreSpec, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return }
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(spec.store)) {
        db.createObjectStore(spec.store, { keyPath: 'id' }).createIndex(spec.index, spec.index, { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function withoutMedia(record: StoredRecord): StoredRecord {
  const { blob: _blob, mediaUrl: _mediaUrl, ...metadata } = record
  return metadata as StoredRecord
}

async function readStore(spec: StoreSpec, name: string): Promise<StoredRecord[]> {
  const db = await openDatabase(spec, name)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(spec.store, 'readonly')
    const request = tx.objectStore(spec.store).getAll()
    tx.oncomplete = () => { db.close(); resolve(request.result as StoredRecord[]) }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Lecture du cache impossible')) }
  })
}

/** Includes account histories, while audio/video recordings remain only on their original device. */
export async function getAuxiliarySnapshot(): Promise<AuxiliarySnapshot> {
  // Freeze names before the first await so an account switch cannot mix stores.
  const namedStores = stores.map((spec) => ({ spec, name: getScopedDatabaseName(spec.database) }))
  const entries = await Promise.all(namedStores.map(async ({ spec, name }) => {
    const records = await readStore(spec, name)
    return [spec.key, spec.key === 'speaking' ? records.map(withoutMedia) : records] as const
  }))
  return Object.fromEntries(entries)
}

async function replaceStore(spec: StoreSpec, name: string, records: StoredRecord[]): Promise<void> {
  const db = await openDatabase(spec, name)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(spec.store, 'readwrite')
    const store = tx.objectStore(spec.store)
    const replace = (existing: StoredRecord[] = []) => {
      const blobs = new Map(existing.filter((record) => record.blob instanceof Blob).map((record) => [record.id, record.blob]))
      store.clear()
      for (const record of records) {
        const next = spec.key === 'speaking' ? withoutMedia(record) : record
        const blob = blobs.get(record.id)
        store.put(spec.key === 'speaking' && blob ? { ...next, blob } : next)
      }
    }
    if (spec.key === 'speaking') {
      const request = store.getAll()
      request.onsuccess = () => replace(request.result as StoredRecord[])
    } else {
      replace()
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Restauration du cache impossible')) }
  })
}

/** Exact replacement preserves deletions; omitted collections support older cloud snapshots. */
export async function restoreAuxiliarySnapshot(snapshot: AuxiliarySnapshot): Promise<void> {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Historique synchronisé invalide')
  const scope = getStorageScope()
  const replacements = stores.filter((spec) => Object.prototype.hasOwnProperty.call(snapshot, spec.key)).map((spec) => {
    const records = snapshot[spec.key]
    if (!Array.isArray(records) || records.some((record) => !record || typeof record !== 'object' || Array.isArray(record) || typeof (record as Record<string, unknown>).id !== 'string' || !(record as Record<string, unknown>).id)) {
      throw new Error(`Historique synchronisé invalide : ${spec.key}`)
    }
    return { spec, name: getScopedDatabaseName(spec.database), records: records as StoredRecord[] }
  })
  await Promise.all(replacements.map(({ spec, name, records }) => replaceStore(spec, name, records)))
  if (replacements.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vivre-storage-change', { detail: { scope, source: 'restore' } }))
  }
}
