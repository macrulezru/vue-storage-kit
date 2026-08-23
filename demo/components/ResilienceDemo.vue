<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useStorage, StorageAdapterFactory } from 'vue-storage-kit'

// ── debounce — coalesce rapid writes ──────────────────────────────────────────
const { value: debouncedText, isReady: debouncedReady } = useStorage('demo:debounced-typing', {
  defaultValue: '',
  debounce: 800,
})

const keystrokes = ref(0)
const writes = ref(0)

// Count real writes hitting localStorage for this one key, purely for the demo.
const originalSetItem = localStorage.setItem.bind(localStorage)
localStorage.setItem = (key: string, val: string) => {
  if (key === 'demo:debounced-typing') writes.value++
  originalSetItem(key, val)
}
onUnmounted(() => { localStorage.setItem = originalSetItem })

function onType() {
  keystrokes.value++
}

// ── write-failed — reported via onError instead of an unhandled rejection ────
const flakyError = ref('')
const { value: flaky } = useStorage('demo:flaky', {
  defaultValue: 0,
  target: 'memory',
  onError: (err) => { flakyError.value = JSON.stringify(err, null, 2) },
})

function simulateWriteFailure() {
  flakyError.value = ''
  const adapter = StorageAdapterFactory.get('memory')
  const original = adapter.setItem.bind(adapter)
  // Throw exactly once, then restore — mimics a one-off adapter failure.
  adapter.setItem = (async () => {
    adapter.setItem = original
    throw new Error('Simulated disk failure')
  }) as typeof original
  flaky.value++
}

// ── quota-exceeded recovery — sweep expired keys, retry once ─────────────────
const quotaStatus = ref('')
const quotaBusy = ref(false)
const { value: quotaTrigger } = useStorage('demo:quota-trigger', {
  defaultValue: 0,
  target: 'memory',
})

async function simulateQuotaExceeded() {
  quotaBusy.value = true
  quotaStatus.value = ''
  const adapter = StorageAdapterFactory.get('memory')

  // Seed an already-expired key — this is what the automatic sweep reclaims.
  await adapter.setItem(
    'demo:quota-victim',
    JSON.stringify({ v: 1, d: '"x"', exp: Date.now() - 1000, ts: 0 }),
  )

  const original = adapter.setItem.bind(adapter)
  let calls = 0
  adapter.setItem = (async (key: string, val: string) => {
    calls++
    if (calls === 1) {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    }
    adapter.setItem = original
    return original(key, val)
  }) as typeof original

  quotaTrigger.value++
  await new Promise((r) => setTimeout(r, 50))

  const victimStillThere = await adapter.getItem('demo:quota-victim')
  quotaStatus.value = victimStillThere === null
    ? '✓ recovered — expired key swept, write retried and succeeded'
    : '⚠️ expired key was not swept — check the console'
  quotaBusy.value = false
}
</script>

<template>
  <div>
    <h2 class="section-title">⚡ Resilience</h2>
    <p class="section-desc">
      Behaviour that runs quietly in the background: coalescing writes, and recovering from
      storage errors instead of throwing from inside a <code>watch</code> callback.
    </p>

    <!-- debounce -->
    <div class="card">
      <div class="card-title">debounce — coalesce rapid writes</div>
      <div v-if="!debouncedReady" style="color:var(--muted)">Loading…</div>
      <template v-else>
        <input
          v-model="debouncedText"
          @input="onType"
          type="text"
          placeholder="Type fast — writes only settle 800ms after you stop…"
        />
        <div class="row" style="margin-top:0.5rem">
          <span class="kv"><span class="kv-key">Keystrokes</span><span class="kv-val">{{ keystrokes }}</span></span>
          <span class="kv" style="margin-left:1.5rem"><span class="kv-key">Actual writes</span><span class="kv-val">{{ writes }}</span></span>
        </div>
      </template>
      <pre style="margin-top:0.5rem">useStorage('draft', { debounce: 800 })  // ms</pre>
    </div>

    <!-- write-failed -->
    <div class="card">
      <div class="card-title">write-failed — reported via onError, not thrown</div>
      <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.5rem">
        Simulates a one-off adapter failure (not quota-related). Before this, a non-quota write
        error would <code>throw</code> from inside an unawaited <code>watch</code> callback —
        an unhandled rejection your app would never see.
      </p>
      <div class="row">
        <button @click="simulateWriteFailure">Simulate a failed write</button>
        <span class="kv" style="margin-left:auto"><span class="kv-key">value</span><span class="kv-val">{{ flaky }}</span></span>
      </div>
      <pre v-if="flakyError" style="margin-top:0.5rem;color:#b91c1c">{{ flakyError }}</pre>
    </div>

    <!-- quota-exceeded recovery -->
    <div class="card">
      <div class="card-title">QuotaExceededError — sweep expired keys, retry once</div>
      <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.5rem">
        Seeds an already-expired TTL key, then simulates the adapter reporting
        <code>QuotaExceededError</code> on the next write. <code>useStorage</code> sweeps this
        adapter's expired entries and retries the write once before giving up.
      </p>
      <div class="row">
        <button @click="simulateQuotaExceeded" :disabled="quotaBusy">Simulate quota exceeded</button>
      </div>
      <div v-if="quotaStatus" class="badge" :class="quotaStatus.startsWith('✓') ? 'badge-green' : 'badge-red'" style="margin-top:0.5rem">
        {{ quotaStatus }}
      </div>
    </div>
  </div>
</template>
