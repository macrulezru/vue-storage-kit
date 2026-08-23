<div align="center" style="background:#111827;border-radius:20px;padding:28px 20px 20px;margin-bottom:32px">
  <h1 style="color:#f9fafb;margin:0 0 32px;font-size:2.2em;letter-spacing:-0.03em;font-weight:700;font-family:sans-serif">
    vue-storage-kit
  </h1>
  <img
    src="https://s3.twcstorage.ru/c9a2cc89-780f97fd-311d-4a1a-b86f-c25665c9dc46/images/npm/vue-storage-kit.webp"
    alt="vue-virtual-scroller-kit"
    style="max-width:100%;width:auto;height:300px;border-radius:12px"
  />
</div>

Reactive localStorage, sessionStorage, IndexedDB and cookies for Vue 3 (and React) — TTL, AES-GCM encryption, HMAC signing, schema migrations with up/down functions, undo/redo, and cross-tab sync — built on a framework-agnostic core, with Vue and React as thin bindings over it.

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
- [Resilience & performance](#resilience--performance)
- [Tab sync](#tab-sync)
- [useIndexedDB](#useindexeddb)
- [useIDBRef](#useidbref)
- [useCookie](#usecookie)
- [Vue plugin](#vue-plugin)
- [Devtools](#devtools)
- [Nuxt module](#nuxt-module)
- [React support](#react-support)
- [Testing utilities](#testing-utilities)
- [TypeScript types](#typescript-types)
- [SSR compatibility](#ssr-compatibility)
- [Architecture](#architecture)
- [Bundle size & peer dependencies](#bundle-size--peer-dependencies)
- [Comparison with @vueuse/core](#comparison-with-vueuse-core)

---

## Features

- **useStorage** — unified reactive state over `localStorage`, `sessionStorage`, `IndexedDB`, or an in-memory store; drop-in replacement for vueuse `useLocalStorage` / `useSessionStorage`. Available for **Vue** (a `Ref`) and **React** (a `useSyncExternalStore`-backed hook) — both are thin bindings over the same framework-agnostic engine
- **Schema migrations** — versioned data with `up` / `down` migration chains; runs automatically on version mismatch, writes back the migrated value
- **TTL** — optional time-to-live per key; lazy expiry checked on every read, no timers; manual `cleanExpired()` sweep for startup cleanup
- **AES-GCM encryption** — Web Crypto API (`crypto.subtle`), key derived from a password via PBKDF2 or supplied as a `CryptoKey`; salt + IV + ciphertext packed into a single base64 string; derived key cached in session memory; `reencrypt()`/`rotateEncryptedKey()` to rotate a password without data loss
- **HMAC signing** — lightweight tamper detection (`sign: true`) for data that doesn't need to be secret but shouldn't be silently alterable; combine with `encrypt` for confidentiality + integrity
- **Undo / redo** — `history: n` keeps the last *n* values in memory; `undo()` / `redo()` navigate them (not persisted across reloads)
- **Debounce & throttle** — `debounce` coalesces writes after a pause; `throttle` guarantees a write at most every *n* ms during continuous changes (a slider, a drag)
- **Resilient writes** — on `QuotaExceededError`, sweeps this adapter's own expired-TTL entries and retries once; opt into `evictOnQuota` to additionally evict the least-recently-written *other* keys. Non-quota write errors are reported via `onError`, not thrown from inside a reactive callback
- **Cross-tab sync** — `BroadcastChannel` with `storage` event fallback; last-write-wins conflict resolution by timestamp; optional leader election via `navigator.locks`
- **useIndexedDB** — promise-based key-value API plus a reactive `useIDBRef` for a single key; or just pass `target: 'indexeddb'` to `useStorage()` for the same TTL/migrations/encrypt/compress/sync pipeline as any other target
- **useCookie** — reactive cookies with `expires`, `sameSite`, `secure`; client-only from the package root, or SSR-aware (H3-backed on the server, supports `httpOnly`) when auto-imported inside the Nuxt module
- **Vue plugin** — global prefix, default target/serializer/encrypt, and a global error handler, all applied to every `useStorage()` call
- **Nuxt module** — auto-imports all composables; wires up the plugin with runtime config
- **Serializer** — JSON with round-trip support for `Date`, `Map`, `Set`, and `undefined`; bring your own serializer via the `Serializer<T>` interface
- **SSR-safe** — falls back to in-memory storage when `window` is unavailable; `isReady` ref lets components show a skeleton until hydration
- **Devtools** — a custom Vue Devtools inspector *and timeline* over every live `useStorage()` instance (Vue or React) — current value, target, TTL, undo/redo state, plus a log of write/expire/migrate/sync events; `/devtools` entry point, opt-in via `setupDevtools(app)`
- **Testing utilities** — `/testing` entry point: `mockStorage()`, `resetStorageState()`, `seedEnvelope()`/`seedExpiredEnvelope()`, `flushAsync()` — the patterns this package's own test suite uses, packaged for your tests
- **Vue and React as optional peers** — `@vue/devtools-api` is the sole required runtime dependency (used only if you call `setupDevtools`); neither `vue` nor `react` is required by the package itself, only by the entry point you actually import. `/crypto`, `/sync`, `/compress`, `/pinia`, `/devtools`, `/react`, `/testing` are separate tree-shakeable entry points

---

## Installation

```bash
npm install vue-storage-kit
```

For Vue, install Vue itself (optional peer — only needed if you import from the package root or any Vue-specific composable):

```bash
npm install vue@>=3.3
```

For React (`vue-storage-kit/react`), install React instead — you don't need `vue` at all:

```bash
npm install react@>=18
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
| `target` | `'local' \| 'session' \| 'memory' \| 'indexeddb'` | `'local'` | Storage backend. `'indexeddb'` stores through a single dedicated object store (db `vue-storage-kit`, store `kv`) — for custom databases/stores or secondary indexes, use `useIndexedDB()` / `useIDBRef()` instead |
| `ttl` | `number` | — | Time-to-live in milliseconds; `0` or omitted = no expiry |
| `version` | `number` | `1` | Schema version of the stored data |
| `migrations` | `Migration[]` | `[]` | Migration functions run when stored version differs from `version` |
| `encrypt` | `boolean \| EncryptOptions` | `false` | Enable AES-GCM encryption |
| `compress` | `boolean \| CompressOptions` | `false` | Compress the stored envelope via the Compression Streams API. Applied before `encrypt`, so compression still works on the plaintext (compressed ciphertext yields no size benefit) |
| `sign` | `boolean \| SignOptions` | `false` | HMAC-SHA256 integrity check, applied as the outermost layer (wraps compressed/encrypted data too). Detects tampering without requiring secrecy — combine with `encrypt` for both |
| `sync` | `boolean \| SyncOptions` | `false` | Enable cross-tab sync via `BroadcastChannel` |
| `debounce` | `number` | — | Coalesce writes: only persist `debounce` ms after the last change. Mutually exclusive with `throttle` (throttle wins if both are set) |
| `throttle` | `number` | — | Write at most once every `throttle` ms even during continuous changes, instead of only after they stop |
| `history` | `number` | — | Keep up to this many past values in memory for `undo()`/`redo()`. Not persisted — resets on reload |
| `evictOnQuota` | `boolean \| { max?: number }` | `false` | On `QuotaExceededError`, if sweeping this adapter's expired-TTL entries isn't enough, evict its least-recently-written *other* keys (oldest first, up to `max`, default `1`) and retry. Off by default — deleting unrelated keys is a real side effect |
| `serializer` | `Serializer<T>` | JSON serializer | Custom serialize / deserialize pair |
| `onError` | `(err: StorageError) => void` | — | Called instead of throwing on quota exceeded, parse errors, crypto errors, invalid signatures, or other write failures |
| `onExpire` | `(key: string) => void` | — | Called when a TTL-expired key is removed on read |
| `onMigrate` | `(from: number, to: number) => void` | — | Called after a successful migration |

### Return value

| Property | Type | Description |
|---|---|---|
| `value` | `Ref<T>` | Reactive two-way binding; assigning writes to storage |
| `isReady` | `Ref<boolean>` | `false` until the initial async read completes (important for IndexedDB and encrypted values) |
| `error` | `Ref<StorageError \| null>` | Last error, `null` if none |
| `expiry` | `ComputedRef<Date \| null>` | When the key expires, `null` if no TTL |
| `canUndo` / `canRedo` | `ComputedRef<boolean>` | Whether `undo()` / `redo()` currently does anything (always `false` unless `history` is set) |
| `remove()` | `void` | Delete the key from storage and reset `value` to `defaultValue` |
| `refresh()` | `Promise<void>` | Re-read from storage (useful if another process may have written) |
| `undo()` / `redo()` | `void` | Navigate through values recorded via `history`; a no-op if `history` isn't set or the respective stack is empty |

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
await TTLManager.cleanExpired(adapter, 'myapp:')
```

**Check when a specific key expires:**

```ts
const exp = await TTLManager.getExpiry(adapter, 'otp')
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

### Rotating a password/key

`reencrypt()` and `rotateEncryptedKey()` (also from `/crypto`) let you switch an already-encrypted value to a new password without the caller ever handling the plaintext:

```ts
import { rotateEncryptedKey } from 'vue-storage-kit/crypto'

// Reads 'api-key' from local storage, decrypts with the old password,
// re-encrypts with the new one, writes it back.
await rotateEncryptedKey(
  'local',
  'api-key',
  { password: 'old-passphrase', iterations: 100_000 },
  { password: 'new-passphrase', iterations: 100_000 },
)
```

`reencrypt(raw, oldOpts, newOpts)` does the same thing at the string level (decrypt + re-encrypt), if you're not going through a `StorageAdapter`.

### Integrity without secrecy — signing

`sign` adds an HMAC-SHA256 check without encrypting the value — the data stays plainly readable, but any tampering is detected on the next read. Useful for values that aren't secret but shouldn't be silently edited (a promo code, a feature flag, a cached entitlement):

```ts
const { value: plan } = useStorage('subscription-tier', {
  defaultValue: 'free',
  sign: { password: 'app-signing-key' },
})
```

Combine `sign` with `encrypt` for confidentiality *and* integrity — signing wraps the outermost layer, so it covers the ciphertext too:

```ts
const { value } = useStorage('vault', {
  defaultValue: {},
  encrypt: { password: 'encrypt-pw' },
  sign: { password: 'sign-pw' }, // can be a different password/key than encrypt
})
```

A failed signature check reports `{ type: 'signature-invalid', key }` via `onError` and falls back to `defaultValue`, the same way a decrypt failure does.

Standalone `sign()` / `verify()` are also exported from `/crypto`, mirroring `encrypt()` / `decrypt()`.

---

## Resilience & performance

### Debounce and throttle

```ts
// Only the value 500ms after typing stops gets written.
const { value: draft } = useStorage('draft', { defaultValue: '', debounce: 500 })

// Written at most once every 200ms while a slider is dragged, instead of
// waiting for it to stop.
const { value: volume } = useStorage('volume', { defaultValue: 50, throttle: 200 })
```

They're mutually exclusive — if both are set, `throttle` wins. Whichever is used, a write still pending when the component unmounts is flushed immediately rather than dropped.

### Quota-exceeded recovery

On `QuotaExceededError`, `useStorage` first sweeps this adapter's own expired-TTL entries (via the same logic as `TTLManager.cleanExpired()`) and retries once. If that's not enough, opt into `evictOnQuota` to additionally evict the least-recently-written *other* keys under the same adapter:

```ts
const { value } = useStorage('cache-entry', {
  defaultValue: null,
  evictOnQuota: { max: 3 }, // evict up to 3 other keys before giving up
})
```

Eviction can only judge the age of plain (unencrypted, uncompressed) envelopes — it leaves encrypted/compressed/signed keys belonging to other `useStorage()` calls alone, since their age can't be safely inspected without their own keys.

Non-quota write failures (a full disk, a broken adapter) are reported as `{ type: 'write-failed', key, error }` via `onError` — they're never thrown from inside the internal reactive write, which would otherwise be an unhandled rejection your app never sees.

### Undo / redo

```ts
const { value: text, undo, redo, canUndo, canRedo } = useStorage('editor-content', {
  defaultValue: '',
  history: 20, // keep the last 20 values
})

text.value = 'draft one'
text.value = 'draft two'
undo() // text.value === 'draft one'
redo() // text.value === 'draft two'
```

History lives in memory only — it does not persist across reloads, and isn't itself written to storage. `canUndo`/`canRedo` are reactive, so you can disable the corresponding buttons in your UI.

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

Imported directly from `vue-storage-kit`, this is client-only (SSR reads return `defaultValue`, since there's no `document` on the server). Inside a Nuxt app with the `vue-storage-kit/nuxt` module registered, auto-imported `useCookie` calls resolve to an SSR-aware version instead — same signature, but backed by the H3 request/response on the server. See [Nuxt module](#nuxt-module).

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
// With the vue-storage-kit/nuxt module registered, this auto-import resolves
// to the SSR-aware useCookie — reads/writes via H3 on the server.
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

These apply to every `useStorage()` call (and anything built on it, like `useStorageList()`) made after the plugin is installed — not to `useCookie`, `useIndexedDB`/`useIDBRef`, or `createPiniaPersist`, which have their own independent options and don't read from the plugin.

| Option | Type | Description |
|---|---|---|
| `prefix` | `string` | Prepended to every storage key — `useStorage('counter', ...)` actually reads/writes `myapp:counter`. Two `useStorage()` calls for the same logical key installed with different prefixes are treated as distinct instances |
| `defaultTarget` | `StorageTarget` | Used when a call doesn't pass `target` itself; an explicit `target` (including the one baked into `useLocalStorage`/`useSessionStorage`) always wins |
| `defaultSerializer` | `Serializer<unknown>` | Fallback used when a call doesn't pass its own `serializer` |
| `defaultEncrypt` | `EncryptOptions` | With `encrypt: true`, used as-is. With `encrypt: { ... }`, the call's options are merged on top — e.g. `encrypt: { iterations: 200_000 }` can override just one field while the password still comes from here |
| `onError` | `(err: StorageError) => void` | Called in addition to (not instead of) any per-call `onError` — handy for app-wide logging/telemetry alongside call-site-specific handling |

---

## Devtools

A custom Vue Devtools inspector *and timeline*, built on the shared engine cache — so it shows every live `useStorage()` instance regardless of whether it was created from Vue or from the [React hook](#react-support).

- **Inspector**: key, target, current value, `isReady`, `expiry`, `canUndo`/`canRedo`, and error state — refreshed roughly once a second so cross-tab or TTL-driven changes show up without a manual refresh.
- **Timeline**: logs `write`, `expire`, `migrate`, `sync-received`, and `error` events as they happen, so you can see *when* and *why* a value changed, not just its current snapshot.

Opt-in: call `setupDevtools(app)` from the `/devtools` entry point once, wherever you create your app.

```ts
import { createApp } from 'vue'
import { setupDevtools } from 'vue-storage-kit/devtools'
import App from './App.vue'

const app = createApp(App)
setupDevtools(app)
app.mount('#app')
```

It's safe to call unconditionally — `setupDevtools` (and the `@vue/devtools-api` it wraps) no-ops when no devtools client is connected, so calling it in production has no effect beyond the (tiny) added code. If you'd rather strip it entirely from production bundles, gate the call and the import behind your own dev-mode check:

```ts
if (import.meta.env.DEV) {
  const { setupDevtools } = await import('vue-storage-kit/devtools')
  setupDevtools(app)
}
```

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

With `autoImports: true` the following are available globally without an explicit import. `useCookie` here resolves to the SSR-aware runtime version (H3-backed on the server), not the client-only one exported from the package root:

```ts
useStorage()
useLocalStorage()
useSessionStorage()
useIndexedDB()
useIDBRef()
useCookie()
```

---

## React support

The `/react` entry point exports a `useStorage()` hook built on the same framework-agnostic engine as the Vue composable — same options (TTL, migrations, `encrypt`, `compress`, `sign`, `sync`, `debounce`/`throttle`, `history`, `evictOnQuota`), same behavior. It's backed by React's `useSyncExternalStore`, so it's safe under concurrent rendering.

```tsx
import { useStorage } from 'vue-storage-kit/react'

function Counter() {
  const { value: count, setValue: setCount, isReady } = useStorage('count', {
    defaultValue: 0,
    target: 'local',
  })

  if (!isReady) return <p>Loading…</p>

  return (
    <button onClick={() => setCount((c) => c + 1)}>
      Clicked {count} times
    </button>
  )
}
```

### Differences from the Vue composable

| | Vue | React |
|---|---|---|
| Returns | `{ value: Ref<T>, ... }` — assign `value.value = x` to write | `{ value: T, setValue, ... }` — call `setValue(x)` or `setValue(prev => next)` to write |
| Shared instance | Two Vue components with the same key+target share one `Ref` | Two React components with the same key+target share one underlying engine (via `useSyncExternalStore`), but each gets its own snapshot |
| Reacting to a changed `key` | Not supported — same as the Vue side | Not supported. Mount a new component instance for a different key (e.g. via a `key` prop), the same pattern React already recommends for "reset this state" |

Two Vue components, two React components, or a mix of both, calling `useStorage()` with the same key+target all share **one** underlying engine — one set of timers, one adapter call per write, one TTL/migration/sync pipeline — regardless of which framework(s) created them.

Not yet available for React (Vue-only for now — see the project's `todo.md` for the tracked backlog): `useCookie`, `useIndexedDB`/`useIDBRef`, `useStorageList`, `useStorageKeys`, `useBroadcastChannel`, and a Pinia-persist equivalent.

`react` (`^18.0.0`, for `useSyncExternalStore`) is an optional peer dependency — only required if you import `vue-storage-kit/react`.

---

## Testing utilities

The `/testing` entry point packages the patterns this package's own test suite uses everywhere — no test-runner-specific import (works with Vitest, Jest, or anything else, since it just reassigns a plain object property, not `vi.spyOn`).

```ts
import { mockStorage, resetStorageState, seedExpiredEnvelope, flushAsync } from 'vue-storage-kit/testing'
import { useStorage } from 'vue-storage-kit'

beforeEach(() => {
  resetStorageState() // clears the shared instance/engine cache between tests
})

it('reads an existing value', async () => {
  const { adapter, restore } = mockStorage() // redirects every target to one MemoryStorageAdapter
  await adapter.setItem('k', JSON.stringify({ v: 1, d: '"stored"', exp: null, ts: Date.now() }))

  const { value } = useStorage('k', { defaultValue: 'default', target: 'memory' })
  await flushAsync()

  expect(value.value).toBe('stored')
  restore()
})

it('treats an expired key as expired', async () => {
  const { adapter } = mockStorage()
  await seedExpiredEnvelope(adapter, 'k', 'stale') // shorthand for the envelope above, with exp in the past

  const { value } = useStorage('k', { defaultValue: 'default', target: 'memory' })
  await flushAsync()

  expect(value.value).toBe('default')
})
```

| Export | Description |
|---|---|
| `mockStorage(adapter?)` | Redirects `StorageAdapterFactory.get()` to always return `adapter` (a fresh `MemoryStorageAdapter` by default), regardless of the requested target. Returns `{ adapter, restore() }` |
| `resetStorageState()` | Clears the shared `useStorage()`/engine instance cache (Vue and React alike) and `StorageAdapterFactory`'s per-target singletons |
| `seedEnvelope(adapter, key, value, opts?)` | Writes a raw envelope directly, for arranging state without a live `useStorage()` instance |
| `seedExpiredEnvelope(adapter, key, value, opts?)` | `seedEnvelope()` with `exp` defaulted to a timestamp already in the past |
| `flushAsync(ms?)` | `await`-able delay (default `10`ms) for letting pending writes/debounce/throttle/dynamic imports settle |
| `MemoryStorageAdapter`, `StorageAdapterFactory` | Re-exported for convenience |

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
  SignOptions,
  CompressOptions,
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
  // { type: 'write-failed'; key; error }
  // { type: 'signature-invalid'; key }

  // Low-level adapter interface (all methods return Promises)
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
    case 'signature-invalid':
      console.error('Tampered or corrupted signed value:', err.key)
      break
    case 'write-failed':
      console.error('Non-quota write failure:', err.key, err.error)
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
| `useCookie` on server (Nuxt) | The `vue-storage-kit/nuxt` module auto-imports an SSR-aware `useCookie()` that reads from `event.node.req.headers.cookie` and writes `httpOnly` cookies via H3's `setCookie()`. The base `useCookie` exported from `vue-storage-kit` directly (used outside Nuxt, or without the module) is client-only — `document.cookie` is unavailable on the server, so it returns `defaultValue` during SSR |
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
│     LocalStorageAdapter     → window.localStorage
│     SessionStorageAdapter   → window.sessionStorage
│     MemoryStorageAdapter    → Map<string, string>  (SSR / 'memory' target)
│     IndexedDBStorageAdapter → a dedicated IndexedDB object store ('indexeddb' target)
│
│     StorageAdapter is async (`Promise`-returning getItem/setItem/removeItem/keys)
│     so all four backends — including IndexedDB — share one pipeline.
│
├── src/engine  (framework-agnostic — no vue or react import anywhere in here)
│     │
│     ├── StorageEngine
│     │     Owns the full read/write pipeline: TTL, schema migrations,
│     │     encrypt/compress/sign, cross-tab sync, debounce/throttle,
│     │     undo/redo history, quota-exceeded recovery (TTL sweep, then
│     │     optional LRU eviction). Exposes getSnapshot()/subscribe() — an
│     │     "external store" shape usable from any framework — plus
│     │     onEvent() for devtools-timeline-style consumers.
│     │
│     └── engineCache
│           acquireEngine()/releaseEngine() — refcounted cache shared by
│           Vue *and* React: two components in either (or both) frameworks
│           asking for the same key+target get the same StorageEngine.
│
├── composables/useStorage  (Vue)
│     Thin wrapper: ref/computed mirroring engine.getSnapshot(), a
│     watch(value, flush:'sync') that calls engine.setValue(), and its own
│     wrapperCache on top of engineCache so multiple Vue components share
│     one literal `Ref` (not just the same engine).
│
├── react/useStorage  (React, `/react` entry point)
│     Thin wrapper: useSyncExternalStore(engine.subscribe, engine.getSnapshot)
│     plus a setValue() callback. Acquires/releases via the same engineCache.
│
├── SchemaManager
│     Builds and runs migration chains (up or down)
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
├── useIndexedDB / useIDBRef  (Vue)
│     IndexedDBAdapter — lazily opens IDB, creates store on upgrade
│     useIDBRef watches the ref and calls adapter.set() on change
│
├── useCookie  (Vue)
│     Parses document.cookie on mount
│     watch → builds Set-Cookie string and assigns to document.cookie
│
├── /crypto  (separate entry point)
│     StorageEncryption — encrypt() / decrypt() / reencrypt() / rotateEncryptedKey()
│     PBKDF2 key derivation; derived keys cached by (password, iterations, salt)
│     StorageSigning — sign() / verify(), HMAC-SHA256
│
├── /sync  (separate entry point)
│     LeaderElection — navigator.locks; holds lock for tab lifetime
│     TabSync — BroadcastChannel + storage event fallback
│               last-write-wins by timestamp; leader wins on tie
│
├── VueStoragePlugin  (Vue)
│     prefix/defaultTarget/defaultSerializer/defaultEncrypt/onError, read by
│     every Vue useStorage() call made after install via getGlobalOptions()
│
├── /devtools  (separate entry point, opt-in via setupDevtools(app))
│     Inspector + timeline over engineCache — sees Vue and React instances alike
│
├── /testing  (separate entry point)
│     mockStorage()/resetStorageState()/seedEnvelope()/flushAsync()
│
└── Nuxt module (vue-storage-kit/nuxt)
      addImports — auto-import all composables (useCookie → SSR-aware runtime version)
      addPlugin  — installs VueStoragePlugin with runtimeConfig.storageKit.prefix
```

---

## Bundle size & peer dependencies

| Entry point | Needs `vue`? | Peer/runtime deps | Notes |
|---|---|---|---|
| `vue-storage-kit` | Yes | `vue ^3.3` | Vue composables, plugin, adapters, serializer |
| `vue-storage-kit/react` | No | `react ^18` | The React `useStorage()` hook |
| `vue-storage-kit/crypto` | No | — | AES-GCM encryption, HMAC signing, key rotation |
| `vue-storage-kit/sync` | No | — | TabSync and LeaderElection only |
| `vue-storage-kit/compress` | No | — | Compression Streams helpers + `CompressAdapter` only |
| `vue-storage-kit/pinia` | No | `pinia ^2 \| ^3` (optional peer) | `createPiniaPersist` only |
| `vue-storage-kit/devtools` | No | `@vue/devtools-api` (bundled runtime dep) | Inspector + timeline, opt-in |
| `vue-storage-kit/testing` | Yes¹ | — | Test helpers |
| `vue-storage-kit/nuxt` | — | `@nuxt/kit` (optional peer), `h3` (optional peer) | Nuxt module |

¹ `/testing` pulls in the Vue composable module for its cache-reset helper even if you're only testing React code — the cost is dev/test-only, never shipped to production, so this isn't optimized away.

The package ships as tree-shakeable ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`). The `/crypto`, `/sync`, and `/compress` entry points are also code-split *inside* `useStorage` — loaded dynamically only when `encrypt`, `sync`, or `compress` options are actually set, keeping the core footprint small regardless of which entry point pulled them in. `@vue/devtools-api` is the package's only required runtime dependency, and it's never bundled into `.`, `/react`, or `/nuxt` — it only loads if you explicitly import `vue-storage-kit/devtools` and call `setupDevtools(app)` yourself. Neither `vue` nor `react` is a hard dependency of the package as a whole — only of the specific entry point you import.

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
| Compression | `compress: true` option on `useStorage`, or the standalone `/compress` entry point — `compress()` / `decompress()` via Compression Streams API |
| Export / Import | `exportStorage()` / `importStorage()` — snapshot and restore all keys |
| Shared instance cache | Two components (Vue *or* React) calling `useStorage('key')` share one underlying engine — zero duplicated watchers/timers |
| Devtools inspector + timeline | `/devtools` entry point — `setupDevtools(app)`, sees Vue and React instances alike |
| HMAC signing | `sign: { password }` option — tamper detection without requiring secrecy |
| Undo / redo | `history: n` option — in-memory `undo()`/`redo()`, no extra state management needed |
| Throttle | `throttle` option, alongside `debounce` |
| Quota-exceeded recovery | Automatic TTL sweep + retry; optional `evictOnQuota` for LRU-style eviction of other keys |
| React support | `/react` entry point — same options, same engine, `useSyncExternalStore`-backed |
| Testing utilities | `/testing` entry point — `mockStorage()`, `resetStorageState()`, `seedEnvelope()` |

### Behavioural differences

| Behaviour | @vueuse/core | vue-storage-kit |
|---|---|---|
| Watcher flush | `'pre'` (default Vue) | `'sync'` — write happens in the same microtask as the assignment |
| Cross-tab update | `storage` event only | `BroadcastChannel` with `storage` event fallback |
| Serialisation | JSON only | JSON + Date, Map, Set, BigInt round-trip; custom `Serializer<T>` |
| Multiple instances | Independent watchers per call | Shared `StorageEngine` via a refcounted cache, across Vue *and* React |
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
