import { describe, it, expect } from 'vitest'
import { sign, verify } from '../crypto/StorageSigning'

describe('StorageSigning', () => {
  const opts = { password: 'sign-password' }

  it('signs and verifies a round-trip, stripping the signature', async () => {
    const signed = await sign('hello world', opts)
    expect(signed).not.toBe('hello world')
    expect(signed.startsWith('hello world.')).toBe(true)

    const data = await verify(signed, opts)
    expect(data).toBe('hello world')
  })

  it('correctly delimits data containing periods', async () => {
    const original = '{"v":1,"d":"3.14","exp":null,"ts":1234567890}'
    const signed = await sign(original, opts)
    const data = await verify(signed, opts)
    expect(data).toBe(original)
  })

  it('throws when the signature is missing', async () => {
    await expect(verify('no-signature-here', opts)).rejects.toThrow('Missing signature')
  })

  it('throws when the data was tampered with', async () => {
    const signed = await sign('original', opts)
    const tampered = signed.replace('original', 'tampered!')
    await expect(verify(tampered, opts)).rejects.toThrow('Signature verification failed')
  })

  it('throws when verified with the wrong password', async () => {
    const signed = await sign('secret', opts)
    await expect(verify(signed, { password: 'wrong' })).rejects.toThrow()
  })

  it('works with a pre-generated CryptoKey', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
    const signed = await sign('data', { key })
    expect(await verify(signed, { key })).toBe('data')
  })

  it('throws when neither password nor key is provided', async () => {
    await expect(sign('data', {})).rejects.toThrow()
  })
})
