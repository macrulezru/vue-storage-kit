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

  static cleanExpired(adapter: StorageAdapter, prefix = ''): void {
    for (const key of adapter.keys()) {
      if (prefix && !key.startsWith(prefix)) continue
      const raw = adapter.getItem(key)
      if (!raw) continue
      try {
        const envelope = JSON.parse(raw) as { exp?: number | null }
        if (envelope.exp != null && TTLManager.isExpired(envelope.exp)) {
          adapter.removeItem(key)
        }
      } catch {
        // not an envelope — skip
      }
    }
  }

  static getExpiry(adapter: StorageAdapter, key: string): Date | null {
    const raw = adapter.getItem(key)
    if (!raw) return null
    try {
      const envelope = JSON.parse(raw) as { exp?: number | null }
      return envelope.exp ? new Date(envelope.exp) : null
    } catch {
      return null
    }
  }
}
