import { ref, watch, getCurrentScope, onScopeDispose, type Ref } from 'vue'
import { createJSONSerializer } from '../core/serializer'
import type { CookieOptions } from '../core/types'

function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  return Object.fromEntries(
    document.cookie.split(';').map((pair) => {
      const idx = pair.indexOf('=')
      if (idx === -1) return [pair.trim(), '']
      const k = pair.slice(0, idx).trim()
      const v = pair.slice(idx + 1).trim()
      return [k, decodeURIComponent(v)]
    }),
  )
}

function buildCookieString<T>(name: string, value: T, opts: CookieOptions<T>): string {
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
  // httpOnly is only honored server-side (H3/Nuxt); silently ignored on client

  return cookie
}

export function useCookie<T>(name: string, options: CookieOptions<T>): Ref<T> {
  const serializer = options.serializer ?? createJSONSerializer<T>()

  function read(): T {
    const cookies = parseCookies()
    const raw = cookies[name]
    if (raw === undefined || raw === '') return options.defaultValue
    try {
      return serializer.deserialize(raw)
    } catch {
      return options.defaultValue
    }
  }

  const cookieRef = ref<T>(read()) as Ref<T>

  let _skipWatch = false

  const stopWatch = watch(
    cookieRef,
    (newVal) => {
      if (_skipWatch) return
      if (typeof document !== 'undefined') {
        document.cookie = buildCookieString(name, newVal, options)
      }
    },
    { deep: true },
  )

  // Sync from storage events (when another tab updates the cookie via document.cookie)
  function onStorage(e: StorageEvent): void {
    // document.cookie changes don't fire StorageEvent, but custom integrations might
    if (e.key !== null) return
    const fresh = read()
    _skipWatch = true
    cookieRef.value = fresh
    _skipWatch = false
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    })
  }

  return cookieRef
}
