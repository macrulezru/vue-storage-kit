vue-storage-kit

Reactive localStorage, sessionStorage, IndexedDB and cookies for Vue 3 — TTL, AES-GCM encryption, schema migrations with up/down functions, and cross-tab sync — all with a single peer dependency (Vue 3).

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Demo](#demo)
- [Quick start](#quick-start)
- [useStorage](#usestorage)
- [useLocalStorage / useSessionStorage](#uselocalstorage--usesessionstorage)
- [Schema migrations](#schema-migrations)
- [TTL and expiry](#ttl-and-expiry)
- [Encryption](#encryption)
- [Tab sync](#tab-sync)
- [useIndexedDB](#useindexeddb)
- [useIDBRef](#useidbref)
- [useCookie](#usecookie)
- [Vue plugin](#vue-plugin)
- [Nuxt module](#nuxt-module)
- [TypeScript types](#typescript-types)
- [SSR compatibility](#ssr-compatibility)
- [Architecture](#architecture)
- [Bundle size & peer dependencies](#bundle-size--peer-dependencies)
- [Comparison with @vueuse/core](#comparison-with-vueuse-core)

---

## Features

- **useStorage** — unified reactive `Ref` over `localStorage`, `sessionStorage`, or in-memory store; drop-in replacement for vueuse `useLocalStorage` / `useSessionStorage`
- **Schema migrations** — versioned data with `up` / `down` migration chains; runs automatically on version mismatch, writes back the migrated value
- **TTL** — optional time-to-live per key; lazy expiry checked on every read, no timers; manual `cleanExpired()` sweep for startup cleanup
- **AES-GCM encryption** — Web Crypto API (`crypto.subtle`), key derived from a password via PBKDF2 or supplied as a `CryptoKey`; salt + IV + ciphertext packed into a single base64 string; derived key cached in session memory
- **Cross-tab sync** — `BroadcastChannel` with `storage` event fallback; last-write-wins conflict resolution by timestamp; optional leader election via `navigator.locks`
- **useIndexedDB** — promise-based key-value API plus a reactive `useIDBRef` for a single key
- **useCookie** — reactive cookies with `expires`, `sameSite`, `secure`; SSR-aware (reads from `document.cookie` on client, from H3 event headers in Nuxt server context)
- **Vue plugin** — global prefix, default target, and default error handler
- **Nuxt module** — auto-imports all composables; wires up the plugin with runtime config
- **Serializer** — JSON with round-trip support for `Date`, `Map`, `Set`, and `undefined`; bring your own serializer via the `Serializer<T>` interface
- **SSR-safe** — falls back to in-memory storage when `window` is unavailable; `isReady` ref lets components show a skeleton until hydration
- **Zero external dependencies** — only Vue 3 as peer dep; `/crypto` and `/sync` are separate tree-shakeable entry points

---

## Installation

```bash
npm install vue-storage-kit
```

Peer dependency:

```bash
npm install vue@>=3.3
```

---

## Demo

A fully interactive demo application is included in the `demo/` directory.
It covers every feature of the package in a tabbed interface — no build step required.

```bash
git clone https://github.com/macrulezru/vue-storage-kit.git
cd vue-storage-kit
npm install
npm run demo
```

Opens `http://localhost:5173` automatically.

| Tab | What it shows |
|---|---|
| 🗄️ localStorage / session | `useLocalStorage`, `useSessionStorage`, `defineStorageKey`, `useStorageKeys` |
| ⏱️ TTL & expiry | Live countdown, `onExpire` callback, `remove()` |
| 🔄 Schema migrations | Seed v1 / v2 data, reload — migration chain runs automatically |
| 🔐 Encryption | AES-GCM write/read, raw base64 in storage vs decrypted value |
| 📡 Tab sync | `useBroadcastChannel` cross-tab chat + `useStorage` with `sync: true` (open two tabs) |
| 💾 IndexedDB | `useIDBRef` reactive note + `useIndexedDB` CRUD table |
| 🍪 Cookies | `useCookie` with JSON object and string, shows raw `document.cookie` |
| 📋 Storage list | `useStorageList` as a persistent to-do app |
| 🔧 Utilities | `getStorageQuota` bar, `exportStorage` / `importStorage` / `clearStorage` |
| 📦 Pinia persist | `createPiniaPersist` global plugin, shows raw persisted state |
| 🗜️ Compression | `compress` / `decompress` with size ratio, `CompressAdapter` |

---

## Quick start

```vue
<script setup lang="ts">
import { useLocalStorage } from 'vue-storage-kit'

const { value: theme } = useLocalStorage('theme', 'light')
</script>

<template>
  <button @click="theme = theme === 'light' ? 'dark' : 'light'">
    Current theme: {{ theme }}
  </button>
</template>
```

The value is persisted to `localStorage` and is reactive — changing `theme.value` writes to storage immediately.

---

## useStorage

The core composable. Works with `localStorage`, `sessionStorage`, and an in-memory fallback.

```ts
useStorage<T>(key: string, options: StorageOptions<T>): UseStorageReturn<T>
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultValue` | `T` | — | Value returned when the key is absent or has expired |
| `target` | `'local' \| 'session' \| 'memory'` | `'local'` | Storage backend |
| `ttl` | `number` | — | Time-to-live in milliseconds; `0` or omitted = no expiry |
| `version` | `number` | `1` | Schema version of the stored data |
| `migrations` | `Migration[]` | `[]` | Migration functions run when stored version differs from `version` |
| `encrypt` | `boolean \| EncryptOptions` | `false` | Enable AES-GCM encryption |
| `sync` | `boolean \| SyncOptions` | `false` | Enable cross-tab sync via `BroadcastChannel` |
| `serializer` | `Serializer<T>` | JSON serializer | Custom serialize / deserialize pair |
| `onError` | `(err: StorageError) => void` | — | Called instead of throwing on quota exceeded, parse errors, crypto errors |
| `onExpire` | `(key: string) => void` | — | Called when a TTL-expired key is removed on read |
| `onMigrate` | `(from: number, to: number) => void` | — | Called after a successful migration |

### Return value

| Property | Type | Description |
|---|---|---|
| `value` | `Ref<T>` | Reactive two-way binding; assigning writes to storage |
| `isReady` | `Ref<boolean>` | `false` until the initial async read completes (important for IndexedDB and encrypted values) |
| `error` | `Ref<StorageError \| null>` | Last error, `null` if none |
| `expiry` | `ComputedRef<Date \| null>` | When the key expires, `null` if no TTL |
| `remove()` | `void` | Delete the key from storage and reset `value` to `defaultValue` |
| `refresh()` | `Promise<void>` | Re-read from storage (useful if another process may have written) |

### Examples

**Basic read/write:**

```ts
const { value: counter } = useStorage('counter', { defaultValue: 0 })

counter.value++  // writes to localStorage immediately
```

**Session storage:**

```ts
const { value: token } = useStorage('auth-token', {
  defaultValue: '',
  target: 'session',
})
```

**TTL — auto-expire after 30 minutes:**

```ts
const { value: cache, expiry } = useStorage('search-cache', {
  defaultValue: [] as string[],
  ttl: 30 * 60 * 1000,
  onExpire: (key) => console.log(`${key} expired`),
})

console.log(expiry.value) // Date | null
```

**Error handling:**

```ts
const { value, error } = useStorage('data', {
  defaultValue: {},
  onError: (err) => {
    if (err.type === 'quota-exceeded') showToast('Storage is full')
    if (err.type === 'parse-error') console.warn('Corrupted value, reset to default')
  },
})
```

**Custom serializer:**

```ts
import type { Serializer } from 'vue-storage-kit'

const base64Serializer: Serializer<string> = {
  serialize: (v) => btoa(v),
  deserialize: (raw) => atob(raw),
}

const { value } = useStorage('encoded', {
  defaultValue: '',
  serializer: base64Serializer,
})
```

---

## useLocalStorage / useSessionStorage

Shorthand composables — identical to `useStorage` but with `target` pre-set and `defaultValue` as the second argument (vueuse-compatible signature).

```ts
useLocalStorage<T>(key: string, defaultValue: T, opts?): UseStorageReturn<T>
useSessionStorage<T>(key: string, defaultValue: T, opts?): UseStorageReturn<T>
```

```ts
import { useLocalStorage, useSessionStorage } from 'vue-storage-kit'

const { value: settings } = useLocalStorage('settings', { theme: 'light', lang: 'en' })
const { value: draft }    = useSessionStorage('draft', '')
```

These are drop-in replacements for `@vueuse/core` `useLocalStorage` / `useSessionStorage`.

---

## Schema migrations

When the shape of stored data changes between releases, `SchemaManager` runs migration functions automatically. Each migration has a `version` (the target version), an `up` function (upgrade), and an optional `down` function (rollback).

### How it works

1. On read, the stored envelope's version is compared to `options.version`.
2. If they differ, the migration chain is built and applied sequentially.
3. The migrated value is written back to storage with the new version.
4. `onMigrate(from, to)` is called.

If downgrading and a `down()` is missing, the key resets to `defaultValue` and `onError` is called.

### Example — v1 → v3

```ts
import { useStorage } from 'vue-storage-kit'

interface SettingsV3 {
  theme: 'light' | 'dark'
  locale: string
}

const { value: settings } = useStorage<SettingsV3>('settings', {
  defaultValue: { theme: 'light', locale: 'en' },
  version: 3,
  migrations: [
    {
      version: 2,
      // v1 had { darkMode: boolean }, v2 introduces theme string
      up:   (d: any) => ({ ...d, theme: d.darkMode ? 'dark' : 'light' }),
      down: (d: any) => { const { theme, ...rest } = d; return { ...rest, darkMode: theme === 'dark' } },
    },
    {
      version: 3,
      // v2 had no locale, v3 adds it from the old lang field
      up:   (d: any) => ({ ...d, locale: d.lang ?? 'en' }),
      down: (d: any) => { const { locale, ...rest } = d; return { ...rest, lang: locale } },
    },
  ],
  onMigrate: (from, to) => console.log(`Migrated settings ${from} → ${to}`),
})
```

A user on v1 opens the app, reads `{ darkMode: true }`, and receives `{ darkMode: true, theme: 'dark', locale: 'en' }` after the chain runs. The migrated value is persisted immediately.

### `Migration` interface

```ts
interface Migration {
  version: number                       // target version after this migration
  up:   (data: unknown) => unknown      // upgrade from version-1 to version
  down?: (data: unknown) => unknown     // optional rollback from version to version-1
}
```

> Migrations must be **idempotent** — running `up` twice must not corrupt data.

---

## TTL and expiry

TTL is stored inside the envelope alongside the data (`exp` field). On every read, if `Date.now() > exp`, the key is deleted and `defaultValue` is returned.

```ts
const { value: otp, expiry, remove } = useStorage('otp', {
  defaultValue: '',
  ttl: 5 * 60 * 1000,   // 5 minutes
  onExpire: () => router.push('/login'),
})
```

**Manual cleanup on app start** — sweep all expired keys with a shared prefix:

```ts
import { TTLManager, StorageAdapterFactory } from 'vue-storage-kit'

const adapter = StorageAdapterFactory.get('local')
TTLManager.cleanExpired(adapter, 'myapp:')
```

**Check when a specific key expires:**

```ts
const exp = TTLManager.getExpiry(adapter, 'otp')
console.log(exp?.toLocaleTimeString())  // e.g. "14:35:00"
```

---

## Encryption

Encryption is handled by the `/crypto` subpackage using the browser's native Web Crypto API — no external libraries. Encrypted values are stored as a single base64 string: `salt[16] + iv[12] + ciphertext`.

### Encrypt with a password (PBKDF2)

```ts
const { value: secret } = useStorage('api-key', {
  defaultValue: '',
  encrypt: { password: 'user-passphrase', iterations: 100_000 },
})
```

### Encrypt with a pre-generated CryptoKey

```ts
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt'],
)

const { value } = useStorage('vault', {
  defaultValue: {},
  encrypt: { key },
})
```

### Use the encryption functions directly

The `/crypto` entry point exports `encrypt` and `decrypt` for use outside of `useStorage`:

```ts
import { encrypt, decrypt } from 'vue-storage-kit/crypto'

const ciphertext = await encrypt('sensitive data', { password: 'pass', iterations: 10_000 })
const plaintext  = await decrypt(ciphertext, { password: 'pass', iterations: 10_000 })
```

### `EncryptOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `password` | `string` | — | Derive AES-GCM key from this password via PBKDF2 |
| `key` | `CryptoKey` | — | Use a pre-existing `CryptoKey` directly |
| `iterations` | `number` | `100_000` | PBKDF2 iteration count |

Either `password` or `key` must be provided. Derived keys are cached in memory — PBKDF2 runs only on the first encrypt/decrypt with a given `(password, salt)` pair.

---

## Tab sync

When `sync: true`, writes to `value` are broadcast to all other open tabs via `BroadcastChannel`. Remote updates are applied silently (without writing back to storage). Falls back to `window.addEventListener('storage', ...)` if `BroadcastChannel` is unavailable.

```ts
const { value: cart } = useStorage('cart', {
  defaultValue: [] as CartItem[],
  sync: true,
})
// cart.value stays in sync across all tabs automatically
```

### `SyncOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `channel` | `string` | `'vue-storage-kit'` | `BroadcastChannel` name |
| `leader` | `boolean` | `false` | Enable leader election — only one tab writes to storage on conflict |
| `debounce` | `number` | `50` | Milliseconds to debounce outgoing broadcasts |

**Leader election** uses `navigator.locks`. The leader tab holds a named lock for its lifetime. When the leader closes, another tab automatically acquires the lock and becomes the new leader. When `leader: true`, conflicts are resolved as last-write-wins by timestamp — on a tie the leader's version is kept.

```ts
const { value: sharedState } = useStorage('shared', {
  defaultValue: { count: 0 },
  sync: { channel: 'app-sync', leader: true, debounce: 100 },
})
```

### Use TabSync directly

```ts
import { TabSync } from 'vue-storage-kit/sync'

const sync = new TabSync({ channel: 'custom-channel', leader: true })
await sync.start()

sync.subscribe('my-key', (rawValue) => {
  console.log('Received from another tab:', rawValue)
})

sync.broadcast('my-key', JSON.stringify({ count: 1 }), Date.now())
sync.stop()
```

---

## useIndexedDB

Promise-based key-value access to an IndexedDB object store. The store is created automatically if it does not exist.

```ts
useIndexedDB<T>(dbName: string, storeName: string, onError?): UseIndexedDBReturn<T>
```

### Methods

| Method | Signature | Description |
|---|---|---|
| `get` | `(key: IDBValidKey) => Promise<T \| null>` | Read a value by key |
| `set` | `(key: IDBValidKey, value: T) => Promise<void>` | Write a value |
| `delete` | `(key: IDBValidKey) => Promise<void>` | Remove a key |
| `keys` | `() => Promise<IDBValidKey[]>` | All keys in the store |
| `getAll` | `() => Promise<T[]>` | All values |
| `clear` | `() => Promise<void>` | Delete everything in the store |
| `count` | `() => Promise<number>` | Number of entries |
| `transaction` | `<R>(fn: (store: IDBObjectStore) => IDBRequest<R>) => Promise<R>` | Raw IDB transaction |

### Example

```ts
import { useIndexedDB } from 'vue-storage-kit'

interface Blob { id: number; data: ArrayBuffer }

const idb = useIndexedDB<Blob>('my-db', 'blobs', (err) => console.error(err))

await idb.set(1, { id: 1, data: buffer })
const blob = await idb.get(1)
console.log(await idb.count())

// Raw transaction
await idb.transaction((store) => store.put({ id: 2, data: buffer2 }, 2))

await idb.delete(1)
await idb.clear()
```

---

## useIDBRef

A reactive `Ref` that reads from and writes to a single IndexedDB key. Useful when you want the same reactive API as `useStorage` but backed by IndexedDB.

```ts
useIDBRef<T>(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
  defaultValue: T,
): { value: Ref<T>; isReady: Ref<boolean>; error: Ref<StorageError | null> }
```

```ts
import { useIDBRef } from 'vue-storage-kit'

const { value: draft, isReady } = useIDBRef('editor-db', 'drafts', 'post-42', '')

// Once isReady.value === true, draft reflects the stored value
draft.value = 'Hello, world!'   // writes back to IDB automatically
```

---

## useCookie

A reactive `Ref` backed by `document.cookie`. Assigning to the ref sets the cookie. JSON serialization with `Date`, `Map`, `Set` support is included by default.

```ts
useCookie<T>(name: string, options: CookieOptions<T>): Ref<T>
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultValue` | `T` | — | Value returned when the cookie is absent |
| `expires` | `Date \| number` | — | Expiry as a `Date` or number of days |
| `path` | `string` | `'/'` | Cookie path |
| `domain` | `string` | — | Cookie domain |
| `secure` | `boolean` | — | Add `Secure` flag |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | — | `SameSite` attribute |
| `httpOnly` | `boolean` | — | SSR only — passed to H3 `setCookie`; ignored by browsers |
| `serializer` | `Serializer<T>` | JSON | Custom serializer |

### Examples

**Session cookie (expires when browser closes):**

```ts
const consent = useCookie('cookie-consent', { defaultValue: false })
consent.value = true
```

**Persistent cookie — 30 days:**

```ts
const locale = useCookie('locale', {
  defaultValue: 'en',
  expires: 30,
  sameSite: 'lax',
})
```

**Nuxt SSR — same API works on server and client:**

```vue
<script setup lang="ts">
// In Nuxt this delegates to the built-in useCookie on the server
const token = useCookie('auth-token', {
  defaultValue: '',
  secure: true,
  httpOnly: true,   // honored server-side via H3 setCookie
  sameSite: 'strict',
})
</script>
```

---

## Vue plugin

Install the plugin to configure a global key prefix, default target, and error handler.

```ts
import { createApp } from 'vue'
import { VueStoragePlugin } from 'vue-storage-kit'
import App from './App.vue'

const app = createApp(App)

app.use(VueStoragePlugin, {
  prefix:          'myapp:',    // all keys are prefixed automatically
  defaultTarget:   'local',
  onError: (err) => {
    if (err.type === 'quota-exceeded') showNotification('Storage full')
  },
})

app.mount('#app')
```

### `VueStoragePluginOptions`

| Option | Type | Description |
|---|---|---|
| `prefix` | `string` | Prepended to every storage key |
| `defaultTarget` | `StorageTarget` | Override the default `'local'` target |
| `defaultSerializer` | `Serializer<unknown>` | Replace the built-in JSON serializer globally |
| `defaultEncrypt` | `EncryptOptions` | Global encryption settings used when `encrypt: true` |
| `onError` | `(err: StorageError) => void` | Global error handler |

---

## Nuxt module

Add the module in `nuxt.config.ts` to auto-import all composables and register the plugin with a prefix from `runtimeConfig`.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-storage-kit/nuxt'],

  storageKit: {
    prefix:      'myapp_',
    autoImports: true,    // default: true
  },
})
```

With `autoImports: true` the following are available globally without an explicit import:

```ts
useStorage()
useLocalStorage()
useSessionStorage()
useIndexedDB()
useIDBRef()
useCookie()
```

---

## TypeScript types

All public types are exported from the package root:

```ts
import type {
  // Storage targets
  StorageTarget,       // 'local' | 'session' | 'memory' | 'indexeddb'

  // Core options
  StorageOptions,
  CookieOptions,
  EncryptOptions,
  SyncOptions,

  // Migration
  Migration,

  // Serializer interface
  Serializer,

  // Internal envelope structure
  StorageEnvelope,

  // Error union
  StorageError,
  // { type: 'quota-exceeded'; key }
  // { type: 'parse-error'; key; raw }
  // { type: 'migration-failed'; from; to; error }
  // { type: 'crypto-error'; operation; error }

  // Low-level adapter interface
  StorageAdapter,

  // Return types
  UseStorageReturn,
  UseIndexedDBReturn,
  UseIDBRefReturn,

  // Plugin options
  VueStoragePluginOptions,
} from 'vue-storage-kit'
```

**`StorageError` discriminated union:**

```ts
import type { StorageError } from 'vue-storage-kit'

function handleError(err: StorageError) {
  switch (err.type) {
    case 'quota-exceeded':
      console.error('Storage full, key:', err.key)
      break
    case 'parse-error':
      console.error('Could not parse', err.key, '— raw:', err.raw)
      break
    case 'migration-failed':
      console.error(`Migration ${err.from} → ${err.to} failed:`, err.error)
      break
    case 'crypto-error':
      console.error(`Crypto ${err.operation} failed:`, err.error)
      break
  }
}
```

**Custom serializer type:**

```ts
import type { Serializer } from 'vue-storage-kit'

const msgpack: Serializer<unknown> = {
  serialize:   (v) => Buffer.from(encode(v)).toString('base64'),
  deserialize: (s) => decode(Buffer.from(s, 'base64')),
}
```

---

## SSR compatibility

| Scenario | Behaviour |
|---|---|
| `typeof window === 'undefined'` | All adapters fall back to `MemoryStorageAdapter` (in-process, not persisted) |
| `isReady.value === false` | The composable has not yet read from storage; show a skeleton or `v-if="isReady"` |
| `useCookie` on server (Nuxt) | Reads from `event.node.req.headers.cookie`; `httpOnly` cookies set via H3 `setCookie` |
| Hydration mismatch | `useStorage` re-reads the actual client value after mount — the SSR-rendered value is never used on the client |

```vue
<script setup lang="ts">
const { value: prefs, isReady } = useLocalStorage('prefs', { theme: 'light' })
</script>

<template>
  <SkeletonCard v-if="!isReady" />
  <UserPrefs v-else :prefs="prefs" />
</template>
```

---

## Architecture

```
vue-storage-kit
│
├── StorageAdapterFactory (singleton per target)
│     LocalStorageAdapter   → window.localStorage
│     SessionStorageAdapter → window.sessionStorage
│     MemoryStorageAdapter  → Map<string, string>  (SSR / 'memory' target)
│
├── StorageEnvelope  { v, d, exp, ts }
│     Wraps every stored value with schema version, serialized data,
│     expiry timestamp, and write timestamp
│
├── SchemaManager
│     Builds and runs migration chains (up or down)
│     Writes migrated value back with new version
│
├── TTLManager
│     Checks exp on every read (lazy expiry)
│     cleanExpired() — bulk sweep with optional prefix
│
├── createJSONSerializer
│     Handles Date, Map, Set, undefined via preProcess()
│     (preProcess walks the tree before JSON.stringify to avoid
│      Date.prototype.toJSON() hijacking the replacer)
│
├── useStorage
│     init() async: load crypto/sync modules if needed, read from storage
│     watch(value, flush:'sync') → writes on every assignment
│     setValueSilently() → updates ref without triggering the watcher
│     onScopeDispose → stops watcher and TabSync channel
│
├── useIndexedDB / useIDBRef
│     IndexedDBAdapter — lazily opens IDB, creates store on upgrade
│     useIDBRef watches the ref and calls adapter.set() on change
│
├── useCookie
│     Parses document.cookie on mount
│     watch → builds Set-Cookie string and assigns to document.cookie
│
├── /crypto  (separate entry point)
│     StorageEncryption — encrypt() / decrypt()
│     PBKDF2 key derivation; derived keys cached by (password, iterations, salt)
│     Output: base64(salt[16] + iv[12] + ciphertext)
│
├── /sync  (separate entry point)
│     LeaderElection — navigator.locks; holds lock for tab lifetime
│     TabSync — BroadcastChannel + storage event fallback
│               last-write-wins by timestamp; leader wins on tie
│
├── VueStoragePlugin
│     Sets global prefix, defaultTarget, defaultEncrypt, onError
│
└── Nuxt module (vue-storage-kit/nuxt)
      addImports — auto-import all composables
      addPlugin  — installs VueStoragePlugin with runtimeConfig.storageKit.prefix
```

---

## Bundle size & peer dependencies

| Entry point | Peer deps | Notes |
|---|---|---|
| `vue-storage-kit` | `vue ^3.3` | Core — adapters, composables, serializer, plugin |
| `vue-storage-kit/crypto` | `vue ^3.3` | AES-GCM encryption functions only |
| `vue-storage-kit/sync` | `vue ^3.3` | TabSync and LeaderElection only |
| `vue-storage-kit/nuxt` | `vue ^3.3`, `@nuxt/kit` (optional peer) | Nuxt module |

The package ships as tree-shakeable ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs`). The `/crypto` and `/sync` entry points are code-split — they are loaded dynamically inside `useStorage` only when `encrypt` or `sync` options are set, keeping the core footprint small.

---

## Comparison with @vueuse/core

`vue-storage-kit` extends and diverges from `@vueuse/core` in specific areas.

### Drop-in replacements

| @vueuse/core | vue-storage-kit | Notes |
|---|---|---|
| `useLocalStorage(key, default)` | `useLocalStorage(key, default)` | Same signature; `flush: 'sync'` by default |
| `useSessionStorage(key, default)` | `useSessionStorage(key, default)` | Same signature |
| `useCookies()` | `useCookie(name, options)` | Per-cookie reactive `Ref` instead of a single object |
| `useStorageAsync()` | `useIDBRef()` | Reactive `Ref` backed by async storage (IndexedDB) |
| `useBroadcastChannel()` | `useBroadcastChannel()` | Identical API |

### Extended functionality (no vueuse equivalent)

| Feature | vue-storage-kit |
|---|---|
| Schema migrations | `migrations: [{ version, up, down? }]` option in `StorageOptions` |
| TTL / expiry | `ttl` option (seconds); lazy check on read; no background timers |
| AES-GCM encryption | `encrypt: { password }` option; Web Crypto API only, no extra deps |
| Cross-tab sync | `sync: true` option; BroadcastChannel + storage event fallback |
| Leader election | `navigator.locks`-based leader in `LeaderElection` |
| IndexedDB full API | `useIndexedDB()` — get / set / delete / keys / getAll / transaction / indexes |
| Secondary IDB indexes | `useIndexedDB('db', 'store', onError, { indexes: [...] })` |
| CRUD collection | `useStorageList<T>()` — add / update / remove / find / findAll |
| Pinia persistence | `/pinia` entry point — `createPiniaPersist({ pick?, omit? })` |
| Compression | `/compress` entry point — `compress()` / `decompress()` via Compression Streams API |
| Export / Import | `exportStorage()` / `importStorage()` — snapshot and restore all keys |
| Shared instance cache | Two components calling `useStorage('key')` share one `Ref` — zero duplicated watchers |

### Behavioural differences

| Behaviour | @vueuse/core | vue-storage-kit |
|---|---|---|
| Watcher flush | `'pre'` (default Vue) | `'sync'` — write happens in the same microtask as the assignment |
| Cross-tab update | `storage` event only | `BroadcastChannel` with `storage` event fallback |
| Serialisation | JSON only | JSON + Date, Map, Set, BigInt round-trip; custom `Serializer<T>` |
| Multiple instances | Independent watchers per call | Shared reactive `Ref` via `instanceCache` |
| SSR | Global stubs | Same stubs; `useCookie` accepts H3 event for Nuxt server routes |

---

## License

MIT

---

## Author

Danil Lisin Vladimirovich aka Macrulez

GitHub: [macrulezru](https://github.com/macrulezru) · Website: [macrulez.ru/en](https://macrulez.ru/en)

Questions and bugs — [issues](https://github.com/macrulezru/vue-storage-kit/issues)

---

## 💖 Support the project

Open source takes time and effort. If my work saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
