<script setup lang="ts">
import { ref } from 'vue'
import { useStorage, useBroadcastChannel } from 'vue-storage-kit'

// ── useStorage with sync enabled ──────────────────────────────────────────────
const { value: syncedNote, isReady } = useStorage('demo:synced-note', {
  defaultValue: '',
  target: 'local',
  sync: { channel: 'vue-storage-kit-demo' },
})

// ── standalone BroadcastChannel ──────────────────────────────────────────────
interface ChatMsg { from: string; text: string; ts: number }

const { isSupported, post, messages } = useBroadcastChannel<ChatMsg>('vsk-chat-demo')
const chatInput = ref('')
const username = ref('Tab-' + Math.floor(Math.random() * 100))

function sendMessage() {
  if (!chatInput.value.trim()) return
  post({ from: username.value, text: chatInput.value.trim(), ts: Date.now() })
  chatInput.value = ''
}
</script>

<template>
  <div>
    <h2 class="section-title">📡 Tab sync</h2>
    <p class="section-desc">
      Open this demo in a second browser tab and interact with both panels below.
      <code>useStorage</code> with <code>sync: true</code> uses <code>BroadcastChannel</code> to propagate
      writes across tabs instantly. <code>useBroadcastChannel</code> is a standalone cross-tab messaging composable.
    </p>

    <div class="info">
      Open a second tab at the same URL to see cross-tab synchronisation live.
    </div>

    <!-- synced note -->
    <div class="card">
      <div class="card-title">useStorage + sync — shared note</div>
      <div v-if="!isReady" style="color:var(--muted)">Initialising…</div>
      <template v-else>
        <textarea
          v-model="syncedNote"
          rows="4"
          placeholder="Type here — changes appear instantly in the other tab…"
        />
        <p style="font-size:0.78rem;color:var(--muted);margin-top:0.5rem">
          <code>useStorage('demo:synced-note', { sync: { channel: 'vue-storage-kit-demo' } })</code>
        </p>
      </template>
    </div>

    <!-- broadcast channel chat -->
    <div class="card">
      <div class="card-title">useBroadcastChannel — cross-tab chat</div>
      <div v-if="!isSupported" class="badge badge-red">BroadcastChannel not supported in this browser</div>
      <template v-else>
        <div class="row" style="margin-bottom:0.6rem">
          <label>Your name</label>
          <input v-model="username" type="text" style="width:130px" />
        </div>
        <div class="row">
          <input
            v-model="chatInput"
            type="text"
            placeholder="Message…"
            style="flex:1"
            @keydown.enter="sendMessage"
          />
          <button @click="sendMessage">Send</button>
        </div>
        <div class="divider" />
        <div style="max-height:200px;overflow-y:auto">
          <div v-if="messages.length === 0" style="color:var(--muted);font-size:0.82rem">
            No messages yet — messages sent from other tabs will appear here.
          </div>
          <div v-for="msg in messages" :key="msg.ts" class="msg-bubble">
            <strong>{{ msg.from }}</strong>: {{ msg.text }}
            <span style="float:right;font-size:0.72rem;color:var(--muted)">
              {{ new Date(msg.ts).toLocaleTimeString() }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
