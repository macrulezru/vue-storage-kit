import { describe, it, expect } from 'vitest'
import { parseCookieHeader } from '../core/cookieUtils'

describe('parseCookieHeader', () => {
  it('returns {} for an empty/missing header', () => {
    expect(parseCookieHeader(undefined)).toEqual({})
    expect(parseCookieHeader(null)).toEqual({})
    expect(parseCookieHeader('')).toEqual({})
  })

  it('parses and decodes normal cookie pairs', () => {
    expect(parseCookieHeader('a=1; b=%22hi%22')).toEqual({ a: '1', b: '"hi"' })
  })

  it('falls back to the raw value for a malformed percent-escape instead of throwing', () => {
    // decodeURIComponent('%') / decodeURIComponent('%E0%A4%A') throw
    // URIError — a cookie header is client-supplied (SSR reads it straight
    // off the request), so this must degrade gracefully, not crash parsing
    // of the whole header.
    expect(() => parseCookieHeader('bad=%; good=1')).not.toThrow()
    expect(parseCookieHeader('bad=%; good=1')).toEqual({ bad: '%', good: '1' })
  })

  it('does not let one malformed pair prevent other pairs from parsing', () => {
    const result = parseCookieHeader('before=%22x%22; broken=%E0%A4%A; after=%22y%22')
    expect(result.before).toBe('"x"')
    expect(result.broken).toBe('%E0%A4%A')
    expect(result.after).toBe('"y"')
  })
})
