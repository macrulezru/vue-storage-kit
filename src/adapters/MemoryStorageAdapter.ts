import type { StorageAdapter } from '../core/types'

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>()

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async setItem(key: string, val: string): Promise<void> {
    this.store.set(key, val)
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key)
  }

  async keys(): Promise<string[]> {
    return [...this.store.keys()]
  }

  clear(): void {
    this.store.clear()
  }
}
