import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useCookie } from '../composables/useCookie'

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

// Intercept document.cookie setter writes without relying on Document.prototype descriptor
function interceptCookieWrites(): { writes: string[]; restore(): void } {
  const writes: string[] = []

  // Walk prototype chain to find where cookie is defined
  let proto: object | null = Object.getPrototypeOf(document)
  let cookieDesc: PropertyDescriptor | undefined
  while (proto) {
    cookieDesc = Object.getOwnPropertyDescriptor(proto, 'cookie')
    if (cookieDesc?.set) break
    proto = Object.getPrototypeOf(proto)
  }

  const originalSet = cookieDesc?.set
  const originalGet = cookieDesc?.get

  Object.defineProperty(document, 'cookie', {
    get: originalGet ? () => originalGet.call(document) : undefined,
    set(val: string) {
      writes.push(val)
      originalSet?.call(document, val)
    },
    configurable: true,
  })

  return {
    writes,
    restore() {
      // Remove the per-instance override to restore prototype behaviour
      delete (document as unknown as Record<string, unknown>).cookie
    },
  }
}

describe('useCookie', () => {
  beforeEach(() => {
    // Clear all cookies before each test
    document.cookie.split(';').forEach((c) => {
      const key = c.split('=')[0].trim()
      if (key) document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  })

  it('returns defaultValue when cookie is absent', () => {
    const ref = withScope(() => useCookie('missing', { defaultValue: 42 }))
    expect(ref.value).toBe(42)
  })

  it('writes a cookie when value changes', async () => {
    const ref = withScope(() => useCookie('theme', { defaultValue: 'light' }))
    ref.value = 'dark'
    await nextTick()
    expect(document.cookie).toContain('theme=')
    expect(document.cookie).toContain('dark')
  })

  it('reads an existing cookie on mount', () => {
    document.cookie = 'lang=%22fr%22; path=/'
    const ref = withScope(() => useCookie('lang', { defaultValue: 'en' }))
    expect(ref.value).toBe('fr')
  })

  it('round-trips an object via JSON serializer', async () => {
    const ref = withScope(() =>
      useCookie<{ count: number }>('state', { defaultValue: { count: 0 } }),
    )
    ref.value = { count: 5 }
    await nextTick()

    const raw = document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('state='))
      ?.split('=')[1]
    expect(raw).toBeDefined()
    const parsed = JSON.parse(decodeURIComponent(raw!))
    expect(parsed).toEqual({ count: 5 })
  })

  it('uses a custom serializer', async () => {
    const ref = withScope(() =>
      useCookie('custom', {
        defaultValue: 'hello',
        serializer: {
          serialize: (v) => btoa(v),
          deserialize: (r) => atob(r),
        },
      }),
    )
    ref.value = 'world'
    await nextTick()
    // btoa('world') = 'd29ybGQ=' — the '=' may be URL-encoded as '%3D'
    const raw = document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('custom='))
      ?.split('=')[1]
    expect(raw).toBeDefined()
    expect(decodeURIComponent(raw!)).toBe(btoa('world'))
  })

  it('sets expires header in the cookie string', async () => {
    const { writes, restore } = interceptCookieWrites()
    const ref = withScope(() => useCookie('expiring', { defaultValue: 'x', expires: 7 }))
    ref.value = 'y'
    await nextTick()
    restore()
    expect(writes.some((w) => w.includes('expires='))).toBe(true)
  })

  it('sets sameSite and secure flags in the cookie string', async () => {
    const { writes, restore } = interceptCookieWrites()
    const ref = withScope(() =>
      useCookie('secure', { defaultValue: '', sameSite: 'strict', secure: true }),
    )
    ref.value = 'v'
    await nextTick()
    restore()
    const last = writes[writes.length - 1] ?? ''
    expect(last.toLowerCase()).toContain('samesite=strict')
    expect(last.toLowerCase()).toContain('secure')
  })
})
