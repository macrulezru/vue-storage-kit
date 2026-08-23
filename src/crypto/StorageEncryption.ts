import type { EncryptOptions, StorageTarget } from '../core/types'

// Cache derived keys to avoid re-running PBKDF2 on every write.
// Key: "password:iterations:base64(salt)" — unique per (password, salt) pair.
const derivedKeyCache = new Map<string, CryptoKey>()

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const cacheKey = `${password}:${iterations}:${btoa(String.fromCharCode(...salt))}`
  const cached = derivedKeyCache.get(cacheKey)
  if (cached) return cached

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  derivedKeyCache.set(cacheKey, key)
  return key
}

async function resolveKey(opts: EncryptOptions, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (opts.key) return opts.key
  if (opts.password) return deriveKey(opts.password, salt, opts.iterations ?? 100_000)
  throw new Error('EncryptOptions must provide either password or key')
}

/**
 * Encrypts a UTF-8 string using AES-GCM.
 * Output format (base64): salt[16] + iv[12] + ciphertext
 */
export async function encrypt(data: string, opts: EncryptOptions): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const key = await resolveKey(opts, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data),
  )

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypts a base64 string produced by encrypt().
 */
export async function decrypt(raw: string, opts: EncryptOptions): Promise<string> {
  const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  const salt = new Uint8Array(combined.buffer, 0, 16) as Uint8Array<ArrayBuffer>
  const iv = new Uint8Array(combined.buffer, 16, 12)
  const ciphertext = new Uint8Array(combined.buffer, 28)

  const key = await resolveKey(opts, salt)

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)

  return new TextDecoder().decode(plaintext)
}

/**
 * Re-encrypts a string produced by encrypt() under a new password/key —
 * decrypts with `oldOpts`, encrypts the resulting plaintext with `newOpts`.
 * Use to rotate a password/key without knowing anything about what's
 * "inside" (e.g. useStorage()'s compressed-then-encrypted envelope): this
 * only touches the outermost encryption layer.
 */
export async function reencrypt(
  raw: string,
  oldOpts: EncryptOptions,
  newOpts: EncryptOptions,
): Promise<string> {
  const plaintext = await decrypt(raw, oldOpts)
  return encrypt(plaintext, newOpts)
}

/**
 * Rotates the encryption key/password for a single key already stored via
 * useStorage({ encrypt: oldOpts }) — reads the raw stored value, re-encrypts
 * it under `newOpts`, and writes it back. No-op if the key isn't present.
 *
 * Run this once (e.g. on app start after prompting for a new password)
 * before switching `useStorage()` callers over to `newOpts`.
 */
export async function rotateEncryptedKey(
  target: StorageTarget,
  key: string,
  oldOpts: EncryptOptions,
  newOpts: EncryptOptions,
): Promise<void> {
  const { StorageAdapterFactory } = await import('../adapters/StorageAdapterFactory')
  const adapter = StorageAdapterFactory.get(target)
  const raw = await adapter.getItem(key)
  if (raw === null) return
  const rotated = await reencrypt(raw, oldOpts, newOpts)
  await adapter.setItem(key, rotated)
}
