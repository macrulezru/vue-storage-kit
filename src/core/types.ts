export type StorageTarget = 'local' | 'session' | 'memory' | 'indexeddb'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, val: string): void
  removeItem(key: string): void
  keys(): string[]
}

export interface Serializer<T> {
  serialize: (value: T) => string
  deserialize: (raw: string) => T
}

export interface Migration {
  version: number
  up: (data: unknown) => unknown
  down?: (data: unknown) => unknown
}

export interface EncryptOptions {
  password?: string
  key?: CryptoKey
  iterations?: number
}

export interface SyncOptions {
  channel?: string
  leader?: boolean
  debounce?: number
}

export interface StorageOptions<T> {
  target?: StorageTarget
  serializer?: Serializer<T>
  ttl?: number
  version?: number
  migrations?: Migration[]
  encrypt?: boolean | EncryptOptions
  sync?: boolean | SyncOptions
  onError?: (err: StorageError) => void
  onExpire?: (key: string) => void
  onMigrate?: (from: number, to: number) => void
  defaultValue: T
}

export interface CookieOptions<T> {
  expires?: Date | number
  path?: string
  domain?: string
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
  httpOnly?: boolean
  serializer?: Serializer<T>
  defaultValue: T
}

// d is the serialized string of the data, not the raw T
export interface StorageEnvelope {
  v: number
  d: string
  exp: number | null
  ts: number
}

export type StorageError =
  | { type: 'quota-exceeded'; key: string }
  | { type: 'parse-error'; key: string; raw: string }
  | { type: 'migration-failed'; from: number; to: number; error: Error }
  | { type: 'crypto-error'; operation: 'encrypt' | 'decrypt'; error: Error }
