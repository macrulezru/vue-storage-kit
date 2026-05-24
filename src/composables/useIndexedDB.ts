import {
  ref,
  watch,
  nextTick,
  getCurrentScope,
  onScopeDispose,
  type Ref,
} from 'vue'
import { IndexedDBAdapter, type IDBIndexDefinition } from '../adapters/IndexedDBAdapter'
import type { StorageError } from '../core/types'

export type { IDBIndexDefinition }

export interface UseIndexedDBOptions {
  indexes?: IDBIndexDefinition[]
  version?: number
}

export interface UseIndexedDBReturn<T> {
  get(key: IDBValidKey): Promise<T | null>
  set(key: IDBValidKey, value: T): Promise<void>
  delete(key: IDBValidKey): Promise<void>
  keys(): Promise<IDBValidKey[]>
  getAll(): Promise<T[]>
  clear(): Promise<void>
  count(): Promise<number>
  transaction<R>(fn: (store: IDBObjectStore) => IDBRequest<R>): Promise<R>
  getByIndex(indexName: string, value: IDBValidKey): Promise<T | null>
  getAllByIndex(indexName: string, value: IDBValidKey): Promise<T[]>
}

export interface UseIDBRefReturn<T> {
  value: Ref<T>
  isReady: Ref<boolean>
  error: Ref<StorageError | null>
}

export function useIndexedDB<T>(
  dbName: string,
  storeName: string,
  onError?: (err: StorageError) => void,
  options: UseIndexedDBOptions = {},
): UseIndexedDBReturn<T> {
  const adapter = new IndexedDBAdapter(
    dbName,
    storeName,
    options.version ?? 1,
    options.indexes ?? [],
  )

  function reportError(e: unknown): void {
    onError?.({ type: 'parse-error', key: storeName, raw: String(e) })
  }

  async function get(key: IDBValidKey): Promise<T | null> {
    try { return await adapter.get<T>(key) } catch (e) { reportError(e); return null }
  }

  async function set(key: IDBValidKey, value: T): Promise<void> {
    try { await adapter.set(key, value) } catch (e) { reportError(e) }
  }

  async function del(key: IDBValidKey): Promise<void> {
    try { await adapter.delete(key) } catch (e) { reportError(e) }
  }

  async function keys(): Promise<IDBValidKey[]> {
    try { return await adapter.keys() } catch (e) { reportError(e); return [] }
  }

  async function getAll(): Promise<T[]> {
    try { return await adapter.getAll<T>() } catch (e) { reportError(e); return [] }
  }

  async function clear(): Promise<void> {
    try { await adapter.clear() } catch (e) { reportError(e) }
  }

  async function count(): Promise<number> {
    try { return await adapter.count() } catch (e) { reportError(e); return 0 }
  }

  async function transaction<R>(fn: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    return adapter.transaction(fn)
  }

  async function getByIndex(indexName: string, value: IDBValidKey): Promise<T | null> {
    try { return await adapter.getByIndex<T>(indexName, value) } catch (e) { reportError(e); return null }
  }

  async function getAllByIndex(indexName: string, value: IDBValidKey): Promise<T[]> {
    try { return await adapter.getAllByIndex<T>(indexName, value) } catch (e) { reportError(e); return [] }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => adapter.close())
  }

  return { get, set, delete: del, keys, getAll, clear, count, transaction, getByIndex, getAllByIndex }
}

export function useIDBRef<T>(
  dbName: string,
  storeName: string,
  key: IDBValidKey,
  defaultValue: T,
): UseIDBRefReturn<T> {
  const adapter = new IndexedDBAdapter(dbName, storeName)
  const value = ref<T>(defaultValue) as Ref<T>
  const isReady = ref(false)
  const error = ref<StorageError | null>(null)
  let _skipWrite = false

  // Watcher set up BEFORE init so writes after isReady are persisted
  const stopWatch = watch(
    value,
    async (newVal) => {
      if (_skipWrite) return
      try {
        await adapter.set(key, newVal)
      } catch (e) {
        error.value = { type: 'parse-error', key: String(key), raw: String(e) }
      }
    },
    { deep: true, flush: 'sync' },
  )

  async function init(): Promise<void> {
    const stored = await adapter.get<T>(key)
    // Suppress the watcher while populating from storage
    _skipWrite = true
    value.value = stored ?? defaultValue
    nextTick(() => {
      _skipWrite = false
      isReady.value = true
    })
  }

  init().catch((e: unknown) => {
    error.value = { type: 'parse-error', key: String(key), raw: String(e) }
    isReady.value = true
  })

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      adapter.close()
    })
  }

  return { value, isReady, error }
}
