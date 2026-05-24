// Composables
export {
  useStorage,
  useLocalStorage,
  useSessionStorage,
  defineStorageKey,
  _clearInstanceCache,
} from './composables/useStorage'
export type { UseStorageReturn, StorageKeyDef } from './composables/useStorage'

export { useIndexedDB, useIDBRef } from './composables/useIndexedDB'
export type {
  UseIndexedDBReturn,
  UseIDBRefReturn,
  UseIndexedDBOptions,
  IDBIndexDefinition,
} from './composables/useIndexedDB'

export { useCookie } from './composables/useCookie'

export { useStorageList } from './composables/useStorageList'
export type { UseStorageListReturn, UseStorageListOptions } from './composables/useStorageList'

export { useStorageKeys } from './composables/useStorageKeys'
export type { UseStorageKeysReturn } from './composables/useStorageKeys'

export { useBroadcastChannel } from './composables/useBroadcastChannel'
export type { UseBroadcastChannelReturn } from './composables/useBroadcastChannel'

// Plugin
export { VueStoragePlugin } from './plugin'
export type { VueStoragePluginOptions } from './plugin'

// Adapters (for advanced use)
export { StorageAdapterFactory } from './adapters/StorageAdapterFactory'
export { MemoryStorageAdapter } from './adapters/MemoryStorageAdapter'
export { IndexedDBAdapter } from './adapters/IndexedDBAdapter'
export type { IDBIndexDefinition as IDBIndex } from './adapters/IndexedDBAdapter'

// Core utilities
export { TTLManager } from './core/TTLManager'
export { SchemaManager } from './core/SchemaManager'
export { createJSONSerializer } from './core/serializer'

// Storage utilities
export {
  getStorageQuota,
  exportStorage,
  importStorage,
  clearStorage,
} from './utils/storage'
export type { StorageQuota, StorageSnapshot } from './utils/storage'

// Types
export type {
  StorageTarget,
  StorageAdapter,
  StorageOptions,
  StorageEnvelope,
  StorageError,
  Serializer,
  Migration,
  EncryptOptions,
  SyncOptions,
  CookieOptions,
} from './core/types'
