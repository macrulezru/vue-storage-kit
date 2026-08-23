import type { StorageAdapter } from './types'

export class TTLManager {
  static isExpired(exp: number | null): boolean {
    if (exp === null) return false
    return Date.now() > exp
  }

  static computeExp(ttl: number | undefined): number | null {
    if (!ttl || ttl === 0) return null
    return Date.now() + ttl
  }

  static async cleanExpired(adapter: StorageAdapter, prefix = ''): Promise<void> {
    for (const key of await adapter.keys()) {
      if (prefix && !key.startsWith(prefix)) continue
      const raw = await adapter.getItem(key)
      if (!raw) continue
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
    try {
      const envelope = JSON.parse(raw) as { exp?: number | null }
      return envelope.exp ? new Date(envelope.exp) : null
    } catch {
      return null
    }
  }
}
