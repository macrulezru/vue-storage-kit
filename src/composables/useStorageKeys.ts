import { ref, onScopeDispose, getCurrentScope, type Ref } from 'vue'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import type { StorageTarget } from '../core/types'

export interface UseStorageKeysReturn {
  keys: Ref<string[]>
  isReady: Ref<boolean>
  refresh(): Promise<void>
}

export function useStorageKeys(
  prefix = '',
  target: StorageTarget = 'local',
): UseStorageKeysReturn {
  const adapter = StorageAdapterFactory.get(target)

  async function getKeys(): Promise<string[]> {
    const all = await adapter.keys()
    return all.filter((k) => k.startsWith(prefix))
  }

  const keys = ref<string[]>([])
  const isReady = ref(false)
  // Guards against two overlapping refresh() calls (e.g. rapid storage
  // events) applying out of order — only the result of the most recently
  // *started* call is ever applied.
  let refreshToken = 0

  async function refresh(): Promise<void> {
    const token = ++refreshToken
    try {
      const next = await getKeys()
      if (token !== refreshToken) return
      keys.value = next
    } catch {
      // best-effort — leave `keys` at its last known value
    }
    if (token === refreshToken) isReady.value = true
  }

  void refresh()

  // Re-scan on storage events from other tabs
  function onStorage(e: StorageEvent): void {
    if (e.key === null || e.key.startsWith(prefix)) {
      void refresh()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    if (getCurrentScope()) {
      onScopeDispose(() => window.removeEventListener('storage', onStorage))
    }
  }

  return { keys, isReady, refresh }
}
