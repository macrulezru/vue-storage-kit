import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, effectScope } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { VueStoragePlugin, _resetGlobalOptions } from '../plugin'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { TTLManager } from '../core/TTLManager'
import type { VueStoragePluginOptions } from '../plugin'

// Every raw stored value is now prefixed with a plaintext {"exp","ts"}
// meta header (see TTLManager.wrapWithMeta) — strip it before inspecting
// the actual (possibly compress/encrypt/sign-transformed) payload.
function payloadOf(raw: string): string {
  return TTLManager.unwrapMeta(raw)?.payload ?? raw
}

function installPlugin(options: VueStoragePluginOptions): void {
  createApp({}).use(VueStoragePlugin, options)
}

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

beforeEach(() => {
  _clearInstanceCache()
  _resetGlobalOptions()
  StorageAdapterFactory._reset()
})

afterEach(() => {
  _resetGlobalOptions()
})

describe('VueStoragePlugin global options', () => {
  it('prefix is prepended to the actual storage key', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    installPlugin({ prefix: 'app:' })

    const { value } = withScope(() =>
      useStorage('counter', { defaultValue: 0, target: 'memory' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 5
    await new Promise((r) => setTimeout(r, 10))

    expect(await adapter.getItem('app:counter')).not.toBeNull()
    expect(await adapter.getItem('counter')).toBeNull()
  })

  it('two calls with the same key but different prefixes are independent instances', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    installPlugin({ prefix: 'a:' })
    const first = withScope(() => useStorage('k', { defaultValue: 'first', target: 'memory' }))
    _resetGlobalOptions()

    installPlugin({ prefix: 'b:' })
    const second = withScope(() => useStorage('k', { defaultValue: 'second', target: 'memory' }))

    expect(first.value.value).toBe('first')
    expect(second.value.value).toBe('second')
  })

  it('defaultTarget is used when target is not specified', () => {
    installPlugin({ defaultTarget: 'memory' })
    const getSpy = vi.spyOn(StorageAdapterFactory, 'get')

    withScope(() => useStorage('k', { defaultValue: 0 }))

    expect(getSpy).toHaveBeenCalledWith('memory')
  })

  it('an explicit target overrides defaultTarget', () => {
    installPlugin({ defaultTarget: 'memory' })
    const getSpy = vi.spyOn(StorageAdapterFactory, 'get')

    withScope(() => useStorage('k', { defaultValue: 0, target: 'session' }))

    expect(getSpy).toHaveBeenCalledWith('session')
  })

  it('useLocalStorage keeps target: local regardless of defaultTarget', async () => {
    installPlugin({ defaultTarget: 'memory' })
    const getSpy = vi.spyOn(StorageAdapterFactory, 'get')
    const { useLocalStorage } = await import('../composables/useStorage')

    withScope(() => useLocalStorage('k', 0))

    expect(getSpy).toHaveBeenCalledWith('local')
  })

  it('defaultSerializer is used when no per-call serializer is given', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    const customSerializer = {
      serialize: (v: unknown) => `CUSTOM:${JSON.stringify(v)}`,
      deserialize: (raw: string) => JSON.parse(raw.replace('CUSTOM:', '')) as unknown,
    }
    installPlugin({ defaultSerializer: customSerializer })

    const { value } = withScope(() =>
      useStorage('k', { defaultValue: '', target: 'memory' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 'hello'
    await new Promise((r) => setTimeout(r, 10))

    const raw = await adapter.getItem('k')
    const envelope = JSON.parse(payloadOf(raw!)) as { d: string }
    expect(envelope.d).toBe('CUSTOM:"hello"')
  })

  it('a per-call serializer overrides defaultSerializer', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    installPlugin({
      defaultSerializer: { serialize: () => 'GLOBAL', deserialize: () => 'global' },
    })

    const { value } = withScope(() =>
      useStorage('k', {
        defaultValue: '',
        target: 'memory',
        serializer: { serialize: (v) => `LOCAL:${v}`, deserialize: (r) => r.replace('LOCAL:', '') },
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 'hi'
    await new Promise((r) => setTimeout(r, 10))

    const raw = await adapter.getItem('k')
    const envelope = JSON.parse(payloadOf(raw!)) as { d: string }
    expect(envelope.d).toBe('LOCAL:hi')
  })

  it('defaultEncrypt supplies the options for encrypt: true', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    installPlugin({ defaultEncrypt: { password: 'global-pw', iterations: 1000 } })

    const { value } = withScope(() =>
      useStorage('secret', { defaultValue: '', target: 'memory', encrypt: true }),
    )
    await new Promise((r) => setTimeout(r, 50))
    value.value = 'top secret'
    await new Promise((r) => setTimeout(r, 50))

    const raw = await adapter.getItem('secret')
    expect(raw).not.toBeNull()
    expect(() => JSON.parse(payloadOf(raw!))).toThrow()

    const { decrypt } = await import('../crypto/StorageEncryption')
    const plain = await decrypt(payloadOf(raw!), { password: 'global-pw', iterations: 1000 })
    const envelope = JSON.parse(plain) as { d: string }
    expect(JSON.parse(envelope.d)).toBe('top secret')
  })

  it('per-call encrypt options merge on top of defaultEncrypt', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    installPlugin({ defaultEncrypt: { password: 'global-pw', iterations: 1000 } })

    // Override only `iterations` — password should still come from the global default.
    const { value } = withScope(() =>
      useStorage('secret2', {
        defaultValue: '',
        target: 'memory',
        encrypt: { iterations: 2000 },
      }),
    )
    await new Promise((r) => setTimeout(r, 50))
    value.value = 'merged'
    await new Promise((r) => setTimeout(r, 50))

    const raw = await adapter.getItem('secret2')
    const { decrypt } = await import('../crypto/StorageEncryption')
    const plain = await decrypt(payloadOf(raw!), { password: 'global-pw', iterations: 2000 })
    const envelope = JSON.parse(plain) as { d: string }
    expect(JSON.parse(envelope.d)).toBe('merged')
  })

  it('global onError runs in addition to a per-instance onError', async () => {
    const globalOnError = vi.fn()
    installPlugin({ onError: globalOnError })
    const localOnError = vi.fn()

    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    const boom = new Error('boom')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => { throw boom })

    const { value } = withScope(() =>
      useStorage('k', { defaultValue: 0, target: 'memory', onError: localOnError }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 1
    await new Promise((r) => setTimeout(r, 10))

    expect(localOnError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-failed', error: boom }),
    )
    expect(globalOnError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-failed', error: boom }),
    )
  })

  it('global onError still fires when no per-instance onError is given', async () => {
    const globalOnError = vi.fn()
    installPlugin({ onError: globalOnError })

    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    vi.spyOn(adapter, 'setItem').mockImplementation(() => { throw new Error('boom') })

    const { value } = withScope(() =>
      useStorage('k', { defaultValue: 0, target: 'memory' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 1
    await new Promise((r) => setTimeout(r, 10))

    expect(globalOnError).toHaveBeenCalledTimes(1)
  })

  it('behaves exactly as before when the plugin is never installed', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    const { value } = withScope(() =>
      useStorage('plain', { defaultValue: 'x', target: 'memory' }),
    )
    await new Promise((r) => setTimeout(r, 10))
    value.value = 'y'
    await new Promise((r) => setTimeout(r, 10))

    expect(await adapter.getItem('plain')).not.toBeNull()
  })
})
