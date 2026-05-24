<script setup lang="ts">
import { ref } from 'vue'
import { useStorage } from 'vue-storage-kit'

interface SettingsV3 {
  theme: 'light' | 'dark' | 'system'
  locale: string
  fontSize: number
}

const migrated = ref(false)

const { value: settings, isReady } = useStorage<SettingsV3>('demo:settings', {
  defaultValue: { theme: 'light', locale: 'en', fontSize: 14 },
  version: 3,
  migrations: [
    {
      // v1 → v2: darkMode: bool → theme: string
      version: 2,
      up: (d: unknown) => {
        const data = d as { darkMode?: boolean; locale?: string }
        return { ...data, theme: data.darkMode ? 'dark' : 'light' }
      },
    },
    {
      // v2 → v3: add fontSize with default
      version: 3,
      up: (d: unknown) => {
        const data = d as { theme?: string; locale?: string }
        return { ...data, fontSize: 14 }
      },
    },
  ],
  onMigrate: (from, to) => {
    migrated.value = true
    console.log(`[demo] migrated settings from v${from} to v${to}`)
  },
})

function seedV1() {
  localStorage.setItem(
    'demo:settings',
    JSON.stringify({ v: 1, d: JSON.stringify({ darkMode: true, locale: 'fr' }), exp: null, ts: Date.now() }),
  )
  window.location.reload()
}

function seedV2() {
  localStorage.setItem(
    'demo:settings',
    JSON.stringify({ v: 2, d: JSON.stringify({ theme: 'dark', locale: 'de' }), exp: null, ts: Date.now() }),
  )
  window.location.reload()
}

function clearSettings() {
  localStorage.removeItem('demo:settings')
  window.location.reload()
}
</script>

<template>
  <div>
    <h2 class="section-title">🔄 Schema migrations</h2>
    <p class="section-desc">
      Seed v1 or v2 data, then reload — <code>SchemaManager</code> runs the migration chain automatically
      and writes the migrated value back with the new version number.
    </p>

    <div class="info">
      <strong>How to use:</strong> click a "Seed" button, then reload the page.
      The <code>onMigrate</code> callback fires and the shape of the data updates automatically.
    </div>

    <div class="card">
      <div class="card-title">Current settings (v3)</div>
      <div v-if="!isReady" style="color:var(--muted)">Loading…</div>
      <template v-else>
        <div class="kv"><span class="kv-key">theme</span><span class="kv-val">{{ settings.theme }}</span></div>
        <div class="kv"><span class="kv-key">locale</span><span class="kv-val">{{ settings.locale }}</span></div>
        <div class="kv"><span class="kv-key">fontSize</span><span class="kv-val">{{ settings.fontSize }}</span></div>
      </template>
      <div v-if="migrated" class="badge badge-green" style="margin-top:0.75rem;display:inline-block">
        ✓ Migration ran this session
      </div>
    </div>

    <div class="card">
      <div class="card-title">Seed old data then reload</div>
      <div class="row">
        <button class="ghost" @click="seedV1">Seed v1 (darkMode: true, locale: "fr")</button>
        <button class="ghost" @click="seedV2">Seed v2 (theme: "dark", locale: "de")</button>
        <button class="danger" @click="clearSettings">Clear</button>
      </div>
      <div class="divider" />
      <pre>migrations: [
  { version: 2, up: (d) => ({ ...d, theme: d.darkMode ? 'dark' : 'light' }) },
  { version: 3, up: (d) => ({ ...d, fontSize: 14 }) },
]</pre>
    </div>
  </div>
</template>
