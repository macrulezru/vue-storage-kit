import type { SignOptions } from '../core/types'

// Appended as `<data>.<base64-hmac>`. Base64's alphabet never contains '.',
// so `lastIndexOf('.')` always finds our delimiter even when `data` itself
// contains periods (e.g. a JSON envelope embedding a decimal value).
const SEPARATOR = '.'

async function resolveKey(opts: SignOptions): Promise<CryptoKey> {
  if (opts.key) return opts.key
  if (opts.password) {
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(opts.password),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  throw new Error('SignOptions must provide either password or key')
}

/**
 * Appends an HMAC-SHA256 signature to `data`. Detects tampering without
 * providing confidentiality — the data itself stays in plain sight.
 */
export async function sign(data: string, opts: SignOptions): Promise<string> {
  const key = await resolveKey(opts)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return `${data}${SEPARATOR}${b64}`
}

/**
 * Verifies and strips the signature appended by sign(). Throws if the
 * signature is missing or doesn't match.
 */
export async function verify(signed: string, opts: SignOptions): Promise<string> {
  const idx = signed.lastIndexOf(SEPARATOR)
  if (idx === -1) throw new Error('Missing signature')

  const data = signed.slice(0, idx)
  const sigB64 = signed.slice(idx + 1)
  const key = await resolveKey(opts)
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
