export type CompressionAlgorithm = 'gzip' | 'deflate' | 'deflate-raw'

export interface CompressOptions {
  algorithm?: CompressionAlgorithm
}

const MAGIC = 'vsk:'

async function readStream(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

export async function compress(data: string, opts: CompressOptions = {}): Promise<string> {
  const algorithm = opts.algorithm ?? 'gzip'
  if (typeof CompressionStream === 'undefined') return data

  const encoded = new TextEncoder().encode(data)
  const stream = new CompressionStream(algorithm)
  const writer = stream.writable.getWriter()
  writer.write(encoded)
  writer.close()

  const compressed = await readStream(stream.readable)
  const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join('')
  return `${MAGIC}${algorithm}:${btoa(binary)}`
}

export async function decompress(data: string, opts: CompressOptions = {}): Promise<string> {
  if (!data.startsWith(MAGIC)) return data

  const withoutMagic = data.slice(MAGIC.length)
  const sep = withoutMagic.indexOf(':')
  if (sep === -1) return data

  const algorithm = withoutMagic.slice(0, sep) as CompressionAlgorithm
  const b64 = withoutMagic.slice(sep + 1)

  if (typeof DecompressionStream === 'undefined') return data

  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const stream = new DecompressionStream(algorithm)
  const writer = stream.writable.getWriter()
  writer.write(bytes)
  writer.close()

  const decompressed = await readStream(stream.readable)
  return new TextDecoder().decode(decompressed)
}

export function isCompressed(data: string): boolean {
  return data.startsWith(MAGIC)
}

// ─── Compressed storage adapter wrapper ──────────────────────────────────────
// Wraps any sync StorageAdapter, compressing values on write and decompressing
// on read. Initial decompression is async; use getDecompressed() instead of
// the standard getItem() when you need the original value.

import type { StorageAdapter } from '../core/types'

export class CompressAdapter implements StorageAdapter {
  constructor(
    private readonly inner: StorageAdapter,
    private readonly opts: CompressOptions = {},
  ) {}

  getItem(key: string): string | null {
    return this.inner.getItem(key)
  }

  async getDecompressed(key: string): Promise<string | null> {
    const raw = this.inner.getItem(key)
    if (raw === null) return null
    return decompress(raw, this.opts)
  }

  setItem(key: string, val: string): void {
    this.inner.setItem(key, val)
  }

  async setCompressed(key: string, val: string): Promise<void> {
    const compressed = await compress(val, this.opts)
    this.inner.setItem(key, compressed)
  }

  removeItem(key: string): void {
    this.inner.removeItem(key)
  }

  keys(): string[] {
    return this.inner.keys()
  }
}
