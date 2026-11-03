import type { AppState } from '../../domain'
import { createState, loadState, saveState } from '../../store'
import { appStorage, getStorageScope } from '../auth/storageScope'
import { getAuxiliarySnapshot, restoreAuxiliarySnapshot } from './auxiliaryStorage'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'
export type SyncStateInfo = { status: SyncStatus; lastSyncedAt: Date | null; lastDevice: string | null; message?: string }
type Auxiliary = Awaited<ReturnType<typeof getAuxiliarySnapshot>>
type Payload = { state: AppState; extraStorage: Record<string, string>; auxiliary?: Auxiliary }
type Remote = { payload: Payload | null; revision: number }
const STATE_KEY = 'vivre-la-langue:state:v2'
const META = 'vivre:sync:'

/** Provider credentials remain in this browser, separately for each account. */
export function withoutApiSecrets(state: AppState): AppState {
  const api = { ...state.settings.api }
  for (const key of Object.keys(api)) if (/key$/i.test(key)) (api as Record<string, unknown>)[key] = ''
  return { ...state, settings: { ...state.settings, api } }
}
export function getExtraStorageSnapshot(): Record<string, string> {
  const extra: Record<string, string> = {}
  for (let index = 0; index < appStorage.length; index++) {
    const key = appStorage.key(index)
    if (!key || key === STATE_KEY || key.startsWith(META) || !/^vivre[-:_]/.test(key) || /auth|session|token|scope|account|guest|sync|state/i.test(key)) continue
    const value = appStorage.getItem(key)
    if (value !== null) extra[key] = value
  }
  return extra
}
class SyncManager {
  private info: SyncStateInfo = { status: 'idle', lastSyncedAt: null, lastDevice: null }
  private listeners = new Set<(info: SyncStateInfo) => void>()
  private callback: ((state: AppState) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private userId: string | null = null
  private revision = 0
  private changes = 0
  private generation = 0
  private restoring = false
  private ownWrite = false
  private busy = false
  private pendingRemote: Remote | null = null
  private pushPromise: Promise<boolean> | null = null
  constructor() {
    if (typeof window === 'undefined') return
    window.addEventListener('vivre-storage-change', (event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope
      if ((scope && scope !== this.userId) || this.ownWrite || key?.startsWith(META)) return
      if (this.restoring) {
        const source = (event as CustomEvent<{ source?: string }>).detail?.source
        if (source !== 'restore' && (!key || key === STATE_KEY)) { this.changes++; this.metadata('dirty', '1') }
        return
      }
      const state = loadState()
      if (state) this.schedulePush(state)
    })
    window.addEventListener('online', () => { void this.pull() })
    window.addEventListener('focus', () => { void this.pull() })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.isDirty()) void this.push()
    })
  }
  getInfo(): SyncStateInfo { return this.info }
  subscribe(listener: (info: SyncStateInfo) => void): () => void {
    this.listeners.add(listener); listener(this.info)
    return () => { this.listeners.delete(listener) }
  }
  private notify(status: SyncStatus, message?: string) {
    this.info = { ...this.info, status, message }
    this.listeners.forEach(listener => listener(this.info))
  }
  private isDirty() { return appStorage.getItem(`${META}dirty`) === '1' }
  private metadata(key: string, value: string) { appStorage.setItem(`${META}${key}`, value) }
  private async request<T>(init?: RequestInit): Promise<T> {
    const account = this.userId
    const response = await fetch('/api/account/progress', { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Account-ID': account || '' } })
    if (response.status === 401) {
      if (account === this.userId) window.dispatchEvent(new Event('vivre-auth-expired'))
      throw new Error('Votre session a expiré. Reconnectez-vous pour sauvegarder votre progression.')
    }
    if (response.status === 409) throw new Error('CONFLICT')
    const body = await response.json().catch(() => ({}))
    if (body.code === 'ACCOUNT_CHANGED' && account === this.userId) window.dispatchEvent(new Event('vivre-auth-expired'))
    if (!response.ok) throw new Error(body.error || 'La sauvegarde est indisponible. Votre progression reste sur cet appareil.')
    return body
  }
  private async snapshot(state: AppState): Promise<Payload> {
    return { state: withoutApiSecrets(state), extraStorage: getExtraStorageSnapshot(), auxiliary: await getAuxiliarySnapshot() }
  }
  private async apply(remote: Remote): Promise<AppState | null> {
    if (!remote.payload) return loadState()
    const generation = this.generation, scope = getStorageScope(), changes = this.changes
    this.restoring = true
    window.dispatchEvent(new Event('vivre-remote-restoring'))
    try {
      const api = loadState()?.settings.api
      const localSecrets = Object.fromEntries(Object.entries(api || {}).filter(([key]) => /key$/i.test(key)))
      const next = { ...remote.payload.state, settings: { ...remote.payload.state.settings, api: { ...createState().settings.api, ...remote.payload.state.settings.api, ...localSecrets } } }
      for (const key of Object.keys(getExtraStorageSnapshot())) appStorage.removeItem(key)
      for (const [key, value] of Object.entries(remote.payload.extraStorage || {})) {
        if (key.startsWith('vivre') && key !== STATE_KEY && !key.startsWith(META)) appStorage.setItem(key, value)
      }
      if (remote.payload.auxiliary) await restoreAuxiliarySnapshot(remote.payload.auxiliary)
      if (generation !== this.generation || scope !== getStorageScope()) return null
      if (changes !== this.changes) {
        this.pendingRemote = remote
        this.notify('conflict', 'Une modification locale est survenue pendant la restauration. Choisissez la version à conserver.')
        return loadState()
      }
      this.ownWrite = true
      try { saveState(next) } finally { this.ownWrite = false }
      this.revision = remote.revision
      this.metadata('revision', String(this.revision)); this.metadata('dirty', '0')
      this.info.lastSyncedAt = new Date(); this.notify('synced')
      this.callback?.(next)
      return next
    } finally {
      if (generation === this.generation) {
        this.restoring = false
        window.dispatchEvent(new Event('vivre-remote-restored'))
      }
    }
  }
  async connect(userId: string, name: string): Promise<void> {
    this.stop(); this.userId = userId
    const generation = this.generation
    this.revision = Number(appStorage.getItem(`${META}revision`) || 0)
    this.notify('syncing')
    const remote = await this.request<Remote>()
    if (generation !== this.generation) return
    if (this.isDirty() && remote.revision !== this.revision) {
      this.pendingRemote = remote
      this.notify('conflict', 'Une autre version existe sur votre compte. Choisissez la version à conserver dans Réglages → Données.')
    } else if (remote.payload && !this.isDirty()) await this.apply(remote)
    else {
      this.revision = remote.revision; this.metadata('revision', String(this.revision))
      this.restoring = true
      if (!loadState()) saveState(createState({ name }))
      this.restoring = false
      this.metadata('dirty', '1'); this.notify('idle', 'Première sauvegarde en attente.')
    }
  }
  init(callback: (state: AppState) => void): () => void {
    this.callback = callback
    if (!this.userId) { this.notify('idle'); return () => {} }
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => { void this.pull() }, 30000)
    if (this.isDirty() && !this.pendingRemote) this.schedulePush(loadState()!)
    return () => { this.callback = null; if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = null }
  }
  schedulePush(_state: AppState): void {
    if (!this.userId || this.restoring || getStorageScope() !== this.userId) return
    this.changes++; this.metadata('dirty', '1')
    if (this.timer) clearTimeout(this.timer)
    if (this.pendingRemote) return
    this.timer = setTimeout(() => { void this.push() }, 1200)
  }
  async push(state?: AppState): Promise<boolean> {
    if (!this.userId || getStorageScope() !== this.userId || this.pendingRemote) return false
    if (this.pushPromise) return this.pushPromise
    const next = state || loadState()
    if (!next) return false
    const generation = this.generation, changes = this.changes
    this.busy = true; this.notify('syncing')
    this.pushPromise = (async () => {
      try {
        const payload = await this.snapshot(next)
        if (generation !== this.generation) return false
        const result = await this.request<{ revision: number }>({ method: 'PUT', body: JSON.stringify({ payload, expectedRevision: this.revision }) })
        if (generation !== this.generation) return false
        this.revision = result.revision; this.metadata('revision', String(this.revision))
        if (changes === this.changes) this.metadata('dirty', '0')
        this.info.lastSyncedAt = new Date(); this.notify('synced'); return true
      } catch (error) {
        if (generation !== this.generation) return false
        if (error instanceof Error && error.message === 'CONFLICT') {
          const remote = await this.request<Remote>().catch(() => null)
          if (generation !== this.generation) return false
          this.pendingRemote = remote
          this.notify('conflict', 'Votre progression a changé sur un autre appareil. Choisissez la version à conserver.')
        } else this.notify(navigator.onLine ? 'error' : 'offline', error instanceof Error ? error.message : 'Sauvegarde impossible.')
        return false
      } finally {
        if (generation === this.generation) {
          this.busy = false; this.pushPromise = null
          if (this.isDirty() && changes !== this.changes && !this.pendingRemote) this.schedulePush(loadState()!)
        }
      }
    })()
    return this.pushPromise
  }
  async pull(): Promise<AppState | null> {
    if (!this.userId || this.busy || this.pendingRemote || getStorageScope() !== this.userId) return null
    if (this.isDirty()) { await this.push(); return null }
    const generation = this.generation
    try {
      const remote = await this.request<Remote>()
      if (generation !== this.generation || this.busy) return null
      if (remote.revision !== this.revision) {
        if (this.callback) {
          this.pendingRemote = remote
          this.notify('conflict', 'Une nouvelle version est disponible sur votre compte. Vous pouvez la charger depuis Réglages → Données, après avoir terminé votre activité.')
          return null
        }
        if (this.isDirty()) { this.pendingRemote = remote; this.notify('conflict'); return null }
        const state = await this.apply(remote)
        return state
      }
      return null
    } catch (error) { if (generation !== this.generation) return null; this.notify(navigator.onLine ? 'error' : 'offline', error instanceof Error ? error.message : 'Connexion interrompue.'); return null }
  }
  async resolveConflict(useRemote: boolean): Promise<void> {
    if (!this.pendingRemote) return
    const remote = this.pendingRemote, generation = this.generation, scope = getStorageScope()
    if (useRemote) {
      const local = loadState()
      if (local) {
        const snapshot = await this.snapshot(local)
        if (generation !== this.generation || scope !== getStorageScope()) return
        const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = 'vivre-progression-avant-restauration.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      if (generation !== this.generation || scope !== getStorageScope()) return
      await this.apply(remote)
      if (generation !== this.generation || scope !== getStorageScope()) return
      this.pendingRemote = null; window.location.reload()
    } else {
      this.revision = remote.revision; this.metadata('revision', String(this.revision)); this.pendingRemote = null
      await this.push()
    }
  }
  stop(): void {
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.timer = null; this.heartbeat = null; this.callback = null
    this.userId = null; this.restoring = false; this.busy = false; this.pushPromise = null; this.pendingRemote = null
    this.info = { status: 'idle', lastSyncedAt: null, lastDevice: null }
  }
}
export const syncService = new SyncManager()
