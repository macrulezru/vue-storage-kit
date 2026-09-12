import { ref, watch, getCurrentScope, onScopeDispose, type Ref } from 'vue'
import { createJSONSerializer } from '../core/serializer'
import { parseCookieHeader, buildCookieString } from '../core/cookieUtils'
import { isDevMode } from '../core/isDevMode'
import type { CookieOptions } from '../core/types'

export function useCookie<T>(name: string, options: CookieOptions<T>): Ref<T> {
  if (isDevMode() && options.httpOnly) {
    console.warn(
      `[vue-storage-kit] useCookie("${name}") was called with \`httpOnly: true\`, but this is ` +
        'the client-only composable — document.cookie can never set HttpOnly, browsers silently ' +
        "ignore it from client JS, so this option has no effect here. Use the Nuxt module's " +
        "useCookie() (SSR, via H3's setCookie()) if you need a real HttpOnly cookie.",
    )
  }

  const serializer = options.serializer ?? createJSONSerializer<T>()

  function read(): T {
    const cookies = parseCookieHeader(typeof document !== 'undefined' ? document.cookie : '')
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
