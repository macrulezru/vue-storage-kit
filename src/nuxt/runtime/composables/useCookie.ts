import { ref, watch, getCurrentScope, onScopeDispose, type Ref } from 'vue'
import { useRequestEvent } from '#imports'
import { createJSONSerializer } from '../../../core/serializer'
import { parseCookieHeader, buildCookieString } from '../../../core/cookieUtils'
import type { CookieOptions } from '../../../core/types'

// SSR-aware replacement for the base package's useCookie(), auto-registered
// by the Nuxt module in place of the client-only version. On the server it
// reads/writes through the current H3 request/response (so SSR output
// reflects real cookie state, and `httpOnly` cookies can actually be set —
// something document.cookie can never do). On the client it behaves exactly
// like the base composable.
function toH3SetCookieOptions<T>(opts: CookieOptions<T>): Record<string, unknown> {
  const out: Record<string, unknown> = { path: opts.path ?? '/' }
  if (opts.expires !== undefined) {
    out.expires =
      typeof opts.expires === 'number' ? new Date(Date.now() + opts.expires * 864e5) : opts.expires
  }
  if (opts.domain) out.domain = opts.domain
  if (opts.secure) out.secure = true
  if (opts.sameSite) out.sameSite = opts.sameSite
  if (opts.httpOnly) out.httpOnly = true
  return out
}

export function useCookie<T>(name: string, options: CookieOptions<T>): Ref<T> {
  const serializer = options.serializer ?? createJSONSerializer<T>()
  // `import.meta.server` is replaced with a literal boolean by Nuxt's build.
  // Outside of that build (e.g. plain unit tests) it is simply undefined, so
  // fall back to the same `window` check the rest of the package uses.
  const isServer = import.meta.server ?? typeof window === 'undefined'
  // Must be called synchronously at setup time — Nuxt's request context does
  // not survive an `await` boundary.
  const event = isServer ? useRequestEvent() : undefined

  function read(): T {
    const header = isServer
      ? (event?.node?.req?.headers?.cookie as string | undefined)
      : typeof document !== 'undefined'
        ? document.cookie
        : ''
    const raw = parseCookieHeader(header)[name]
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
      if (isServer) {
        if (!event) return
        // Dynamic import: keeps h3 out of the client bundle, since it's a
        // server-only concern and this branch never runs there.
        void import('h3').then(({ setCookie }) => {
          setCookie(event, name, serializer.serialize(newVal), toH3SetCookieOptions(options))
        })
      } else if (typeof document !== 'undefined') {
        document.cookie = buildCookieString(name, newVal, options)
      }
    },
    { deep: true },
  )

  function onStorage(e: StorageEvent): void {
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
