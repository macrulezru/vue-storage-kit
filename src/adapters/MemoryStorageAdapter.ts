import type { StorageAdapter } from '../core/types'

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, val: string): void {
    this.store.set(key, val)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  keys(): string[] {
    return [...this.store.keys()]
  }

  clear(): void {
    this.store.clear()
  }
}
