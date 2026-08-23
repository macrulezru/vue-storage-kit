import type { StorageAdapter } from './types'

export interface StoredMeta {
  exp: number | null
  ts: number
}

export class TTLManager {
  static isExpired(exp: number | null): boolean {
    if (exp === null) return false
    return Date.now() > exp
  }

  static computeExp(ttl: number | undefined): number | null {
    if (!ttl || ttl === 0) return null
    return Date.now() + ttl
  }

  /**
   * Wraps a (possibly compress/encrypt/sign-transformed) stored value with
   * a small, always-plaintext `exp`/`ts` header. Without this, `exp`/`ts`
   * end up buried inside the transformed payload — unreadable by anything
   * that doesn't know this specific key's encryption settings. cleanExpired()
   * (TTL sweep) and evictOnQuota's LRU eviction both need to read these for
   * *arbitrary* keys during quota recovery, not just keys sharing this
   * engine's own password/options.
   */
  static wrapWithMeta(raw: string, meta: StoredMeta): string {
    return `${JSON.stringify(meta)}|${raw}`
  }

  /**
   * Reverses wrapWithMeta(). Returns null if `raw` has no recognizable
   * header — data written before this header existed, or seeded directly
   * (e.g. in a test) — callers should fall back to their own way of finding
   * what they need in that case.
   */
  static unwrapMeta(raw: string): (StoredMeta & { payload: string }) | null {
    const sep = raw.indexOf('|')
    if (sep === -1) return null
    try {
      const meta = JSON.parse(raw.slice(0, sep)) as Partial<StoredMeta>
      if (typeof meta.ts !== 'number') return null
      return { exp: meta.exp ?? null, ts: meta.ts, payload: raw.slice(sep + 1) }
    } catch {
      return null
    }
  }

  static async cleanExpired(adapter: StorageAdapter, prefix = ''): Promise<void> {
    for (const key of await adapter.keys()) {
      if (prefix && !key.startsWith(prefix)) continue
      const raw = await adapter.getItem(key)
      if (!raw) continue

      const meta = TTLManager.unwrapMeta(raw)
      if (meta) {
        if (meta.exp != null && TTLManager.isExpired(meta.exp)) {
          await adapter.removeItem(key)
        }
        continue
      }

      // No meta header — fall back to reading `exp` off a plain,
      // untransformed envelope; a compressed/encrypted/signed value written
      // before the header existed can't be judged and is left alone.
      try {
        const envelope = JSON.parse(raw) as { exp?: number | null }
        if (envelope.exp != null && TTLManager.isExpired(envelope.exp)) {
          await adapter.removeItem(key)
        }
      } catch {
        // not an envelope — skip
      }
    }
  }

  static async getExpiry(adapter: StorageAdapter, key: string): Promise<Date | null> {
    const raw = await adapter.getItem(key)
    if (!raw) return null

    const meta = TTLManager.unwrapMeta(raw)
    if (meta) return meta.exp ? new Date(meta.exp) : null

    try {
      const envelope = JSON.parse(raw) as { exp?: number | null }
      return envelope.exp ? new Date(envelope.exp) : null
    } catch {
      return null
    }
  }
}
