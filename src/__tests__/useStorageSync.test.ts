import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useStorage, _clearInstanceCache } from '../composables/useStorage'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'

// ─── BroadcastChannel mock ────────────────────────────────────────────────────

class MockBroadcastChannel {
  private static channels = new Map<string, Set<MockBroadcastChannel>>()
  private listeners: ((e: MessageEvent) => void)[] = []

  constructor(public readonly name: string) {
    const set = MockBroadcastChannel.channels.get(name) ?? new Set()
    set.add(this)
    MockBroadcastChannel.channels.set(name, set)
  }

  postMessage(data: unknown): void {
    const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set()
    for (const peer of peers) {
      if (peer !== this) {
        peer.listeners.forEach((fn) => fn({ data } as MessageEvent))
      }
    }
  }

  static deliverTo(channelName: string, data: unknown): void {
    const peers = MockBroadcastChannel.channels.get(channelName) ?? new Set()
    for (const peer of peers) {
      peer.listeners.forEach((fn) => fn({ data } as MessageEvent))
    }
  }

  addEventListener(_: string, fn: (e: MessageEvent) => void): void {
    this.listeners.push(fn)
  }

  removeEventListener(_: string, fn: (e: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn)
  }

  close(): void {
    MockBroadcastChannel.channels.get(this.name)?.delete(this)
  }

  static reset(): void {
    MockBroadcastChannel.channels.clear()
  }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

// ─────────────────────────────────────────────────────────────────────────────

function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  let result!: T
  scope.run(() => { result = fn() })
  return result
}

const CHANNEL = 'vue-storage-kit' // TabSync default channel name

beforeEach(() => {
  _clearInstanceCache()
  MockBroadcastChannel.reset()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockImplementation(() => new MemoryStorageAdapter())
})

describe('useStorage + sync', () => {
  it('receives a cross-tab update and reflects it in value', async () => {
    const { value } = withScope(() =>
      useStorage('sync-key', {
        defaultValue: 'initial',
        target: 'memory',
        sync: { channel: CHANNEL },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(value.value).toBe('initial')

    // Simulate a message from another tab: a valid StorageEnvelope JSON
    const envelope = JSON.stringify({ v: 1, d: '"updated-from-other-tab"', exp: null, ts: Date.now() + 1 })
    MockBroadcastChannel.deliverTo(CHANNEL, { key: 'sync-key', value: envelope, ts: Date.now() + 1 })

    await new Promise((r) => setTimeout(r, 30))
    expect(value.value).toBe('updated-from-other-tab')
  })

  it('ignores a cross-tab update with an older timestamp', async () => {
    const { value } = withScope(() =>
      useStorage('stale-key', {
        defaultValue: 'local',
        target: 'memory',
        sync: { channel: CHANNEL },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    value.value = 'local-write'
    await new Promise((r) => setTimeout(r, 30))

    // Send a stale message (ts = 0)
    const stale = JSON.stringify({ v: 1, d: '"stale"', exp: null, ts: 0 })
    MockBroadcastChannel.deliverTo(CHANNEL, { key: 'stale-key', value: stale, ts: 0 })

    await new Promise((r) => setTimeout(r, 30))
    // Value should remain the local write, not the stale one
    expect(value.value).toBe('local-write')
  })

  it('broadcasts a write to other tabs via BroadcastChannel', async () => {
    const adapter = new MemoryStorageAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)

    // Listener opens the channel BEFORE useStorage so it can receive broadcasts
    const received: Array<{ key: string; value: string; ts: number }> = []
    const listener = new MockBroadcastChannel(CHANNEL)
    listener.addEventListener('message', (e) => received.push(e.data))

    const { value } = withScope(() =>
      useStorage('broadcast-key', {
        defaultValue: '',
        target: 'memory',
        sync: { channel: CHANNEL },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    value.value = 'broadcast-test'
    await new Promise((r) => setTimeout(r, 50))

    expect(received.length).toBeGreaterThan(0)
    const msg = received[0]
    expect(msg.key).toBe('broadcast-key')
    // The value field is the raw JSON envelope string
    const envelope = JSON.parse(msg.value) as { v: number; d: string }
    expect(JSON.parse(envelope.d)).toBe('broadcast-test')

    listener.close()
  })
})
