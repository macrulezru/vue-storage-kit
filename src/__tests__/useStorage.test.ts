import { describe, it, expect, beforeEach, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useStorage, useLocalStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { TTLManager } from '../core/TTLManager'

// Every raw stored value is now prefixed with a plaintext {"exp","ts"}
// meta header (see TTLManager.wrapWithMeta) — strip it before inspecting
// the actual (possibly compress/encrypt/sign-transformed) payload.
function payloadOf(raw: string): string {
  return TTLManager.unwrapMeta(raw)?.payload ?? raw
}

// Use memory adapter for all tests to avoid localStorage pollution
beforeEach(() => {
  _clearInstanceCache()
  StorageAdapterFactory._reset()
  // Redirect 'local' and 'session' to fresh memory adapters by overriding get
  vi.spyOn(StorageAdapterFactory, 'get').mockImplementation(() => new MemoryStorageAdapter())
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => {
    result = fn()
  })
  return result
}

describe('useStorage', () => {
  it('returns defaultValue initially', () => {
    const { value } = withScope(() =>
      useStorage('key', { defaultValue: 'hello', target: 'memory' }),
    )
    expect(value.value).toBe('hello')
  })

  it('persists a value to storage', async () => {
    const { value } = withScope(() =>
      useStorage('key', { defaultValue: '', target: 'memory' }),
    )
    // Wait for init
    await nextTick()
    await nextTick()
    value.value = 'test'
    await nextTick()
    expect(value.value).toBe('test')
  })

  it('reads existing value from storage on init', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    // Pre-populate storage with an envelope
    const envelope = { v: 1, d: '"stored-value"', exp: null, ts: Date.now() }
    adapter.setItem('key', JSON.stringify(envelope))

    const { value } = withScope(() =>
      useStorage('key', { defaultValue: 'default', target: 'memory' }),
    )

    // Wait for async init
    await new Promise((r) => setTimeout(r, 10))
    expect(value.value).toBe('stored-value')
  })

  it('returns defaultValue and removes key when TTL has expired', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const expired = { v: 1, d: '"old"', exp: Date.now() - 1, ts: 0 }
    adapter.setItem('key', JSON.stringify(expired))

    const onExpire = vi.fn()
    const { value } = withScope(() =>
      useStorage('key', { defaultValue: 'default', target: 'memory', onExpire }),
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(value.value).toBe('default')
    expect(await adapter.getItem('key')).toBeNull()
    expect(onExpire).toHaveBeenCalledWith('key')
  })

  it('runs migration chain v1 → v3', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const v1Data = JSON.stringify({ darkMode: true })
    const envelope = { v: 1, d: v1Data, exp: null, ts: Date.now() }
    adapter.setItem('settings', JSON.stringify(envelope))

    const onMigrate = vi.fn()
    const { value } = withScope(() =>
      useStorage<{ theme?: string; locale?: string }>('settings', {
        defaultValue: {},
        target: 'memory',
        version: 3,
        onMigrate,
        migrations: [
          {
            version: 2,
            up: (d: unknown) => {
              const data = d as { darkMode?: boolean }
              return { ...data, theme: data.darkMode ? 'dark' : 'light' }
            },
          },
          {
            version: 3,
            up: (d: unknown) => {
              const data = d as { lang?: string }
              return { ...data, locale: data.lang ?? 'en' }
            },
          },
        ],
      }),
    )

    await new Promise((r) => setTimeout(r, 20))
    expect(value.value).toMatchObject({ theme: 'dark', locale: 'en' })
    expect(onMigrate).toHaveBeenCalledWith(1, 3)
  })

  it('calls onError and does not throw on quota exceeded', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw quotaError
    })

    const onError = vi.fn()
    const { value } = withScope(() =>
      useStorage('key', { defaultValue: 0, target: 'memory', onError }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 42
    // The quota-exceeded path retries once (after sweeping expired keys)
    // before reporting, which takes a few microtask hops — nextTick() alone
    // isn't enough here.
    await new Promise((r) => setTimeout(r, 10))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quota-exceeded', key: 'key' }),
    )
  })

  it('debounces writes: rapid mutations only persist the last value once', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    const setItemSpy = vi.spyOn(adapter, 'setItem')

    const { value } = withScope(() =>
      useStorage('debounced', { defaultValue: 0, target: 'memory', debounce: 30 }),
    )

    await new Promise((r) => setTimeout(r, 10))
    setItemSpy.mockClear()

    value.value = 1
    value.value = 2
    value.value = 3

    // Still within the debounce window — nothing written yet.
    await new Promise((r) => setTimeout(r, 10))
    expect(setItemSpy).not.toHaveBeenCalled()

    // Window elapses — exactly one write, carrying the latest value.
    await new Promise((r) => setTimeout(r, 30))
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    const raw = await adapter.getItem('debounced')
    expect(JSON.parse((JSON.parse(payloadOf(raw!)) as { d: string }).d)).toBe(3)
  })

  it('flushes a pending debounced write on scope dispose', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const scope = effectScope()
    const { value } = scope.run(() =>
      useStorage('flush-on-dispose', { defaultValue: 0, target: 'memory', debounce: 1000 }),
    )!

    await new Promise((r) => setTimeout(r, 10))
    value.value = 99
    scope.stop()

    await new Promise((r) => setTimeout(r, 10))
    const raw = await adapter.getItem('flush-on-dispose')
    expect(raw).not.toBeNull()
    expect(JSON.parse((JSON.parse(payloadOf(raw!)) as { d: string }).d)).toBe(99)
  })

  it('recovers from quota-exceeded by sweeping expired keys and retrying once', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    await adapter.setItem('stale', JSON.stringify({ v: 1, d: '"x"', exp: Date.now() - 1, ts: 0 }))

    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError')
    const setItemSpy = vi.spyOn(adapter, 'setItem').mockImplementationOnce(() => {
      throw quotaError
    })

    const onError = vi.fn()
    const { value } = withScope(() =>
      useStorage('recovers', { defaultValue: 0, target: 'memory', onError }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 7
    await new Promise((r) => setTimeout(r, 10))

    expect(onError).not.toHaveBeenCalled()
    expect(setItemSpy).toHaveBeenCalledTimes(2)
    expect(await adapter.getItem('stale')).toBeNull()
    expect(value.value).toBe(7)
  })

  it('reports write-failed (not quota) instead of throwing from the watcher', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    const boom = new Error('adapter exploded')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw boom
    })

    const onError = vi.fn()
    const { value } = withScope(() =>
      useStorage('boom-key', { defaultValue: 0, target: 'memory', onError }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 1
    await new Promise((r) => setTimeout(r, 10))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-failed', key: 'boom-key', error: boom }),
    )
  })

  it('remove() restores defaultValue and clears storage', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const { value, remove } = withScope(() =>
      useStorage('key', { defaultValue: 'default', target: 'memory' }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 'changed'
    // The write is chained onto a per-engine promise queue (see
    // StorageEngine's writeChain) — a single Vue tick isn't guaranteed to
    // flush it, unlike the synchronous local `value` update.
    await new Promise((r) => setTimeout(r, 10))
    expect(await adapter.getItem('key')).not.toBeNull()

    remove()
    await new Promise((r) => setTimeout(r, 10))
    expect(value.value).toBe('default')
    expect(await adapter.getItem('key')).toBeNull()
  })

  it('useLocalStorage is a shortcut for target: local', () => {
    const { value } = withScope(() => useLocalStorage('k', 99))
    expect(value.value).toBe(99)
  })
})

describe('serializer — Date/Map/Set round-trip', () => {
  it('preserves Date', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const now = new Date('2024-01-01T00:00:00.000Z')
    const { value } = withScope(() =>
      useStorage('date-key', { defaultValue: now, target: 'memory' }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = new Date('2025-06-15T12:00:00.000Z')
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    // Re-read through a fresh composable
    const { value: value2 } = withScope(() =>
      useStorage('date-key', { defaultValue: now, target: 'memory' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(value2.value).toBeInstanceOf(Date)
    expect(value2.value.toISOString()).toBe('2025-06-15T12:00:00.000Z')
  })
})
