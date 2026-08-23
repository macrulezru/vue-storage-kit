export { useStorage } from './useStorage'
export type { UseStorageResult } from './useStorage'

// Re-exported for convenience — same option/type surface as the Vue entry point.
export type {
  StorageTarget,
  StorageOptions,
  StorageError,
  Serializer,
  Migration,
  EncryptOptions,
  CompressOptions,
  SignOptions,
  SyncOptions,
} from '../core/types'
