import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  exportStorage,
  importStorage,
  clearStorage,
  getStorageQuota,
} from '../utils/storage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

let adapter: MemoryStorageAdapter

beforeEach(() => {
  adapter = new MemoryStorageAdapter()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
})

describe('exportStorage', () => {
  it('snapshots all keys for the target', async () => {
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')

    const snapshot = await exportStorage('local')
    expect(snapshot).toEqual({ a: '1', b: '2' })
  })

  it('filters by prefix', async () => {
    await adapter.setItem('user:1', 'x')
    await adapter.setItem('user:2', 'y')
    await adapter.setItem('settings:theme', 'dark')

    const snapshot = await exportStorage('local', 'user:')
    expect(snapshot).toEqual({ 'user:1': 'x', 'user:2': 'y' })
  })

  it('returns an empty object when the adapter has no keys', async () => {
    expect(await exportStorage('local')).toEqual({})
  })
})

describe('importStorage', () => {
  it('writes every key from the snapshot', async () => {
    await importStorage({ a: '1', b: '2' }, 'local')

    expect(await adapter.getItem('a')).toBe('1')
    expect(await adapter.getItem('b')).toBe('2')
  })

  it('overwrites existing keys by default', async () => {
    await adapter.setItem('a', 'old')
    await importStorage({ a: 'new' }, 'local')

    expect(await adapter.getItem('a')).toBe('new')
  })

  it('skips existing keys when overwrite is false', async () => {
    await adapter.setItem('a', 'old')
    await importStorage({ a: 'new', b: 'fresh' }, 'local', { overwrite: false })

    expect(await adapter.getItem('a')).toBe('old')
    expect(await adapter.getItem('b')).toBe('fresh')
  })
})

describe('clearStorage', () => {
  it('removes all keys for the target', async () => {
    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')

    await clearStorage('local')

    expect(await adapter.keys()).toHaveLength(0)
  })

  it('removes only keys matching the prefix', async () => {
    await adapter.setItem('user:1', 'x')
    await adapter.setItem('settings:theme', 'dark')

    await clearStorage('local', 'user:')

    expect(await adapter.getItem('user:1')).toBeNull()
    expect(await adapter.getItem('settings:theme')).toBe('dark')
  })
})

describe('exportStorage + importStorage round-trip', () => {
  it('restores an identical snapshot into a fresh adapter', async () => {
    await adapter.setItem('x', '1')
    await adapter.setItem('y', '2')
    const snapshot = await exportStorage('local')

    const fresh = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(fresh)
    await importStorage(snapshot, 'local')

    expect(await exportStorage('local')).toEqual(snapshot)
  })
})

describe('getStorageQuota', () => {
  it('returns quota/usage/usagePercent from navigator.storage.estimate', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 250 }) },
    })

    const result = await getStorageQuota()
    expect(result).toEqual({ quota: 1000, usage: 250, usagePercent: 25 })

    vi.unstubAllGlobals()
  })

  it('returns zeros when navigator.storage is unavailable', async () => {
    vi.stubGlobal('navigator', {})

    const result = await getStorageQuota()
    expect(result).toEqual({ quota: 0, usage: 0, usagePercent: 0 })

    vi.unstubAllGlobals()
  })

  it('returns usagePercent 0 when quota is 0 (avoids division by zero)', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 0, usage: 0 }) },
    })

    expect((await getStorageQuota()).usagePercent).toBe(0)

    vi.unstubAllGlobals()
  })
})
