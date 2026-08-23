import type { SyncOptions } from '../core/types'
import { LeaderElection } from './LeaderElection'

interface SyncMessage {
  key: string
  value: string
  ts: number
}

type MessageListener = (value: string) => void

export class TabSync {
  private channel: BroadcastChannel | null = null
  private usingFallback = false
  private localTimestamps = new Map<string, number>()
  private listeners = new Map<string, MessageListener>()
  private leaderElection: LeaderElection | null = null
  private readonly channelName: string
  private readonly debounce: number
  private pendingMessages = new Map<string, SyncMessage>()
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly opts: SyncOptions = {}) {
    this.channelName = opts.channel ?? 'vue-storage-kit'
    this.debounce = opts.debounce ?? 50
  }

  async start(): Promise<void> {
    if (typeof window === 'undefined') return

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.channelName)
      this.channel.addEventListener('message', this.onMessage)
    } else {
      this.usingFallback = true
      window.addEventListener('storage', this.onStorageEvent)
    }

    if (this.opts.leader) {
      this.leaderElection = new LeaderElection()
      await this.leaderElection.start(`${this.channelName}-leader`)
    }
  }

  get isLeader(): boolean {
    return this.leaderElection?.isLeader ?? true
  }

  broadcast(key: string, value: string, ts: number): void {
    if (!this.channel) return
    this.localTimestamps.set(key, ts)
    const msg: SyncMessage = { key, value, ts }

    if (this.debounce <= 0) {
      this.channel.postMessage(msg)
      return
    }

    // Coalesce rapid successive broadcasts for the same key into a single
    // postMessage carrying the latest value, sent after `debounce` ms of
    // quiet — this is what SyncOptions.debounce documents.
    this.pendingMessages.set(key, msg)
    const existingTimer = this.pendingTimers.get(key)
    if (existingTimer) clearTimeout(existingTimer)

    const timer = setTimeout(() => {
      this.pendingTimers.delete(key)
      const pending = this.pendingMessages.get(key)
      this.pendingMessages.delete(key)
      if (pending) this.channel?.postMessage(pending)
    }, this.debounce)
    this.pendingTimers.set(key, timer)
  }

  subscribe(key: string, callback: MessageListener): void {
    this.listeners.set(key, callback)
  }

  unsubscribe(key: string): void {
    this.listeners.delete(key)
  }

  stop(): void {
    for (const timer of this.pendingTimers.values()) clearTimeout(timer)
    this.pendingTimers.clear()

    // Flush any messages still waiting out their debounce window instead of
    // dropping them — otherwise the last update before a dispose/unmount
    // would silently never reach other tabs.
    if (this.channel) {
      for (const pending of this.pendingMessages.values()) {
        this.channel.postMessage(pending)
      }
    }
    this.pendingMessages.clear()

    this.channel?.close()
    this.channel = null
    if (this.usingFallback) {
      window.removeEventListener('storage', this.onStorageEvent)
    }
    this.leaderElection?.stop()
    this.leaderElection = null
  }

  private onMessage = (event: MessageEvent<SyncMessage>): void => {
    const { key, value, ts } = event.data
    const localTs = this.localTimestamps.get(key) ?? 0

    // last-write-wins; on tie, the leader keeps its version
    if (ts > localTs || (ts === localTs && !this.isLeader)) {
      this.localTimestamps.set(key, ts)
      this.listeners.get(key)?.(value)
    }
  }

  private onStorageEvent = (event: StorageEvent): void => {
    if (!event.key || !event.newValue) return
    this.listeners.get(event.key)?.(event.newValue)
  }
}
