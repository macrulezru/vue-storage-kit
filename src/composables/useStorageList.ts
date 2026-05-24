import { computed, type ComputedRef } from 'vue'
import { useStorage } from './useStorage'
import type { StorageOptions, StorageError } from '../core/types'
import type { Ref } from 'vue'

export interface UseStorageListOptions<T extends object> extends Omit<StorageOptions<T[]>, 'defaultValue'> {
  keyField?: keyof T & string
}

export interface UseStorageListReturn<T extends object> {
  items: Ref<T[]>
  isReady: Ref<boolean>
  error: Ref<StorageError | null>
  add(item: T): void
  update(id: unknown, patch: Partial<T>): void
  remove(id: unknown): void
  find(id: unknown): ComputedRef<T | undefined>
  findAll(predicate: (item: T) => boolean): ComputedRef<T[]>
  clear(): void
  set(items: T[]): void
}

export function useStorageList<T extends object>(
  key: string,
  options: UseStorageListOptions<T> = {},
): UseStorageListReturn<T> {
  const { keyField = 'id' as keyof T & string, ...storageOpts } = options

  const { value: items, isReady, error, remove: _remove } = useStorage<T[]>(key, {
    ...storageOpts,
    defaultValue: [],
  })

  function getKey(item: T): unknown {
    return (item as Record<string, unknown>)[keyField as string]
  }

  function add(item: T): void {
    items.value = [...items.value, item]
  }

  function update(id: unknown, patch: Partial<T>): void {
    items.value = items.value.map((item) =>
      getKey(item) === id ? { ...item, ...patch } : item,
    )
  }

  function remove(id: unknown): void {
    items.value = items.value.filter((item) => getKey(item) !== id)
  }

  function find(id: unknown): ComputedRef<T | undefined> {
    return computed(() => items.value.find((item) => getKey(item) === id))
  }

  function findAll(predicate: (item: T) => boolean): ComputedRef<T[]> {
    return computed(() => items.value.filter(predicate))
  }

  function clear(): void {
    _remove()
  }

  function set(newItems: T[]): void {
    items.value = newItems
  }

  return { items, isReady, error, add, update, remove, find, findAll, clear, set }
}
