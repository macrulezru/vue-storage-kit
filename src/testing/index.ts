// Test helpers for apps/components that consume vue-storage-kit. Framework
// and test-runner agnostic (no `vi`/`jest` import) — StorageAdapterFactory
// is a plain object, so redirecting it is just a property assignment.
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { createJSONSerializer } from '../core/serializer'
import { _clearInstanceCache } from '../composables/useStorage'
import { _clearEngineCache } from '../engine/engineCache'
import type { StorageAdapter, Serializer } from '../core/types'

export { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
export { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'

export interface MockStorageHandle {
  adapter: StorageAdapter
  /** Restores StorageAdapterFactory.get() to its real implementation. */
  restore(): void
}

/**
 * Redirects StorageAdapterFactory.get() to always return one adapter
 * (a fresh MemoryStorageAdapter by default), regardless of the requested
 * target — the same pattern this package's own test suite uses everywhere:
 *
 * ```ts
 * const { adapter, restore } = mockStorage()
 * // ...test using useStorage()/useStorageList()/createPiniaPersist()/etc...
 * restore()
 * ```
 */
export function mockStorage(adapter: StorageAdapter = new MemoryStorageAdapter()): MockStorageHandle {
  const original = StorageAdapterFactory.get
  StorageAdapterFactory.get = () => adapter
  return {
    adapter,
    restore() {
      StorageAdapterFactory.get = original
    },
  }
}

/**
 * Clears every cache this package keeps at module scope: the shared
 * useStorage()/StorageEngine instance cache (Vue and React alike) and
 * StorageAdapterFactory's per-target singletons. Call this in `beforeEach`
 * so tests don't leak state (or share `Ref`s / engines) across each other.
 */
export function resetStorageState(): void {
  _clearInstanceCache()
  _clearEngineCache()
  StorageAdapterFactory._reset()
}

export interface SeedEnvelopeOptions<T> {
  version?: number
  exp?: number | null
  ts?: number
  serializer?: Serializer<T>
}

/**
 * Writes a raw envelope directly into an adapter — for arranging test state
 * without going through a live useStorage() instance (e.g. to pre-seed data
 * before mounting the component under test, or to test migrations/TTL by
 * constructing a specific stored shape).
 */
export async function seedEnvelope<T>(
  adapter: StorageAdapter,
  key: string,
  value: T,
  opts: SeedEnvelopeOptions<T> = {},
): Promise<void> {
  const serializer = opts.serializer ?? createJSONSerializer<T>()
  const envelope = {
    v: opts.version ?? 1,
    d: serializer.serialize(value),
    exp: opts.exp ?? null,
    ts: opts.ts ?? Date.now(),
  }
  await adapter.setItem(key, JSON.stringify(envelope))
}

/** seedEnvelope(), with `exp` defaulted to a timestamp already in the past. */
export async function seedExpiredEnvelope<T>(
  adapter: StorageAdapter,
  key: string,
  value: T,
  opts: Omit<SeedEnvelopeOptions<T>, 'exp'> = {},
): Promise<void> {
  await seedEnvelope(adapter, key, value, { ...opts, exp: Date.now() - 1000 })
}

/**
 * Waits for pending microtasks/timers (storage writes, debounce/throttle
 * windows, dynamic `import()`s inside useStorage()) to settle. `ms` should
 * comfortably exceed any `debounce`/`throttle` window under test.
 */
export function flushAsync(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
