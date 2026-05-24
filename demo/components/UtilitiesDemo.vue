<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getStorageQuota,
  exportStorage,
  importStorage,
  clearStorage,
  useStorageKeys,
} from 'vue-storage-kit'

interface Quota { quota: number; usage: number; usagePercent: number }

const quota = ref<Quota | null>(null)
const { keys } = useStorageKeys('demo:')
const snapshot = ref('')
const importText = ref('')
const statusMsg = ref('')

onMounted(async () => {
  quota.value = await getStorageQuota()
})

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function doExport() {
  const snap = exportStorage('local', 'demo:')
  snapshot.value = JSON.stringify(snap, null, 2)
  statusMsg.value = `Exported ${Object.keys(snap).length} key(s)`
}

function doImport() {
  try {
    const snap = JSON.parse(importText.value || snapshot.value) as Record<string, string>
    importStorage(snap, 'local', { overwrite: true })
    statusMsg.value = `Imported ${Object.keys(snap).length} key(s)`
    window.location.reload()
  } catch {
    statusMsg.value = 'Error: invalid JSON'
  }
}

function doClear() {
  clearStorage('local', 'demo:')
  snapshot.value = ''
  statusMsg.value = 'Cleared all demo: keys'
  window.location.reload()
}
</script>

<template>
  <div>
    <h2 class="section-title">🔧 Utilities</h2>
    <p class="section-desc">
      Standalone helper functions for quota inspection, bulk export/import, and key listing.
      These operate directly on the underlying storage adapter.
    </p>

    <!-- quota -->
    <div class="card">
      <div class="card-title">getStorageQuota() — navigator.storage.estimate()</div>
      <div v-if="!quota" style="color:var(--muted)">Loading…</div>
      <template v-else>
        <div class="kv">
          <span class="kv-key">Total quota</span>
          <span class="kv-val">{{ fmt(quota.quota) }}</span>
        </div>
        <div class="kv">
          <span class="kv-key">Used</span>
          <span class="kv-val">{{ fmt(quota.usage) }}</span>
        </div>
        <div style="margin-top:0.5rem">
          <div class="row" style="align-items:center;gap:0.75rem;margin:0">
            <div class="bar-wrap">
              <div class="bar-fill" :style="{ width: quota.usagePercent + '%' }" />
            </div>
            <span style="font-size:0.82rem;white-space:nowrap">{{ quota.usagePercent.toFixed(2) }}%</span>
          </div>
        </div>
      </template>
    </div>

    <!-- useStorageKeys -->
    <div class="card">
      <div class="card-title">useStorageKeys('demo:') — reactive key list</div>
      <div class="row" style="flex-wrap:wrap;gap:0.4rem">
        <span v-if="keys.length === 0" style="color:var(--muted)">No demo: keys in storage</span>
        <span v-for="k in keys" :key="k" class="badge badge-blue">{{ k }}</span>
      </div>
    </div>

    <!-- export / import -->
    <div class="card">
      <div class="card-title">exportStorage / importStorage / clearStorage</div>
      <div class="row">
        <button @click="doExport">Export demo: keys</button>
        <button class="ghost" @click="doImport" :disabled="!snapshot && !importText">Import</button>
        <button class="danger" @click="doClear">Clear demo: keys</button>
      </div>
      <div v-if="statusMsg" class="badge badge-green" style="margin:0.5rem 0;display:inline-block">
        {{ statusMsg }}
      </div>
      <textarea
        v-model="snapshot"
        rows="8"
        placeholder="Exported JSON appears here…"
        style="margin-top:0.5rem"
      />
    </div>
  </div>
</template>
