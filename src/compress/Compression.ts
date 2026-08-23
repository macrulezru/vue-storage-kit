import type { CompressOptions, CompressionAlgorithm } from '../core/types'

export type { CompressOptions, CompressionAlgorithm }

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

  let stream: CompressionStream
  try {
    stream = new CompressionStream(algorithm)
  } catch {
    // This runtime's CompressionStream doesn't support `algorithm` — e.g.
    // 'deflate-raw' isn't recognized until Node 21+, even though
    // CompressionStream itself exists from Node 18. Degrade the same way as
    // CompressionStream being entirely unavailable: pass through
    // uncompressed rather than throwing.
    return data
  }

  const encoded = new TextEncoder().encode(data)
  const writer = stream.writable.getWriter()
  writer.write(encoded)
  writer.close()

  const compressed = await readStream(stream.readable)
  const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join('')
  return `${MAGIC}${algorithm}:${btoa(binary)}`
}

export async function decompress(data: string, _opts: CompressOptions = {}): Promise<string> {
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

  let stream: DecompressionStream
  try {
    stream = new DecompressionStream(algorithm)
  } catch {
    // This runtime can't decode `algorithm` (see compress()'s matching
    // guard) — unlike compress(), there's no uncompressed fallback to hand
    // back here; the data was genuinely compressed with it elsewhere.
    // Returning it unchanged (instead of throwing an uncaught error deep in
    // the read pipeline) means the caller's later JSON.parse() fails
    // instead, which StorageEngine already treats as a reportable
    // parse-error with a defaultValue fallback — the same outcome as any
    // other undecodable envelope.
    return data
  }

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
// Wraps any StorageAdapter; getItem()/setItem() pass values through
// untouched (compression is opt-in per call). Use setCompressed() /
// getDecompressed() to actually compress on write / decompress on read.

import type { StorageAdapter } from '../core/types'

export class CompressAdapter implements StorageAdapter {
  constructor(
    private readonly inner: StorageAdapter,
    private readonly opts: CompressOptions = {},
  ) {}

  getItem(key: string): Promise<string | null> {
    return this.inner.getItem(key)
  }

  async getDecompressed(key: string): Promise<string | null> {
    const raw = await this.inner.getItem(key)
    if (raw === null) return null
    return decompress(raw, this.opts)
  }

  setItem(key: string, val: string): Promise<void> {
    return this.inner.setItem(key, val)
  }

  async setCompressed(key: string, val: string): Promise<void> {
    const compressed = await compress(val, this.opts)
    await this.inner.setItem(key, compressed)
  }

  removeItem(key: string): Promise<void> {
    return this.inner.removeItem(key)
  }

  keys(): Promise<string[]> {
    return this.inner.keys()
  }
}
