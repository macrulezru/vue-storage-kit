# **Storage Kit**

![Storage Kit](https://github.com/macrulezru/assets/blob/master/packages-images/vue-storage-kit.png?raw=true)

Reactive localStorage, sessionStorage, IndexedDB and cookies for Vue 3 (and React) — TTL, AES-GCM encryption, HMAC signing, schema migrations with up/down functions, undo/redo, and cross-tab sync — built on a framework-agnostic core, with Vue and React as thin bindings over it.

---

## Features

- **useStorage** — unified reactive state over `localStorage`, `sessionStorage`, `IndexedDB`, or an in-memory store; drop-in replacement for vueuse `useLocalStorage` / `useSessionStorage`. Available for **Vue** (a `Ref`) and **React** (a `useSyncExternalStore`-backed hook)
- **Schema migrations** — versioned data with `up` / `down` migration chains; runs automatically on version mismatch, writes back the migrated value
- **TTL** — optional time-to-live per key; lazy expiry checked on every read, no timers; manual `cleanExpired()` sweep for startup cleanup
- **AES-GCM encryption** — Web Crypto API (`crypto.subtle`), key derived from a password via PBKDF2 or supplied as a `CryptoKey`; `reencrypt()`/`rotateEncryptedKey()` to rotate a password without data loss
- **HMAC signing** — lightweight _accidental_-corruption detection (`sign: { password }`) for data that doesn't need to be secret
- **Undo / redo** — `history: n` keeps the last _n_ values in memory; `undo()` / `redo()` navigate them
- **Debounce & throttle** — `debounce` coalesces writes after a pause; `throttle` guarantees a write at most every _n_ ms during continuous changes
- **Resilient writes** — on `QuotaExceededError`, sweeps this adapter's own expired-TTL entries and retries once; opt into `evictOnQuota` to additionally evict the least-recently-written _other_ keys
- **Cross-tab sync** — `BroadcastChannel` with `storage` event fallback; last-write-wins conflict resolution by timestamp; optional leader election via `navigator.locks`
- **useIndexedDB** — promise-based key-value API plus a reactive `useIDBRef` for a single key
- **useCookie** — reactive cookies with `expires`, `sameSite`, `secure`; SSR-aware (H3-backed) when auto-imported inside the Nuxt module
- **Vue plugin** — global prefix, default target/serializer/encrypt, and a global error handler, all applied to every `useStorage()` call
- **Nuxt module** — auto-imports all composables; wires up the plugin with runtime config
- **Serializer** — JSON with round-trip support for `Date`, `Map`, `Set`, and `undefined`; bring your own serializer via the `Serializer<T>` interface
- **SSR-safe** — falls back to in-memory storage when `window` is unavailable; `isReady` ref lets components show a skeleton until hydration
- **Devtools** — a custom Vue Devtools inspector _and timeline_ over every live `useStorage()` instance; `/devtools` entry point, opt-in via `setupDevtools(app)`
- **Testing utilities** — `/testing` entry point: `mockStorage()`, `resetStorageState()`, `seedEnvelope()`/`seedExpiredEnvelope()`, `flushAsync()`
- **Vue and React as optional peers** — `@vue/devtools-api` is the sole required runtime dependency; `/crypto`, `/sync`, `/compress`, `/pinia`, `/devtools`, `/react`, `/testing` are separate tree-shakeable entry points

---

## Installation

| Environment | Minimum version                                                        |
| ------------- | -------------------------------------------------------------------------- |
| Node.js     | `18+`                                                                       |
| Vue         | `3.3.0+` (optional — only for the package root / Vue composables)          |
| React       | `18.0.0+` (optional — only for `/react`)                                   |
| `pinia`     | `2.0.0+` or `3.0.0+` (optional — only for `/pinia`)                        |
| `@nuxt/kit` | `3.0.0+` (optional — only for the `/nuxt` module)                          |
| `h3`        | `1.0.0+` (optional — only for the Nuxt module's SSR-aware `useCookie`)     |

```bash
npm install vue-storage-kit
```

For Vue (optional peer — only needed if you import from the package root or any Vue-specific composable):

```bash
npm install vue@>=3.3
```

For React (`vue-storage-kit/react`), install React instead — you don't need `vue` at all:

```bash
npm install react@>=18
```

### Quick start

```vue
<script setup lang="ts">
import { useLocalStorage } from 'vue-storage-kit'

const { value: theme } = useLocalStorage('theme', 'light')
</script>

<template>
  <button @click="theme = theme === 'light' ? 'dark' : 'light'">Current theme: {{ theme }}</button>
</template>
```

The value is persisted to `localStorage` and is reactive — changing `theme.value` writes to storage immediately.

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/vue-storage-kit](https://npm.vuecraft.ru/en/packages/vue-storage-kit/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/vue-storage-kit](https://github.com/macrulezru/vue-storage-kit)
- 📦 **NPM:** [vue-storage-kit](https://www.npmjs.com/package/vue-storage-kit)
- 🐛 **Issues:** [github.com/macrulezru/vue-storage-kit/issues](https://github.com/macrulezru/vue-storage-kit/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
