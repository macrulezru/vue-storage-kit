export class LeaderElection {
  private _isLeader = false
  private _abortController: AbortController | null = null

  get isLeader(): boolean {
    return this._isLeader
  }

  async start(lockName: string): Promise<void> {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) {
      // Web Locks API unavailable — treat this tab as leader
      this._isLeader = true
      return
    }

    this._abortController = new AbortController()

    // navigator.locks.request resolves only after the lock is released.
    // We hold the lock by keeping the callback's promise alive until abort.
    navigator.locks
      .request(lockName, { signal: this._abortController.signal }, () => {
        this._isLeader = true
        return new Promise<void>((resolve) => {
          this._abortController!.signal.addEventListener('abort', () => resolve(), { once: true })
        })
      })
      .catch(() => {
        // Aborted or lock unavailable — not the leader
        this._isLeader = false
      })

    // Yield to the microtask queue so the lock callback can run if it acquires immediately.
    await Promise.resolve()
  }

  stop(): void {
    this._isLeader = false
    this._abortController?.abort()
    this._abortController = null
  }
}
