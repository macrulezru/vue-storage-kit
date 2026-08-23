import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { createPiniaPersist } from '../pinia/index'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

let adapter: MemoryStorageAdapter

beforeEach(() => {
  adapter = new MemoryStorageAdapter()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
})

function setupPinia(pluginOpts: Parameters<typeof createPiniaPersist>[0] = {}) {
  const pinia = createPinia()
  pinia.use(createPiniaPersist(pluginOpts))
  // Pinia only flushes queued plugins into stores once installed into a real
  // app (pinia._a) — setActivePinia() alone isn't enough in Pinia 3.x.
  createApp({}).use(pinia)
  setActivePinia(pinia)
  return pinia
}

const useCounter = defineStore('counter', {
  state: () => ({ count: 0, name: 'anon' }),
})

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10))
}

describe('createPiniaPersist', () => {
  it('persists state changes to storage under the store id', async () => {
    setupPinia()
    const store = useCounter()
    await flush()

    store.count = 5
    await flush()

    const raw = await adapter.getItem('counter')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toMatchObject({ count: 5, name: 'anon' })
  })

  it('restores state from storage on store creation', async () => {
    await adapter.setItem('counter', JSON.stringify({ count: 42, name: 'restored' }))
    setupPinia()
    const store = useCounter()
    await flush()

    expect(store.count).toBe(42)
    expect(store.name).toBe('restored')
  })

  it('supports a custom key', async () => {
    setupPinia({ key: 'custom-key' })
    const store = useCounter()
    await flush()

    store.count = 1
    await flush()

    expect(await adapter.getItem('custom-key')).not.toBeNull()
    expect(await adapter.getItem('counter')).toBeNull()
  })

  it('pick limits persisted fields', async () => {
    setupPinia({ pick: ['count'] })
    const store = useCounter()
    await flush()

    store.count = 1
    store.name = 'changed'
    await flush()

    const raw = await adapter.getItem('counter')
    expect(JSON.parse(raw!)).toEqual({ count: 1 })
  })

  it('omit excludes persisted fields', async () => {
    setupPinia({ omit: ['name'] })
    const store = useCounter()
    await flush()

    store.count = 2
    store.name = 'secret'
    await flush()

    const raw = await adapter.getItem('counter')
    expect(JSON.parse(raw!)).toEqual({ count: 2 })
  })

  it('calls beforeRestore/afterRestore around a successful restore', async () => {
    await adapter.setItem('counter', JSON.stringify({ count: 9, name: 'x' }))
    const beforeRestore = vi.fn()
    const afterRestore = vi.fn()
    setupPinia({ beforeRestore, afterRestore })
    useCounter()
    await flush()

    expect(beforeRestore).toHaveBeenCalledTimes(1)
    expect(afterRestore).toHaveBeenCalledTimes(1)
  })

  it('reports a parse-error via onError for corrupted stored state', async () => {
    await adapter.setItem('counter', 'not valid json')
    const onError = vi.fn()
    setupPinia({ onError })
    const store = useCounter()
    await flush()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'parse-error', key: 'counter' }),
    )
    // Corrupted data is ignored — store keeps its default state.
    expect(store.count).toBe(0)
  })

  it('reports quota-exceeded via onError when persisting fails', async () => {
    const quotaError = new DOMException('QuotaExceededError', 'QuotaExceededError')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw quotaError
    })
    const onError = vi.fn()
    setupPinia({ onError })
    const store = useCounter()
    await flush()

    store.count = 1
    await flush()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quota-exceeded', key: 'counter' }),
    )
  })

  it('reports write-failed via onError for non-quota adapter errors', async () => {
    const boom = new Error('disk on fire')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw boom
    })
    const onError = vi.fn()
    setupPinia({ onError })
    const store = useCounter()
    await flush()

    store.count = 1
    await flush()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-failed', key: 'counter', error: boom }),
    )
  })
})
