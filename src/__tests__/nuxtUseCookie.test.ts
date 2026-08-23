import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'

const requestEvent = {
  node: { req: { headers: { cookie: '' } } },
}

vi.mock('#imports', () => ({
  useRequestEvent: vi.fn(() => requestEvent),
}))

const setCookieMock = vi.fn()
vi.mock('h3', () => ({
  setCookie: setCookieMock,
}))

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

function asServer(): void {
  vi.stubGlobal('window', undefined)
  vi.stubGlobal('document', undefined)
}

describe('nuxt runtime useCookie (SSR)', () => {
  beforeEach(() => {
    requestEvent.node.req.headers.cookie = ''
    setCookieMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('reads the initial value from the H3 request cookie header on the server', async () => {
    requestEvent.node.req.headers.cookie = `session=${encodeURIComponent('"abc123"')}`
    asServer()

    const { useCookie } = await import('../nuxt/runtime/composables/useCookie')
    const value = withScope(() => useCookie('session', { defaultValue: '' }))

    expect(value.value).toBe('abc123')
  })

  it('falls back to defaultValue when the cookie is absent on the server', async () => {
    asServer()

    const { useCookie } = await import('../nuxt/runtime/composables/useCookie')
    const value = withScope(() => useCookie('missing', { defaultValue: 'fallback' }))

    expect(value.value).toBe('fallback')
  })

  it('writes through H3 setCookie (with httpOnly) when the ref changes on the server', async () => {
    asServer()

    const { useCookie } = await import('../nuxt/runtime/composables/useCookie')
    const value = withScope(() =>
      useCookie('token', { defaultValue: '', httpOnly: true, secure: true }),
    )

    value.value = 'new-token'
    await new Promise((r) => setTimeout(r, 10))

    expect(setCookieMock).toHaveBeenCalledTimes(1)
    const [event, name, serialized, opts] = setCookieMock.mock.calls[0]
    expect(event).toBe(requestEvent)
    expect(name).toBe('token')
    expect(JSON.parse(serialized)).toBe('new-token')
    expect(opts).toMatchObject({ httpOnly: true, secure: true, path: '/' })
  })
})
