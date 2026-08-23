import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encrypt, decrypt, reencrypt, rotateEncryptedKey } from '../crypto/StorageEncryption'
import { sign, verify } from '../crypto/StorageSigning'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

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

  describe('reencrypt', () => {
    it('re-encrypts under a new password, preserving the plaintext', async () => {
      const oldOpts = { password: 'old-pw', iterations: 1000 }
      const newOpts = { password: 'new-pw', iterations: 1000 }

      const ciphertext = await encrypt('rotate-me', oldOpts)
      const rotated = await reencrypt(ciphertext, oldOpts, newOpts)

      expect(rotated).not.toBe(ciphertext)
      await expect(decrypt(rotated, oldOpts)).rejects.toThrow()
      expect(await decrypt(rotated, newOpts)).toBe('rotate-me')
    })
  })

  describe('rotateEncryptedKey', () => {
    let adapter: MemoryStorageAdapter

    beforeEach(() => {
      adapter = new MemoryStorageAdapter()
      StorageAdapterFactory._reset()
      vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
    })

    it('rewrites the stored value under the new password', async () => {
      const oldOpts = { password: 'old-pw', iterations: 1000 }
      const newOpts = { password: 'new-pw', iterations: 1000 }

      const ciphertext = await encrypt('stored-secret', oldOpts)
      await adapter.setItem('secret-key', ciphertext)

      await rotateEncryptedKey('memory', 'secret-key', oldOpts, newOpts)

      const raw = await adapter.getItem('secret-key')
      expect(raw).not.toBe(ciphertext)
      expect(await decrypt(raw!, newOpts)).toBe('stored-secret')
    })

    it('is a no-op when the key is absent', async () => {
      await rotateEncryptedKey('memory', 'missing', { password: 'a' }, { password: 'b' })
      expect(await adapter.getItem('missing')).toBeNull()
    })

    it('rotates a value that was also sign()ed, preserving a valid signature', async () => {
      const oldOpts = { password: 'old-pw', iterations: 1000 }
      const newOpts = { password: 'new-pw', iterations: 1000 }
      const signOpts = { password: 'sign-pw' }

      const encrypted = await encrypt('stored-secret', oldOpts)
      const signed = await sign(encrypted, signOpts)
      await adapter.setItem('signed-key', signed)

      await rotateEncryptedKey('memory', 'signed-key', oldOpts, newOpts, signOpts)

      const raw = await adapter.getItem('signed-key')
      expect(raw).not.toBe(signed)
      const unwrapped = await verify(raw!, signOpts)
      expect(await decrypt(unwrapped, newOpts)).toBe('stored-secret')
      // The old password no longer decrypts it.
      await expect(decrypt(unwrapped, oldOpts)).rejects.toThrow()
    })
  })
})
