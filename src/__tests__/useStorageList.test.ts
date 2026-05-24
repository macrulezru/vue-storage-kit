import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'
import { useStorageList } from '../composables/useStorageList'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { _clearInstanceCache } from '../composables/useStorage'

interface Item {
  id: number
  name: string
}

let adapter: MemoryStorageAdapter

beforeEach(() => {
  _clearInstanceCache()
  adapter = new MemoryStorageAdapter()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
})

describe('useStorageList', () => {
  it('starts with an empty list', () => {
    const scope = effectScope()
    const { items } = scope.run(() => useStorageList<Item>('list'))!
    expect(items.value).toEqual([])
    scope.stop()
  })

  it('add() appends an item', () => {
    const scope = effectScope()
    const { items, add } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    expect(items.value).toEqual([{ id: 1, name: 'Alice' }])
    scope.stop()
  })

  it('add() multiple items accumulates them', () => {
    const scope = effectScope()
    const { items, add } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    add({ id: 2, name: 'Bob' })
    expect(items.value).toHaveLength(2)
    scope.stop()
  })

  it('remove() deletes item by id', () => {
    const scope = effectScope()
    const { items, add, remove } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    add({ id: 2, name: 'Bob' })
    remove(1)
    expect(items.value).toEqual([{ id: 2, name: 'Bob' }])
    scope.stop()
  })

  it('update() patches item by id', () => {
    const scope = effectScope()
    const { items, add, update } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    update(1, { name: 'Alicia' })
    expect(items.value[0].name).toBe('Alicia')
    scope.stop()
  })

  it('update() leaves other items unchanged', () => {
    const scope = effectScope()
    const { items, add, update } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    add({ id: 2, name: 'Bob' })
    update(1, { name: 'Alicia' })
    expect(items.value[1]).toEqual({ id: 2, name: 'Bob' })
    scope.stop()
  })

  it('find() returns computed ref for matching item', () => {
    const scope = effectScope()
    const { add, find } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 42, name: 'Alice' })
    const found = find(42)
    expect(found.value).toEqual({ id: 42, name: 'Alice' })
    scope.stop()
  })

  it('find() returns undefined for missing id', () => {
    const scope = effectScope()
    const { find } = scope.run(() => useStorageList<Item>('list'))!
    expect(find(99).value).toBeUndefined()
    scope.stop()
  })

  it('findAll() filters by predicate', () => {
    const scope = effectScope()
    const { add, findAll } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    add({ id: 2, name: 'Bob' })
    add({ id: 3, name: 'Anna' })
    const result = findAll((i) => i.name.startsWith('A'))
    expect(result.value).toHaveLength(2)
    expect(result.value.map((i) => i.id)).toEqual(expect.arrayContaining([1, 3]))
    scope.stop()
  })

  it('set() replaces all items', () => {
    const scope = effectScope()
    const { items, add, set } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    set([{ id: 10, name: 'X' }, { id: 11, name: 'Y' }])
    expect(items.value).toHaveLength(2)
    expect(items.value[0].id).toBe(10)
    scope.stop()
  })

  it('clear() empties the list', () => {
    const scope = effectScope()
    const { items, add, clear } = scope.run(() => useStorageList<Item>('list'))!
    add({ id: 1, name: 'Alice' })
    add({ id: 2, name: 'Bob' })
    clear()
    expect(items.value).toEqual([])
    scope.stop()
  })

  it('respects custom keyField', () => {
    interface Tagged { slug: string; title: string }
    const scope = effectScope()
    const { items, add, remove, find } = scope.run(() =>
      useStorageList<Tagged>('tagged', { keyField: 'slug' }),
    )!
    add({ slug: 'hello', title: 'Hello World' })
    add({ slug: 'bye', title: 'Goodbye' })
    remove('hello')
    expect(items.value).toHaveLength(1)
    expect(find('bye').value?.title).toBe('Goodbye')
    scope.stop()
  })
})
