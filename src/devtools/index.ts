import type { App } from 'vue'
import { setupDevtoolsPlugin } from '@vue/devtools-api'
import { getEngineCache, onEngineCreated, type EngineInstanceInfo } from '../engine/engineCache'
import type { EngineEvent } from '../engine/StorageEngine'

const INSPECTOR_ID = 'vue-storage-kit-inspector'
const TIMELINE_LAYER_ID = 'vue-storage-kit-timeline'

const EVENT_LOG_TYPE: Record<EngineEvent['type'], 'default' | 'warning' | 'error'> = {
  write: 'default',
  'sync-received': 'default',
  migrate: 'default',
  expire: 'warning',
  error: 'error',
}

// Custom Vue Devtools inspector + timeline over the shared engine cache
// (src/engine/engineCache.ts) — lists every live useStorage() instance
// (key, target, current value, TTL/expiry, ready/error state, undo/redo),
// and logs write/expire/migrate/sync-received/error events to the timeline.
// Vue- *and* React-created instances both show up, since they share the
// same underlying cache. Safe to call even when devtools isn't installed —
// setupDevtoolsPlugin() just no-ops.
export function setupDevtools(app: App): void {
  setupDevtoolsPlugin(
    {
      id: 'vue-storage-kit',
      label: 'Storage Kit',
      packageName: 'vue-storage-kit',
      homepage: 'https://github.com/macrulezru/vue-storage-kit',
      app,
    },
    (api) => {
      api.addInspector({
        id: INSPECTOR_ID,
        label: 'Storage Kit',
        icon: 'inventory_2',
        treeFilterPlaceholder: 'Filter by key…',
      })

      api.on.getInspectorTree((payload) => {
        if (payload.inspectorId !== INSPECTOR_ID) return
        payload.rootNodes = getEngineCache()
          .filter((i) => !payload.filter || i.key.includes(payload.filter))
          .map((i) => ({
            id: i.cacheKey,
            label: i.key,
            tags: [
              {
                label: i.target,
                textColor: 0xffffff,
                backgroundColor: 0x2f6f9f,
              },
            ],
          }))
      })

      api.on.getInspectorState((payload) => {
        if (payload.inspectorId !== INSPECTOR_ID) return
        const instance = getEngineCache().find((i) => i.cacheKey === payload.nodeId)
        if (!instance) return

        const snap = instance.engine.getSnapshot()
        payload.state = {
          Storage: [
            { key: 'value', value: snap.value },
            { key: 'target', value: instance.target },
            { key: 'isReady', value: snap.isReady },
            { key: 'expiry', value: snap.expiry },
            { key: 'error', value: snap.error },
            { key: 'canUndo', value: snap.canUndo },
            { key: 'canRedo', value: snap.canRedo },
            { key: 'refCount', value: instance.refCount },
          ],
        }
      })

      // Live values change outside of any devtools-observable Vue update
      // (e.g. a cross-tab sync message), so refresh on an interval rather
      // than relying solely on reactivity-triggered pushes.
      const refreshTimer = setInterval(() => {
        api.sendInspectorTree(INSPECTOR_ID)
        api.sendInspectorState(INSPECTOR_ID)
      }, 1000)

      // ─── Timeline ───────────────────────────────────────────────────────────

      api.addTimelineLayer({ id: TIMELINE_LAYER_ID, label: 'Storage Kit', color: 0x2f6f9f })

      function logToTimeline(event: EngineEvent): void {
        api.addTimelineEvent({
          layerId: TIMELINE_LAYER_ID,
          event: {
            time: event.at,
            title: `${event.type}: ${event.key}`,
            data: (event.detail ?? {}) as Record<string, unknown>,
            logType: EVENT_LOG_TYPE[event.type],
          },
        })
      }

      function attachTimeline(info: EngineInstanceInfo): void {
        info.engine.onEvent(logToTimeline)
      }

      getEngineCache().forEach(attachTimeline)
      const stopWatchingNewEngines = onEngineCreated(attachTimeline)

      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          clearInterval(refreshTimer)
          stopWatchingNewEngines()
        })
      }
    },
  )
}
