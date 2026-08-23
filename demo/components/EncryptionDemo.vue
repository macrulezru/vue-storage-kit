<script setup lang="ts">
import { ref } from 'vue'
import { useStorage, _clearInstanceCache } from 'vue-storage-kit'

const password = ref('my-secret-password')
const inputValue = ref('Hello, encrypted world!')
const rawInStorage = ref<string | null>(null)
const decrypted = ref<string | null>(null)
const busy = ref(false)
const error = ref('')

const { value: encValue, isReady } = useStorage('demo:encrypted', {
  defaultValue: '',
  encrypt: { password: password.value, iterations: 10_000 },
  onError: (err) => { error.value = JSON.stringify(err) },
})

async function save() {
  busy.value = true
  error.value = ''
  encValue.value = inputValue.value
  // Give watcher time to write async
  await new Promise((r) => setTimeout(r, 300))
  rawInStorage.value = localStorage.getItem('demo:encrypted')
  busy.value = false
}

async function readBack() {
  busy.value = true
  // decrypt inline using the crypto subpackage
  const raw = localStorage.getItem('demo:encrypted')
  if (!raw) { decrypted.value = '(nothing stored yet)'; busy.value = false; return }
  try {
    const { decrypt } = await import('vue-storage-kit/crypto')
    const plain = await decrypt(raw, { password: password.value, iterations: 10_000 })
    const envelope = JSON.parse(plain) as { d: string }
    decrypted.value = JSON.parse(envelope.d) as string
  } catch (e) {
    decrypted.value = `Error: ${e}`
  }
  busy.value = false
}

// ── Key rotation — re-encrypt existing stored data under a new password ──────
const newPassword = ref('a-brand-new-password')
const rotateStatus = ref('')
const rotateBusy = ref(false)

async function rotateKey() {
  rotateBusy.value = true
  rotateStatus.value = ''
  try {
    const { rotateEncryptedKey, decrypt } = await import('vue-storage-kit/crypto')
    await rotateEncryptedKey(
      'local',
      'demo:encrypted',
      { password: password.value, iterations: 10_000 },
      { password: newPassword.value, iterations: 10_000 },
    )

    const raw = localStorage.getItem('demo:encrypted')!
    const oldStillWorks = await decrypt(raw, { password: password.value, iterations: 10_000 })
      .then(() => true).catch(() => false)
    const newWorks = await decrypt(raw, { password: newPassword.value, iterations: 10_000 })
      .then(() => true).catch(() => false)

    password.value = newPassword.value
    rawInStorage.value = raw
    rotateStatus.value = oldStillWorks
      ? '⚠️ old password still decrypts it — something is wrong'
      : newWorks
        ? '✓ rotated — old password now fails, new password works'
        : '⚠️ new password does not decrypt it — something is wrong'
  } catch (e) {
    rotateStatus.value = `Error: ${e}`
  }
  rotateBusy.value = false
}
</script>

<template>
  <div>
    <h2 class="section-title">🔐 Encryption</h2>
    <p class="section-desc">
      Pass <code>encrypt: { password }</code> to enable AES-GCM encryption.
      The key is derived via PBKDF2. The raw bytes stored are base64(salt + IV + ciphertext).
      The package imports <code>/crypto</code> lazily — zero cost if unused.
    </p>

    <div class="card">
      <div class="card-title">Write encrypted value</div>
      <div class="row">
        <label>Password</label>
        <input v-model="password" type="password" style="flex:1" />
      </div>
      <div class="row">
        <label>Value</label>
        <input v-model="inputValue" type="text" style="flex:1" />
      </div>
      <div class="row">
        <button @click="save" :disabled="busy">Save to storage</button>
        <button class="ghost" @click="readBack" :disabled="busy">Read back &amp; decrypt</button>
        <span v-if="busy" style="font-size:0.8rem;color:var(--muted)">Working…</span>
      </div>
      <div v-if="error" class="badge badge-red" style="margin-top:0.5rem">{{ error }}</div>
    </div>

    <div v-if="rawInStorage !== null" class="card">
      <div class="card-title">Raw value in localStorage (base64 ciphertext)</div>
      <pre>{{ rawInStorage }}</pre>
      <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
        This is what an attacker sees — no plaintext, no structure visible.
      </p>
    </div>

    <div v-if="decrypted !== null" class="card">
      <div class="card-title">Decrypted value (round-trip verified)</div>
      <div style="font-size:1.1rem;font-weight:600;padding:0.5rem 0">{{ decrypted }}</div>
      <div class="badge badge-green">✓ Round-trip successful</div>
    </div>

    <div class="card">
      <div class="card-title">Key rotation — rotateEncryptedKey()</div>
      <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.5rem">
        Save a value above first. This re-encrypts the value already sitting in storage under a
        new password, without ever exposing the plaintext to the caller.
      </p>
      <div class="row">
        <label>New password</label>
        <input v-model="newPassword" type="password" style="flex:1" />
      </div>
      <div class="row">
        <button @click="rotateKey" :disabled="rotateBusy || !rawInStorage">Rotate key</button>
        <span v-if="rotateBusy" style="font-size:0.8rem;color:var(--muted)">Working…</span>
      </div>
      <div v-if="rotateStatus" class="badge" :class="rotateStatus.startsWith('✓') ? 'badge-green' : 'badge-red'" style="margin-top:0.5rem">
        {{ rotateStatus }}
      </div>
      <pre style="margin-top:0.5rem">await rotateEncryptedKey(
  'local', 'demo:encrypted',
  { password: oldPassword }, { password: newPassword },
)</pre>
    </div>

    <div class="card">
      <div class="card-title">Code</div>
      <pre>const { value } = useStorage('demo:encrypted', {
  defaultValue: '',
  encrypt: { password: 'my-secret-password', iterations: 100_000 },
})</pre>
    </div>
  </div>
</template>
