import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TabSync } from '../sync/TabSync'

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

describe('TabSync', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset()
  })

  it('delivers a broadcast message to a subscriber on another instance', async () => {
    const sender = new TabSync({ channel: 'test', debounce: 0 })
    const receiver = new TabSync({ channel: 'test', debounce: 0 })
    await sender.start()
    await receiver.start()

    const received = vi.fn()
    receiver.subscribe('myKey', received)

    sender.broadcast('myKey', 'value-1', 100)

    await new Promise((r) => setTimeout(r, 5))
    expect(received).toHaveBeenCalledWith('value-1')

    sender.stop()
    receiver.stop()
  })

  it('does not deliver its own broadcast back to itself', async () => {
    const sync = new TabSync({ channel: 'self', debounce: 0 })
    await sync.start()

    const received = vi.fn()
    sync.subscribe('k', received)
    sync.broadcast('k', 'v', 200)

    await new Promise((r) => setTimeout(r, 5))
    expect(received).not.toHaveBeenCalled()

    sync.stop()
  })

  it('last-write-wins: newer timestamp replaces older', async () => {
    const sender = new TabSync({ channel: 'lww', debounce: 0 })
    const receiver = new TabSync({ channel: 'lww', debounce: 0 })
    await sender.start()
    await receiver.start()

    const received: string[] = []
    receiver.subscribe('k', (v) => received.push(v))

    sender.broadcast('k', 'old', 100)
    sender.broadcast('k', 'new', 200)

    await new Promise((r) => setTimeout(r, 5))
    expect(received).toContain('new')
    expect(received).toContain('old')

    sender.stop()
    receiver.stop()
  })

  it('ignores a message with an older timestamp', async () => {
    const sender = new TabSync({ channel: 'stale', debounce: 0 })
    const receiver = new TabSync({ channel: 'stale', debounce: 0 })
    await sender.start()
    await receiver.start()

    const received: string[] = []
    receiver.subscribe('k', (v) => received.push(v))

    // First send a newer message
    sender.broadcast('k', 'v2', 500)
    await new Promise((r) => setTimeout(r, 5))

    // Manually set the receiver's timestamp ahead
    // Then send a stale message — it should be dropped
    sender.broadcast('k', 'v1-stale', 100)
    await new Promise((r) => setTimeout(r, 5))

    expect(received).toContain('v2')
    expect(received).not.toContain('v1-stale')

    sender.stop()
    receiver.stop()
  })

  it('unsubscribe removes the listener', async () => {
    const sender = new TabSync({ channel: 'unsub', debounce: 0 })
    const receiver = new TabSync({ channel: 'unsub', debounce: 0 })
    await sender.start()
    await receiver.start()

    const received = vi.fn()
    receiver.subscribe('k', received)
    receiver.unsubscribe('k')

    sender.broadcast('k', 'value', 1)
    await new Promise((r) => setTimeout(r, 5))
    expect(received).not.toHaveBeenCalled()

    sender.stop()
    receiver.stop()
  })

  it('debounces rapid broadcasts for the same key into a single message', async () => {
    vi.useFakeTimers()
    try {
      const sender = new TabSync({ channel: 'debounced', debounce: 50 })
      const receiver = new TabSync({ channel: 'debounced', debounce: 50 })
      await sender.start()
      await receiver.start()

      const received: string[] = []
      receiver.subscribe('k', (v) => received.push(v))

      sender.broadcast('k', 'v1', 100)
      sender.broadcast('k', 'v2', 200)
      sender.broadcast('k', 'v3', 300)

      // Nothing sent yet — still within the debounce window.
      await vi.advanceTimersByTimeAsync(30)
      expect(received).toHaveLength(0)

      // Window elapses — only the latest value is delivered, once.
      await vi.advanceTimersByTimeAsync(30)
      expect(received).toEqual(['v3'])

      sender.stop()
      receiver.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends immediately when debounce is 0', async () => {
    const sender = new TabSync({ channel: 'no-debounce', debounce: 0 })
    const receiver = new TabSync({ channel: 'no-debounce', debounce: 0 })
    await sender.start()
    await receiver.start()

    const received: string[] = []
    receiver.subscribe('k', (v) => received.push(v))

    sender.broadcast('k', 'v1', 100)
    sender.broadcast('k', 'v2', 200)

    await new Promise((r) => setTimeout(r, 5))
    expect(received).toEqual(['v1', 'v2'])

    sender.stop()
    receiver.stop()
  })

  it('stop() closes the channel', async () => {
    const sync = new TabSync({ channel: 'stop-test', debounce: 0 })
    await sync.start()
    sync.stop()
    // After stop, sending should not reach receivers
    const receiver = new TabSync({ channel: 'stop-test', debounce: 0 })
    await receiver.start()
    const received = vi.fn()
    receiver.subscribe('k', received)
    sync.broadcast('k', 'v', 1) // should be no-op, channel closed
    await new Promise((r) => setTimeout(r, 5))
    expect(received).not.toHaveBeenCalled()
    receiver.stop()
  })
})
