import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter'
import { SessionStorageAdapter } from '../adapters/SessionStorageAdapter'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'

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

  it('returns null for missing keys', () => {
    expect(adapter.getItem('x')).toBeNull()
  })

  it('stores and retrieves values', () => {
    adapter.setItem('k', 'v')
    expect(adapter.getItem('k')).toBe('v')
  })

  it('removes a key', () => {
    adapter.setItem('k', 'v')
    adapter.removeItem('k')
    expect(adapter.getItem('k')).toBeNull()
  })

  it('lists all keys', () => {
    adapter.setItem('a', '1')
    adapter.setItem('b', '2')
    expect(adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('clears all entries', () => {
    adapter.setItem('a', '1')
    adapter.clear()
    expect(adapter.keys()).toHaveLength(0)
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

  it('returns null for missing key', () => {
    expect(adapter.getItem('missing')).toBeNull()
  })

  it('stores and retrieves a value', () => {
    adapter.setItem('hello', 'world')
    expect(adapter.getItem('hello')).toBe('world')
  })

  it('removes a key', () => {
    adapter.setItem('k', 'v')
    adapter.removeItem('k')
    expect(adapter.getItem('k')).toBeNull()
  })

  it('lists stored keys', () => {
    adapter.setItem('a', '1')
    adapter.setItem('b', '2')
    expect(adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))
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

  it('returns null for missing key', () => {
    expect(adapter.getItem('missing')).toBeNull()
  })

  it('stores and retrieves a value', () => {
    adapter.setItem('foo', 'bar')
    expect(adapter.getItem('foo')).toBe('bar')
  })

  it('removes a key', () => {
    adapter.setItem('x', 'y')
    adapter.removeItem('x')
    expect(adapter.getItem('x')).toBeNull()
  })

  it('lists stored keys', () => {
    adapter.setItem('p', '1')
    adapter.setItem('q', '2')
    expect(adapter.keys()).toEqual(expect.arrayContaining(['p', 'q']))
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

  it('throws for indexeddb target', () => {
    expect(() => StorageAdapterFactory.get('indexeddb')).toThrow()
  })

  it('returns a defined adapter for "local" target', () => {
    const adapter = StorageAdapterFactory.get('local')
    expect(adapter).toBeDefined()
  })
})
