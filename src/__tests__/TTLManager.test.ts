import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  describe('cleanExpired', () => {
    let adapter: MemoryStorageAdapter

    beforeEach(() => {
      adapter = new MemoryStorageAdapter()
    })

    it('removes expired keys', () => {
      adapter.setItem('key1', JSON.stringify({ v: 1, d: 'x', exp: Date.now() - 1, ts: 0 }))
      adapter.setItem('key2', JSON.stringify({ v: 1, d: 'y', exp: null, ts: 0 }))
      TTLManager.cleanExpired(adapter)
      expect(adapter.getItem('key1')).toBeNull()
      expect(adapter.getItem('key2')).not.toBeNull()
    })

    it('skips keys that are not envelopes', () => {
      adapter.setItem('raw', 'just a string')
      TTLManager.cleanExpired(adapter)
      expect(adapter.getItem('raw')).toBe('just a string')
    })

    it('respects prefix filter', () => {
      adapter.setItem('app:key', JSON.stringify({ v: 1, d: 'x', exp: Date.now() - 1, ts: 0 }))
      adapter.setItem('other:key', JSON.stringify({ v: 1, d: 'y', exp: Date.now() - 1, ts: 0 }))
      TTLManager.cleanExpired(adapter, 'app:')
      expect(adapter.getItem('app:key')).toBeNull()
      expect(adapter.getItem('other:key')).not.toBeNull()
    })
  })

  describe('getExpiry', () => {
    let adapter: MemoryStorageAdapter

    beforeEach(() => {
      adapter = new MemoryStorageAdapter()
    })

    it('returns null for missing key', () => {
      expect(TTLManager.getExpiry(adapter, 'missing')).toBeNull()
    })

    it('returns Date for key with exp', () => {
      const exp = Date.now() + 60_000
      adapter.setItem('k', JSON.stringify({ v: 1, d: '', exp, ts: 0 }))
      const result = TTLManager.getExpiry(adapter, 'k')
      expect(result).toBeInstanceOf(Date)
      expect(result!.getTime()).toBe(exp)
    })

    it('returns null for key with exp=null', () => {
      adapter.setItem('k', JSON.stringify({ v: 1, d: '', exp: null, ts: 0 }))
      expect(TTLManager.getExpiry(adapter, 'k')).toBeNull()
    })
  })
})
