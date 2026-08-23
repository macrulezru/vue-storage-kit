import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StorageEngine } from '../engine/StorageEngine'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { MemoryStorageAdapter } from '../adapters/MemoryStorageAdapter'
import { TabSync } from '../sync/TabSync'
import { TTLManager } from '../core/TTLManager'

// Every raw stored value is now prefixed with a plaintext {"exp","ts"}
// meta header (see TTLManager.wrapWithMeta) — strip it before inspecting
// the actual (possibly compress/encrypt/sign-transformed) payload.
function payloadOf(raw: string): string {
  return TTLManager.unwrapMeta(raw)?.payload ?? raw
}

let adapter: MemoryStorageAdapter

beforeEach(() => {
  adapter = new MemoryStorageAdapter()
  StorageAdapterFactory._reset()
  vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(adapter)
})

function flush(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Polls instead of sleeping a fixed duration — a write that involves a
// crypto/compress/sign module isn't done until that module's dynamic
// import() resolves, and a cold import (first use, mid-transform under the
// full suite's load) can take longer than a fixed guess safely covers on
// some runtimes (observed on Node 18 specifically).
async function waitForWrite(getRaw: () => Promise<string | null>, timeoutMs = 3000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const raw = await getRaw()
    if (raw !== null) return raw
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Timed out waiting for the write to land in storage')
}

describe('StorageEngine — basics', () => {
  it('starts with defaultValue and flips isReady after init', async () => {
    const engine = new StorageEngine('k', { defaultValue: 'x', target: 'memory' })
    expect(engine.getSnapshot().value).toBe('x')
    expect(engine.getSnapshot().isReady).toBe(false)

    await engine.ready
    expect(engine.getSnapshot().isReady).toBe(true)
    engine.dispose()
  })

  it('setValue writes to the adapter and notifies subscribers', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready

    const listener = vi.fn()
    engine.subscribe(listener)
    engine.setValue(5)

    expect(engine.getSnapshot().value).toBe(5)
    expect(listener).toHaveBeenCalled()

    await flush()
    const raw = await adapter.getItem('k')
    expect(raw).not.toBeNull()
    engine.dispose()
  })

  it('reads an existing envelope from storage on init', async () => {
    await adapter.setItem('k', JSON.stringify({ v: 1, d: '"stored"', exp: null, ts: Date.now() }))
    const engine = new StorageEngine('k', { defaultValue: 'default', target: 'memory' })
    await engine.ready

    expect(engine.getSnapshot().value).toBe('stored')
    engine.dispose()
  })

  it('getSnapshot returns a new object reference on every change (external-store contract)', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready
    const before = engine.getSnapshot()
    engine.setValue(1)
    const after = engine.getSnapshot()
    expect(after).not.toBe(before)
    expect(engine.getSnapshot()).toBe(after) // stable until the next change
    engine.dispose()
  })

  it('unsubscribe stops further notifications', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    unsubscribe()
    engine.setValue(1)
    expect(listener).not.toHaveBeenCalled()
    engine.dispose()
  })

  it('remove() resets to defaultValue and clears storage', async () => {
    const engine = new StorageEngine('k', { defaultValue: 'default', target: 'memory' })
    await engine.ready
    engine.setValue('changed')
    await flush()
    expect(await adapter.getItem('k')).not.toBeNull()

    engine.remove()
    await flush()
    expect(engine.getSnapshot().value).toBe('default')
    expect(await adapter.getItem('k')).toBeNull()
    engine.dispose()
  })

  it('refresh() re-reads from storage', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready
    await adapter.setItem('k', JSON.stringify({ v: 1, d: '99', exp: null, ts: Date.now() }))
    await engine.refresh()
    expect(engine.getSnapshot().value).toBe(99)
    engine.dispose()
  })
})

describe('StorageEngine — TTL', () => {
  it('expires and removes the key, calling onExpire', async () => {
    await adapter.setItem('k', JSON.stringify({ v: 1, d: '"old"', exp: Date.now() - 1, ts: 0 }))
    const onExpire = vi.fn()
    const engine = new StorageEngine('k', { defaultValue: 'default', target: 'memory', onExpire })
    await engine.ready

    expect(engine.getSnapshot().value).toBe('default')
    expect(onExpire).toHaveBeenCalledWith('k')
    expect(await adapter.getItem('k')).toBeNull()
    engine.dispose()
  })
})

describe('StorageEngine — migrations', () => {
  it('runs the migration chain and writes back the migrated value', async () => {
    await adapter.setItem(
      'settings',
      JSON.stringify({ v: 1, d: JSON.stringify({ darkMode: true }), exp: null, ts: Date.now() }),
    )
    const onMigrate = vi.fn()
    const engine = new StorageEngine<{ theme?: string }>('settings', {
      defaultValue: {},
      target: 'memory',
      version: 2,
      onMigrate,
      migrations: [
        { version: 2, up: (d) => ({ theme: (d as { darkMode?: boolean }).darkMode ? 'dark' : 'light' }) },
      ],
    })
    await engine.ready

    expect(engine.getSnapshot().value).toEqual({ theme: 'dark' })
    expect(onMigrate).toHaveBeenCalledWith(1, 2)
    engine.dispose()
  })

  it('preserves the source envelope ts on the migration write-back, rather than stamping a fresh one', async () => {
    // A schema migration isn't a new value being decided — using Date.now()
    // for the rewritten envelope's ts would inflate lastAppliedTs with a
    // timestamp unrelated to the data's actual recency, which (with sync
    // enabled) could make a merely-just-migrated stale value outrank a
    // genuinely newer cross-tab message arriving shortly after.
    const originalTs = Date.now() - 100_000
    await adapter.setItem(
      'settings',
      JSON.stringify({ v: 1, d: JSON.stringify({ darkMode: true }), exp: null, ts: originalTs }),
    )
    const engine = new StorageEngine<{ theme?: string }>('settings', {
      defaultValue: {},
      target: 'memory',
      version: 2,
      migrations: [
        { version: 2, up: (d) => ({ theme: (d as { darkMode?: boolean }).darkMode ? 'dark' : 'light' }) },
      ],
    })
    await engine.ready

    const raw = await adapter.getItem('settings')
    const meta = TTLManager.unwrapMeta(raw!)
    expect(meta?.ts).toBe(originalTs)
    engine.dispose()
  })
})

describe('StorageEngine — encrypt / compress / sign', () => {
  it('round-trips through encrypt', async () => {
    const engine = new StorageEngine('k', {
      defaultValue: '',
      target: 'memory',
      encrypt: { password: 'pw', iterations: 1000 },
    })
    await engine.ready
    engine.setValue('secret')
    const raw = await waitForWrite(() => adapter.getItem('k'))
    expect(() => JSON.parse(raw)).toThrow()
    engine.dispose()

    const engine2 = new StorageEngine('k', {
      defaultValue: '',
      target: 'memory',
      encrypt: { password: 'pw', iterations: 1000 },
    })
    await engine2.ready
    expect(engine2.getSnapshot().value).toBe('secret')
    engine2.dispose()
  })

  it('round-trips through sign, and detects tampering', async () => {
    const engine = new StorageEngine('k', {
      defaultValue: '',
      target: 'memory',
      sign: { password: 'sign-pw' },
    })
    await engine.ready
    engine.setValue('trust me')
    const raw = await waitForWrite(() => adapter.getItem('k'))
    engine.dispose()

    // Correct password — reads through fine.
    const engine2 = new StorageEngine('k', {
      defaultValue: '',
      target: 'memory',
      sign: { password: 'sign-pw' },
    })
    await engine2.ready
    expect(engine2.getSnapshot().value).toBe('trust me')
    engine2.dispose()

    // Tampered value — signature-invalid, falls back to defaultValue.
    await adapter.setItem('k', raw.slice(0, -2) + 'xx')
    const onError = vi.fn()
    const engine3 = new StorageEngine('k', {
      defaultValue: 'fallback',
      target: 'memory',
      sign: { password: 'sign-pw' },
      onError,
    })
    await engine3.ready
    expect(engine3.getSnapshot().value).toBe('fallback')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'signature-invalid' }))
    engine3.dispose()
  })

  it('combines compress + encrypt + sign (compress-then-encrypt-then-sign)', async () => {
    const opts = {
      defaultValue: '',
      target: 'memory' as const,
      compress: true,
      encrypt: { password: 'pw', iterations: 1000 },
      sign: { password: 'sign-pw' },
    }
    const engine = new StorageEngine('k', opts)
    await engine.ready
    engine.setValue('x'.repeat(200))
    await waitForWrite(() => adapter.getItem('k'))

    const engine2 = new StorageEngine('k', opts)
    await engine2.ready
    expect(engine2.getSnapshot().value).toBe('x'.repeat(200))
    engine.dispose()
    engine2.dispose()
  })
})

describe('StorageEngine — debounce / throttle', () => {
  it('debounce coalesces rapid writes into one', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', debounce: 30 })
    await engine.ready
    const setItemSpy = vi.spyOn(adapter, 'setItem')

    engine.setValue(1)
    engine.setValue(2)
    engine.setValue(3)

    await flush(10)
    expect(setItemSpy).not.toHaveBeenCalled()

    await flush(30)
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it('flushes a pending debounced write on dispose', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', debounce: 1000 })
    await engine.ready
    engine.setValue(42)
    engine.dispose()

    await flush()
    const raw = await adapter.getItem('k')
    expect(JSON.parse((JSON.parse(payloadOf(raw!)) as { d: string }).d)).toBe(42)
  })

  it('throttle writes immediately once, then guarantees a trailing write', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', throttle: 40 })
    await engine.ready
    const setItemSpy = vi.spyOn(adapter, 'setItem')

    engine.setValue(1) // fires immediately (first call within the window)
    await flush(5)
    expect(setItemSpy).toHaveBeenCalledTimes(1)

    engine.setValue(2)
    engine.setValue(3) // still within the throttle window — coalesced
    await flush(10)
    expect(setItemSpy).toHaveBeenCalledTimes(1) // trailing write not due yet

    await flush(40)
    expect(setItemSpy).toHaveBeenCalledTimes(2)
    const raw = await adapter.getItem('k')
    expect(JSON.parse((JSON.parse(payloadOf(raw!)) as { d: string }).d)).toBe(3)
    engine.dispose()
  })
})

describe('StorageEngine — history / undo / redo', () => {
  it('undo/redo navigate through recorded values', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', history: 5 })
    await engine.ready

    engine.setValue(1)
    engine.setValue(2)
    engine.setValue(3)
    expect(engine.getSnapshot().value).toBe(3)
    expect(engine.getSnapshot().canUndo).toBe(true)
    expect(engine.getSnapshot().canRedo).toBe(false)

    engine.undo()
    expect(engine.getSnapshot().value).toBe(2)
    engine.undo()
    expect(engine.getSnapshot().value).toBe(1)
    expect(engine.getSnapshot().canRedo).toBe(true)

    engine.redo()
    expect(engine.getSnapshot().value).toBe(2)
    engine.dispose()
  })

  it('a new setValue after undo clears the redo stack', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', history: 5 })
    await engine.ready
    engine.setValue(1)
    engine.setValue(2)
    engine.undo()
    expect(engine.getSnapshot().canRedo).toBe(true)

    engine.setValue(99)
    expect(engine.getSnapshot().canRedo).toBe(false)
    engine.redo()
    expect(engine.getSnapshot().value).toBe(99) // no-op, redo stack was cleared
    engine.dispose()
  })

  it('caps history at the configured limit', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', history: 2 })
    await engine.ready
    engine.setValue(1) // historyStack: [0]
    engine.setValue(2) // historyStack: [0,1]
    engine.setValue(3) // historyStack: [0,1,2] capped to [1,2] — the push of 0 is dropped

    engine.undo()
    expect(engine.getSnapshot().value).toBe(2)
    engine.undo()
    expect(engine.getSnapshot().value).toBe(1)
    expect(engine.getSnapshot().canUndo).toBe(false)

    // A third undo would be the dropped value (0) — confirm it's gone, not just skipped.
    engine.undo()
    expect(engine.getSnapshot().value).toBe(1)
    engine.dispose()
  })

  it('undo()/redo() are no-ops when history is disabled (default)', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready
    engine.setValue(1)
    engine.undo()
    expect(engine.getSnapshot().value).toBe(1)
    expect(engine.getSnapshot().canUndo).toBe(false)
    engine.dispose()
  })

  it('does not let a mutated defaultValue bleed into history', async () => {
    // A caller-owned object handed in as defaultValue, mutated *after*
    // construction but *before* the first setValue() — lastCommitted must
    // already be an independent clone at construction time, not just from
    // the first applyValue() onward.
    const shared = { count: 0 }
    const engine = new StorageEngine('k', { defaultValue: shared, target: 'memory', history: 5 })
    await engine.ready

    shared.count = 999 // mutated after construction, before any setValue()

    engine.setValue({ count: 1 })
    engine.undo()
    expect(engine.getSnapshot().value).toEqual({ count: 0 })
    engine.dispose()
  })

  it('clones a Vue reactive Proxy value for history instead of sharing the live reference', async () => {
    // structuredClone() throws DataCloneError on a Vue reactive Proxy — the
    // exact shape an object value arrives in from the Vue composable's deep
    // ref. cloneValue() must fall back to a working clone (not the same
    // reference) in that case.
    const { reactive } = await import('vue')
    const engine = new StorageEngine('k', {
      defaultValue: reactive({ count: 0 }),
      target: 'memory',
      history: 5,
    })
    await engine.ready

    const proxied = reactive({ count: 1 })
    engine.setValue(proxied)
    // Mutate the same reactive object the caller is still holding — must
    // not retroactively change what undo()/redo() restore.
    proxied.count = 2

    engine.undo()
    expect(engine.getSnapshot().value).toEqual({ count: 0 })
    engine.redo()
    expect(engine.getSnapshot().value).toEqual({ count: 1 })
    engine.dispose()
  })
})

describe('StorageEngine — quota-exceeded recovery', () => {
  it('sweeps expired keys and retries once', async () => {
    await adapter.setItem('stale', JSON.stringify({ v: 1, d: '"x"', exp: Date.now() - 1, ts: 0 }))
    vi.spyOn(adapter, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', onError })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).not.toHaveBeenCalled()
    expect(await adapter.getItem('stale')).toBeNull()
    engine.dispose()
  })

  it('sweeps an expired key even when its payload is encrypted', async () => {
    // A short-TTL encrypted entry from a completely different engine — the
    // one about to hit quota below has no idea it's encrypted, or what its
    // password is. Before TTLManager's plaintext exp header, cleanExpired()
    // couldn't have read `exp` off this at all and would have left it alone.
    const staleEngine = new StorageEngine('stale-encrypted', {
      defaultValue: '',
      target: 'memory',
      encrypt: { password: 'pw', iterations: 1000 },
      ttl: 10,
    })
    await staleEngine.ready
    staleEngine.setValue('secret')
    await waitForWrite(() => adapter.getItem('stale-encrypted'))
    await flush(20) // let the 10ms TTL elapse
    staleEngine.dispose()

    vi.spyOn(adapter, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', onError })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).not.toHaveBeenCalled()
    expect(await adapter.getItem('stale-encrypted')).toBeNull()
    engine.dispose()
  })

  it('with evictOnQuota, evicts the oldest other key when TTL sweep is not enough', async () => {
    await adapter.setItem('old-key', JSON.stringify({ v: 1, d: '"x"', exp: null, ts: 100 }))
    await adapter.setItem('newer-key', JSON.stringify({ v: 1, d: '"y"', exp: null, ts: 200 }))

    // Fails the initial write AND the post-TTL-sweep retry (neither seeded
    // key is TTL-expired, so that sweep alone can't help) — only the third
    // call, after eviction actually freed something, should succeed.
    const original = adapter.setItem.bind(adapter)
    let calls = 0
    vi.spyOn(adapter, 'setItem').mockImplementation(async (key: string, val: string) => {
      calls++
      if (calls <= 2) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      return original(key, val)
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', {
      defaultValue: 0,
      target: 'memory',
      evictOnQuota: true,
      onError,
    })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).not.toHaveBeenCalled()
    expect(await adapter.getItem('old-key')).toBeNull()
    expect(await adapter.getItem('newer-key')).not.toBeNull()
    engine.dispose()
  })

  it('with evictOnQuota, can evict an oldest other key even when it is encrypted', async () => {
    // The evicted key's `ts` is now readable via TTLManager's plaintext
    // meta header, even though this engine (writing to 'k') doesn't know
    // it's encrypted or what its password is.
    const oldEncryptedEngine = new StorageEngine('old-encrypted', {
      defaultValue: '',
      target: 'memory',
      encrypt: { password: 'pw', iterations: 1000 },
    })
    await oldEncryptedEngine.ready
    oldEncryptedEngine.setValue('x')
    await waitForWrite(() => adapter.getItem('old-encrypted'))
    oldEncryptedEngine.dispose()

    await adapter.setItem('newer-key', JSON.stringify({ v: 1, d: '"y"', exp: null, ts: Date.now() + 100_000 }))

    const original = adapter.setItem.bind(adapter)
    let calls = 0
    vi.spyOn(adapter, 'setItem').mockImplementation(async (key: string, val: string) => {
      calls++
      if (calls <= 2) throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      return original(key, val)
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', {
      defaultValue: 0,
      target: 'memory',
      evictOnQuota: true,
      onError,
    })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).not.toHaveBeenCalled()
    expect(await adapter.getItem('old-encrypted')).toBeNull()
    expect(await adapter.getItem('newer-key')).not.toBeNull()
    engine.dispose()
  })

  it('reports quota-exceeded when recovery is not enough', async () => {
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', onError })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'quota-exceeded' }))
    engine.dispose()
  })
})

describe('StorageEngine — write-failed', () => {
  it('reports write-failed for non-quota errors instead of throwing', async () => {
    const boom = new Error('adapter exploded')
    vi.spyOn(adapter, 'setItem').mockImplementation(() => {
      throw boom
    })

    const onError = vi.fn()
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory', onError })
    await engine.ready
    engine.setValue(1)
    await flush(20)

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'write-failed', error: boom }),
    )
    engine.dispose()
  })
})

describe('StorageEngine — events', () => {
  it('emits a write event on successful write', async () => {
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    await engine.ready
    const onEvent = vi.fn()
    engine.onEvent(onEvent)

    engine.setValue(1)
    await flush(20)

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'write', key: 'k' }))
    engine.dispose()
  })

  it('emits an expire event when a TTL-expired key is read', async () => {
    await adapter.setItem('k', JSON.stringify({ v: 1, d: '"x"', exp: Date.now() - 1, ts: 0 }))
    const engine = new StorageEngine('k', { defaultValue: 0, target: 'memory' })
    const onEvent = vi.fn()
    engine.onEvent(onEvent)
    await engine.ready

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'expire' }))
    engine.dispose()
  })
})

describe('StorageEngine — sync update racing the initial read', () => {
  class MockBroadcastChannel {
    private static channels = new Map<string, Set<MockBroadcastChannel>>()
    private listeners: ((e: MessageEvent) => void)[] = []

    constructor(public readonly name: string) {
      const set = MockBroadcastChannel.channels.get(name) ?? new Set()
      set.add(this)
      MockBroadcastChannel.channels.set(name, set)
    }

    postMessage(): void {
      // Not exercised by this test — the engine only needs to receive.
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

  // Blocks getItem() until the test explicitly releases it, instead of
  // guessing a delay long enough to outlast the rest of the setup.
  class GatedAdapter extends MemoryStorageAdapter {
    private release!: () => void
    private readonly gate = new Promise<void>((resolve) => {
      this.release = resolve
    })
    async getItem(key: string): Promise<string | null> {
      await this.gate
      return super.getItem(key)
    }
    releaseRead(): void {
      this.release()
    }
  }

  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    MockBroadcastChannel.reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves a cross-tab sync update that lands while the initial read is still in flight', async () => {
    const gatedAdapter = new GatedAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(gatedAdapter)

    // The raw BroadcastChannel-level addEventListener() (inside
    // TabSync.start()) fires a whole microtask before TabSync.subscribe()
    // actually registers interest in this specific key — delivering right
    // after the former, not the latter, drops the message. Spy on the
    // latter, the exact point a delivered message can actually reach this
    // engine, instead of guessing a delay.
    let resolveSubscribed!: () => void
    const subscribed = new Promise<void>((resolve) => {
      resolveSubscribed = resolve
    })
    const originalSubscribe = TabSync.prototype.subscribe
    vi.spyOn(TabSync.prototype, 'subscribe').mockImplementation(function (
      this: TabSync,
      key,
      cb,
    ) {
      originalSubscribe.call(this, key, cb)
      resolveSubscribed()
    })

    const engine = new StorageEngine('sync-race-key', {
      defaultValue: 'default',
      target: 'memory',
      sync: { channel: 'race-channel' },
    })

    // Deliver only once TabSync has actually subscribed to this key —
    // deterministic, not dependent on a guessed delay.
    await subscribed
    const envelope = JSON.stringify({ v: 1, d: '"from-other-tab"', exp: null, ts: Date.now() })
    MockBroadcastChannel.deliverTo('race-channel', {
      key: 'sync-race-key',
      value: envelope,
      ts: Date.now(),
    })

    // Only now let the still-in-flight initial read resolve, so it's
    // guaranteed to land strictly after the sync update was applied.
    gatedAdapter.releaseRead()

    await engine.ready
    // The initial read (resolving after the sync update) must not clobber
    // the value the sync update already applied.
    expect(engine.getSnapshot().value).toBe('from-other-tab')
    engine.dispose()
  })

  it('does not let the initial read regress lastAppliedTs backward, opening a window for an intermediate-stale message', async () => {
    const gatedAdapter = new GatedAdapter()
    vi.spyOn(StorageAdapterFactory, 'get').mockReturnValue(gatedAdapter)
    await gatedAdapter.setItem(
      'monotonic-race-key',
      JSON.stringify({ v: 1, d: '"from-disk"', exp: null, ts: 1000 }),
    )

    // Capture the engine's own subscriber callback and invoke it directly,
    // instead of routing messages through MockBroadcastChannel.deliverTo
    // (which goes through TabSync's real onMessage first). TabSync tracks
    // its own per-key localTimestamps and would, on its own, reject the
    // second (intermediate) message below purely for having already seen
    // ts: 2000 from the first — masking whether the *engine's*
    // lastAppliedTs guard (the thing this test exists to verify) is what's
    // actually doing the rejecting. Bypassing TabSync entirely isolates it.
    let engineCallback!: (raw: string) => void
    let resolveSubscribed!: () => void
    const subscribed = new Promise<void>((resolve) => {
      resolveSubscribed = resolve
    })
    vi.spyOn(TabSync.prototype, 'subscribe').mockImplementation(function (
      this: TabSync,
      _key,
      cb,
    ) {
      engineCallback = cb
      resolveSubscribed()
    })

    const engine = new StorageEngine('monotonic-race-key', {
      defaultValue: 'default',
      target: 'memory',
      sync: { channel: 'monotonic-race-channel' },
    })

    await subscribed

    // A newer message arrives and is accepted while the (gated) initial
    // read of the older on-disk value (ts: 1000) is still in flight.
    engineCallback(JSON.stringify({ v: 1, d: '"newer-value"', exp: null, ts: 2000 }))
    await flush(10)

    // Now let the initial read (ts: 1000, older than what's already
    // applied) resolve. lastAppliedTs must stay at 2000, not regress to
    // 1000 — otherwise the message below would incorrectly pass the
    // staleness check next.
    gatedAdapter.releaseRead()
    await engine.ready
    expect(engine.getSnapshot().value).toBe('newer-value')

    // An intermediate-stale message — older than what's already applied,
    // but newer than the disk value the read just (correctly) discarded —
    // must still be rejected, by the engine's own lastAppliedTs check.
    engineCallback(JSON.stringify({ v: 1, d: '"intermediate-stale"', exp: null, ts: 1500 }))
    await flush(20)

    expect(engine.getSnapshot().value).toBe('newer-value')
    engine.dispose()
  })

  it('preserves an optimistic debounced local write against an inbound message arriving before the debounce fires', async () => {
    // setValue() bumps lastAppliedTs synchronously (before the debounced
    // write actually lands) precisely so this can't happen: without it,
    // an inbound message with any ts newer than whatever lastAppliedTs was
    // *before* this edit (e.g. the initial disk read) would pass the
    // staleness check and clobber the optimistic value while it's still
    // waiting out the debounce window.
    const engine = new StorageEngine('debounce-race-key', {
      defaultValue: 'default',
      target: 'memory',
      debounce: 200,
      sync: { channel: 'debounce-race-channel' },
    })
    await engine.ready

    engine.setValue('local-edit') // debounced — not persisted for 200ms

    const envelope = JSON.stringify({ v: 1, d: '"stale-remote"', exp: null, ts: Date.now() - 10 })
    MockBroadcastChannel.deliverTo('debounce-race-channel', {
      key: 'debounce-race-key',
      value: envelope,
      ts: Date.now() - 10,
    })
    await flush(20)

    expect(engine.getSnapshot().value).toBe('local-edit')
    engine.dispose()
  })

  it('ignores a stale cross-tab message older than what was already loaded from storage', async () => {
    // As if this engine had already read this "fresher" envelope on
    // startup (ts = 1000) — TabSync's own per-key timestamp tracking never
    // sees this, since it only tracks messages it has itself sent/received.
    await adapter.setItem(
      'stale-race-key',
      JSON.stringify({ v: 1, d: '"fresh-from-disk"', exp: null, ts: 1000 }),
    )

    const engine = new StorageEngine('stale-race-key', {
      defaultValue: 'default',
      target: 'memory',
      sync: { channel: 'stale-race-channel' },
    })
    await engine.ready
    expect(engine.getSnapshot().value).toBe('fresh-from-disk')

    // A stale broadcast from another tab (e.g. a debounced write queued
    // before that tab had seen the newer value) arrives with an older ts.
    // Without engine-level lastAppliedTs tracking this would incorrectly
    // win, since TabSync's own staleness check has no prior ts for this key.
    const staleEnvelope = JSON.stringify({ v: 1, d: '"stale-value"', exp: null, ts: 500 })
    MockBroadcastChannel.deliverTo('stale-race-channel', {
      key: 'stale-race-key',
      value: staleEnvelope,
      ts: 500,
    })
    await flush(20)

    expect(engine.getSnapshot().value).toBe('fresh-from-disk')
    engine.dispose()
  })
})
