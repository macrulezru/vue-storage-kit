import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../crypto/StorageEncryption'

describe('StorageEncryption', () => {
  const opts = { password: 'test-password-123', iterations: 1000 }

  it('encrypts and decrypts a string round-trip', async () => {
    const original = 'Hello, World!'
    const ciphertext = await encrypt(original, opts)
    expect(typeof ciphertext).toBe('string')
    expect(ciphertext).not.toBe(original)

    const plaintext = await decrypt(ciphertext, opts)
    expect(plaintext).toBe(original)
  })

  it('produces different ciphertext on each call (random IV/salt)', async () => {
    const c1 = await encrypt('same', opts)
    const c2 = await encrypt('same', opts)
    expect(c1).not.toBe(c2)
  })

  it('encrypts and decrypts JSON objects', async () => {
    const data = JSON.stringify({ name: 'test', value: 42 })
    const ciphertext = await encrypt(data, opts)
    const result = await decrypt(ciphertext, opts)
    expect(JSON.parse(result)).toEqual({ name: 'test', value: 42 })
  })

  it('throws on decrypt with wrong password', async () => {
    const ciphertext = await encrypt('secret', opts)
    await expect(decrypt(ciphertext, { password: 'wrong', iterations: 1000 })).rejects.toThrow()
  })

  it('throws when neither password nor key is provided', async () => {
    await expect(encrypt('data', {})).rejects.toThrow()
  })

  it('works with a pre-generated CryptoKey', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    const ciphertext = await encrypt('data', { key })
    const result = await decrypt(ciphertext, { key })
    expect(result).toBe('data')
  })
})
