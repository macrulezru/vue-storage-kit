<script setup lang="ts">
import { ref } from 'vue'
import { useIDBRef, useIndexedDB, useStorage } from 'vue-storage-kit'

// ── useIDBRef — single reactive value backed by IDB ───────────────────────────
const { value: note, isReady: noteReady } = useIDBRef<string>('demo-db', 'notes', 'main-note', '')

// ── useStorage({ target: 'indexeddb' }) — same pipeline as local/session/memory ──
const { value: idbCount, isReady: idbCountReady, expiry: idbCountExpiry } = useStorage('demo:idb-counter', {
  defaultValue: 0,
  target: 'indexeddb',
  ttl: 5 * 60_000,
})

// ── useIndexedDB — low-level CRUD ─────────────────────────────────────────────
const idb = useIndexedDB<string>('demo-db', 'kv-store')

const newKey = ref('')
const newVal = ref('')
const kvEntries = ref<Array<{ key: string; value: string }>>([])

async function loadEntries() {
  const keys = await idb.keys() as string[]
  const entries = await Promise.all(
    keys.map(async (k) => ({ key: k, value: (await idb.get(k)) ?? '' })),
  )
  kvEntries.value = entries
}

async function addEntry() {
  if (!newKey.value.trim()) return
  await idb.set(newKey.value.trim(), newVal.value)
  newKey.value = ''
  newVal.value = ''
  await loadEntries()
}

async function deleteEntry(key: string) {
  await idb.delete(key)
  await loadEntries()
}

async function clearAll() {
  await idb.clear()
  await loadEntries()
}

// Load on mount
loadEntries()
</script>

<template>
  <div>
    <h2 class="section-title">💾 IndexedDB</h2>
    <p class="section-desc">
      <code>useIDBRef</code> gives a reactive <code>Ref&lt;T&gt;</code> backed by a single IDB key —
      watch it like any local state. <code>useIndexedDB</code> exposes a promise-based CRUD API
      for more complex scenarios.
    </p>

    <!-- useStorage target: indexeddb -->
    <div class="card">
      <div class="card-title">useStorage({ target: 'indexeddb' }) — TTL, migrations, encrypt & compress all work here too</div>
      <div v-if="!idbCountReady" style="color:var(--muted)">Connecting…</div>
      <template v-else>
        <div class="row" style="align-items:center;gap:1rem">
          <div style="text-align:center">
            <div style="font-size:2.5rem;font-weight:700;line-height:1">{{ idbCount }}</div>
            <div style="font-size:0.75rem;color:var(--muted)">count</div>
          </div>
          <div style="flex:1">
            <button @click="idbCount++" style="width:100%;padding:0.75rem">+1 (stored in IndexedDB)</button>
          </div>
        </div>
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
          Backed by IndexedDB db <code>vue-storage-kit</code>, store <code>kv</code> — the same
          <code>useStorage()</code> API as local/session/memory, with a 5-minute TTL
          (expires {{ idbCountExpiry ? idbCountExpiry.toLocaleTimeString() : '—' }}).
          For custom databases/stores/indexes, use <code>useIndexedDB()</code> below instead.
        </p>
      </template>
      <pre style="margin-top:0.5rem">useStorage('counter', { target: 'indexeddb', ttl: 5 * 60_000 })</pre>
    </div>

    <!-- useIDBRef -->
    <div class="card">
      <div class="card-title">useIDBRef — reactive "main-note"</div>
      <div v-if="!noteReady" style="color:var(--muted)">Connecting to IndexedDB…</div>
      <template v-else>
        <textarea
          v-model="note"
          rows="4"
          placeholder="Type a note — it's saved to IndexedDB automatically…"
        />
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
          <code>useIDBRef('demo-db', 'notes', 'main-note', '')</code>
          — persists to IndexedDB, survives page reload.
        </p>
      </template>
    </div>

    <!-- useIndexedDB CRUD -->
    <div class="card">
      <div class="card-title">useIndexedDB — key-value store</div>
      <div class="row">
        <input v-model="newKey" type="text" placeholder="Key" style="width:130px" />
        <input v-model="newVal" type="text" placeholder="Value" style="flex:1" />
        <button @click="addEntry">Add</button>
        <button class="danger ghost sm" @click="clearAll">Clear all</button>
      </div>
      <div class="divider" />
      <div v-if="kvEntries.length === 0" style="color:var(--muted);font-size:0.82rem">
        No entries yet.
      </div>
      <table v-else>
        <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in kvEntries" :key="e.key">
            <td>{{ e.key }}</td>
            <td>{{ e.value }}</td>
            <td>
              <button class="danger sm" @click="deleteEntry(e.key)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
