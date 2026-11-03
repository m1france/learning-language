/** Browser caches are isolated by the authenticated account; legacy data belongs to the guest. */
let currentScope = 'guest'

const ACCOUNT_PREFIX = 'vivre:account:'

export function getStorageScope(): string {
  return currentScope
}

export function setStorageScope(scope: string): void {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(scope)) throw new Error('Invalid storage scope')
  currentScope = scope
}

export function getScopedDatabaseName(name: string): string {
  return currentScope === 'guest' ? name : `${name}:${currentScope}`
}

export function notifyStorageChange(scope = currentScope, key?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vivre-storage-change', { detail: { scope, key } }))
  }
}

function isApplicationKey(key: string): boolean {
  return key.startsWith('vivre')
    && !key.startsWith(ACCOUNT_PREFIX)
    && !/^vivre[-_:](?:auth|guest)(?:[-_:]|$)/.test(key)
    && key !== 'vivre_sync_device_id'
}

function prefix(): string {
  return currentScope === 'guest' ? '' : `${ACCOUNT_PREFIX}${currentScope}:`
}

function visibleKeys(): string[] {
  if (typeof localStorage === 'undefined') return []
  const scopePrefix = prefix()
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const physicalKey = localStorage.key(index)
    if (physicalKey === null || (scopePrefix && !physicalKey.startsWith(scopePrefix))) continue
    const logicalKey = scopePrefix ? physicalKey.slice(scopePrefix.length) : physicalKey
    if (isApplicationKey(logicalKey)) keys.push(logicalKey)
  }
  return keys
}

/** Storage-compatible facade. clear() only removes application data in the active scope. */
export const appStorage: Storage = {
  get length() { return visibleKeys().length },
  key(index: number): string | null { return visibleKeys()[index] ?? null },
  getItem(key: string): string | null {
    return isApplicationKey(key) ? localStorage.getItem(`${prefix()}${key}`) : null
  },
  setItem(key: string, value: string): void {
    if (!isApplicationKey(key)) throw new DOMException('This key is outside the application storage scope', 'SecurityError')
    const physicalKey = `${prefix()}${key}`
    const serialized = String(value)
    if (localStorage.getItem(physicalKey) === serialized) return
    localStorage.setItem(physicalKey, serialized)
    notifyStorageChange(currentScope, key)
  },
  removeItem(key: string): void {
    if (!isApplicationKey(key)) return
    const physicalKey = `${prefix()}${key}`
    if (localStorage.getItem(physicalKey) === null) return
    localStorage.removeItem(physicalKey)
    notifyStorageChange(currentScope, key)
  },
  clear(): void {
    const keys = visibleKeys()
    const scopePrefix = prefix()
    for (const key of keys) localStorage.removeItem(`${scopePrefix}${key}`)
    if (keys.length) notifyStorageChange()
  },
}
