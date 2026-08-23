import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStorage } from '../react/useStorage'
import { _clearEngineCache } from '../engine/engineCache'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

let adapter: MemoryStorageAdapter

beforeEach(() => {
  adapter = new MemoryStorageAdapter()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
  _clearEngineCache()
})

describe('react useStorage', () => {
  it('starts with defaultValue, then flips isReady', async () => {
    const { result } = renderHook(() => useStorage('k', { defaultValue: 'x', target: 'memory' }))

    expect(result.current.value).toBe('x')
    await waitFor(() => expect(result.current.isReady).toBe(true))
  })

  it('reads an existing value from storage on mount', async () => {
    await adapter.setItem('k', JSON.stringify({ v: 1, d: '"stored"', exp: null, ts: Date.now() }))

    const { result } = renderHook(() => useStorage('k', { defaultValue: 'default', target: 'memory' }))
    await waitFor(() => expect(result.current.isReady).toBe(true))

    expect(result.current.value).toBe('stored')
  })

  it('setValue updates the returned value and persists to storage', async () => {
    const { result } = renderHook(() => useStorage('k', { defaultValue: 0, target: 'memory' }))
    await waitFor(() => expect(result.current.isReady).toBe(true))

    act(() => {
      result.current.setValue(5)
    })

    expect(result.current.value).toBe(5)
    await waitFor(async () => expect(await adapter.getItem('k')).not.toBeNull())
  })

  it('setValue accepts a functional updater', async () => {
    const { result } = renderHook(() => useStorage('k', { defaultValue: 1, target: 'memory' }))
    await waitFor(() => expect(result.current.isReady).toBe(true))

    act(() => {
      result.current.setValue((prev) => prev + 1)
    })

    expect(result.current.value).toBe(2)
  })

  it('remove() resets to defaultValue and clears storage', async () => {
    const { result } = renderHook(() => useStorage('k', { defaultValue: 'default', target: 'memory' }))
    await waitFor(() => expect(result.current.isReady).toBe(true))

    act(() => result.current.setValue('changed'))
    await waitFor(async () => expect(await adapter.getItem('k')).not.toBeNull())

    act(() => result.current.remove())
    expect(result.current.value).toBe('default')
    await waitFor(async () => expect(await adapter.getItem('k')).toBeNull())
  })

  it('undo/redo work when history is enabled', async () => {
    const { result } = renderHook(() =>
      useStorage('k', { defaultValue: 0, target: 'memory', history: 5 }),
    )
    await waitFor(() => expect(result.current.isReady).toBe(true))

    act(() => result.current.setValue(1))
    act(() => result.current.setValue(2))
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.value).toBe(1)
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(result.current.value).toBe(2)
  })

  it('reports errors via the error field', async () => {
    const boom = new Error('write exploded')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw boom
    })

    const { result } = renderHook(() => useStorage('k', { defaultValue: 0, target: 'memory' }))
    await waitFor(() => expect(result.current.isReady).toBe(true))

    act(() => result.current.setValue(1))

    await waitFor(() =>
      expect(result.current.error).toEqual(
        expect.objectContaining({ type: 'write-failed', error: boom }),
      ),
    )
  })

  it('two hook instances for the same key+target share the underlying engine', async () => {
    const a = renderHook(() => useStorage('shared', { defaultValue: 0, target: 'memory' }))
    const b = renderHook(() => useStorage('shared', { defaultValue: 0, target: 'memory' }))
    await waitFor(() => expect(a.result.current.isReady).toBe(true))
    await waitFor(() => expect(b.result.current.isReady).toBe(true))

    act(() => a.result.current.setValue(42))

    await waitFor(() => expect(b.result.current.value).toBe(42))
  })

  it('releases the engine on unmount (last consumer disposes it)', async () => {
    const { result, unmount } = renderHook(() =>
      useStorage('to-release', { defaultValue: 0, target: 'memory' }),
    )
    await waitFor(() => expect(result.current.isReady).toBe(true))

    unmount()

    // Remounting should create a *fresh* engine (re-reads defaultValue, not
    // whatever the disposed instance last held in memory) — a cheap proxy
    // for "the previous engine really was released."
    const again = renderHook(() =>
      useStorage('to-release', { defaultValue: 'fresh', target: 'memory' }),
    )
    expect(again.result.current.value).toBe('fresh')
  })
})
