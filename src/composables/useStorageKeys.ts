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

  async function refresh(): Promise<void> {
    keys.value = await getKeys()
    isReady.value = true
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
