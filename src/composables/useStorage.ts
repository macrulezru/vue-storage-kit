import {
  ref,
  computed,
  watch,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  type Ref,
  type ComputedRef,
} from 'vue'
import { acquireEngine, releaseEngine, cacheKey } from '../engine/engineCache'
import { getGlobalOptions } from '../plugin'
import type { StorageOptions, StorageError, Serializer } from '../core/types'

export interface UseStorageReturn<T> {
  value: Ref<T>
  isReady: Ref<boolean>
  error: Ref<StorageError | null>
  expiry: ComputedRef<Date | null>
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  remove(): void
  refresh(): Promise<void>
  /** Navigate to the previous value. Requires `history` to be set; a no-op otherwise. */
  undo(): void
  /** Re-apply a value undone via undo(). Requires `history` to be set; a no-op otherwise. */
  redo(): void
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

// ─── Shared Vue-reactive-wrapper cache ────────────────────────────────────────
// Multiple calls to useStorage with the same key+target return the same
// reactive Ref. A detached effectScope keeps watchers alive independently of
// any component scope. Reference counting tears down the scope (and releases
// the underlying, framework-agnostic StorageEngine — see src/engine/ — via
// engineCache) when the last consumer is disposed.
//
// This is a Vue-specific cache layer on top of the shared engine cache: it
// exists so that two Vue components asking for the same key+target get the
// literal same `Ref` object, not just the same underlying engine.

interface WrapperCacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: UseStorageReturn<any>
  refCount: number
  scope: ReturnType<typeof effectScope>
}

const wrapperCache = new Map<string, WrapperCacheEntry>()

// ─── Public API ───────────────────────────────────────────────────────────────

export function useStorage<T>(key: string, options: StorageOptions<T>): UseStorageReturn<T>
export function useStorage<T>(def: StorageKeyDef<T>): UseStorageReturn<T>
export function useStorage<T>(
  keyOrDef: string | StorageKeyDef<T>,
  options?: StorageOptions<T>,
): UseStorageReturn<T> {
  const rawKey = typeof keyOrDef === 'string' ? keyOrDef : keyOrDef._key
  const rawOpts = typeof keyOrDef === 'string' ? options! : keyOrDef._options
  const { key, options: resolvedOpts } = resolveGlobalOptions(rawKey, rawOpts)
  const ck = cacheKey(key, resolvedOpts.target ?? 'local')

  // Return cached instance if available
  const existing = wrapperCache.get(ck)
  if (existing) {
    existing.refCount++
    _registerDispose(ck)
    return existing.result as UseStorageReturn<T>
  }

  // Create in a detached scope so it outlives any component
  const scope = effectScope(true)
  let result!: UseStorageReturn<T>
  scope.run(() => {
    result = _wrapEngine(key, resolvedOpts)
  })

  wrapperCache.set(ck, { result, refCount: 1, scope })
  _registerDispose(ck)
  return result
}

// VueStoragePlugin's global options (prefix/defaultTarget/defaultSerializer/
// defaultEncrypt/onError), resolved against this call's own options. Kept
// here (not in the framework-agnostic engine) because VueStoragePlugin is a
// Vue-specific concept.
function resolveGlobalOptions<T>(
  rawKey: string,
  options: StorageOptions<T>,
): { key: string; options: StorageOptions<T> } {
  const globalOpts = getGlobalOptions()
  const target = options.target ?? globalOpts.defaultTarget ?? 'local'
  const key = globalOpts.prefix ? globalOpts.prefix + rawKey : rawKey
  const serializer =
    options.serializer ?? (globalOpts.defaultSerializer as unknown as Serializer<T> | undefined)
  const encrypt =
    options.encrypt === true
      ? (globalOpts.defaultEncrypt ?? true)
      : options.encrypt
        ? { ...globalOpts.defaultEncrypt, ...options.encrypt }
        : options.encrypt

  const localOnError = options.onError
  const onError = globalOpts.onError
    ? (err: StorageError) => {
        localOnError?.(err)
        // VueStoragePlugin's onError runs in addition to (not instead of) a
        // per-call handler — useful for app-wide logging/telemetry.
        if (globalOpts.onError !== localOnError) globalOpts.onError!(err)
      }
    : localOnError

  return { key, options: { ...options, target, serializer, encrypt, onError } }
}

function _registerDispose(ck: string): void {
  if (!getCurrentScope()) return
  onScopeDispose(() => {
    const entry = wrapperCache.get(ck)
    if (!entry) return
    entry.refCount--
    if (entry.refCount <= 0) {
      entry.scope.stop()
      wrapperCache.delete(ck)
    }
  })
}

// Exposed for testing only
export function _clearInstanceCache(): void {
  wrapperCache.forEach((e) => e.scope.stop())
  wrapperCache.clear()
}

export interface StorageInstanceInfo {
  cacheKey: string
  target: string
  key: string
  refCount: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: UseStorageReturn<any>
}

// Exposed for the devtools inspector — a read-only snapshot of every live
// useStorage() instance, keyed by "target:key".
export function _getInstanceCache(): StorageInstanceInfo[] {
  return [...wrapperCache.entries()].map(([ck, entry]) => {
    const sep = ck.indexOf(':')
    return {
      cacheKey: ck,
      target: ck.slice(0, sep),
      key: ck.slice(sep + 1),
      refCount: entry.refCount,
      result: entry.result,
    }
  })
}

// ─── Implementation: thin Vue-reactive wrapper over StorageEngine ─────────────

function _wrapEngine<T>(key: string, options: StorageOptions<T>): UseStorageReturn<T> {
  const { engine, cacheKey: engineCk } = acquireEngine<T>(key, options)

  const snap = engine.getSnapshot()
  const value = ref<T>(snap.value) as Ref<T>
  const isReady = ref(snap.isReady)
  const error = ref<StorageError | null>(snap.error)
  const expiryDate = ref<Date | null>(snap.expiry)
  const canUndoRef = ref(snap.canUndo)
  const canRedoRef = ref(snap.canRedo)
  const expiry = computed<Date | null>(() => expiryDate.value)
  const canUndo = computed<boolean>(() => canUndoRef.value)
  const canRedo = computed<boolean>(() => canRedoRef.value)

  // Guards the watcher below from re-broadcasting a value the engine itself
  // just applied (initial read, cross-tab sync, undo/redo, migration). Reset
  // synchronously rather than via nextTick(): with flush: 'sync' the watcher
  // below runs synchronously, nested inside the `value.value = s.value`
  // assignment itself, so by the time control returns to the next line the
  // (re-entrant, skipped) watcher call has already happened. Resetting
  // synchronously — instead of leaving the flag up for a whole microtask —
  // matters when the engine's own setValue() echoes back through this same
  // subscriber (see below): a deferred reset would still be "up" for a
  // second, unrelated user edit landing later in the same synchronous tick,
  // silently dropping it.
  let _skipWrite = false

  const unsubscribe = engine.subscribe(() => {
    const s = engine.getSnapshot()
    _skipWrite = true
    value.value = s.value
    _skipWrite = false
    isReady.value = s.isReady
    error.value = s.error
    expiryDate.value = s.expiry
    canUndoRef.value = s.canUndo
    canRedoRef.value = s.canRedo
  })

  const stopWatch = watch(
    value,
    (newVal) => {
      if (_skipWrite) return
      engine.setValue(newVal)
    },
    { deep: true, flush: 'sync' },
  )

  // Cleanup is handled by the detached scope owner (_clearInstanceCache / refCount)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      unsubscribe()
      releaseEngine(engineCk)
    })
  }

  return {
    value,
    isReady,
    error,
    expiry,
    canUndo,
    canRedo,
    remove: () => engine.remove(),
    refresh: () => engine.refresh(),
    undo: () => engine.undo(),
    redo: () => engine.redo(),
  }
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
