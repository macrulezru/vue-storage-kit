<script setup lang="ts">
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Pinia store — persisted automatically because main.ts calls pinia.use(createPiniaPersist())
const useCounterStore = defineStore('demo-counter', {
  state: () => ({
    count: 0,
    username: 'Vue Dev',
  }),
  getters: {
    doubled: (s) => s.count * 2,
  },
  actions: {
    inc()   { this.count++ },
    dec()   { this.count-- },
    reset() { this.count = 0 },
  },
})

const store = useCounterStore()

const rawInStorage = computed(() => {
  const raw = localStorage.getItem('demo-counter')
  return raw ? JSON.parse(raw) : null
})

// Demonstrates createPiniaPersist's onError option: simulate a corrupted
// value already sitting in storage, then create a fresh store that tries
// to restore from it.
const restoreError = ref('')

async function simulateCorruptedRestore() {
  restoreError.value = ''
  localStorage.setItem('demo-corrupted', 'not valid json{{{')

  const { createPinia, getActivePinia, setActivePinia, disposePinia } = await import('pinia')
  const { createPiniaPersist } = await import('vue-storage-kit/pinia')
  const { createApp } = await import('vue')

  // app.use(pinia) makes this throwaway instance the *global* active pinia
  // (pinia.install() calls setActivePinia() internally) — without saving
  // and restoring the real app's instance, this demo component would
  // permanently steal it, breaking the counter store above and anything
  // else on the page that resolves its store via the active pinia rather
  // than an explicit instance.
  const previousPinia = getActivePinia()
  const pinia = createPinia()
  try {
    pinia.use(createPiniaPersist({
      key: 'demo-corrupted',
      onError: (err) => { restoreError.value = JSON.stringify(err, null, 2) },
    }))
    createApp({}).use(pinia)

    const useBrokenStore = defineStore('demo-corrupted-store', { state: () => ({ x: 1 }) })
    // Pinia stores are process-wide by store id, not by pinia instance — use
    // a throwaway id so this doesn't collide with a real store.
    useBrokenStore(pinia)

    await new Promise((r) => setTimeout(r, 10))
  } finally {
    disposePinia(pinia)
    if (previousPinia) setActivePinia(previousPinia)
    localStorage.removeItem('demo-corrupted')
  }
}
</script>

<template>
  <div>
    <h2 class="section-title">📦 Pinia persist</h2>
    <p class="section-desc">
      <code>createPiniaPersist()</code> is a Pinia plugin applied in <code>main.ts</code>.
      It uses <code>ctx.store.$subscribe</code> to write the entire store state to localStorage
      whenever it changes. On startup, the state is restored from storage.
    </p>

    <div class="card">
      <div class="card-title">Counter store — auto-persisted</div>
      <div class="row" style="align-items:center;gap:1.25rem">
        <div style="text-align:center">
          <div style="font-size:2.5rem;font-weight:700">{{ store.count }}</div>
          <div style="font-size:0.75rem;color:var(--muted)">count</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem">
          <button @click="store.inc">+1</button>
          <button @click="store.dec">-1</button>
          <button class="ghost" @click="store.reset">Reset</button>
        </div>
        <div style="flex:1">
          <div class="kv"><span class="kv-key">doubled</span><span class="kv-val">{{ store.doubled }}</span></div>
          <div class="kv" style="margin-top:0.4rem">
            <span class="kv-key">username</span>
            <input v-model="store.username" type="text" style="width:140px;text-align:right" />
          </div>
        </div>
      </div>
      <p style="font-size:0.78rem;color:var(--muted);margin-top:0.75rem">
        Reload the page — <code>count</code> and <code>username</code> persist automatically.
      </p>
    </div>

    <div class="card">
      <div class="card-title">Raw value in localStorage (key: "demo-counter")</div>
      <pre v-if="rawInStorage">{{ JSON.stringify(rawInStorage, null, 2) }}</pre>
      <span v-else style="color:var(--muted)">Not yet written to storage.</span>
    </div>

    <div class="card">
      <div class="card-title">onError — reported instead of silently swallowed</div>
      <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.5rem">
        Writes garbage into a throwaway key, then creates a store that tries to restore from it
        with <code>createPiniaPersist({ onError })</code> — the corrupted-data error is reported
        instead of being silently ignored.
      </p>
      <div class="row">
        <button @click="simulateCorruptedRestore">Simulate corrupted restore</button>
      </div>
      <pre v-if="restoreError" style="margin-top:0.5rem;color:#b91c1c">{{ restoreError }}</pre>
    </div>

    <div class="card">
      <div class="card-title">Setup in main.ts</div>
      <pre>import { createPinia } from 'pinia'
import { createPiniaPersist } from 'vue-storage-kit/pinia'

const pinia = createPinia()
pinia.use(createPiniaPersist({ target: 'local' }))

createApp(App).use(pinia).mount('#app')</pre>
      <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
        Options: <code>key?</code>, <code>pick?</code>, <code>omit?</code>,
        <code>beforeRestore?</code>, <code>afterRestore?</code>.
      </p>
    </div>
  </div>
</template>
