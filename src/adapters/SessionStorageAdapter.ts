import type { StorageAdapter } from '../core/types'

export class SessionStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    return window.sessionStorage.getItem(key)
  }

  setItem(key: string, val: string): void {
    window.sessionStorage.setItem(key, val)
  }

  removeItem(key: string): void {
    window.sessionStorage.removeItem(key)
  }

  keys(): string[] {
    return Object.keys(window.sessionStorage)
  }
}
