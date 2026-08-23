export type StorageTarget = 'local' | 'session' | 'memory' | 'indexeddb'

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, val: string): Promise<void>
  removeItem(key: string): Promise<void>
  keys(): Promise<string[]>
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

export interface SignOptions {
  password?: string
  key?: CryptoKey
  iterations?: number
}

export type CompressionAlgorithm = 'gzip' | 'deflate' | 'deflate-raw'

export interface CompressOptions {
  algorithm?: CompressionAlgorithm
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
  compress?: boolean | CompressOptions
  /** Lightweight HMAC integrity check — detects tampering without requiring
   *  secrecy. Applied as the outermost layer (wraps compressed/encrypted
   *  data too). Combine with `encrypt` for confidentiality + integrity. */
  sign?: boolean | SignOptions
  sync?: boolean | SyncOptions
  /** Debounce writes to storage by this many ms. Local reactive `value` still
   *  updates immediately — only the persisted write is deferred/coalesced.
   *  Mutually exclusive with `throttle` — if both are set, `throttle` wins. */
  debounce?: number
  /** Throttle writes to at most once every this many ms, guaranteeing a
   *  write during continuous changes (e.g. a slider) instead of only after
   *  they stop. Mutually exclusive with `debounce` — if both are set, this wins. */
  throttle?: number
  /** Keep up to this many past values in memory for undo()/redo(). Not
   *  persisted — resets on reload. 0 or omitted disables history tracking. */
  history?: number
  /** On QuotaExceededError, if the TTL sweep alone doesn't free enough
   *  space, evict this adapter's least-recently-written *other* keys (oldest
   *  envelope `ts` first) and retry, up to `max` evictions (default 1).
   *  Off by default — deleting unrelated keys is a meaningful side effect
   *  that must be opted into. */
  evictOnQuota?: boolean | { max?: number }
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
  | { type: 'write-failed'; key: string; error: Error }
  | { type: 'signature-invalid'; key: string }
  | { type: 'read-failed'; key: string; error: Error }
