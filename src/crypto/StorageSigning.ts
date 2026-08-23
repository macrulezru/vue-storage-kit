import type { SignOptions } from '../core/types'

// Format: `<data>.<base64-salt>.<base64-hmac>`. Base64's alphabet never
// contains '.', so scanning from the end with lastIndexOf() always finds our
// two delimiters even when `data` itself contains periods (e.g. a JSON
// envelope embedding a decimal value).
const SEPARATOR = '.'

async function resolveKey(opts: SignOptions, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (opts.key) return opts.key
  if (opts.password) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(opts.password),
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: opts.iterations ?? 100_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    )
  }
  throw new Error('SignOptions must provide either password or key')
}

/**
 * Appends an HMAC-SHA256 signature to `data`. Detects tampering without
 * providing confidentiality — the data itself stays in plain sight.
 *
 * When signing with a password, a fresh random salt is generated per call
 * and carried alongside the signature (PBKDF2-derived key, same approach as
 * StorageEncryption) so the key material isn't derived directly from the
 * password alone.
 */
export async function sign(data: string, opts: SignOptions): Promise<string> {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const key = await resolveKey(opts, salt as Uint8Array<ArrayBuffer>)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const saltB64 = btoa(String.fromCharCode(...salt))
  const macB64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return `${data}${SEPARATOR}${saltB64}${SEPARATOR}${macB64}`
}

/**
 * Verifies and strips the signature appended by sign(). Throws if the
 * signature is missing or doesn't match.
 */
export async function verify(signed: string, opts: SignOptions): Promise<string> {
  const macIdx = signed.lastIndexOf(SEPARATOR)
  if (macIdx === -1) throw new Error('Missing signature')
  const saltIdx = signed.lastIndexOf(SEPARATOR, macIdx - 1)
  if (saltIdx === -1) throw new Error('Missing signature')

  const data = signed.slice(0, saltIdx)
  const saltB64 = signed.slice(saltIdx + 1, macIdx)
  const sigB64 = signed.slice(macIdx + 1)

  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
  const key = await resolveKey(opts, salt)
  const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0))

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(data),
  )
  if (!valid) throw new Error('Signature verification failed')

  return data
}
