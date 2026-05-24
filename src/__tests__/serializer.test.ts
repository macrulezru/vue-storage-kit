import { describe, it, expect } from 'vitest'
import { createJSONSerializer } from '../core/serializer'

describe('createJSONSerializer', () => {
  const s = createJSONSerializer<unknown>()

  it('round-trips primitives', () => {
    expect(s.deserialize(s.serialize(42))).toBe(42)
    expect(s.deserialize(s.serialize('hello'))).toBe('hello')
    expect(s.deserialize(s.serialize(true))).toBe(true)
    expect(s.deserialize(s.serialize(null))).toBeNull()
  })

  it('round-trips a Date', () => {
    const d = new Date('2024-03-15T10:00:00.000Z')
    const result = s.deserialize(s.serialize(d))
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).toISOString()).toBe(d.toISOString())
  })

  it('round-trips a Map', () => {
    const m = new Map([['a', 1], ['b', 2]])
    const result = s.deserialize(s.serialize(m)) as Map<string, number>
    expect(result).toBeInstanceOf(Map)
    expect(result.get('a')).toBe(1)
    expect(result.get('b')).toBe(2)
  })

  it('round-trips a Set', () => {
    const set = new Set([1, 2, 3])
    const result = s.deserialize(s.serialize(set)) as Set<number>
    expect(result).toBeInstanceOf(Set)
    expect([...result]).toEqual([1, 2, 3])
  })

  it('round-trips undefined inside an object', () => {
    const obj = { a: 1, b: undefined }
    const result = s.deserialize(s.serialize(obj)) as typeof obj
    expect(result.a).toBe(1)
    expect(result.b).toBeUndefined()
  })

  it('round-trips a BigInt', () => {
    const big = BigInt('9007199254740993')
    const result = s.deserialize(s.serialize(big))
    expect(typeof result).toBe('bigint')
    expect(result).toBe(big)
  })

  it('round-trips BigInt inside an object', () => {
    const obj = { id: BigInt(42), name: 'test' }
    const result = s.deserialize(s.serialize(obj)) as typeof obj
    expect(typeof result.id).toBe('bigint')
    expect(result.id).toBe(BigInt(42))
    expect(result.name).toBe('test')
  })

  it('round-trips nested complex types', () => {
    const obj = {
      date: new Date('2024-01-01'),
      items: new Set([1, 2]),
      meta: new Map([['key', new Date('2024-06-01')]]),
    }
    const result = s.deserialize(s.serialize(obj)) as typeof obj
    expect(result.date).toBeInstanceOf(Date)
    expect(result.items).toBeInstanceOf(Set)
    expect(result.meta).toBeInstanceOf(Map)
    expect(result.meta.get('key')).toBeInstanceOf(Date)
  })
})
