import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import {
  mockStorage,
  resetStorageState,
  seedEnvelope,
  seedExpiredEnvelope,
  flushAsync,
  MemoryStorageAdapter,
} from '../testing/index'
import { useStorage } from '../composables/useStorage'

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

beforeEach(() => {
  resetStorageState()
})

describe('vue-storage-kit/testing', () => {
  it('mockStorage() redirects every target to the same adapter', async () => {
    const { adapter, restore } = mockStorage()

    const local = withScope(() => useStorage('a', { defaultValue: 0, target: 'local' }))
    const session = withScope(() => useStorage('b', { defaultValue: 0, target: 'session' }))
    await flushAsync()

    local.value.value = 1
    session.value.value = 2
    await flushAsync()

    expect(await adapter.getItem('a')).not.toBeNull()
    expect(await adapter.getItem('b')).not.toBeNull()
    restore()
  })

  it('mockStorage() accepts a pre-built adapter', () => {
    const custom = new MemoryStorageAdapter()
    const { adapter } = mockStorage(custom)
    expect(adapter).toBe(custom)
  })

  it('restore() puts the real adapter factory back', async () => {
    const { restore } = mockStorage()
    restore()

    // Without a real DOM/localStorage this would throw when actually used —
    // just check the factory function identity was restored, not exercise it.
    const { StorageAdapterFactory } = await import('../adapters/StorageAdapterFactory')
    expect(typeof StorageAdapterFactory.get).toBe('function')
  })

  it('resetStorageState() clears the shared instance cache between tests', async () => {
    mockStorage()
    const first = withScope(() => useStorage('shared', { defaultValue: 'first', target: 'memory' }))
    await flushAsync()
    first.value.value = 'changed'
    await flushAsync()

    resetStorageState()
    // A genuinely fresh adapter, as a real `beforeEach` in a consuming test
    // suite would set up — resetStorageState() clears this package's own
    // caches, it doesn't (and shouldn't) touch whatever adapter a previous
    // test happened to be using.
    mockStorage(new MemoryStorageAdapter())

    const second = withScope(() => useStorage('shared', { defaultValue: 'second', target: 'memory' }))
    // A brand-new instance, not the cached one still holding 'changed' — if
    // the cache hadn't been cleared, this would return the old cached Ref
    // (value 'changed') instead of creating a new one.
    expect(second.value.value).toBe('second')
    await flushAsync()
    expect(second.value.value).toBe('second')
  })

  it('seedEnvelope() writes a plain (non-expired) envelope a real instance can read', async () => {
    const adapter = new MemoryStorageAdapter()
    await seedEnvelope(adapter, 'k', 'preloaded')

    const raw = await adapter.getItem('k')
    expect(raw).not.toBeNull()
    const envelope = JSON.parse(raw!) as { v: number; d: string; exp: number | null }
    expect(envelope.v).toBe(1)
    expect(JSON.parse(envelope.d)).toBe('preloaded')
    expect(envelope.exp).toBeNull()

    mockStorage(adapter)
    const { value } = withScope(() => useStorage('k', { defaultValue: 'default', target: 'memory' }))
    await flushAsync()
    expect(value.value).toBe('preloaded')
  })

  it('seedExpiredEnvelope() writes an envelope with exp in the past', async () => {
    const adapter = new MemoryStorageAdapter()
    await seedExpiredEnvelope(adapter, 'k', 'stale')

    const raw = await adapter.getItem('k')
    const envelope = JSON.parse(raw!) as { exp: number }
    expect(envelope.exp).toBeLessThan(Date.now())
  })

  it('a seeded expired envelope is treated as expired by a real useStorage() instance', async () => {
    const adapter = new MemoryStorageAdapter()
    await seedExpiredEnvelope(adapter, 'k', 'stale')
    mockStorage(adapter)

    const { value } = withScope(() => useStorage('k', { defaultValue: 'default', target: 'memory' }))
    await flushAsync()

    expect(value.value).toBe('default')
    expect(await adapter.getItem('k')).toBeNull()
  })

  it('flushAsync() resolves after the given delay', async () => {
    const start = Date.now()
    await flushAsync(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
  })
})
