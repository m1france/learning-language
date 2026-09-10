import type { ApiSettings, AppState, LearnedWord, ReadingProgress, Resource, UserSettings } from '../../domain'
import { defaultSettings, loadState, saveState } from '../../store'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export type SyncStateInfo = {
  status: SyncStatus
  lastSyncedAt: Date | null
  lastDevice: string | null
  message?: string
}

export type SyncPayload = {
  version: number
  state: AppState
  extraStorage?: Record<string, string>
  lastModified: number
  deviceId: string
  deviceName: string
}

const SYNC_DEVICE_ID_KEY = 'vivre_sync_device_id'

/**
 * Gets or creates a stable unique identifier for this device.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = localStorage.getItem(SYNC_DEVICE_ID_KEY)
  if (!id) {
    id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(SYNC_DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Detects whether the current device is an iPhone/iPad or a Mac/PC.
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Mac'
  const ua = navigator.userAgent || ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Mobile'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  return 'Appareil'
}

/**
 * Determines the API base URL.
 * When on Mac localhost or iPhone accessing via local network IP (e.g. 192.168.x.x),
 * relative /api works seamlessly with Vite dev server and Hono.
 */
export function getSyncApiBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return ''
}

/**
 * Non-destructively merges API settings.
 * Ensures that non-empty API keys (e.g. openRouterKey, deepLKey, etc.) configured
 * on Mac are never overwritten by empty strings from iPhone, and vice-versa.
 */
export function mergeApiSettings(local: ApiSettings, remote: ApiSettings): ApiSettings {
  const merged: ApiSettings = { ...local }
  for (const key of Object.keys(remote) as (keyof ApiSettings)[]) {
    const remoteVal = remote[key]
    const localVal = local[key]
    if (typeof remoteVal === 'string') {
      if (remoteVal.trim()) {
        (merged as any)[key] = remoteVal
      } else if (typeof localVal === 'string' && localVal.trim()) {
        (merged as any)[key] = localVal
      }
    } else if (remoteVal !== undefined && remoteVal !== null) {
      (merged as any)[key] = remoteVal
    }
  }
  return merged
}

/**
 * Smart bidirectional merge of two AppState objects without data loss:
 * - Resources: union by id, keeping newer updates
 * - Words: union by id/normalized, keeping highest knowledge / newer status
 * - Progress: union by resourceId, keeping highest read percentage
 * - Writings & Sessions: union by id
 * - Marks: dictionary union
 * - API Keys: non-destructive preservation
 */
export function smartMergeAppState(local: AppState, remote: AppState): AppState {
  // 1. Settings & API Keys
  const mergedApi = mergeApiSettings(local.settings.api, remote.settings.api)
  const mergedSettings: UserSettings = {
    ...defaultSettings,
    ...remote.settings,
    ...local.settings,
    api: mergedApi,
    name: local.settings.name || remote.settings.name || '',
    uiLanguage: local.settings.uiLanguage || remote.settings.uiLanguage || 'fr',
    learningLanguage: local.settings.learningLanguage || remote.settings.learningLanguage || 'en',
    theme: local.settings.theme || remote.settings.theme || 'light',
  }

  // 2. Resources (union by id, prefer newest)
  const resourceMap = new Map<string, Resource>()
  for (const r of remote.resources || []) resourceMap.set(r.id, r)
  for (const r of local.resources || []) {
    const existing = resourceMap.get(r.id)
    if (!existing) {
      resourceMap.set(r.id, r)
    } else {
      const localDate = r.createdAt ? new Date(r.createdAt).getTime() : 0
      const remoteDate = existing.createdAt ? new Date(existing.createdAt).getTime() : 0
      resourceMap.set(r.id, localDate >= remoteDate ? r : existing)
    }
  }

  // 0. Deleted Word Keys (tombstones): merge taking maximum timestamp
  const mergedDeletedKeys: Record<string, number> = { ...(remote.deletedWordKeys || {}) }
  for (const [k, ts] of Object.entries(local.deletedWordKeys || {})) {
    mergedDeletedKeys[k] = Math.max(mergedDeletedKeys[k] || 0, ts)
  }

  // 3. Learned Words (union by language:normalized, respecting tombstones)
  const wordMap = new Map<string, LearnedWord>()
  const wordKey = (w: LearnedWord) => `${w.language}:${w.normalized}`
  for (const w of remote.words || []) {
    const key = wordKey(w)
    const delTs = mergedDeletedKeys[key]
    if (delTs) {
      const wCreated = w.createdAt ? new Date(w.createdAt).getTime() : 0
      if (wCreated <= delTs) continue
    }
    wordMap.set(key, w)
  }
  for (const w of local.words || []) {
    const key = wordKey(w)
    const delTs = mergedDeletedKeys[key]
    if (delTs) {
      const wCreated = w.createdAt ? new Date(w.createdAt).getTime() : 0
      if (wCreated <= delTs) continue
    }
    const existing = wordMap.get(key)
    if (!existing) {
      wordMap.set(key, w)
    } else {
      // Keep higher knowledge level or newer review
      const bestKl = Math.max(w.knowledge || 1, existing.knowledge || 1)
      const isMastered = bestKl === 6 || w.status === 'mastered' || existing.status === 'mastered'
      wordMap.set(key, {
        ...existing,
        ...w,
        knowledge: bestKl,
        status: isMastered ? 'mastered' : (w.status || existing.status),
        translation: w.translation || existing.translation,
        phonetic: w.phonetic || existing.phonetic,
        definitions: (w.definitions && w.definitions.length > 0) ? w.definitions : existing.definitions,
        tags: Array.from(new Set([...(w.tags || []), ...(existing.tags || [])])),
      })
    }
  }

  // 4. Reading Progress
  const progressMap: Record<string, ReadingProgress> = { ...(remote.progress || {}) }
  for (const [resId, p] of Object.entries(local.progress || {})) {
    const rem = progressMap[resId]
    if (!rem) {
      progressMap[resId] = p
    } else {
      const localP = (p.chapterIndex ?? 0) * 1000 + (p.paragraphIndex ?? 0)
      const remoteP = (rem.chapterIndex ?? 0) * 1000 + (rem.paragraphIndex ?? 0)
      progressMap[resId] = localP >= remoteP ? p : rem
    }
  }

  // 5. Writings & Sessions
  const writingMap = new Map((remote.writings || []).map((w) => [w.id, w]))
  for (const w of local.writings || []) writingMap.set(w.id, w)

  const sessionMap = new Map((remote.sessions || []).map((s) => [s.id, s]))
  for (const s of local.sessions || []) sessionMap.set(s.id, s)

  // 6. Marks & Known Words (purging any known words that were deleted)
  const mergedWordMarks = { ...(remote.wordMarks || {}), ...(local.wordMarks || {}) }
  const mergedSilentMarks = { ...(remote.silentMarks || {}), ...(local.silentMarks || {}) }
  const mergedKnownWords: Record<string, boolean> = {}
  for (const [k, v] of Object.entries({ ...(remote.knownWords || {}), ...(local.knownWords || {}) })) {
    if (v && !mergedDeletedKeys[k]) {
      mergedKnownWords[k] = true
    }
  }

  // 7. Read Pages
  const mergedReadPages = { ...(remote.readPages || {}), ...(local.readPages || {}) }

  return {
    version: 3,
    settings: mergedSettings,
    resources: Array.from(resourceMap.values()),
    progress: progressMap,
    words: Array.from(wordMap.values()),
    writings: Array.from(writingMap.values()),
    sessions: Array.from(sessionMap.values()),
    completedScenarios: Array.from(new Set([...(remote.completedScenarios || []), ...(local.completedScenarios || [])])),
    wordMarks: mergedWordMarks,
    silentMarks: mergedSilentMarks,
    knownWords: mergedKnownWords,
    deletedWordKeys: mergedDeletedKeys,
    readPages: mergedReadPages,
    markings: (local.markings && local.markings.length > 0) ? local.markings : (remote.markings || []),
    customTools: (local.customTools && local.customTools.length > 0) ? local.customTools : (remote.customTools || []),
    removedTools: Array.from(new Set([...(remote.removedTools || []), ...(local.removedTools || [])])),
    customCategories: Array.from(new Set([...(remote.customCategories || []), ...(local.customCategories || [])])),
    customTags: Array.from(new Set([...(remote.customTags || []), ...(local.customTags || [])])),
  }
}

/**
 * Extracts extra reading storage keys (e.g. vivre-page-*, vivre-focus-*)
 */
export function getExtraStorageSnapshot(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const extra: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('vivre-page-') || k.startsWith('vivre-focus-'))) {
      const val = localStorage.getItem(k)
      if (val !== null) extra[k] = val
    }
  }
  return extra
}

/**
 * Restores extra reading storage keys to localStorage.
 */
export function restoreExtraStorageSnapshot(extra?: Record<string, string>): void {
  if (!extra || typeof window === 'undefined') return
  for (const [k, val] of Object.entries(extra)) {
    try {
      localStorage.setItem(k, val)
    } catch {}
  }
}

// ============================================================================
// SYNC MANAGER CLASS
// ============================================================================
class SyncManager {
  private status: SyncStatus = 'idle'
  private lastSyncedAt: Date | null = null
  private lastDevice: string | null = null
  private listeners = new Set<(info: SyncStateInfo) => void>()
  private pushTimer: any = null
  private heartbeatTimer: any = null
  private broadcastChannel: BroadcastChannel | null = null
  private onRemoteUpdateCallback: ((state: AppState) => void) | null = null
  private isPushing = false
  private isPulling = false
  private localRevision = 0

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('vivre-sync-channel')
        this.broadcastChannel.onmessage = (e) => {
          if (e.data?.type === 'SYNC_PUSHED') {
            void this.pull()
          }
        }
      } catch {}

      // Listen for window visibility/focus to immediately catch updates from the other device
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void this.pull()
        }
      })
      window.addEventListener('focus', () => {
        void this.pull()
      })
    }
  }

  public getInfo(): SyncStateInfo {
    return {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      lastDevice: this.lastDevice,
    }
  }

  public subscribe(listener: (info: SyncStateInfo) => void): () => void {
    this.listeners.add(listener)
    listener(this.getInfo())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(status?: SyncStatus, message?: string) {
    if (status) this.status = status
    const info: SyncStateInfo = {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      lastDevice: this.lastDevice,
      message,
    }
    for (const listener of this.listeners) {
      listener(info)
    }
  }

  /**
   * Initializes automatic synchronization.
   * Pulls immediately from server, starts periodic lightweight heartbeat,
   * and sets the callback for state updates.
   */
  public init(onRemoteUpdate: (state: AppState) => void): void {
    this.onRemoteUpdateCallback = onRemoteUpdate

    // Initial pull immediately
    void this.pull()

    // Heartbeat check every 15 seconds
    if (!this.heartbeatTimer && typeof window !== 'undefined') {
      this.heartbeatTimer = setInterval(() => {
        void this.checkStatusAndPullIfNeeded()
      }, 15000)
    }
  }

  /**
   * Schedules a debounced push of local state to the server (1.5s debounce).
   */
  public schedulePush(state: AppState): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      void this.push(state)
    }, 1500)
  }

  /**
   * Pushes the current local state to the synchronization endpoint.
   */
  public async push(state: AppState): Promise<boolean> {
    if (this.isPushing) return false
    this.isPushing = true
    this.notify('syncing')

    try {
      const base = getSyncApiBaseUrl()
      const payload: SyncPayload = {
        version: 3,
        state,
        extraStorage: getExtraStorageSnapshot(),
        lastModified: Date.now(),
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      }

      const res = await fetch(`${base}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      })

      if (res.ok) {
        const data = await res.json()
        this.lastSyncedAt = new Date()
        this.lastDevice = getDeviceName()
        if (data.revision) {
          this.localRevision = data.revision
        }
        this.notify('synced')

        try {
          this.broadcastChannel?.postMessage({ type: 'SYNC_PUSHED', deviceId: getDeviceId() })
        } catch {}

        return true
      } else {
        this.notify('error', `Erreur HTTP ${res.status}`)
        return false
      }
    } catch (err) {
      this.notify('offline', 'Serveur inaccessible pour le moment')
      return false
    } finally {
      this.isPushing = false
    }
  }

  /**
   * Pulls the latest synchronized state from the server.
   */
  public async pull(): Promise<AppState | null> {
    if (this.isPulling) return null
    this.isPulling = true
    this.notify('syncing')

    try {
      const base = getSyncApiBaseUrl()
      const res = await fetch(`${base}/api/sync`)
      if (!res.ok) {
        this.notify('offline', `Erreur HTTP ${res.status}`)
        return null
      }

      const data = await res.json()
      if (!data.payload || !data.payload.state) {
        // No remote state on server yet: push local state to seed the server
        const local = loadState()
        if (local && (local.resources.length > 0 || local.words.length > 0 || local.settings.api.openRouterKey)) {
          void this.push(local)
        }
        this.notify('synced')
        return null
      }

      const remotePayload = data.payload as SyncPayload
      const remoteState = remotePayload.state

      // Restore extra bookmarks/annotations
      restoreExtraStorageSnapshot(remotePayload.extraStorage)

      const localState = loadState()
      let finalState: AppState

      if (!localState) {
        finalState = remoteState
      } else {
        // Smart bidirectional merge
        finalState = smartMergeAppState(localState, remoteState)
      }

      saveState(finalState)
      this.lastSyncedAt = new Date(remotePayload.lastModified || Date.now())
      this.lastDevice = remotePayload.deviceName || 'Distant'
      if (data.revision) {
        this.localRevision = data.revision
      }

      this.notify('synced')

      if (this.onRemoteUpdateCallback) {
        this.onRemoteUpdateCallback(finalState)
      }

      return finalState
    } catch (err) {
      this.notify('offline', 'Serveur local hors ligne')
      return null
    } finally {
      this.isPulling = false
    }
  }

  /**
   * Lightweight heartbeat revision check.
   * If remote revision > localRevision, triggers full pull.
   */
  private async checkStatusAndPullIfNeeded(): Promise<void> {
    try {
      const base = getSyncApiBaseUrl()
      const res = await fetch(`${base}/api/sync/status`)
      if (!res.ok) return
      const statusData = await res.json()
      if (statusData && statusData.revision && statusData.revision > this.localRevision) {
        void this.pull()
      }
    } catch {}
  }
}

export const syncService = new SyncManager()
