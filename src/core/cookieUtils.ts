import { createJSONSerializer } from './serializer'
import type { CookieOptions } from './types'

// Shared by the client-only useCookie() composable and the SSR-aware Nuxt
// runtime variant, so both parse/serialize cookies identically.

export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=')
      if (idx === -1) return [pair.trim(), '']
      const k = pair.slice(0, idx).trim()
      const v = pair.slice(idx + 1).trim()
      return [k, decodeURIComponent(v)]
    }),
  )
}

export function buildCookieString<T>(name: string, value: T, opts: CookieOptions<T>): string {
  const serializer = opts.serializer ?? createJSONSerializer<T>()
  let cookie = `${name}=${encodeURIComponent(serializer.serialize(value))}`

  if (opts.expires !== undefined) {
    const date =
      typeof opts.expires === 'number'
        ? new Date(Date.now() + opts.expires * 864e5)
        : opts.expires
    cookie += `; expires=${date.toUTCString()}`
  }

  if (opts.path !== undefined) cookie += `; path=${opts.path}`
  else cookie += `; path=/`

  if (opts.domain) cookie += `; domain=${opts.domain}`
  if (opts.secure) cookie += `; secure`
  if (opts.sameSite) cookie += `; samesite=${opts.sameSite}`
  // httpOnly cannot be set via document.cookie — browsers silently ignore it
  // from client JS. It is only honored server-side; see the Nuxt runtime
  // useCookie(), which sets it through H3's setCookie().

  return cookie
}
