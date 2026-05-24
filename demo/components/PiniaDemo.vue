<script setup lang="ts">
import { defineStore } from 'pinia'
import { computed } from 'vue'

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
