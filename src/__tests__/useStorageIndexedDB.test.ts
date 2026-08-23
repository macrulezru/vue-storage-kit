import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'

// happy-dom does not implement IndexedDB — mock the underlying IndexedDBAdapter
// with an in-memory Map store, same approach as useIndexedDB.test.ts.
vi.mock('../adapters/IndexedDBAdapter', () => {
  const makeStore = () => {
    const store = new Map<string, unknown>()
    return {
      get: vi.fn(async (key: IDBValidKey) => store.get(String(key)) ?? null),
      set: vi.fn(async (key: IDBValidKey, val: unknown) => { store.set(String(key), val) }),
      delete: vi.fn(async (key: IDBValidKey) => { store.delete(String(key)) }),
      keys: vi.fn(async () => [...store.keys()]),
    }
  }
  return { IndexedDBAdapter: vi.fn().mockImplementation(makeStore) }
})

beforeEach(() => {
  _clearInstanceCache()
  StorageAdapterFactory._reset()
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

describe('useStorage + target: indexeddb', () => {
  it('reads and writes through the same useStorage() API as other targets', async () => {
    const { value, isReady } = withScope(() =>
      useStorage('idb-key', { defaultValue: 'default', target: 'indexeddb' }),
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(isReady.value).toBe(true)
    expect(value.value).toBe('default')

    value.value = 'stored-in-idb'
    await new Promise((r) => setTimeout(r, 10))

    _clearInstanceCache()
    const { value: value2 } = withScope(() =>
      useStorage('idb-key', { defaultValue: 'default', target: 'indexeddb' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(value2.value).toBe('stored-in-idb')
  })

  it('supports TTL and remove() on the indexeddb target, and remove() actually persists', async () => {
    const { value, remove } = withScope(() =>
      useStorage('idb-ttl-key', { defaultValue: 0, target: 'indexeddb', ttl: 60_000 }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 42
    await new Promise((r) => setTimeout(r, 10))

    remove()
    await new Promise((r) => setTimeout(r, 10))
    expect(value.value).toBe(0)

    // Reload as a fresh instance to confirm the removal was actually written
    // through to the store, not just reflected in the live local ref.
    _clearInstanceCache()
    const { value: reloaded } = withScope(() =>
      useStorage('idb-ttl-key', { defaultValue: 0, target: 'indexeddb', ttl: 60_000 }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(reloaded.value).toBe(0)
  })

  it('honors TTL expiry on the indexeddb target', async () => {
    const { value } = withScope(() =>
      useStorage('idb-ttl-expiry-key', { defaultValue: 0, target: 'indexeddb', ttl: 20 }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 42
    await new Promise((r) => setTimeout(r, 10))

    await new Promise((r) => setTimeout(r, 40)) // let the TTL elapse

    _clearInstanceCache()
    const { value: afterExpiry } = withScope(() =>
      useStorage('idb-ttl-expiry-key', { defaultValue: 0, target: 'indexeddb', ttl: 20 }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(afterExpiry.value).toBe(0)
  })
})
