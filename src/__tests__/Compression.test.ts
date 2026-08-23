import { describe, it, expect } from 'vitest'
import { compress, decompress, isCompressed, CompressAdapter } from '../compress/Compression'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

describe('compress / decompress', () => {
  it('round-trips a string through gzip (default algorithm)', async () => {
    const original = 'hello '.repeat(50)
    const compressed = await compress(original)
    expect(isCompressed(compressed)).toBe(true)
    expect(compressed).not.toBe(original)

    const restored = await decompress(compressed)
    expect(restored).toBe(original)
  })

  it('supports deflate and deflate-raw algorithms', async () => {
    const original = JSON.stringify({ a: 1, b: 'x'.repeat(100) })

    for (const algorithm of ['deflate', 'deflate-raw'] as const) {
      const compressed = await compress(original, { algorithm })
      expect(compressed.startsWith(`vsk:${algorithm}:`)).toBe(true)
      expect(await decompress(compressed, { algorithm })).toBe(original)
    }
  })

  it('produces smaller output for repetitive data', async () => {
    const original = 'a'.repeat(2000)
    const compressed = await compress(original)
    expect(compressed.length).toBeLessThan(original.length)
  })

  it('decompress() passes through data without the magic prefix unchanged', async () => {
    expect(await decompress('plain data')).toBe('plain data')
    expect(await decompress('')).toBe('')
  })

  it('decompress() passes through malformed vsk:-prefixed data unchanged', async () => {
    const malformed = 'vsk:no-colon-separator'
    expect(await decompress(malformed)).toBe(malformed)
  })

  it('isCompressed() detects the magic prefix', async () => {
    expect(isCompressed('vsk:gzip:abc')).toBe(true)
    expect(isCompressed('plain')).toBe(false)
    expect(isCompressed('')).toBe(false)
  })
})

describe('CompressAdapter', () => {
  it('getItem/setItem pass values through uncompressed', async () => {
    const inner = new MemoryStorageAdapter()
    const adapter = new CompressAdapter(inner)

    await adapter.setItem('k', 'plain-value')
    expect(await adapter.getItem('k')).toBe('plain-value')
    expect(await inner.getItem('k')).toBe('plain-value')
  })

  it('setCompressed() stores a compressed value; getDecompressed() restores it', async () => {
    const inner = new MemoryStorageAdapter()
    const adapter = new CompressAdapter(inner)
    const original = 'y'.repeat(500)

    await adapter.setCompressed('k', original)

    const rawStored = await inner.getItem('k')
    expect(isCompressed(rawStored!)).toBe(true)

    expect(await adapter.getDecompressed('k')).toBe(original)
  })

  it('getDecompressed() returns null for a missing key', async () => {
    const adapter = new CompressAdapter(new MemoryStorageAdapter())
    expect(await adapter.getDecompressed('missing')).toBeNull()
  })

  it('removeItem() and keys() delegate to the inner adapter', async () => {
    const inner = new MemoryStorageAdapter()
    const adapter = new CompressAdapter(inner)

    await adapter.setItem('a', '1')
    await adapter.setItem('b', '2')
    expect(await adapter.keys()).toEqual(expect.arrayContaining(['a', 'b']))

    await adapter.removeItem('a')
    expect(await adapter.getItem('a')).toBeNull()
    expect(await inner.getItem('a')).toBeNull()
  })
})
