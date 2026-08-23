import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { acquireEngine, releaseEngine } from '../engine/engineCache'
import type { StorageEngine } from '../engine/StorageEngine'
import type { StorageOptions, StorageError } from '../core/types'

export interface UseStorageResult<T> {
  value: T
  setValue: (value: T | ((prev: T) => T)) => void
  isReady: boolean
  error: StorageError | null
  expiry: Date | null
  canUndo: boolean
  canRedo: boolean
  remove(): void
  refresh(): Promise<void>
  /** Navigate to the previous value. Requires `history` to be set; a no-op otherwise. */
  undo(): void
  /** Re-apply a value undone via undo(). Requires `history` to be set; a no-op otherwise. */
  redo(): void
}

/**
 * React equivalent of the Vue `useStorage()` composable, built on the same
 * framework-agnostic StorageEngine — same options, same TTL/migrations/
 * encrypt/compress/sign/sync/debounce/throttle/history behavior. Backed by
 * `useSyncExternalStore`, so it's concurrent-rendering safe.
 *
 * The engine is acquired once, from `key`+`target` at the time this
 * component first calls the hook, and released on unmount. Like the Vue
 * composable, it does not react to `key` (or `options.target`) changing
 * across re-renders — if you need a different key, mount a new component
 * instance for it (e.g. via a `key` prop), the same pattern React already
 * recommends for "reset this piece of state" scenarios.
 */
export function useStorage<T>(key: string, options: StorageOptions<T>): UseStorageResult<T> {
  const ref = useRef<{ engine: StorageEngine<T>; cacheKey: string } | null>(null)
  if (!ref.current) {
    ref.current = acquireEngine<T>(key, options)
  }
  const { engine, cacheKey } = ref.current

  useEffect(() => {
    return () => {
      releaseEngine(cacheKey)
    }
  }, [cacheKey])

  const subscribe = useCallback((onStoreChange: () => void) => engine.subscribe(onStoreChange), [engine])
  const getSnapshot = useCallback(() => engine.getSnapshot(), [engine])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: T) => T)(engine.getSnapshot().value)
          : next
      engine.setValue(resolved)
    },
    [engine],
  )

  const remove = useCallback(() => engine.remove(), [engine])
  const refresh = useCallback(() => engine.refresh(), [engine])
  const undo = useCallback(() => engine.undo(), [engine])
  const redo = useCallback(() => engine.redo(), [engine])

  return {
    value: snapshot.value,
    setValue,
    isReady: snapshot.isReady,
    error: snapshot.error,
    expiry: snapshot.expiry,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    remove,
    refresh,
    undo,
    redo,
  }
}
