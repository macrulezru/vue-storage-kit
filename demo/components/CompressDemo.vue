<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { compress, decompress, isCompressed, CompressAdapter } from 'vue-storage-kit/compress'
import { MemoryStorageAdapter, useStorage } from 'vue-storage-kit'

// ── useStorage({ compress: true }) — built into the main read/write pipeline ──
const { value: compressedNote, isReady: compressedNoteReady } = useStorage('demo:compressed-note', {
  defaultValue: '',
  target: 'local',
  compress: true,
})
// localStorage.getItem() isn't a Vue-reactive read, so a plain computed()
// over it would only ever evaluate once and never update as the note is
// edited. Track it as a ref, refreshed after each write settles.
const rawCompressedNote = ref<string | null>(localStorage.getItem('demo:compressed-note'))

// useStorage() writes asynchronously (module load + adapter.setItem) and
// doesn't expose a public "write completed" signal — poll for the change
// instead of guessing a fixed delay, so this is exact regardless of how
// long that write actually takes.
async function waitForCompressedNoteWrite(previous: string | null, timeoutMs = 2000): Promise<string | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const current = localStorage.getItem('demo:compressed-note')
    if (current !== previous) return current
    await new Promise((r) => setTimeout(r, 10))
  }
  return localStorage.getItem('demo:compressed-note')
}

watch(compressedNote, async () => {
  rawCompressedNote.value = await waitForCompressedNoteWrite(rawCompressedNote.value)
})
const compressedNoteSize = computed(() =>
  rawCompressedNote.value ? new TextEncoder().encode(rawCompressedNote.value).length : 0,
)
const compressedNotePlainSize = computed(() => new TextEncoder().encode(compressedNote.value).length)

function fillCompressedNote() {
  compressedNote.value = SAMPLE.repeat(4)
}

const SAMPLE = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt.`

const input = ref(SAMPLE)
const compressed = ref('')
const decompressed = ref('')
const algorithm = ref<'gzip' | 'deflate' | 'deflate-raw'>('gzip')
const busy = ref(false)

const originalSize = () => new TextEncoder().encode(input.value).length
const compressedSize = () => new TextEncoder().encode(compressed.value).length
const ratio = () => compressed.value
  ? ((1 - compressedSize() / originalSize()) * 100).toFixed(1)
  : '—'

async function doCompress() {
  busy.value = true
  compressed.value = await compress(input.value, { algorithm: algorithm.value })
  decompressed.value = ''
  busy.value = false
}

async function doDecompress() {
  busy.value = true
  decompressed.value = await decompress(compressed.value)
  busy.value = false
}

// CompressAdapter demo
const baseAdapter = new MemoryStorageAdapter()
const adapter = new CompressAdapter(baseAdapter, { algorithm: 'gzip' })
const adapterKey = 'compressed-value'
const adapterInput = ref('Secret text that will be compressed and stored')
const adapterRaw = ref('')
const adapterDecoded = ref('')

async function saveCompressed() {
  await adapter.setCompressed(adapterKey, adapterInput.value)
  adapterRaw.value = (await baseAdapter.getItem(adapterKey)) ?? ''
}

async function readDecompressed() {
  adapterDecoded.value = (await adapter.getDecompressed(adapterKey)) ?? '(empty)'
}
</script>

<template>
  <div>
    <h2 class="section-title">🗜️ Compression</h2>
    <p class="section-desc">
      The <code>vue-storage-kit/compress</code> subpackage provides async
      <code>compress()</code> / <code>decompress()</code> via the native Compression Streams API
      (gzip, deflate, deflate-raw). Zero extra dependencies.
      <code>CompressAdapter</code> wraps any <code>StorageAdapter</code>.
    </p>

    <!-- useStorage({ compress: true }) -->
    <div class="card">
      <div class="card-title">useStorage({ compress: true }) — built into the pipeline</div>
      <div v-if="!compressedNoteReady" style="color:var(--muted)">Loading…</div>
      <template v-else>
        <textarea v-model="compressedNote" rows="4" placeholder="Type something, or fill with sample text…" />
        <div class="row" style="margin-top:0.5rem">
          <button class="ghost" @click="fillCompressedNote">Fill with repetitive sample text</button>
          <span style="margin-left:auto;font-size:0.82rem;color:var(--muted)" v-if="rawCompressedNote">
            plain {{ compressedNotePlainSize }} B → stored {{ compressedNoteSize }} B
          </span>
        </div>
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
          Same option shape as <code>encrypt</code> — no separate adapter wrapper needed.
          Combine both: <code>{ compress: true, encrypt: { password } }</code> compresses
          the plaintext, then encrypts (compressing ciphertext gains nothing).
        </p>
      </template>
      <pre style="margin-top:0.5rem">const { value } = useStorage('note', {
  defaultValue: '',
  compress: true,
})</pre>
    </div>

    <!-- standalone compress/decompress -->
    <div class="card">
      <div class="card-title">compress() / decompress()</div>
      <div class="row">
        <label>Algorithm</label>
        <select v-model="algorithm" style="flex:1">
          <option>gzip</option>
          <option>deflate</option>
          <option>deflate-raw</option>
        </select>
      </div>
      <textarea v-model="input" rows="5" />
      <div class="row" style="margin-top:0.5rem">
        <button @click="doCompress" :disabled="busy">Compress</button>
        <button class="ghost" @click="doDecompress" :disabled="busy || !compressed">Decompress</button>
        <span style="margin-left:auto;font-size:0.82rem;color:var(--muted)">
          {{ originalSize() }} B → {{ compressed ? compressedSize() + ' B' : '—' }}
          <span v-if="compressed" class="badge badge-green" style="margin-left:0.4rem">
            {{ ratio() }}% smaller
          </span>
        </span>
      </div>
      <div v-if="compressed">
        <div style="font-size:0.78rem;color:var(--muted);margin:0.5rem 0 0.25rem">
          Compressed (base64, prefixed with <code>vsk:gzip:</code>):
        </div>
        <pre style="max-height:80px">{{ compressed.slice(0, 200) }}…</pre>
        <div style="font-size:0.78rem;color:var(--muted);margin:0.5rem 0 0.25rem">
          isCompressed(): <span class="badge badge-blue">{{ isCompressed(compressed) }}</span>
        </div>
      </div>
      <div v-if="decompressed">
        <div style="font-size:0.78rem;color:var(--muted);margin:0.5rem 0 0.25rem">Decompressed:</div>
        <pre>{{ decompressed.slice(0, 300) }}</pre>
        <div class="badge badge-green">✓ Round-trip OK</div>
      </div>
    </div>

    <!-- CompressAdapter -->
    <div class="card">
      <div class="card-title">CompressAdapter — wraps MemoryStorageAdapter</div>
      <div class="row">
        <input v-model="adapterInput" type="text" style="flex:1" />
        <button @click="saveCompressed">Save compressed</button>
        <button class="ghost" @click="readDecompressed" :disabled="!adapterRaw">Decompress</button>
      </div>
      <div v-if="adapterRaw" style="margin-top:0.5rem">
        <div class="kv"><span class="kv-key">Raw in adapter</span>
          <span class="kv-val" style="font-size:0.75rem;font-family:monospace">{{ adapterRaw.slice(0, 60) }}…</span>
        </div>
        <div v-if="adapterDecoded" class="kv">
          <span class="kv-key">Decompressed</span>
          <span class="kv-val">{{ adapterDecoded }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
