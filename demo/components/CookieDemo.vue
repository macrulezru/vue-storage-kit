<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCookie } from 'vue-storage-kit'

// Reactive cookie — JSON-serialised object
const { value: prefs } = useCookie<{ lang: string; color: string }>('demo-prefs', {
  defaultValue: { lang: 'en', color: '#3b82f6' },
  expires: 7,    // days
  sameSite: 'lax',
})

// Simple string cookie with 1-day expiry
const { value: banner } = useCookie<string>('demo-banner', {
  defaultValue: '',
  expires: 1,
})

const allCookies = computed(() =>
  document.cookie
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean),
)
</script>

<template>
  <div>
    <h2 class="section-title">🍪 Cookies</h2>
    <p class="section-desc">
      <code>useCookie&lt;T&gt;</code> returns a reactive <code>Ref</code> backed by a browser cookie.
      It uses the same JSON serializer as <code>useStorage</code> and supports all standard cookie options.
    </p>

    <div class="info">
      This demo is a plain client-side Vite app, so <code>useCookie</code> here is the client-only
      version exported from the package root. Inside a <strong>Nuxt</strong> app with the
      <code>vue-storage-kit/nuxt</code> module registered, the same auto-imported <code>useCookie()</code>
      call resolves to an SSR-aware version instead — it reads/writes through the H3
      request/response on the server, so <code>httpOnly</code> actually works and SSR output
      reflects the real cookie value instead of always falling back to <code>defaultValue</code>.
    </div>

    <div class="grid2">
      <!-- prefs cookie -->
      <div class="card">
        <div class="card-title">JSON cookie — preferences (7 days)</div>
        <div class="row">
          <label>Language</label>
          <select v-model="prefs.lang" style="flex:1">
            <option>en</option><option>fr</option><option>de</option><option>es</option>
          </select>
        </div>
        <div class="row">
          <label>Accent</label>
          <input v-model="prefs.color" type="color" style="width:50px;cursor:pointer;border:none;padding:2px" />
          <span style="font-size:0.82rem">{{ prefs.color }}</span>
        </div>
        <div class="divider" />
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div
            style="width:32px;height:32px;border-radius:6px"
            :style="{ background: prefs.color }"
          />
          <span style="font-size:0.82rem;color:var(--muted)">
            lang: <strong>{{ prefs.lang }}</strong>
          </span>
        </div>
      </div>

      <!-- banner cookie -->
      <div class="card">
        <div class="card-title">String cookie — banner text (1 day)</div>
        <div class="row">
          <input
            v-model="banner"
            type="text"
            placeholder="Banner text…"
            style="flex:1"
          />
        </div>
        <div style="margin-top:0.5rem;padding:0.6rem;background:#fef9c3;border-radius:4px;font-size:0.85rem" v-if="banner">
          📢 {{ banner }}
        </div>
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
          Stored as <code>demo-banner=&lt;encoded-value&gt;</code>
        </p>
      </div>
    </div>

    <!-- all cookies -->
    <div class="card">
      <div class="card-title">All cookies on this page</div>
      <div v-if="allCookies.length === 0" style="color:var(--muted)">No cookies set yet.</div>
      <div v-for="c in allCookies" :key="c" class="mono" style="display:block;margin-bottom:0.3rem">
        {{ c }}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Code</div>
      <pre>const { value: prefs } = useCookie&lt;{ lang: string; color: string }&gt;('demo-prefs', {
  defaultValue: { lang: 'en', color: '#3b82f6' },
  expires: 7,       // days (or a Date)
  sameSite: 'lax',
  secure: false,    // true in production
})</pre>
    </div>
  </div>
</template>
