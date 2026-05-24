import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useBroadcastChannel } from '../composables/useBroadcastChannel'

type Listener = (event: MessageEvent) => void

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  private listeners: Listener[] = []
  closed = false
  postMessage = vi.fn((data: unknown) => {
    MockBroadcastChannel.instances.forEach((ch) => {
      if (ch !== this && ch.name === this.name && !ch.closed) {
        ch.listeners.forEach((fn) => fn({ data } as MessageEvent))
      }
    })
  })
  addEventListener(_: string, fn: Listener) { this.listeners.push(fn) }
  removeEventListener(_: string, fn: Listener) {
    this.listeners = this.listeners.filter((l) => l !== fn)
  }
  close() { this.closed = true; MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter((c) => c !== this) }
  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }
  _deliver(data: unknown) {
    this.listeners.forEach((fn) => fn({ data } as MessageEvent))
  }
}

beforeEach(() => {
  MockBroadcastChannel.instances = []
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useBroadcastChannel', () => {
  it('reports isSupported = true when BroadcastChannel exists', () => {
    const scope = effectScope()
    const { isSupported } = scope.run(() => useBroadcastChannel('test'))!
    expect(isSupported).toBe(true)
    scope.stop()
  })

  it('reports isSupported = false when BroadcastChannel is absent', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const scope = effectScope()
    const { isSupported } = scope.run(() => useBroadcastChannel('test'))!
    expect(isSupported).toBe(false)
    scope.stop()
  })

  it('starts with empty messages and null lastMessage', () => {
    const scope = effectScope()
    const { messages, lastMessage } = scope.run(() => useBroadcastChannel<string>('chan'))!
    expect(messages.value).toEqual([])
    expect(lastMessage.value).toBeNull()
    scope.stop()
  })

  it('receives a message from another instance', () => {
    const scope1 = effectScope()
    const scope2 = effectScope()
    const a = scope1.run(() => useBroadcastChannel<string>('chan'))!
    const b = scope2.run(() => useBroadcastChannel<string>('chan'))!

    a.post('hello')

    expect(b.messages.value).toEqual(['hello'])
    expect(b.lastMessage.value).toBe('hello')
    scope1.stop()
    scope2.stop()
  })

  it('accumulates multiple messages', () => {
    const scope1 = effectScope()
    const scope2 = effectScope()
    const a = scope1.run(() => useBroadcastChannel<number>('nums'))!
    const b = scope2.run(() => useBroadcastChannel<number>('nums'))!

    a.post(1)
    a.post(2)
    a.post(3)

    expect(b.messages.value).toEqual([1, 2, 3])
    scope1.stop()
    scope2.stop()
  })

  it('close() stops receiving messages', () => {
    const scope1 = effectScope()
    const scope2 = effectScope()
    const a = scope1.run(() => useBroadcastChannel<string>('chan'))!
    const b = scope2.run(() => useBroadcastChannel<string>('chan'))!

    b.close()
    a.post('after close')

    expect(b.messages.value).toEqual([])
    scope1.stop()
    scope2.stop()
  })

  it('post() does nothing after close()', () => {
    const scope = effectScope()
    const { post, close } = scope.run(() => useBroadcastChannel<string>('chan'))!
    close()
    expect(() => post('msg')).not.toThrow()
    scope.stop()
  })

  it('does not receive own posted messages', () => {
    const scope = effectScope()
    const { post, messages } = scope.run(() => useBroadcastChannel<string>('solo'))!
    post('self')
    expect(messages.value).toEqual([])
    scope.stop()
  })
})
