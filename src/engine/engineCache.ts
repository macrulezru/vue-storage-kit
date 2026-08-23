import { StorageEngine } from './StorageEngine'
import type { StorageOptions } from '../core/types'

// Shared across Vue and React: two components (regardless of framework)
// calling useStorage() with the same key+target get the same StorageEngine
// instance — one set of timers/subscriptions/adapter calls, not one per
// caller. Reference-counted; disposed when the last consumer releases it.

interface CacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: StorageEngine<any>
  refCount: number
}

const cache = new Map<string, CacheEntry>()
const creationListeners = new Set<(info: EngineInstanceInfo) => void>()

export function cacheKey(key: string, target: string): string {
  return `${target}:${key}`
}

export function acquireEngine<T>(
  key: string,
  options: StorageOptions<T>,
): { engine: StorageEngine<T>; cacheKey: string } {
  const target = options.target ?? 'local'
  const ck = cacheKey(key, target)

  const existing = cache.get(ck)
  if (existing) {
    existing.refCount++
    return { engine: existing.engine as StorageEngine<T>, cacheKey: ck }
  }

  const engine = new StorageEngine<T>(key, options)
  cache.set(ck, { engine, refCount: 1 })
  creationListeners.forEach((l) => l({ cacheKey: ck, target, key, refCount: 1, engine }))
  return { engine, cacheKey: ck }
}

// For devtools: notified whenever a *new* engine is created (not on a cache
// hit) — lets a timeline subscriber attach to engines created after devtools
// itself was set up, without polling.
export function onEngineCreated(listener: (info: EngineInstanceInfo) => void): () => void {
  creationListeners.add(listener)
  return () => creationListeners.delete(listener)
}

export function releaseEngine(ck: string): void {
  const entry = cache.get(ck)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    entry.engine.dispose()
    cache.delete(ck)
  }
}

export interface EngineInstanceInfo {
  cacheKey: string
  target: string
  key: string
  refCount: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: StorageEngine<any>
}

// Exposed for the devtools inspector — a read-only snapshot of every live
// engine, keyed by "target:key". Vue- and React-created instances both show
// up here since they share this same cache.
export function getEngineCache(): EngineInstanceInfo[] {
  return [...cache.entries()].map(([ck, entry]) => {
    const sep = ck.indexOf(':')
    return {
      cacheKey: ck,
      target: ck.slice(0, sep),
      key: ck.slice(sep + 1),
      refCount: entry.refCount,
      engine: entry.engine,
    }
  })
}

// Exposed for testing only
export function _clearEngineCache(): void {
  cache.forEach((e) => e.engine.dispose())
  cache.clear()
}
