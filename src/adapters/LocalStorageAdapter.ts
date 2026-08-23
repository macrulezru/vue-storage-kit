import type { StorageAdapter } from '../core/types'

export class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return window.localStorage.getItem(key)
  }

  async setItem(key: string, val: string): Promise<void> {
    window.localStorage.setItem(key, val)
  }

  async removeItem(key: string): Promise<void> {
    window.localStorage.removeItem(key)
  }

  async keys(): Promise<string[]> {
    return Object.keys(window.localStorage)
  }
}
