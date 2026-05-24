import type { StorageAdapter } from '../core/types'

export class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key)
  }

  setItem(key: string, val: string): void {
    window.localStorage.setItem(key, val)
  }

  removeItem(key: string): void {
    window.localStorage.removeItem(key)
  }

  keys(): string[] {
    return Object.keys(window.localStorage)
  }
}
