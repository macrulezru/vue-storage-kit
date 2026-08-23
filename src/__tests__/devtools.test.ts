import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { _clearEngineCache, acquireEngine, releaseEngine } from '../engine/engineCache'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

const INSPECTOR_ID = 'vue-storage-kit-inspector'
const TIMELINE_LAYER_ID = 'vue-storage-kit-timeline'

const addInspector = vi.fn()
const addTimelineLayer = vi.fn()
const addTimelineEvent = vi.fn()
const sendInspectorTree = vi.fn()
const sendInspectorState = vi.fn()
let getInspectorTreeHandler: ((payload: { inspectorId: string; filter: string; rootNodes: unknown[] }) => void) | null = null
let getInspectorStateHandler: ((payload: { inspectorId: string; nodeId: string; state: unknown }) => void) | null = null

const fakeApi = {
  addInspector,
  addTimelineLayer,
  addTimelineEvent,
  on: {
    getInspectorTree: (h: typeof getInspectorTreeHandler) => { getInspectorTreeHandler = h },
    getInspectorState: (h: typeof getInspectorStateHandler) => { getInspectorStateHandler = h },
  },
  sendInspectorTree,
  sendInspectorState,
}

vi.mock('@vue/devtools-api', () => ({
  setupDevtoolsPlugin: vi.fn((_descriptor: unknown, setupFn: (api: typeof fakeApi) => void) => setupFn(fakeApi)),
}))

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  addInspector.mockClear()
  addTimelineLayer.mockClear()
  addTimelineEvent.mockClear()
  sendInspectorTree.mockClear()
  sendInspectorState.mockClear()
  getInspectorTreeHandler = null
  getInspectorStateHandler = null
  _clearInstanceCache()
  _clearEngineCache()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockImplementation(() => new MemoryStorageAdapter())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('devtools', () => {
  it('registers a custom inspector and a timeline layer', async () => {
    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    expect(addInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: INSPECTOR_ID, label: 'Storage Kit' }),
    )
    expect(addTimelineLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: TIMELINE_LAYER_ID, label: 'Storage Kit' }),
    )
  })

  it('lists live useStorage() instances in the inspector tree', async () => {
    withScope(() => useStorage('alpha', { defaultValue: 1, target: 'memory' }))
    withScope(() => useStorage('beta', { defaultValue: 2, target: 'local' }))

    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    const payload = { inspectorId: INSPECTOR_ID, filter: '', rootNodes: [] as { id: string; label: string }[] }
    getInspectorTreeHandler!(payload)

    expect(payload.rootNodes).toHaveLength(2)
    expect(payload.rootNodes.map((n) => n.label)).toEqual(expect.arrayContaining(['alpha', 'beta']))
  })

  it('also lists engines created outside of Vue (e.g. the React hook)', async () => {
    // Simulates what src/react/useStorage.ts does — acquiring an engine
    // directly, without going through Vue's useStorage()/wrapperCache.
    const { engine, cacheKey } = acquireEngine('react-key', { defaultValue: 0, target: 'memory' })
    await engine.ready

    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    const payload = { inspectorId: INSPECTOR_ID, filter: '', rootNodes: [] as { label: string }[] }
    getInspectorTreeHandler!(payload)

    expect(payload.rootNodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'react-key' })]),
    )
    releaseEngine(cacheKey)
  })

  it('ignores getInspectorTree calls for other inspectors', async () => {
    withScope(() => useStorage('alpha', { defaultValue: 1, target: 'memory' }))

    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    const payload = { inspectorId: 'some-other-inspector', filter: '', rootNodes: [] as unknown[] }
    getInspectorTreeHandler!(payload)

    expect(payload.rootNodes).toHaveLength(0)
  })

  it('filters the tree by key', async () => {
    withScope(() => useStorage('alpha', { defaultValue: 1, target: 'memory' }))
    withScope(() => useStorage('beta', { defaultValue: 2, target: 'memory' }))

    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    const payload = { inspectorId: INSPECTOR_ID, filter: 'alp', rootNodes: [] as { label: string }[] }
    getInspectorTreeHandler!(payload)

    expect(payload.rootNodes).toEqual([expect.objectContaining({ label: 'alpha' })])
  })

  it('reports live state (value/target/isReady/expiry/canUndo/canRedo) for a selected node', async () => {
    const { value } = withScope(() =>
      useStorage('gamma', { defaultValue: 'x', target: 'memory', history: 3 }),
    )
    await vi.advanceTimersByTimeAsync(10)
    value.value = 'updated'
    await vi.advanceTimersByTimeAsync(10)

    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    const treePayload = { inspectorId: INSPECTOR_ID, filter: '', rootNodes: [] as { id: string }[] }
    getInspectorTreeHandler!(treePayload)
    const nodeId = treePayload.rootNodes[0].id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statePayload: any = { inspectorId: INSPECTOR_ID, nodeId, state: undefined }
    getInspectorStateHandler!(statePayload)

    const entries = statePayload.state.Storage as { key: string; value: unknown }[]
    expect(entries.find((e) => e.key === 'value')?.value).toBe('updated')
    expect(entries.find((e) => e.key === 'target')?.value).toBe('memory')
    expect(entries.find((e) => e.key === 'isReady')?.value).toBe(true)
    expect(entries.find((e) => e.key === 'canUndo')?.value).toBe(true)
    expect(entries.find((e) => e.key === 'canRedo')?.value).toBe(false)
  })

  it('periodically pushes tree/state updates to devtools', async () => {
    const { setupDevtools } = await import('../devtools/index')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setupDevtools({} as any)

    expect(sendInspectorTree).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)

    expect(sendInspectorTree).toHaveBeenCalledWith(INSPECTOR_ID)
    expect(sendInspectorState).toHaveBeenCalledWith(INSPECTOR_ID)
  })

  describe('timeline', () => {
    it('logs a write event for an instance that already existed at setup time', async () => {
      const { value } = withScope(() =>
        useStorage('delta', { defaultValue: 0, target: 'memory' }),
      )
      await vi.advanceTimersByTimeAsync(10)

      const { setupDevtools } = await import('../devtools/index')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setupDevtools({} as any)

      value.value = 1
      await vi.advanceTimersByTimeAsync(10)

      expect(addTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          layerId: TIMELINE_LAYER_ID,
          event: expect.objectContaining({ title: 'write: delta', logType: 'default' }),
        }),
      )
    })

    it('logs events for an instance created after devtools was set up', async () => {
      const { setupDevtools } = await import('../devtools/index')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setupDevtools({} as any)

      const { value } = withScope(() =>
        useStorage('epsilon', { defaultValue: 0, target: 'memory' }),
      )
      await vi.advanceTimersByTimeAsync(10)
      value.value = 1
      await vi.advanceTimersByTimeAsync(10)

      expect(addTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ title: 'write: epsilon' }),
        }),
      )
    })

    it('logs an expire event with logType warning', async () => {
      const adapter = new MemoryStorageAdapter()
      vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
      await adapter.setItem('zeta', JSON.stringify({ v: 1, d: '"x"', exp: Date.now() - 1, ts: 0 }))

      const { setupDevtools } = await import('../devtools/index')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setupDevtools({} as any)

      withScope(() => useStorage('zeta', { defaultValue: 'default', target: 'memory' }))
      await vi.advanceTimersByTimeAsync(10)

      expect(addTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ title: 'expire: zeta', logType: 'warning' }),
        }),
      )
    })
  })
})
