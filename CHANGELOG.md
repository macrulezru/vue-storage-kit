# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-08-23

Everything below is relative to the previously published `0.1.2`. Includes a breaking change to `StorageAdapter` (see below), hence the minor bump under `0.x` semver.

### Fixed — critical packaging bugs

- `package.json`'s `module`/`exports` fields pointed at `./dist/*.mjs`, but the actual tsup output (given `"type": "module"`) is `.js` (ESM) / `.cjs` (CJS) — **the published package could not be `import`-ed at all**. Fixed to match the real build output.
- `vue-storage-kit/nuxt` was never actually built — `tsup.config.ts` didn't include `src/nuxt/module.ts` in its entry list, so `dist/nuxt/` didn't exist despite `exports["./nuxt"]` pointing at it. Now built as a separate ESM-only tsup step.
- Added `scripts/verify-pack.mjs`, wired into `prepublishOnly` (`npm run verify-pack`) — checks every path in `main`/`module`/`exports` exists and actually resolves through both `import()` and `require()`, so a packaging regression fails the publish instead of shipping broken.

### Fixed — documented-but-unimplemented behavior

- `sync: { debounce }` on `useStorage`/`TabSync` was stored but never used — `broadcast()` sent every message immediately. Now actually debounces (coalesces rapid same-key broadcasts into one, carrying the latest value).
- README claimed Nuxt's `useCookie` "delegates to the built-in useCookie on the server" and read `event.node.req.headers.cookie` with `httpOnly` support — none of this existed; the shipped `useCookie` was client-only (`document.cookie`) everywhere, including during SSR. Implemented for real as a separate SSR-aware runtime composable, auto-imported in place of the base one inside the Nuxt module.
- `VueStoragePlugin`'s options (`prefix`, `defaultTarget`, `defaultSerializer`, `defaultEncrypt`, `onError`) were stored via `getGlobalOptions()` but never read by `useStorage()` — installing the plugin with any of these had zero effect. Now wired in: `prefix` is prepended to the actual storage key (and participates in the instance cache key, so different prefixes never collide); `defaultTarget`/`defaultSerializer` are used as fallbacks when a call doesn't specify its own; `defaultEncrypt` is used as-is for `encrypt: true` or merged under an explicit `encrypt: {...}`; `onError` runs in addition to (not instead of) any per-call `onError`. Scope: only `useStorage()` and things built on it (`useStorageList()`) — `useCookie`, `useIndexedDB`/`useIDBRef`, and `createPiniaPersist` have their own independent options and intentionally don't read from the plugin.

### Added

- **`compress` option on `useStorage`** — compression (via the existing `/compress` Compression Streams helpers) is now part of the main read/write pipeline, composable with `encrypt` (compress-then-encrypt).
- **IndexedDB as a first-class `useStorage()` target** — `target: 'indexeddb'` now works through the same pipeline as local/session/memory (TTL, migrations, encryption, compression, sync), backed by a new `IndexedDBStorageAdapter`. `useIndexedDB()`/`useIDBRef()` remain for custom databases/stores/indexes.
- **SSR-aware `useCookie` for Nuxt** — reads/writes through the H3 request/response on the server (real `httpOnly` support, correct SSR-time value instead of always `defaultValue`); auto-imported by the Nuxt module in place of the client-only version.
- **Write debounce** — new `debounce` option on `useStorage` coalesces rapid mutations into a single storage write; flushed on scope dispose so the last value is never lost.
- **Quota-exceeded recovery** — on `QuotaExceededError`, `useStorage` now sweeps this adapter's own expired-TTL entries and retries the write once before giving up.
- **`write-failed` error type** — non-quota write errors are now reported via `onError` instead of being thrown from inside a `watch` callback (previously an unhandled rejection).
- **`onError` on `createPiniaPersist`** — corrupted restore data and failed persists are now reported (`parse-error` / `quota-exceeded` / `write-failed`) instead of being silently swallowed.
- **Encryption key rotation** — `reencrypt()` and `rotateEncryptedKey()` in the `/crypto` entry point, for rotating a password/key on already-encrypted data without loss.
- **Devtools integration** — a custom Vue Devtools inspector (live `useStorage()` instances: value, target, TTL, ready/error state) via the new `/devtools` entry point, `setupDevtools(app)`.

### Changed — breaking

- **`StorageAdapter` is now async** (`getItem`/`setItem`/`removeItem`/`keys` return `Promise`s), to allow IndexedDB to implement it. Cascading changes:
  - `exportStorage()`, `importStorage()`, `clearStorage()` (`vue-storage-kit`) are now `async`.
  - `TTLManager.cleanExpired()`, `TTLManager.getExpiry()` are now `async`.
  - `useStorageKeys()` gained an `isReady` ref; `refresh()` is now `Promise<void>`; the initial key scan is async.
  - Custom `StorageAdapter` implementations (if any) must be updated to the async contract.
  - `useStorage()`'s public API (`value`, `isReady`, `error`, `expiry`, `remove()`, `refresh()`) is unchanged.

### Fixed — other

- `adapter.setItem(...).catch(...)`-style error handling (in `createPiniaPersist` and `useStorage.remove()`) didn't catch a **synchronous** throw from a non-conforming adapter — only a rejected promise. Replaced with `async` IIFE + `try/catch`, which catches both.

### Testing

- Added test coverage for previously-untested modules: `compress/Compression.ts`, `utils/storage.ts`, `pinia/index.ts`, `nuxt/module.ts`, `nuxt/runtime/plugin.ts`, `nuxt/runtime/composables/useCookie.ts`, `adapters/IndexedDBStorageAdapter.ts`, `devtools/index.ts`.
- Full suite: 196 tests across 25 files, all passing; `tsc --noEmit` clean; `eslint` clean (fixed 12 pre-existing unused-var errors so CI starts green).
- Added GitHub Actions CI (`.github/workflows/ci.yml`) — lint, typecheck, test, build, and `verify-pack` on every PR/push to `master`, across Node 18/20/22.

### Demo

- Fixed two demo components broken by the `StorageAdapter` async change (`CompressDemo.vue`, `UtilitiesDemo.vue` were calling adapter methods synchronously).
- Added a new "⚡ Resilience" tab demonstrating `debounce`, the `write-failed` error path, and quota-exceeded recovery live (via a temporarily monkey-patched adapter, not by actually filling browser storage).
- Added live demos for `useStorage({ compress: true })`, `useStorage({ target: 'indexeddb' })`, encryption key rotation (`rotateEncryptedKey`), and `createPiniaPersist`'s `onError`.
- Wired `setupDevtools(app)` into the demo's `main.ts`.

### Added — framework-agnostic core + React support

By explicit request: the whole `useStorage()` pipeline (TTL, migrations, encrypt/compress/sign, cross-tab sync, debounce/throttle, undo/redo, quota recovery) was extracted out of the Vue composable into a new framework-agnostic `StorageEngine` (`src/engine/StorageEngine.ts`), with a shared, refcounted instance cache (`src/engine/engineCache.ts`) used by *both* the Vue and React bindings — two components in either (or both) frameworks asking for the same key+target now share one engine.

- **`vue-storage-kit/react`** — a `useStorage()` hook for React, built on the same engine as the Vue composable (same options, same behavior), backed by `useSyncExternalStore` (concurrent-rendering safe). Returns `{ value, setValue, isReady, error, expiry, canUndo, canRedo, remove, refresh, undo, redo }`. `react ^18` is an optional peer dependency, needed only for this entry point.
  - Scope for this pass: `useStorage()` only. `useCookie`, `useIndexedDB`/`useIDBRef`, `useStorageList`, `useStorageKeys`, `useBroadcastChannel`, and a Pinia-equivalent are **not** ported to React yet — tracked as backlog in `todo.md`, not a silent omission.
  - Like the Vue composable, a hook instance doesn't react to `key`/`target` changing across re-renders — mount a new component instance (e.g. via a `key` prop) for a different key, same pattern React already recommends for this.
- **`composables/useStorage.ts` refactored** to a thin reactive wrapper over `StorageEngine` — zero changes to its existing tests, which now double as a regression suite proving the refactor preserves exact behavior. Fixed one new bug surfaced by the refactor along the way: the Vue wrapper's write-echo guard (`_skipWrite`) was reset via `nextTick()`, which stayed "up" long enough to silently swallow a second rapid synchronous edit in the same tick (e.g. `value.value = 1; value.value = 2` back to back); reset is now synchronous, matching `flush: 'sync'` semantics.

### Added — new `useStorage`/engine options (Vue and React alike)

- **`sign` (HMAC-SHA256 signing)** — lightweight tamper detection for data that doesn't need to be secret. New `/crypto` exports `sign()`/`verify()` (`src/crypto/StorageSigning.ts`); new `StorageError` variant `{ type: 'signature-invalid'; key }`. Applied as the outermost layer (wraps compressed/encrypted data too) — combine with `encrypt` for confidentiality + integrity.
- **`throttle`** — alongside the existing `debounce`, guarantees a write at most every `throttle` ms during continuous changes (a slider, a drag) instead of only after they stop. Mutually exclusive with `debounce` (throttle wins if both set); a pending throttled write is flushed on dispose, same as debounce.
- **`history` + `undo()`/`redo()`** — keeps up to `history` past values in memory (not persisted — resets on reload); `canUndo`/`canRedo` are reactive. A new `setValue()` after `undo()` clears the redo stack, as expected.
- **`evictOnQuota`** — extends the existing TTL-sweep-then-retry quota recovery: if that alone doesn't free enough space, evicts this adapter's least-recently-written *other* keys (oldest envelope `ts` first, up to `max`, default `1`) and retries. Off by default. Can only judge the age of plain (unencrypted/uncompressed) envelopes — leaves other instances' encrypted/compressed/signed keys alone, since their age can't be safely inspected without their own keys.

### Added — devtools timeline, testing utilities

- **Devtools timeline** — the existing inspector (`/devtools`) now also logs `write`/`expire`/`migrate`/`sync-received`/`error` events to a Vue Devtools timeline layer, sourced from the engine's new `onEvent()` hook. The inspector itself was switched from reading Vue's wrapper cache to reading the shared `engineCache`, so it (and the timeline) now shows React-created instances too, not just Vue's.
- **`vue-storage-kit/testing`** — `mockStorage()`, `resetStorageState()`, `seedEnvelope()`/`seedExpiredEnvelope()`, `flushAsync()` — the exact patterns this package's own test suite used by hand, dozens of times, packaged for consumers. Framework/test-runner agnostic (no `vi`/`jest` import — `StorageAdapterFactory` is a plain object, so redirecting it is just a property assignment).

### Fixed — other gaps found while wiring this up

- `SignOptions` (and, while auditing, `CompressOptions`) were missing from the root `vue-storage-kit` type exports despite being usable — added.

### Testing (updated)

- Full suite: 249 tests across 29 files, all passing; `tsc --noEmit` and `eslint` both clean.
- New test files: `StorageEngine.test.ts` (25 tests, exercises the engine directly — including throttle, history, signing, eviction), `reactUseStorage.test.ts` (9), `StorageSigning.test.ts` (7), `testingUtils.test.ts` (8), plus `devtools.test.ts` extended for the timeline and for cross-framework visibility.

### Fixed — issues found in review

- **`StorageEngine` writes could silently skip encryption/compression/signing.** A write triggered synchronously right after a `useStorage()` call (before the crypto/compress/sign modules' dynamic `import()`s had settled) checked `this.cryptoMod`/`compressMod`/`signingMod` while they were still `null` and wrote the raw envelope through untouched. Writes now wait for module loading to finish before touching the pipeline; the migration-triggered internal write (which runs *during* that same loading phase) is unaffected since it already runs after modules are loaded.
- **`undo()`/`redo()` could silently no-op for object/array values.** The history/redo stacks pushed `snapshot.value` directly — for a caller that mutates its value in place (e.g. Vue's `value.value.foo = x` under a deep watcher), that's the same object reference as the incoming new value by the time `setValue()` runs, so the "previous" entry pushed onto history was already indistinguishable from the new one. History pushes now read from an independently-cloned `lastCommitted` value instead.
- **Writes and `remove()` could race and complete out of order.** Two overlapping `setValue()` calls (or a `remove()` racing an in-flight write) each fired an independent, unserialized adapter call — under encryption in particular, there was no guarantee the write issued first would also finish first. Both now run through a single serialized per-engine queue.
- **HMAC signing derived its key directly from the password**, with no salt or key-stretching (unlike `encrypt`'s PBKDF2 + salt). `sign()`/`verify()` now derive the HMAC key via PBKDF2 with a random per-signature salt, carried alongside the signature. Breaking format change for `sign`/`verify`/`useStorage({ sign })` — old signed values won't verify against the new code (not yet published, so no migration needed).
- A failing `sign()` call (e.g. bare `sign: true` with no password/key) is now caught and reported via `onError` (`write-failed`) instead of causing an unhandled promise rejection.
- `TabSync.stop()` now flushes any still-debounced pending broadcasts instead of dropping them — previously, the last cross-tab update before a dispose/unmount within the debounce window was silently lost.
- `useStorageKeys()`'s `refresh()` no longer causes an unhandled rejection if `adapter.keys()` throws, and overlapping `refresh()` calls (e.g. rapid `storage` events) can no longer apply out of order — only the most recently *started* call's result is ever kept.
- `createPiniaPersist`'s restore path now catches a failing `adapter.getItem()` and reports it via the new `{ type: 'read-failed', key, error }` `StorageError` instead of an unhandled rejection.
- `vue-storage-kit/react`'s `useStorage()` now passes a `getServerSnapshot` to `useSyncExternalStore` (previously omitted, which throws under SSR).
- `EncryptionDemo.vue`: "Save to storage" is now disabled after a successful key rotation — the demo's live `useStorage()` instance still holds the pre-rotation password (options are captured once, not reactive), so saving afterwards would silently re-encrypt under the old password and clobber the rotated data.
- Corrected a README bullet documenting `sign: true` as usable on its own — `sign` always needs `{ password }` or `{ key }`; `true` alone has no credentials to sign with and would throw.
- Documented that the shared `StorageEngine` cache is a per-process (not per-request) singleton — a caveat for `target: 'memory'`/`'indexeddb'` under Nuxt SSR specifically (`local`/`session` already fail closed server-side).

### Fixed — a second round of review findings

- **`writeToStorage()` could reverse the effective order of an earlier write and a later `remove()`.** It awaited `modulesReady` *before* joining the serialized write queue, but `remove()` joins the queue synchronously with no such wait — a `remove()` issued while an earlier write was still stuck waiting on `modulesReady` (e.g. the very first write, with the crypto module still loading) could claim its writeChain slot first, running its `removeItem()` before that earlier write's `setItem()`. The queue slot is now claimed synchronously, before anything is awaited; the wait for `modulesReady` now happens inside the chained callback.
- **A cross-tab sync update landing while the initial read was still in flight could be silently discarded.** The `hasExternalWrite` guard added earlier this session covered `setValue()`/`undo()`/`redo()`/`remove()`, but not a value applied via `TabSync`'s subscribe callback — so the initial read, resolving afterwards, could still overwrite a value that had just arrived from another tab. The sync path now sets the same guard.
- **`cloneValue()`'s fallback silently defeated its own purpose.** When `structuredClone()` threw, it fell back to returning the *same* object reference — and verified empirically, `structuredClone()` throws `DataCloneError` on a Vue reactive Proxy, which is exactly the shape an object/array value arrives in from the Vue composable's deep `ref()`. In practice this meant the history-bleeding fix from earlier this session was close to a no-op for the primary real-world (Vue, object/array) case. It now falls back to the engine's own configured serializer (JSON by default, which handles a Proxy transparently) before, only as a last resort, reporting a `parse-error` and keeping the reference. `lastCommitted` is also now cloned up front at construction (from `defaultValue`), not just from the first `applyValue()` onward — a caller-owned `defaultValue` object mutated before the first `setValue()` no longer bleeds into history.
- New regression tests: a mutated-`defaultValue`-before-first-`setValue()` case, an `undo()`/`redo()` case using an actual Vue `reactive()` Proxy, and a sync-update-racing-the-initial-read case (via a delayed adapter + mocked `BroadcastChannel`).

### Fixed — test flakiness found in review

- The sync-update-racing-the-initial-read regression test (added just above) used a fixed 10ms delay to guess when `TabSync`'s setup would be done, and a fixed 50ms delay for the initial read — both real-time guesses that could flake on a slow enough CI runner. Replaced with two deterministic signals: a spy on `TabSync.prototype.subscribe()` (the exact point a delivered message can reach the engine — a whole microtask later than the raw `BroadcastChannel.addEventListener()` call, which was tried first and confirmed too early by re-running the test), and a manually-gated adapter (`releaseRead()`) instead of a timed one. The test no longer depends on wall-clock timing at all.
