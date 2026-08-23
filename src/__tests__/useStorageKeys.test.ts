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

// Flushes any pending microtasks (e.g. the composable's internal async keys()
// scan), which can outlast a single Vue nextTick().
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

describe('useStorageKeys', () => {
  it('returns empty array when adapter has no keys', async () => {
    const scope = effectScope()
    const { keys, isReady } = scope.run(() => useStorageKeys())!
    await flush()
    expect(isReady.value).toBe(true)
    expect(keys.value).toEqual([])
    scope.stop()
  })

  it('returns all keys when no prefix given', async () => {
    await adapter.setItem('foo', '1')
    await adapter.setItem('bar', '2')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys())!
    await flush()
    expect(keys.value).toEqual(expect.arrayContaining(['foo', 'bar']))
    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('filters keys by prefix', async () => {
    await adapter.setItem('user:alice', '1')
    await adapter.setItem('user:bob', '2')
    await adapter.setItem('settings:theme', 'dark')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('user:'))!
    await flush()
    expect(keys.value).toEqual(expect.arrayContaining(['user:alice', 'user:bob']))
    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('refresh() updates the key list', async () => {
    const scope = effectScope()
    const { keys, refresh } = scope.run(() => useStorageKeys('item:'))!
    await flush()
    expect(keys.value).toHaveLength(0)

    await adapter.setItem('item:1', 'a')
    await adapter.setItem('item:2', 'b')
    await refresh()

    expect(keys.value).toHaveLength(2)
    scope.stop()
  })

  it('refresh() removes keys that were deleted', async () => {
    await adapter.setItem('k:1', 'v')
    await adapter.setItem('k:2', 'v')
    const scope = effectScope()
    const { keys, refresh } = scope.run(() => useStorageKeys('k:'))!
    await flush()
    expect(keys.value).toHaveLength(2)

    await adapter.removeItem('k:1')
    await refresh()

    expect(keys.value).toEqual(['k:2'])
    scope.stop()
  })

  it('responds to window storage event with matching prefix', async () => {
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('evt:'))!
    await flush()
    expect(keys.value).toHaveLength(0)

    await adapter.setItem('evt:x', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: 'evt:x' }))
    await flush()
    await nextTick()

    expect(keys.value).toEqual(['evt:x'])
    scope.stop()
  })

  it('ignores storage events for unrelated keys', async () => {
    await adapter.setItem('other:y', '1')
    const scope = effectScope()
    const { keys } = scope.run(() => useStorageKeys('prefix:'))!
    await flush()
    expect(keys.value).toHaveLength(0)

    window.dispatchEvent(new StorageEvent('storage', { key: 'other:y' }))
    await flush()
    await nextTick()

    expect(keys.value).toHaveLength(0)
    scope.stop()
  })
})
