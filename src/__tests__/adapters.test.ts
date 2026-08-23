import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter'
import { SessionStorageAdapter } from '../adapters/SessionStorageAdapter'
import { IndexedDBStorageAdapter } from '../adapters/IndexedDBStorageAdapter'
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

function makeFakeStorage(): Storage {
  const store = new Map<string, string>()
  const obj = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as unknown as Storage
  return new Proxy(obj, {
    ownKeys: () => [...store.keys()],
    getOwnPropertyDescriptor: (_, k) =>
      store.has(k as string)
        ? { value: store.get(k as string), enumerable: true, configurable: true, writable: true }
        : Object.getOwnPropertyDescriptor(obj, k),
  })
}

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter

  beforeEach(() => {
    adapter = new MemoryStorageAdapter()
  })

  it('returns null for missing keys', async () => {
    expect(await adapter.getItem('x')).toBeNull()
  })

  it('stores and retrieves values', async () => {
    await adapter.setItem('k', 'v')
    expect(await adapter.getItem('k')).toBe('v')
  })

  it('removes a key', async () => {
    await adapter.setItem('k', 'v')
    await adapter.removeItem('k')
    expect(await adapter.getItem('k')).toBeNull()
  })

  it('lists all keys', async () => {
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')
    expect(await adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('clears all entries', async () => {
    await adapter.setItem('a', '1')
    adapter.clear()
    expect(await adapter.keys()).toHaveLength(0)
  })
})

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter

  beforeEach(() => {
    const fake = makeFakeStorage()
    vi.stubGlobal('window', { ...window, localStorage: fake })
    adapter = new LocalStorageAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for missing key', async () => {
    expect(await adapter.getItem('missing')).toBeNull()
  })

  it('stores and retrieves a value', async () => {
    await adapter.setItem('hello', 'world')
    expect(await adapter.getItem('hello')).toBe('world')
  })

  it('removes a key', async () => {
    await adapter.setItem('k', 'v')
    await adapter.removeItem('k')
    expect(await adapter.getItem('k')).toBeNull()
  })

  it('lists stored keys', async () => {
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')
    expect(await adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))
  })
})

describe('SessionStorageAdapter', () => {
  let adapter: SessionStorageAdapter

  beforeEach(() => {
    const fake = makeFakeStorage()
    vi.stubGlobal('window', { ...window, sessionStorage: fake })
    adapter = new SessionStorageAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null for missing key', async () => {
    expect(await adapter.getItem('missing')).toBeNull()
  })

  it('stores and retrieves a value', async () => {
    await adapter.setItem('foo', 'bar')
    expect(await adapter.getItem('foo')).toBe('bar')
  })

  it('removes a key', async () => {
    await adapter.setItem('x', 'y')
    await adapter.removeItem('x')
    expect(await adapter.getItem('x')).toBeNull()
  })

  it('lists stored keys', async () => {
    await adapter.setItem('p', '1')
    await adapter.setItem('q', '2')
    expect(await adapter.keys()).toEqual(expect.arrayContaining(['p', 'q']))
  })
})

describe('IndexedDBStorageAdapter', () => {
  let adapter: IndexedDBStorageAdapter

  beforeEach(() => {
    adapter = new IndexedDBStorageAdapter()
  })

  it('returns null for missing key', async () => {
    expect(await adapter.getItem('missing')).toBeNull()
  })

  it('stores and retrieves a value', async () => {
    await adapter.setItem('a', '1')
    expect(await adapter.getItem('a')).toBe('1')
  })

  it('removes a key', async () => {
    await adapter.setItem('a', '1')
    await adapter.removeItem('a')
    expect(await adapter.getItem('a')).toBeNull()
  })

  it('lists stored keys', async () => {
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')
    expect(await adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))
  })
})

describe('StorageAdapterFactory', () => {
  beforeEach(() => {
    StorageAdapterFactory._reset()
  })

  it('returns MemoryStorageAdapter on SSR (no window)', () => {
    const adapter = StorageAdapterFactory.get('memory')
    expect(adapter).toBeInstanceOf(MemoryStorageAdapter)
  })

  it('returns the same instance for the same target (singleton)', () => {
    const a = StorageAdapterFactory.get('memory')
    const b = StorageAdapterFactory.get('memory')
    expect(a).toBe(b)
  })

  it('returns an IndexedDBStorageAdapter for indexeddb target', () => {
    const adapter = StorageAdapterFactory.get('indexeddb')
    expect(adapter).toBeInstanceOf(IndexedDBStorageAdapter)
  })

  it('returns a defined adapter for "local" target', () => {
    const adapter = StorageAdapterFactory.get('local')
    expect(adapter).toBeDefined()
  })
})
