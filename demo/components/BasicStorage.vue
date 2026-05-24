<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLocalStorage, useSessionStorage, useStorageKeys, defineStorageKey } from 'vue-storage-kit'

// useLocalStorage — persists across page reloads
const { value: theme } = useLocalStorage('demo:theme', 'light')

// useSessionStorage — cleared when tab closes
const { value: draft } = useSessionStorage('demo:draft', '')

// defineStorageKey — typed key descriptor shared across components
const COUNTER_KEY = defineStorageKey<number>('demo:counter', { defaultValue: 0 })
const { value: counter, remove: resetCounter } = useLocalStorage(COUNTER_KEY._key, COUNTER_KEY._options.defaultValue!)

// Live list of all keys with our prefix
const { keys, refresh } = useStorageKeys('demo:')

const rawTheme = computed(() => localStorage.getItem('demo:theme'))
</script>

<template>
  <div>
    <h2 class="section-title">🗄️ localStorage / sessionStorage</h2>
    <p class="section-desc">
      <code>useLocalStorage</code> and <code>useSessionStorage</code> are drop-in replacements
      for <code>@vueuse/core</code>. Assigning <code>value.value</code> writes to storage synchronously.
      <code>defineStorageKey</code> creates a reusable typed key descriptor.
    </p>

    <div class="grid2">
      <!-- localStorage -->
      <div class="card">
        <div class="card-title">useLocalStorage — theme</div>
        <div class="row">
          <label>Theme</label>
          <select v-model="theme" style="flex:1">
            <option>light</option>
            <option>dark</option>
            <option>system</option>
          </select>
        </div>
        <div class="kv">
          <span class="kv-key">localStorage raw</span>
          <span class="kv-val">{{ rawTheme }}</span>
        </div>
        <p style="margin-top:0.6rem;font-size:0.78rem;color:var(--muted)">
          Reload the page — the value persists.
        </p>
      </div>

      <!-- sessionStorage -->
      <div class="card">
        <div class="card-title">useSessionStorage — draft</div>
        <div class="row">
          <textarea v-model="draft" rows="3" placeholder="Type something…" />
        </div>
        <p style="font-size:0.78rem;color:var(--muted)">
          Cleared when you close the tab. Open a new tab — it won't be there.
        </p>
      </div>
    </div>

    <!-- defineStorageKey -->
    <div class="card">
      <div class="card-title">defineStorageKey — shared typed descriptor</div>
      <div class="row">
        <label>Counter</label>
        <strong style="font-size:1.2rem;min-width:40px;text-align:center">{{ counter }}</strong>
        <button @click="counter++">+1</button>
        <button @click="counter--">-1</button>
        <button class="ghost" @click="resetCounter()">Reset</button>
      </div>
      <pre>{{ `defineStorageKey<number>('demo:counter', { defaultValue: 0 })` }}</pre>
    </div>

    <!-- useStorageKeys -->
    <div class="card">
      <div class="card-title">useStorageKeys — reactive key list (prefix "demo:")</div>
      <div class="row">
        <span v-if="keys.length === 0" style="color:var(--muted)">No keys yet</span>
        <span v-for="k in keys" :key="k" class="badge badge-blue" style="margin-right:0.3rem">{{ k }}</span>
        <button class="ghost sm" @click="refresh()" style="margin-left:auto">Refresh</button>
      </div>
    </div>
  </div>
</template>
