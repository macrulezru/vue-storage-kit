import type { StorageAdapter } from '../core/types'
import { IndexedDBAdapter } from './IndexedDBAdapter'

// Backing store used when useStorage()'s `target: 'indexeddb'` is selected.
// This is a plain key-value view over a single dedicated object store — for
// custom database/store names, multiple stores, or indexes, use
// useIndexedDB()/useIDBRef() instead.
const DB_NAME = 'vue-storage-kit'
const STORE_NAME = 'kv'

export class IndexedDBStorageAdapter implements StorageAdapter {
  private readonly idb = new IndexedDBAdapter(DB_NAME, STORE_NAME)

  async getItem(key: string): Promise<string | null> {
    return this.idb.get<string>(key)
  }

  async setItem(key: string, val: string): Promise<void> {
    await this.idb.set(key, val)
  }

  async removeItem(key: string): Promise<void> {
    await this.idb.delete(key)
  }

  async keys(): Promise<string[]> {
    const keys = await this.idb.keys()
    return keys.map((k) => String(k))
  }
}
