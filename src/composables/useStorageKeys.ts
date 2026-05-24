import { ref, onScopeDispose, getCurrentScope, type Ref } from 'vue'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import type { StorageTarget } from '../core/types'

export interface UseStorageKeysReturn {
  keys: Ref<string[]>
  refresh(): void
}

export function useStorageKeys(
  prefix = '',
  target: StorageTarget = 'local',
): UseStorageKeysReturn {
  const adapter = StorageAdapterFactory.get(target)

  function getKeys(): string[] {
    return adapter.keys().filter((k) => k.startsWith(prefix))
  }

  const keys = ref<string[]>(getKeys())

  function refresh(): void {
    keys.value = getKeys()
  }

  // Re-scan on storage events from other tabs
  function onStorage(e: StorageEvent): void {
    if (e.key === null || e.key.startsWith(prefix)) {
      refresh()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    if (getCurrentScope()) {
      onScopeDispose(() => window.removeEventListener('storage', onStorage))
    }
  }

  return { keys, refresh }
}
