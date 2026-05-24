import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

let adapter: MemoryStorageAdapter

beforeEach(() => {
  _clearInstanceCache()
  StorageAdapterFactory._reset()
  adapter = new MemoryStorageAdapter()
  // Use a single shared adapter so we can inspect raw values
  const original = StorageAdapterFactory.get.bind(StorageAdapterFactory)
  StorageAdapterFactory.get = () => adapter
  void original // keep TS happy
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

describe('useStorage + encrypt', () => {
  it('stores data in encrypted form (not plain JSON)', async () => {
    const { value } = withScope(() =>
      useStorage('secret', {
        defaultValue: 'hello',
        target: 'memory',
        encrypt: { password: 'pw123', iterations: 1000 },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    value.value = 'sensitive-data'
    await new Promise((r) => setTimeout(r, 50))

    const raw = adapter.getItem('secret')
    expect(raw).not.toBeNull()
    // Raw value must not contain the plain text
    expect(raw).not.toContain('sensitive-data')
    // It should look like base64, not a JSON envelope
    expect(() => JSON.parse(raw!)).toThrow()
  })

  it('round-trips an encrypted string value', async () => {
    const opts = {
      defaultValue: '',
      target: 'memory' as const,
      encrypt: { password: 'pw-roundtrip', iterations: 1000 },
    }

    const { value } = withScope(() => useStorage('enc-key', opts))
    await new Promise((r) => setTimeout(r, 50))
    value.value = 'my secret message'
    await new Promise((r) => setTimeout(r, 50))

    // Read it back via a new composable (clear cache first)
    _clearInstanceCache()

    const { value: value2 } = withScope(() => useStorage('enc-key', opts))
    await new Promise((r) => setTimeout(r, 50))

    expect(value2.value).toBe('my secret message')
  })

  it('round-trips an encrypted object value', async () => {
    const opts = {
      defaultValue: {} as { name: string; score: number },
      target: 'memory' as const,
      encrypt: { password: 'obj-pw', iterations: 1000 },
    }

    const { value } = withScope(() => useStorage('enc-obj', opts))
    await new Promise((r) => setTimeout(r, 50))
    value.value = { name: 'Alice', score: 42 }
    await new Promise((r) => setTimeout(r, 50))

    _clearInstanceCache()

    const { value: value2 } = withScope(() => useStorage('enc-obj', opts))
    await new Promise((r) => setTimeout(r, 50))

    expect(value2.value).toEqual({ name: 'Alice', score: 42 })
  })
})
