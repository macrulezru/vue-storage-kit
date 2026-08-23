import type { PiniaPluginContext, StateTree, SubscriptionCallbackMutation } from 'pinia'
import { StorageAdapterFactory } from '../adapters/StorageAdapterFactory'
import { createJSONSerializer } from '../core/serializer'
import type { StorageTarget, Serializer, StorageError } from '../core/types'

export interface PiniaPersistOptions {
  key?: string
  target?: StorageTarget
  pick?: string[]
  omit?: string[]
  serializer?: Serializer<unknown>
  beforeRestore?: (ctx: PiniaPluginContext) => void
  afterRestore?: (ctx: PiniaPluginContext) => void
  onError?: (err: StorageError) => void
}

function applyPatch(state: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    state[k] = v
  }
}

function filterState(
  state: Record<string, unknown>,
  pick?: string[],
  omit?: string[],
): Record<string, unknown> {
  if (pick) return Object.fromEntries(Object.entries(state).filter(([k]) => pick.includes(k)))
  if (omit) return Object.fromEntries(Object.entries(state).filter(([k]) => !omit.includes(k)))
  return state
}

export function createPiniaPersist(opts: PiniaPersistOptions = {}) {
  return (ctx: PiniaPluginContext): void => {
    const {
      key = ctx.store.$id,
      target = 'local',
      pick,
      omit,
      serializer = createJSONSerializer<unknown>(),
      beforeRestore,
      afterRestore,
      onError,
    } = opts

    const adapter = StorageAdapterFactory.get(target)

    // Restore (async — the adapter may be backed by IndexedDB). State reflects
    // defaultValue-initialized values until this resolves, same tradeoff as
    // useStorage()'s isReady.
    void (async () => {
      const raw = await adapter.getItem(key)
      if (raw !== null) {
        beforeRestore?.(ctx)
        try {
          const stored = serializer.deserialize(raw) as Record<string, unknown>
          applyPatch(ctx.store.$state as Record<string, unknown>, stored)
        } catch {
          onError?.({ type: 'parse-error', key, raw })
        }
        afterRestore?.(ctx)
      }
    })()

    // Persist on every state change
    ctx.store.$subscribe((_: SubscriptionCallbackMutation<StateTree>, state: StateTree) => {
      const slice = filterState(state as Record<string, unknown>, pick, omit)
      // Wrapped in an async IIFE (rather than `adapter.setItem(...).catch()`)
      // so a synchronous throw from a non-conforming adapter is caught too,
      // not just a rejected promise.
      void (async () => {
        try {
          await adapter.setItem(key, serializer.serialize(slice))
        } catch (e) {
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            onError?.({ type: 'quota-exceeded', key })
          } else {
            onError?.({ type: 'write-failed', key, error: e as Error })
          }
        }
      })()
    })
  }
}
