<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useStorage } from 'vue-storage-kit'

const TTL_MS = 60_000 // 60 seconds

const { value: clicks, expiry, remove } = useStorage('demo:ttl-clicks', {
  defaultValue: 0,
  ttl: TTL_MS,
  onExpire: (key) => console.log(`[demo] ${key} expired`),
})

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const secondsLeft = computed(() => {
  if (!expiry.value) return null
  return Math.max(0, Math.round((expiry.value.getTime() - now.value) / 1000))
})
</script>

<template>
  <div>
    <h2 class="section-title">⏱️ TTL &amp; expiry</h2>
    <p class="section-desc">
      Pass <code>ttl</code> (milliseconds) to any <code>useStorage</code> call.
      The value is lazily checked on every read — no background timers.
      When the key expires it's removed from storage and <code>value</code> resets to <code>defaultValue</code>.
    </p>

    <div class="card">
      <div class="card-title">Click counter — expires in 60 s</div>
      <div class="row" style="align-items:center;gap:1rem">
        <div style="text-align:center">
          <div style="font-size:2.5rem;font-weight:700;line-height:1">{{ clicks }}</div>
          <div style="font-size:0.75rem;color:var(--muted)">clicks</div>
        </div>
        <div style="flex:1">
          <button @click="clicks++" style="width:100%;padding:0.75rem">Click me</button>
        </div>
      </div>

      <div class="divider" />

      <div class="row">
        <span style="font-size:0.82rem;color:var(--muted)">TTL</span>
        <span class="badge badge-blue">60 000 ms</span>
        <span style="margin-left:auto;font-size:0.82rem">
          <template v-if="secondsLeft !== null">
            Expires in <strong>{{ secondsLeft }} s</strong>
            <span v-if="secondsLeft === 0" class="badge badge-red" style="margin-left:0.4rem">EXPIRED</span>
          </template>
          <span v-else style="color:var(--muted)">Not started yet — click above</span>
        </span>
      </div>

      <div class="row">
        <span style="font-size:0.82rem;color:var(--muted)">Expires at</span>
        <span style="margin-left:auto;font-size:0.82rem">
          {{ expiry ? expiry.toLocaleTimeString() : '—' }}
        </span>
      </div>

      <div class="divider" />
      <div class="row">
        <button class="ghost" @click="remove()">Remove key now</button>
        <span style="font-size:0.78rem;color:var(--muted)">
          Removes from storage and resets value to 0
        </span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">How it works</div>
      <pre>const { value, expiry } = useStorage('demo:ttl-clicks', {
  defaultValue: 0,
  ttl: 60_000,            // milliseconds
  onExpire: (key) => …,   // called when expired on read
})</pre>
      <p style="font-size:0.8rem;color:var(--muted);margin-top:0.5rem">
        The envelope stored in localStorage: <code>{"v":1,"d":"5","exp":1234567890,"ts":…}</code>.
        On the next read after <code>exp</code>, the key is removed and <code>defaultValue</code> is returned.
      </p>
    </div>
  </div>
</template>
