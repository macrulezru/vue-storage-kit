import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { isCompressed } from '../compress/Compression'
import { TTLManager } from '../core/TTLManager'

// Every raw stored value is now prefixed with a plaintext {"exp","ts"}
// meta header (see TTLManager.wrapWithMeta) — strip it before inspecting
// the actual (possibly compressed) payload.
function payloadOf(raw: string): string {
  return TTLManager.unwrapMeta(raw)?.payload ?? raw
}

let adapter: MemoryStorageAdapter

beforeEach(() => {
  _clearInstanceCache()
  StorageAdapterFactory._reset()
  adapter = new MemoryStorageAdapter()
  const original = StorageAdapterFactory.get.bind(StorageAdapterFactory)
  StorageAdapterFactory.get = () => adapter
  void original
})

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

describe('useStorage + compress', () => {
  it('stores data with the compression magic prefix', async () => {
    const { value } = withScope(() =>
      useStorage('compressed-key', {
        defaultValue: '',
        target: 'memory',
        compress: true,
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    value.value = 'x'.repeat(500)
    await new Promise((r) => setTimeout(r, 50))

    const raw = await adapter.getItem('compressed-key')
    expect(raw).not.toBeNull()
    expect(isCompressed(payloadOf(raw!))).toBe(true)
    expect(() => JSON.parse(payloadOf(raw!))).toThrow()
  })

  it('round-trips a compressed object value', async () => {
    const opts = {
      defaultValue: {} as { name: string; tags: string[] },
      target: 'memory' as const,
      compress: true,
    }

    const { value } = withScope(() => useStorage('compress-obj', opts))
    await new Promise((r) => setTimeout(r, 50))
    value.value = { name: 'Alice', tags: Array(50).fill('tag') }
    await new Promise((r) => setTimeout(r, 50))

    _clearInstanceCache()

    const { value: value2 } = withScope(() => useStorage('compress-obj', opts))
    await new Promise((r) => setTimeout(r, 50))

    expect(value2.value).toEqual({ name: 'Alice', tags: Array(50).fill('tag') })
  })

  it('combines compress and encrypt (compress-then-encrypt)', async () => {
    const opts = {
      defaultValue: '',
      target: 'memory' as const,
      compress: true,
      encrypt: { password: 'pw', iterations: 1000 },
    }

    const { value } = withScope(() => useStorage('compress-encrypt', opts))
    await new Promise((r) => setTimeout(r, 50))
    value.value = 'secret-and-repetitive-'.repeat(20)
    await new Promise((r) => setTimeout(r, 50))

    const raw = await adapter.getItem('compress-encrypt')
    expect(raw).not.toBeNull()
    // Encrypted output must not carry the plaintext magic prefix (compression
    // happens before encryption, so the ciphertext looks like opaque base64).
    expect(isCompressed(payloadOf(raw!))).toBe(false)

    _clearInstanceCache()

    const { value: value2 } = withScope(() => useStorage('compress-encrypt', opts))
    await new Promise((r) => setTimeout(r, 50))

    expect(value2.value).toBe('secret-and-repetitive-'.repeat(20))
  })
})
