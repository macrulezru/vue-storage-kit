import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { SchemaManager } from '../core/SchemaManager'
import { TTLManager } from '../core/TTLManager'
import { createJSONSerializer } from '../core/serializer'
import type {
  StorageOptions,
  StorageError,
  StorageEnvelope,
  StorageTarget,
  StorageAdapter,
  EncryptOptions,
  CompressOptions,
  SignOptions,
  Migration,
  Serializer,
} from '../core/types'

export interface StorageSnapshot<T> {
  value: T
  isReady: boolean
  error: StorageError | null
  expiry: Date | null
  canUndo: boolean
  canRedo: boolean
}

export type EngineEventType = 'write' | 'expire' | 'migrate' | 'sync-received' | 'error'

export interface EngineEvent {
  type: EngineEventType
  key: string
  at: number
  detail?: unknown
}

type CryptoModule = typeof import('../crypto/StorageEncryption')
type SigningModule = typeof import('../crypto/StorageSigning')
type CompressModule = typeof import('../compress/Compression')
type TabSyncModule = typeof import('../sync/TabSync')

/**
 * Framework-agnostic reactive-storage engine — the shared core behind
 * useStorage() on both the Vue and React sides. No Vue or React import
 * anywhere in this file.
 *
 * Exposes an "external store" shape (getSnapshot + subscribe) that's
 * directly compatible with React's useSyncExternalStore, and easy to mirror
 * into a Vue ref via a subscribe callback.
 */
export class StorageEngine<T> {
  readonly key: string
  readonly target: StorageTarget

  private readonly adapter: StorageAdapter
  private readonly serializer: Serializer<T>
  private readonly ttl?: number
  private readonly version: number
  private readonly migrations: Migration[]
  private readonly encryptOpts: EncryptOptions | null
  private readonly compressOpts: CompressOptions | null
  private readonly signOpts: SignOptions | null
  private readonly syncOpts: StorageOptions<T>['sync']
  private readonly debounce: number
  private readonly throttle: number
  private readonly historyLimit: number
  private readonly evictOnQuota: StorageOptions<T>['evictOnQuota']
  private readonly onErrorCb?: (err: StorageError) => void
  private readonly onExpireCb?: (key: string) => void
  private readonly onMigrateCb?: (from: number, to: number) => void
  private readonly defaultValue: T

  private cryptoMod: CryptoModule | null = null
  private signingMod: SigningModule | null = null
  private compressMod: CompressModule | null = null
  private tabSync: InstanceType<TabSyncModule['TabSync']> | null = null

  private snapshot: StorageSnapshot<T>
  private listeners = new Set<() => void>()
  private eventListeners = new Set<(e: EngineEvent) => void>()

  private historyStack: T[] = []
  private redoStack: T[] = []

  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private throttleTimer: ReturnType<typeof setTimeout> | null = null
  private lastWriteTime = 0
  private pendingThrottleBox: { value: T } | undefined

  private disposed = false

  /** Resolves once the initial read (and cross-tab subscription, if any) has settled. */
  readonly ready: Promise<void>

  constructor(key: string, options: StorageOptions<T>) {
    this.key = key
    this.target = options.target ?? 'local'
    this.serializer = options.serializer ?? createJSONSerializer<T>()
    this.ttl = options.ttl
    this.version = options.version ?? 1
    this.migrations = options.migrations ?? []
    this.encryptOpts =
      options.encrypt === false || options.encrypt === undefined
        ? null
        : options.encrypt === true
          ? ({} as EncryptOptions)
          : options.encrypt
    this.compressOpts =
      options.compress === false || options.compress === undefined
        ? null
        : options.compress === true
          ? {}
          : options.compress
    this.signOpts =
      options.sign === false || options.sign === undefined
        ? null
        : options.sign === true
          ? ({} as SignOptions)
          : options.sign
    this.syncOpts = options.sync ?? false
    this.debounce = options.debounce ?? 0
    this.throttle = options.throttle ?? 0
    this.historyLimit = options.history ?? 0
    this.evictOnQuota = options.evictOnQuota ?? false
    this.onErrorCb = options.onError
    this.onExpireCb = options.onExpire
    this.onMigrateCb = options.onMigrate
    this.defaultValue = options.defaultValue

    this.adapter = StorageAdapterFactory.get(this.target)

    this.snapshot = {
      value: this.defaultValue,
      isReady: false,
      error: null,
      expiry: null,
      canUndo: false,
      canRedo: false,
    }

    this.ready = this.init().catch((e: unknown) => {
      this.reportError({ type: 'parse-error', key: this.key, raw: String(e) })
      this.patchSnapshot({ isReady: true })
    })
  }

  // ─── External-store surface ────────────────────────────────────────────────

  getSnapshot(): StorageSnapshot<T> {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** For devtools/telemetry — write/expire/migrate/sync-received/error events. */
  onEvent(listener: (e: EngineEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  private patchSnapshot(patch: Partial<StorageSnapshot<T>>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }

  private emitEvent(type: EngineEventType, detail?: unknown): void {
    const event: EngineEvent = { type, key: this.key, at: Date.now(), detail }
    this.eventListeners.forEach((l) => l(event))
  }

  private reportError(err: StorageError): void {
    this.patchSnapshot({ error: err })
    this.onErrorCb?.(err)
    this.emitEvent('error', err)
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setValue(newValue: T): void {
    if (this.historyLimit > 0) {
      this.historyStack.push(this.snapshot.value)
      if (this.historyStack.length > this.historyLimit) this.historyStack.shift()
      this.redoStack = []
    }
    this.applyValue(newValue)
    this.scheduleWrite(newValue)
  }

  undo(): void {
    if (this.historyStack.length === 0) return
    const previous = this.historyStack.pop()!
    this.redoStack.push(this.snapshot.value)
    this.applyValue(previous)
    this.scheduleWrite(previous)
  }

  redo(): void {
    if (this.redoStack.length === 0) return
    const next = this.redoStack.pop()!
    this.historyStack.push(this.snapshot.value)
    if (this.historyStack.length > this.historyLimit) this.historyStack.shift()
    this.applyValue(next)
    this.scheduleWrite(next)
  }

  remove(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = null
      this.pendingThrottleBox = undefined
    }

    void (async () => {
      try {
        await this.adapter.removeItem(this.key)
      } catch {
        // best-effort — local state is already reset below regardless
      }
    })()

    if (this.tabSync) {
      const ts = Date.now()
      const tombstone: StorageEnvelope = {
        v: this.version,
        d: this.serializer.serialize(this.defaultValue),
        exp: null,
        ts,
      }
      this.tabSync.broadcast(this.key, JSON.stringify(tombstone), ts)
    }

    this.applyValue(this.defaultValue)
    this.patchSnapshot({ expiry: null })
  }

  async refresh(): Promise<void> {
    const newVal = await this.readFromStorage()
    this.applyValue(newVal)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.flushPendingWrite()
    this.tabSync?.stop()
    this.listeners.clear()
    this.eventListeners.clear()
  }

  // ─── Internal: apply a value without recording history or scheduling a write ──

  private applyValue(newValue: T): void {
    this.patchSnapshot({
      value: newValue,
      canUndo: this.historyStack.length > 0,
      canRedo: this.redoStack.length > 0,
    })
  }

  // ─── Internal: read pipeline ────────────────────────────────────────────────

  private async readFromStorage(): Promise<T> {
    let raw = await this.adapter.getItem(this.key)
    if (raw === null) return this.defaultValue

    if (this.signOpts && this.signingMod) {
      try {
        raw = await this.signingMod.verify(raw, this.signOpts)
      } catch {
        this.reportError({ type: 'signature-invalid', key: this.key })
        return this.defaultValue
      }
    }

    if (this.encryptOpts && this.cryptoMod) {
      try {
        raw = await this.cryptoMod.decrypt(raw, this.encryptOpts)
      } catch (e) {
        this.reportError({ type: 'crypto-error', operation: 'decrypt', error: e as Error })
        return this.defaultValue
      }
    }

    if (this.compressOpts && this.compressMod) {
      raw = await this.compressMod.decompress(raw, this.compressOpts)
    }

    let envelope: StorageEnvelope
    try {
      envelope = JSON.parse(raw) as StorageEnvelope
    } catch {
      this.reportError({ type: 'parse-error', key: this.key, raw })
      return this.defaultValue
    }

    if (TTLManager.isExpired(envelope.exp)) {
      await this.adapter.removeItem(this.key)
      this.patchSnapshot({ expiry: null })
      this.onExpireCb?.(this.key)
      this.emitEvent('expire')
      return this.defaultValue
    }

    this.patchSnapshot({ expiry: envelope.exp ? new Date(envelope.exp) : null })

    if (envelope.v !== this.version) {
      let deserialized: unknown
      try {
        deserialized = this.serializer.deserialize(envelope.d)
      } catch {
        this.reportError({ type: 'parse-error', key: this.key, raw: envelope.d })
        return this.defaultValue
      }

      const result = SchemaManager.migrate<T>(
        { v: envelope.v, d: deserialized },
        this.version,
        this.migrations,
        (from, to) => {
          this.onMigrateCb?.(from, to)
          this.emitEvent('migrate', { from, to })
        },
        (err) => this.reportError(err),
      )
      if (!result) return this.defaultValue

      await this.writeToStorageInternal(result.data, result.version, false)
      return result.data
    }

    try {
      return this.serializer.deserialize(envelope.d)
    } catch {
      this.reportError({ type: 'parse-error', key: this.key, raw: envelope.d })
      return this.defaultValue
    }
  }

  // ─── Internal: write pipeline ───────────────────────────────────────────────

  private async writeToStorageInternal(
    data: T,
    schemaVersion: number,
    broadcast: boolean,
  ): Promise<void> {
    const exp = TTLManager.computeExp(this.ttl)
    const ts = Date.now()
    const envelope: StorageEnvelope = {
      v: schemaVersion,
      d: this.serializer.serialize(data),
      exp,
      ts,
    }

    let raw = JSON.stringify(envelope)

    if (this.compressOpts && this.compressMod) {
      raw = await this.compressMod.compress(raw, this.compressOpts)
    }

    if (this.encryptOpts && this.cryptoMod) {
      try {
        raw = await this.cryptoMod.encrypt(raw, this.encryptOpts)
      } catch (e) {
        this.reportError({ type: 'crypto-error', operation: 'encrypt', error: e as Error })
        return
      }
    }

    if (this.signOpts && this.signingMod) {
      raw = await this.signingMod.sign(raw, this.signOpts)
    }

    try {
      await this.adapter.setItem(this.key, raw)
      this.patchSnapshot({ expiry: exp ? new Date(exp) : null })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        const recovered = await this.recoverFromQuotaExceeded(raw, exp)
        if (recovered) {
          this.emitEvent('write', { schemaVersion, recoveredFromQuota: true })
          if (broadcast && this.tabSync) this.tabSync.broadcast(this.key, raw, ts)
          return
        }
        this.reportError({ type: 'quota-exceeded', key: this.key })
        return
      }
      this.reportError({ type: 'write-failed', key: this.key, error: e as Error })
      return
    }

    this.emitEvent('write', { schemaVersion })

    if (broadcast && this.tabSync) {
      this.tabSync.broadcast(this.key, raw, ts)
    }
  }

  /**
   * One bounded recovery attempt on QuotaExceededError: sweep this adapter's
   * own expired-TTL entries and retry once; if that's not enough and
   * evictOnQuota is enabled, evict this adapter's least-recently-written
   * *other* keys (oldest envelope `ts` first) one at a time, retrying after
   * each, up to `max` evictions.
   *
   * Eviction can only judge the age of keys stored as plain (unencrypted,
   * uncompressed) envelopes — an encrypted/compressed/signed key belonging
   * to some other useStorage() instance can't be safely inspected here, so
   * it's left alone.
   */
  private async recoverFromQuotaExceeded(raw: string, exp: number | null): Promise<boolean> {
    try {
      await TTLManager.cleanExpired(this.adapter)
      await this.adapter.setItem(this.key, raw)
      this.patchSnapshot({ expiry: exp ? new Date(exp) : null })
      return true
    } catch {
      // fall through to eviction
    }

    if (!this.evictOnQuota) return false

    const max = typeof this.evictOnQuota === 'object' ? (this.evictOnQuota.max ?? 1) : 1
    for (let i = 0; i < max; i++) {
      const evicted = await this.evictOldestOther()
      if (!evicted) break
      try {
        await this.adapter.setItem(this.key, raw)
        this.patchSnapshot({ expiry: exp ? new Date(exp) : null })
        return true
      } catch {
        continue
      }
    }
    return false
  }

  private async evictOldestOther(): Promise<boolean> {
    const keys = await this.adapter.keys()
    let oldestKey: string | null = null
    let oldestTs = Infinity

    for (const k of keys) {
      if (k === this.key) continue
      const raw = await this.adapter.getItem(k)
      if (!raw) continue
      try {
        const envelope = JSON.parse(raw) as { ts?: number }
        if (typeof envelope.ts === 'number' && envelope.ts < oldestTs) {
          oldestTs = envelope.ts
          oldestKey = k
        }
      } catch {
        // not a plain envelope (or encrypted/compressed) — can't judge age, skip
      }
    }

    if (!oldestKey) return false
    await this.adapter.removeItem(oldestKey)
    return true
  }

  private async writeToStorage(data: T): Promise<void> {
    return this.writeToStorageInternal(data, this.version, true)
  }

  // ─── Internal: debounce/throttle scheduling ────────────────────────────────

  private scheduleWrite(data: T): void {
    if (this.throttle > 0) {
      this.pendingThrottleBox = { value: data }
      const now = Date.now()
      const elapsed = now - this.lastWriteTime
      if (elapsed >= this.throttle) {
        this.lastWriteTime = now
        this.pendingThrottleBox = undefined
        void this.writeToStorage(data)
      } else if (this.throttleTimer === null) {
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null
          this.lastWriteTime = Date.now()
          const pending = this.pendingThrottleBox
          this.pendingThrottleBox = undefined
          if (pending) void this.writeToStorage(pending.value)
        }, this.throttle - elapsed)
      }
      return
    }

    if (this.debounce <= 0) {
      void this.writeToStorage(data)
      return
    }

    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.writeToStorage(data)
    }, this.debounce)
  }

  private flushPendingWrite(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      void this.writeToStorage(this.snapshot.value)
    }
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = null
      const pending = this.pendingThrottleBox
      this.pendingThrottleBox = undefined
      if (pending) void this.writeToStorage(pending.value)
    }
  }

  // ─── Internal: init ─────────────────────────────────────────────────────────

  private async init(): Promise<void> {
    if (this.encryptOpts) {
      this.cryptoMod = await import('../crypto/StorageEncryption')
    }
    if (this.compressOpts) {
      this.compressMod = await import('../compress/Compression')
    }
    if (this.signOpts) {
      this.signingMod = await import('../crypto/StorageSigning')
    }

    if (this.syncOpts) {
      const syncOpts = this.syncOpts === true ? {} : this.syncOpts
      const { TabSync } = await import('../sync/TabSync')
      this.tabSync = new TabSync(syncOpts)
      await this.tabSync.start()

      this.tabSync.subscribe(this.key, async (raw) => {
        let dataRaw = raw
        if (this.signOpts && this.signingMod) {
          try {
            dataRaw = await this.signingMod.verify(dataRaw, this.signOpts)
          } catch {
            return
          }
        }
        if (this.encryptOpts && this.cryptoMod) {
          try {
            dataRaw = await this.cryptoMod!.decrypt(dataRaw, this.encryptOpts)
          } catch {
            return
          }
        }
        if (this.compressOpts && this.compressMod) {
          dataRaw = await this.compressMod.decompress(dataRaw, this.compressOpts)
        }
        try {
          const envelope = JSON.parse(dataRaw) as StorageEnvelope
          if (!TTLManager.isExpired(envelope.exp)) {
            const data = this.serializer.deserialize(envelope.d)
            this.applyValue(data)
            this.patchSnapshot({ expiry: envelope.exp ? new Date(envelope.exp) : null })
            this.emitEvent('sync-received')
          }
        } catch {
          // ignore malformed cross-tab messages
        }
      })
    }

    const initial = await this.readFromStorage()
    this.applyValue(initial)
    this.patchSnapshot({ isReady: true })
  }
}
