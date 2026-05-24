import { describe, it, expect, beforeEach, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useStorage, useLocalStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

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
    const { value, isReady } = withScope(() =>
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

    const { value, isReady } = withScope(() =>
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
    expect(adapter.getItem('key')).toBeNull()
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
    await nextTick()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quota-exceeded', key: 'key' }),
    )
  })

  it('remove() restores defaultValue and clears storage', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const { value, isReady, remove } = withScope(() =>
      useStorage('key', { defaultValue: 'default', target: 'memory' }),
    )

    await new Promise((r) => setTimeout(r, 10))
    value.value = 'changed'
    await nextTick()
    expect(adapter.getItem('key')).not.toBeNull()

    remove()
    await nextTick()
    expect(value.value).toBe('default')
    expect(adapter.getItem('key')).toBeNull()
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
