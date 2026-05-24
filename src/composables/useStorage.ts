import {
  ref,
  computed,
  watch,
  nextTick,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  type Ref,
  type ComputedRef,
} from 'vue'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { SchemaManager } from '../core/SchemaManager'
import { TTLManager } from '../core/TTLManager'
import { createJSONSerializer } from '../core/serializer'
import type { StorageOptions, StorageError, StorageEnvelope, EncryptOptions } from '../core/types'

export interface UseStorageReturn<T> {
  value: Ref<T>
  isReady: Ref<boolean>
  error: Ref<StorageError | null>
  expiry: ComputedRef<Date | null>
  remove(): void
  refresh(): Promise<void>
}

// ─── Typed key descriptor produced by defineStorageKey() ─────────────────────

export interface StorageKeyDef<T> {
  _key: string
  _options: StorageOptions<T>
}

export function defineStorageKey<T>(
  key: string,
  options: StorageOptions<T>,
): StorageKeyDef<T> {
  return { _key: key, _options: options }
}

// ─── Shared instance cache ────────────────────────────────────────────────────
// Multiple calls to useStorage with the same key+target return the same
// reactive Ref. A detached effectScope keeps watchers alive independently of
// any component scope. Reference counting tears down the scope when the last
// consumer is disposed.

interface CacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: UseStorageReturn<any>
  refCount: number
  scope: ReturnType<typeof effectScope>
}

const instanceCache = new Map<string, CacheEntry>()

function cacheKey(key: string, target: string): string {
  return `${target}:${key}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function useStorage<T>(key: string, options: StorageOptions<T>): UseStorageReturn<T>
export function useStorage<T>(def: StorageKeyDef<T>): UseStorageReturn<T>
export function useStorage<T>(
  keyOrDef: string | StorageKeyDef<T>,
  options?: StorageOptions<T>,
): UseStorageReturn<T> {
  const resolvedKey = typeof keyOrDef === 'string' ? keyOrDef : keyOrDef._key
  const resolvedOpts =
    typeof keyOrDef === 'string' ? options! : keyOrDef._options
  const target = resolvedOpts.target ?? 'local'
  const ck = cacheKey(resolvedKey, target)

  // Return cached instance if available
  const existing = instanceCache.get(ck)
  if (existing) {
    existing.refCount++
    _registerDispose(ck)
    return existing.result as UseStorageReturn<T>
  }

  // Create in a detached scope so it outlives any component
  const scope = effectScope(true)
  let result!: UseStorageReturn<T>
  scope.run(() => {
    result = _useStorageImpl(resolvedKey, resolvedOpts)
  })

  instanceCache.set(ck, { result, refCount: 1, scope })
  _registerDispose(ck)
  return result
}

function _registerDispose(ck: string): void {
  if (!getCurrentScope()) return
  onScopeDispose(() => {
    const entry = instanceCache.get(ck)
    if (!entry) return
    entry.refCount--
    if (entry.refCount <= 0) {
      entry.scope.stop()
      instanceCache.delete(ck)
    }
  })
}

// Exposed for testing only
export function _clearInstanceCache(): void {
  instanceCache.forEach((e) => e.scope.stop())
  instanceCache.clear()
}

// ─── Implementation ───────────────────────────────────────────────────────────

type CryptoModule = typeof import('../crypto/StorageEncryption')
type TabSyncModule = typeof import('../sync/TabSync')

function _useStorageImpl<T>(key: string, options: StorageOptions<T>): UseStorageReturn<T> {
  const {
    target = 'local',
    serializer = createJSONSerializer<T>(),
    ttl,
    version = 1,
    migrations = [],
    encrypt = false,
    sync = false,
    onError,
    onExpire,
    onMigrate,
    defaultValue,
  } = options

  const adapter = StorageAdapterFactory.get(target)
  const value = ref<T>(defaultValue) as Ref<T>
  const isReady = ref(false)
  const error = ref<StorageError | null>(null)
  const expiryDate = ref<Date | null>(null)

  const encryptOpts: EncryptOptions | null =
    encrypt === false ? null : encrypt === true ? ({} as EncryptOptions) : encrypt

  let cryptoMod: CryptoModule | null = null
  let tabSync: InstanceType<TabSyncModule['TabSync']> | null = null
  let _skipWrite = false

  const expiry = computed<Date | null>(() => expiryDate.value)

  function reportError(err: StorageError): void {
    error.value = err
    onError?.(err)
  }

  function setValueSilently(val: T): void {
    _skipWrite = true
    value.value = val
    nextTick(() => {
      _skipWrite = false
    })
  }

  async function readFromStorage(): Promise<T> {
    let raw = adapter.getItem(key)
    if (raw === null) return defaultValue

    if (encryptOpts && cryptoMod) {
      try {
        raw = await cryptoMod.decrypt(raw, encryptOpts)
      } catch (e) {
        reportError({ type: 'crypto-error', operation: 'decrypt', error: e as Error })
        return defaultValue
      }
    }

    let envelope: StorageEnvelope
    try {
      envelope = JSON.parse(raw) as StorageEnvelope
    } catch {
      reportError({ type: 'parse-error', key, raw })
      return defaultValue
    }

    if (TTLManager.isExpired(envelope.exp)) {
      adapter.removeItem(key)
      expiryDate.value = null
      onExpire?.(key)
      return defaultValue
    }

    expiryDate.value = envelope.exp ? new Date(envelope.exp) : null

    if (envelope.v !== version) {
      let deserialized: unknown
      try {
        deserialized = serializer.deserialize(envelope.d)
      } catch {
        reportError({ type: 'parse-error', key, raw: envelope.d })
        return defaultValue
      }

      const result = SchemaManager.migrate<T>(
        { v: envelope.v, d: deserialized },
        version,
        migrations,
        onMigrate,
        reportError,
      )
      if (!result) return defaultValue

      await writeToStorageInternal(result.data, result.version, false)
      return result.data
    }

    try {
      return serializer.deserialize(envelope.d)
    } catch {
      reportError({ type: 'parse-error', key, raw: envelope.d })
      return defaultValue
    }
  }

  async function writeToStorageInternal(
    data: T,
    schemaVersion: number,
    broadcast: boolean,
  ): Promise<void> {
    const exp = TTLManager.computeExp(ttl)
    const ts = Date.now()
    const envelope: StorageEnvelope = {
      v: schemaVersion,
      d: serializer.serialize(data),
      exp,
      ts,
    }

    let raw = JSON.stringify(envelope)

    if (encryptOpts && cryptoMod) {
      try {
        raw = await cryptoMod.encrypt(raw, encryptOpts)
      } catch (e) {
        reportError({ type: 'crypto-error', operation: 'encrypt', error: e as Error })
        return
      }
    }

    try {
      adapter.setItem(key, raw)
      expiryDate.value = exp ? new Date(exp) : null
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        reportError({ type: 'quota-exceeded', key })
        return
      }
      throw e
    }

    if (broadcast && tabSync) {
      tabSync.broadcast(key, raw, ts)
    }
  }

  async function writeToStorage(data: T): Promise<void> {
    return writeToStorageInternal(data, version, true)
  }

  async function init(): Promise<void> {
    if (encryptOpts) {
      cryptoMod = await import('../crypto/StorageEncryption')
    }

    if (sync) {
      const syncOpts = sync === true ? {} : sync
      const { TabSync } = await import('../sync/TabSync')
      tabSync = new TabSync(syncOpts)
      await tabSync.start()

      tabSync.subscribe(key, async (raw) => {
        let dataRaw = raw
        if (encryptOpts && cryptoMod) {
          try {
            dataRaw = await cryptoMod!.decrypt(raw, encryptOpts)
          } catch {
            return
          }
        }
        try {
          const envelope = JSON.parse(dataRaw) as StorageEnvelope
          if (!TTLManager.isExpired(envelope.exp)) {
            const data = serializer.deserialize(envelope.d)
            setValueSilently(data)
            expiryDate.value = envelope.exp ? new Date(envelope.exp) : null
          }
        } catch {
          // ignore malformed cross-tab messages
        }
      })
    }

    const initial = await readFromStorage()
    setValueSilently(initial)
    isReady.value = true
  }

  const stopWatch = watch(
    value,
    async (newVal) => {
      if (_skipWrite) return
      await writeToStorage(newVal)
    },
    { deep: true, flush: 'sync' },
  )

  init().catch((e: unknown) => {
    reportError({ type: 'parse-error', key, raw: String(e) })
    isReady.value = true
  })

  // Cleanup is handled by the detached scope owner (_clearInstanceCache / refCount)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      tabSync?.stop()
    })
  }

  function remove(): void {
    adapter.removeItem(key)
    expiryDate.value = null
    if (tabSync) {
      const ts = Date.now()
      const tombstone: StorageEnvelope = {
        v: version,
        d: serializer.serialize(defaultValue),
        exp: null,
        ts,
      }
      tabSync.broadcast(key, JSON.stringify(tombstone), ts)
    }
    setValueSilently(defaultValue)
  }

  async function refresh(): Promise<void> {
    const newVal = await readFromStorage()
    setValueSilently(newVal)
  }

  return { value, isReady, error, expiry, remove, refresh }
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  opts?: Omit<StorageOptions<T>, 'target' | 'defaultValue'>,
): UseStorageReturn<T> {
  return useStorage(key, { ...opts, target: 'local', defaultValue })
}

export function useSessionStorage<T>(
  key: string,
  defaultValue: T,
  opts?: Omit<StorageOptions<T>, 'target' | 'defaultValue'>,
): UseStorageReturn<T> {
  return useStorage(key, { ...opts, target: 'session', defaultValue })
}
