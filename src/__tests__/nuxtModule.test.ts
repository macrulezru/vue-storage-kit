import { describe, it, expect, vi, beforeEach } from 'vitest'

const addImports = vi.fn()
const addPlugin = vi.fn()
const resolve = vi.fn((p: string) => `/resolved${p.replace('.', '')}`)
const createResolver = vi.fn(() => ({ resolve }))

vi.mock('@nuxt/kit', () => ({
  // Identity wrapper: hands back the raw module definition ({ meta, defaults,
  // setup }) instead of @nuxt/kit's normalized/async module function, so the
  // test can call `.setup(options)` directly without simulating a full Nuxt
  // context (that machinery belongs to @nuxt/kit, not this package).
  defineNuxtModule: (definition: unknown) => definition,
  addImports,
  addPlugin,
  createResolver,
}))

beforeEach(() => {
  addImports.mockClear()
  addPlugin.mockClear()
  resolve.mockClear()
  createResolver.mockClear()
})

describe('nuxt module', () => {
  it('registers the composable auto-imports and the plugin by default', async () => {
    const { default: mod } = await import('../nuxt/module')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mod as any).setup({ autoImports: true }, {})

    expect(addImports).toHaveBeenCalledTimes(1)
    const registered = addImports.mock.calls[0][0] as Array<{ name: string; from: string }>
    const names = registered.map((i) => i.name)
    expect(names).toEqual([
      'useStorage',
      'useLocalStorage',
      'useSessionStorage',
      'useIndexedDB',
      'useIDBRef',
      'useCookie',
    ])

    // useCookie must resolve to the SSR-aware runtime composable, not the
    // client-only one exported from the package root.
    const useCookieImport = registered.find((i) => i.name === 'useCookie')!
    expect(useCookieImport.from).toBe('/resolved/runtime/composables/useCookie')
    expect(useCookieImport.from).not.toBe('vue-storage-kit')

    // Every other composable comes straight from the package.
    for (const i of registered.filter((i) => i.name !== 'useCookie')) {
      expect(i.from).toBe('vue-storage-kit')
    }

    expect(addPlugin).toHaveBeenCalledWith('/resolved/runtime/plugin')
  })

  it('skips auto-imports when autoImports is false, but still registers the plugin', async () => {
    vi.resetModules()
    const { default: mod } = await import('../nuxt/module')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mod as any).setup({ autoImports: false }, {})

    expect(addImports).not.toHaveBeenCalled()
    expect(addPlugin).toHaveBeenCalledTimes(1)
  })

  it('defaults autoImports to true and exposes the expected meta', async () => {
    const { default: mod } = await import('../nuxt/module')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = mod as any
    expect(m.defaults).toEqual({ autoImports: true })
    expect(m.meta).toMatchObject({
      name: 'vue-storage-kit',
      configKey: 'storageKit',
      compatibility: { nuxt: '>=3.0.0' },
    })
  })
})
