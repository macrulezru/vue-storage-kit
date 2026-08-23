import { describe, it, expect, vi, beforeEach } from 'vitest'

const useRuntimeConfig = vi.fn()

vi.mock('#imports', () => ({
  // Identity wrapper: defineNuxtPlugin normally registers the callback with
  // Nuxt's plugin system — for a unit test we just need the raw callback.
  defineNuxtPlugin: (fn: unknown) => fn,
  useRuntimeConfig,
}))

beforeEach(() => {
  useRuntimeConfig.mockReset()
})

describe('nuxt runtime plugin', () => {
  it('installs VueStoragePlugin with the configured prefix', async () => {
    useRuntimeConfig.mockReturnValue({ public: { storageKit: { prefix: 'app_' } } })

    const { default: plugin } = await import('../nuxt/runtime/plugin')
    const use = vi.fn()
    const nuxtApp = { vueApp: { use } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(plugin as any)(nuxtApp)

    expect(use).toHaveBeenCalledTimes(1)
    const [installedPlugin, options] = use.mock.calls[0]
    expect(options).toEqual({ prefix: 'app_' })
    expect(typeof installedPlugin.install).toBe('function')
  })

  it('defaults to an empty prefix when storageKit runtime config is absent', async () => {
    useRuntimeConfig.mockReturnValue({ public: {} })

    const { default: plugin } = await import('../nuxt/runtime/plugin')
    const use = vi.fn()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(plugin as any)({ vueApp: { use } })

    expect(use).toHaveBeenCalledWith(expect.anything(), { prefix: '' })
  })
})
