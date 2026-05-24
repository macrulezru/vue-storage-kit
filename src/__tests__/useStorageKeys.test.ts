import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useStorageKeys } from '../composables/useStorageKeys'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

let adapter: MemoryStorageAdapter

beforeEach(() => {
  adapter = new MemoryStorageAdapter()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
})

describe('useStorageKeys', () => {
  it('returns empty array when adapter has no keys', () => {
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys())!
    expect(keys.value).toEqual([])
    scope.stop()
  })

  it('returns all keys when no prefix given', () => {
    adapter.setItem('foo', '1')
    adapter.setItem('bar', '2')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys())!
    expect(keys.value).toEqual(expect.arrayContaining(['foo', 'bar']))
    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('filters keys by prefix', () => {
    adapter.setItem('user:alice', '1')
    adapter.setItem('user:bob', '2')
    adapter.setItem('settings:theme', 'dark')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('user:'))!
    expect(keys.value).toEqual(expect.arrayContaining(['user:alice', 'user:bob']))
    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('refresh() updates the key list', () => {
    const scope = effectScope()
    const { keys, refresh } = scope.run(() => useStorageKeys('item:'))!
    expect(keys.value).toHaveLength(0)

    adapter.setItem('item:1', 'a')
    adapter.setItem('item:2', 'b')
    refresh()

    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('refresh() removes keys that were deleted', () => {
    adapter.setItem('k:1', 'v')
    adapter.setItem('k:2', 'v')
    const scope = effectScope()
    const { keys, refresh } = scope.run(() => useStorageKeys('k:'))!
    expect(keys.value).toHaveLength(2)

    adapter.removeItem('k:1')
    refresh()

    expect(keys.value).toEqual(['k:2'])
    scope.stop()
  })

  it('responds to window storage event with matching prefix', async () => {
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('evt:'))!
    expect(keys.value).toHaveLength(0)

    adapter.setItem('evt:x', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'evt:x' }))
    await nextTick()

    expect(keys.value).toEqual(['evt:x'])
    scope.stop()
  })

  it('ignores storage events for unrelated keys', async () => {
    adapter.setItem('other:y', '1')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('prefix:'))!
    expect(keys.value).toHaveLength(0)

    window.dispatchEvent(new StorageEvent('storage', { key: 'other:y' }))
    await nextTick()

    expect(keys.value).toHaveLength(0)
    scope.stop()
  })
})
