import type { StorageAdapter, StorageTarget } from '../core/types'
import { LocalStorageAdapter } from './LocalStorageAdapter'
import { SessionStorageAdapter } from './SessionStorageAdapter'
import { MemoryStorageAdapter } from './MemoryStorageAdapter'
import { IndexedDBStorageAdapter } from './IndexedDBStorageAdapter'

const instances = new Map<StorageTarget, StorageAdapter>()

export const StorageAdapterFactory = {
  get(target: StorageTarget): StorageAdapter {
    if (typeof window === 'undefined') {
      if (!instances.has('memory')) {
        instances.set('memory', new MemoryStorageAdapter())
      }
      return instances.get('memory')!
    }

    if (!instances.has(target)) {
      switch (target) {
        case 'local':
          instances.set(target, new LocalStorageAdapter())
          break
        case 'session':
          instances.set(target, new SessionStorageAdapter())
          break
        case 'memory':
          instances.set(target, new MemoryStorageAdapter())
          break
        case 'indexeddb':
          instances.set(target, new IndexedDBStorageAdapter())
          break
      }
    }

    return instances.get(target)!
  },

  // Reset singletons — intended for testing only
  _reset(): void {
    instances.clear()
  },
}
