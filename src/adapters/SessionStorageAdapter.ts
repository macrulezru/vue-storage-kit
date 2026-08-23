import type { StorageAdapter } from '../core/types'

export class SessionStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    return window.sessionStorage.getItem(key)
  }

  async setItem(key: string, val: string): Promise<void> {
    window.sessionStorage.setItem(key, val)
  }

  async removeItem(key: string): Promise<void> {
    window.sessionStorage.removeItem(key)
  }

  async keys(): Promise<string[]> {
    return Object.keys(window.sessionStorage)
  }
}
