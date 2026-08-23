import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useIDBRef, useIndexedDB } from '../composables/useIndexedDB'
import { IndexedDBAdapter } from '../adapters/IndexedDBAdapter'

// Stub IndexedDBAdapter so tests don't need a real IDB environment
vi.mock('../adapters/IndexedDBAdapter', () => {
  const store = new Map<string, unknown>()
  const MockAdapter = vi.fn().mockImplementation(() => ({
    get: vi.fn(async (key: string) => store.get(String(key)) ?? null),
    set: vi.fn(async (key: string, val: unknown) => { store.set(String(key), val) }),
    delete: vi.fn(async (key: string) => { store.delete(String(key)) }),
    keys: vi.fn(async () => [...store.keys()]),
    getAll: vi.fn(async () => [...store.values()]),
    clear: vi.fn(async () => { store.clear() }),
    count: vi.fn(async () => store.size),
    transaction: vi.fn(async (fn: (s: IDBObjectStore) => IDBRequest<unknown>) => fn({} as IDBObjectStore)),
    close: vi.fn(),
    _store: store,
  }))
  return { IndexedDBAdapter: MockAdapter }
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

describe('useIDBRef', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns defaultValue before isReady', () => {
    const { value, isReady } = withScope(() => useIDBRef('db', 'store', 'k', 'default'))
    expect(value.value).toBe('default')
    expect(isReady.value).toBe(false)
  })

  it('reads stored value and sets isReady', async () => {
    const adapter = new IndexedDBAdapter('db', 'store') as unknown as { _store: Map<string, unknown> }
    ;(adapter as unknown as { get: ReturnType<typeof vi.fn> }).get = vi.fn(async () => 'stored')

    const { isReady } = withScope(() => useIDBRef('db', 'store', 'k', 'default'))
    await new Promise((r) => setTimeout(r, 10))
    await nextTick()
    expect(isReady.value).toBe(true)
  })

  it('writes to IDB when value changes after ready', async () => {
    const { IndexedDBAdapter: MockCls } = await import('../adapters/IndexedDBAdapter') as unknown as {
      IndexedDBAdapter: ReturnType<typeof vi.fn>
    }
    const mockInstance = { get: vi.fn(async () => null), set: vi.fn(async () => {}), close: vi.fn() }
    MockCls.mockImplementationOnce(() => mockInstance)

    const { value } = withScope(() => useIDBRef('db', 'store', 'k', ''))
    await new Promise((r) => setTimeout(r, 10))
    await nextTick()
    await nextTick()

    value.value = 'updated'
    await nextTick()
    await new Promise((r) => setTimeout(r, 5))

    expect(mockInstance.set).toHaveBeenCalledWith('k', 'updated')
  })
})

describe('useIndexedDB', () => {
  it('exposes get / set / delete / keys / count / clear methods', () => {
    const idb = useIndexedDB('db', 'store')
    expect(typeof idb.get).toBe('function')
    expect(typeof idb.set).toBe('function')
    expect(typeof idb.delete).toBe('function')
    expect(typeof idb.keys).toBe('function')
    expect(typeof idb.count).toBe('function')
    expect(typeof idb.clear).toBe('function')
    expect(typeof idb.getAll).toBe('function')
    expect(typeof idb.transaction).toBe('function')
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
    const idb = useIndexedDB('db', 'store', onError)
    const result = await idb.get('key')
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalled()
  })
})
