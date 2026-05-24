import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useIndexedDB } from '../composables/useIndexedDB'

// Mock the IndexedDBAdapter with an in-memory Map store
vi.mock('../adapters/IndexedDBAdapter', () => {
  const makeStore = () => {
    const store = new Map<string, unknown>()
    return {
      get: vi.fn(async (key: IDBValidKey) => store.get(String(key)) ?? null),
      set: vi.fn(async (key: IDBValidKey, val: unknown) => { store.set(String(key), val) }),
      delete: vi.fn(async (key: IDBValidKey) => { store.delete(String(key)) }),
      keys: vi.fn(async () => [...store.keys()]),
      getAll: vi.fn(async () => [...store.values()]),
      clear: vi.fn(async () => { store.clear() }),
      count: vi.fn(async () => store.size),
      getByIndex: vi.fn(async () => null),
      getAllByIndex: vi.fn(async () => []),
      transaction: vi.fn(async (fn: (s: IDBObjectStore) => IDBRequest<unknown>) =>
        fn({} as IDBObjectStore)),
      close: vi.fn(),
    }
  }
  return { IndexedDBAdapter: vi.fn().mockImplementation(makeStore), IDBIndexDefinition: undefined }
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

describe('useIndexedDB', () => {
  let db: ReturnType<typeof useIndexedDB<string>>

  beforeEach(() => {
    vi.clearAllMocks()
    db = withScope(() => useIndexedDB<string>('db', 'items'))
  })

  it('set and get a value', async () => {
    await db.set('hello', 'world')
    expect(await db.get('hello')).toBe('world')
  })

  it('returns null for a missing key', async () => {
    expect(await db.get('no-such-key')).toBeNull()
  })

  it('delete removes a key', async () => {
    await db.set('del-me', 'bye')
    await db.delete('del-me')
    expect(await db.get('del-me')).toBeNull()
  })

  it('keys() returns all stored keys', async () => {
    await db.set('k1', 'a')
    await db.set('k2', 'b')
    const keys = await db.keys()
    expect(keys).toContain('k1')
    expect(keys).toContain('k2')
  })

  it('getAll() returns all stored values', async () => {
    await db.set('a', 'v1')
    await db.set('b', 'v2')
    const all = await db.getAll()
    expect(all).toContain('v1')
    expect(all).toContain('v2')
  })

  it('count() reflects the number of entries', async () => {
    await db.set('x', '1')
    await db.set('y', '2')
    expect(await db.count()).toBe(2)
  })

  it('clear() removes all entries', async () => {
    await db.set('p', 'q')
    await db.clear()
    expect(await db.count()).toBe(0)
  })

  it('transaction() calls the provided function with a store', async () => {
    let receivedStore: IDBObjectStore | null = null
    // The mock calls fn({} as IDBObjectStore) and returns the fn result
    await db.transaction((store) => {
      receivedStore = store
      // Return a mock IDBRequest-like object
      return { onsuccess: null, onerror: null, result: undefined } as unknown as IDBRequest<void>
    })
    expect(receivedStore).not.toBeNull()
  })

  it('getByIndex() delegates to the adapter', async () => {
    const result = await db.getByIndex('byEmail', 'a@b.com')
    expect(result).toBeNull()
  })

  it('getAllByIndex() delegates to the adapter', async () => {
    const result = await db.getAllByIndex('byCategory', 'news')
    expect(result).toEqual([])
  })

  it('calls onError and returns null on adapter failure', async () => {
    const { IndexedDBAdapter: MockCls } = await import('../adapters/IndexedDBAdapter') as unknown as {
      IndexedDBAdapter: ReturnType<typeof vi.fn>
    }
    MockCls.mockImplementationOnce(() => ({
      get: vi.fn(async () => { throw new Error('idb error') }),
      close: vi.fn(),
    }))

    const onError = vi.fn()
    const idb = withScope(() => useIndexedDB<string>('db', 'err-store', onError))
    const result = await idb.get('key')
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalled()
  })
})
