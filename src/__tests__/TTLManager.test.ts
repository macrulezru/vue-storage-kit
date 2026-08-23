import { describe, it, expect, beforeEach } from 'vitest'
import { TTLManager } from '../core/TTLManager'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

describe('TTLManager', () => {
  describe('isExpired', () => {
    it('returns false for null (no expiry)', () => {
      expect(TTLManager.isExpired(null)).toBe(false)
    })

    it('returns false for a future timestamp', () => {
      expect(TTLManager.isExpired(Date.now() + 10_000)).toBe(false)
    })

    it('returns true for a past timestamp', () => {
      expect(TTLManager.isExpired(Date.now() - 1)).toBe(true)
    })
  })

  describe('computeExp', () => {
    it('returns null for ttl=0', () => {
      expect(TTLManager.computeExp(0)).toBeNull()
    })

    it('returns null for undefined ttl', () => {
      expect(TTLManager.computeExp(undefined)).toBeNull()
    })

    it('returns a future timestamp for positive ttl', () => {
      const before = Date.now()
      const exp = TTLManager.computeExp(5000)
      expect(exp).toBeGreaterThanOrEqual(before + 5000)
    })
  })

  describe('wrapWithMeta / unwrapMeta', () => {
    it('round-trips exp/ts and the payload', () => {
      const wrapped = TTLManager.wrapWithMeta('opaque-ciphertext', { exp: 123, ts: 456 })
      const unwrapped = TTLManager.unwrapMeta(wrapped)
      expect(unwrapped).toEqual({ exp: 123, ts: 456, payload: 'opaque-ciphertext' })
    })

    it('round-trips a null exp', () => {
      const wrapped = TTLManager.wrapWithMeta('x', { exp: null, ts: 1 })
      expect(TTLManager.unwrapMeta(wrapped)).toEqual({ exp: null, ts: 1, payload: 'x' })
    })

    it('returns null for data with no recognizable header', () => {
      expect(TTLManager.unwrapMeta('just a string')).toBeNull()
      expect(TTLManager.unwrapMeta(JSON.stringify({ v: 1, d: 'x', exp: null, ts: 0 }))).toBeNull()
    })

    it('is unfooled by a payload that happens to contain a "|"', () => {
      const wrapped = TTLManager.wrapWithMeta('a|b|c', { exp: null, ts: 1 })
      expect(TTLManager.unwrapMeta(wrapped)).toEqual({ exp: null, ts: 1, payload: 'a|b|c' })
    })

    it('rejects a header with a non-numeric exp instead of passing it through', () => {
      expect(TTLManager.unwrapMeta('{"exp":"not-a-number","ts":1}|x')).toBeNull()
      expect(TTLManager.unwrapMeta('{"exp":true,"ts":1}|x')).toBeNull()
      expect(TTLManager.unwrapMeta('{"exp":{},"ts":1}|x')).toBeNull()
    })

    it('preserves exp: 0 (a valid, already-expired epoch timestamp) rather than treating it as no expiry', () => {
      const wrapped = TTLManager.wrapWithMeta('x', { exp: 0, ts: 1 })
      expect(TTLManager.unwrapMeta(wrapped)).toEqual({ exp: 0, ts: 1, payload: 'x' })
    })
  })

  describe('cleanExpired', () => {
    let adapter: MemoryStorageAdapter

    beforeEach(() => {
      adapter = new MemoryStorageAdapter()
    })

    it('removes expired keys', async () => {
      await adapter.setItem('key1', JSON.stringify({ v: 1, d: 'x', exp: Date.now() - 1, ts: 0 }))
      await adapter.setItem('key2', JSON.stringify({ v: 1, d: 'y', exp: null, ts: 0 }))
      await TTLManager.cleanExpired(adapter)
      expect(await adapter.getItem('key1')).toBeNull()
      expect(await adapter.getItem('key2')).not.toBeNull()
    })

    it('skips keys that are not envelopes', async () => {
      await adapter.setItem('raw', 'just a string')
      await TTLManager.cleanExpired(adapter)
      expect(await adapter.getItem('raw')).toBe('just a string')
    })

    it('respects prefix filter', async () => {
      await adapter.setItem('app:key', JSON.stringify({ v: 1, d: 'x', exp: Date.now() - 1, ts: 0 }))
      await adapter.setItem('other:key', JSON.stringify({ v: 1, d: 'y', exp: Date.now() - 1, ts: 0 }))
      await TTLManager.cleanExpired(adapter, 'app:')
      expect(await adapter.getItem('app:key')).toBeNull()
      expect(await adapter.getItem('other:key')).not.toBeNull()
    })

    it('removes an expired key even when its payload is opaque (encrypted/compressed/signed)', async () => {
      // Simulates what StorageEngine.writeToStorageInternal() produces for
      // an encrypt/compress/sign-transformed value: exp is unreadable
      // without the key's own password, EXCEPT through the plaintext meta
      // header — this is the whole point of wrapWithMeta().
      const opaque = TTLManager.wrapWithMeta('unreadable-ciphertext-blob', {
        exp: Date.now() - 1,
        ts: 0,
      })
      await adapter.setItem('encrypted-key', opaque)
      await TTLManager.cleanExpired(adapter)
      expect(await adapter.getItem('encrypted-key')).toBeNull()
    })

    it('leaves a not-yet-expired opaque key alone', async () => {
      const opaque = TTLManager.wrapWithMeta('unreadable-ciphertext-blob', {
        exp: Date.now() + 60_000,
        ts: 0,
      })
      await adapter.setItem('encrypted-key', opaque)
      await TTLManager.cleanExpired(adapter)
      expect(await adapter.getItem('encrypted-key')).not.toBeNull()
    })
  })

  describe('getExpiry', () => {
    let adapter: MemoryStorageAdapter

    beforeEach(() => {
      adapter = new MemoryStorageAdapter()
    })

    it('returns null for missing key', async () => {
      expect(await TTLManager.getExpiry(adapter, 'missing')).toBeNull()
    })

    it('returns Date for key with exp', async () => {
      const exp = Date.now() + 60_000
      await adapter.setItem('k', JSON.stringify({ v: 1, d: '', exp, ts: 0 }))
      const result = await TTLManager.getExpiry(adapter, 'k')
      expect(result).toBeInstanceOf(Date)
      expect(result!.getTime()).toBe(exp)
    })

    it('returns null for key with exp=null', async () => {
      await adapter.setItem('k', JSON.stringify({ v: 1, d: '', exp: null, ts: 0 }))
      expect(await TTLManager.getExpiry(adapter, 'k')).toBeNull()
    })

    it('reads exp for a key with an opaque (encrypted/compressed/signed) payload', async () => {
      const exp = Date.now() + 60_000
      const opaque = TTLManager.wrapWithMeta('unreadable-ciphertext-blob', { exp, ts: 0 })
      await adapter.setItem('k', opaque)
      const result = await TTLManager.getExpiry(adapter, 'k')
      expect(result).toBeInstanceOf(Date)
      expect(result!.getTime()).toBe(exp)
    })

    it('returns epoch (not null) for exp: 0, both for a plain envelope and an opaque one', async () => {
      await adapter.setItem('plain', JSON.stringify({ v: 1, d: '', exp: 0, ts: 0 }))
      const plainResult = await TTLManager.getExpiry(adapter, 'plain')
      expect(plainResult).toBeInstanceOf(Date)
      expect(plainResult!.getTime()).toBe(0)

      const opaque = TTLManager.wrapWithMeta('unreadable-ciphertext-blob', { exp: 0, ts: 0 })
      await adapter.setItem('opaque', opaque)
      const opaqueResult = await TTLManager.getExpiry(adapter, 'opaque')
      expect(opaqueResult).toBeInstanceOf(Date)
      expect(opaqueResult!.getTime()).toBe(0)
    })
  })
})
