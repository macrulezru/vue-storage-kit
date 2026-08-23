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

// Devtools integration lives at the `vue-storage-kit/devtools` entry point
// (not re-exported here) so @vue/devtools-api never ends up in the main
// bundle — VueStoragePlugin.install() already loads it dynamically outside
// production; import from the subpath directly only if you skip the plugin.

// Adapters (for advanced use)
export { StorageAdapterFactory } from './adapters/StorageAdapterFactory'
export { MemoryStorageAdapter } from './adapters/MemoryStorageAdapter'
export { IndexedDBStorageAdapter } from './adapters/IndexedDBStorageAdapter'
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
  SignOptions,
  CompressOptions,
  CompressionAlgorithm,
  SyncOptions,
  CookieOptions,
} from './core/types'
