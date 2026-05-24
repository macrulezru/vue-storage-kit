import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import type { StorageTarget } from '../core/types'

// ─── Quota ────────────────────────────────────────────────────────────────────

export interface StorageQuota {
  quota: number
  usage: number
  usagePercent: number
}

export async function getStorageQuota(): Promise<StorageQuota> {
  if (typeof navigator !== 'undefined' && 'storage' in navigator) {
    const estimate = await navigator.storage.estimate()
    const quota = estimate.quota ?? 0
    const usage = estimate.usage ?? 0
    return {
      quota,
      usage,
      usagePercent: quota > 0 ? Math.round((usage / quota) * 10_000) / 100 : 0,
    }
  }
  return { quota: 0, usage: 0, usagePercent: 0 }
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export type StorageSnapshot = Record<string, string>

export function exportStorage(target: StorageTarget = 'local', prefix = ''): StorageSnapshot {
  const adapter = StorageAdapterFactory.get(target)
  const result: StorageSnapshot = {}
  for (const key of adapter.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      const val = adapter.getItem(key)
      if (val !== null) result[key] = val
    }
  }
  return result
}

export function importStorage(
  snapshot: StorageSnapshot,
  target: StorageTarget = 'local',
  options: { overwrite?: boolean } = {},
): void {
  const { overwrite = true } = options
  const adapter = StorageAdapterFactory.get(target)
  for (const [key, val] of Object.entries(snapshot)) {
    if (!overwrite && adapter.getItem(key) !== null) continue
    adapter.setItem(key, val)
  }
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function clearStorage(target: StorageTarget = 'local', prefix = ''): void {
  const adapter = StorageAdapterFactory.get(target)
  const toRemove = prefix
    ? adapter.keys().filter((k) => k.startsWith(prefix))
    : adapter.keys()
  for (const key of toRemove) {
    adapter.removeItem(key)
  }
}
