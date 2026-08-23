<script setup lang="ts">
import { ref, computed, markRaw } from 'vue'
import BasicStorage    from './components/BasicStorage.vue'
import TTLDemo         from './components/TTLDemo.vue'
import MigrationsDemo  from './components/MigrationsDemo.vue'
import EncryptionDemo  from './components/EncryptionDemo.vue'
import SyncDemo        from './components/SyncDemo.vue'
import IndexedDBDemo   from './components/IndexedDBDemo.vue'
import CookieDemo      from './components/CookieDemo.vue'
import StorageListDemo from './components/StorageListDemo.vue'
import UtilitiesDemo   from './components/UtilitiesDemo.vue'
import PiniaDemo       from './components/PiniaDemo.vue'
import CompressDemo    from './components/CompressDemo.vue'
import ResilienceDemo  from './components/ResilienceDemo.vue'

const tabs = [
  { id: 'basic',      label: '🗄️  localStorage / session', component: markRaw(BasicStorage)    },
  { id: 'ttl',        label: '⏱️  TTL & expiry',            component: markRaw(TTLDemo)         },
  { id: 'migrate',    label: '🔄  Schema migrations',       component: markRaw(MigrationsDemo)  },
  { id: 'encrypt',    label: '🔐  Encryption',               component: markRaw(EncryptionDemo)  },
  { id: 'sync',       label: '📡  Tab sync',                 component: markRaw(SyncDemo)        },
  { id: 'idb',        label: '💾  IndexedDB',                component: markRaw(IndexedDBDemo)   },
  { id: 'cookie',     label: '🍪  Cookies',                  component: markRaw(CookieDemo)      },
  { id: 'list',       label: '📋  Storage list',             component: markRaw(StorageListDemo) },
  { id: 'utils',      label: '🔧  Utilities',                component: markRaw(UtilitiesDemo)   },
  { id: 'pinia',      label: '📦  Pinia persist',            component: markRaw(PiniaDemo)       },
  { id: 'compress',   label: '🗜️  Compression',              component: markRaw(CompressDemo)    },
  { id: 'resilience', label: '⚡  Resilience',                component: markRaw(ResilienceDemo)  },
]

const active = ref('basic')
const current = computed(() => tabs.find((t) => t.id === active.value)?.component)
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <strong>vue-storage-kit</strong>
        <span>interactive demo</span>
      </div>
      <nav>
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="{ active: active === tab.id }"
          @click="active = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
      <p class="sidebar-note">
        🔍 Open Vue Devtools → <strong>Storage Kit</strong> tab to inspect every live
        <code>useStorage()</code> instance (wired via <code>setupDevtools()</code> in
        <code>main.ts</code>).
      </p>
    </aside>

    <main class="content">
      <Suspense>
        <component :is="current" />
      </Suspense>
    </main>
  </div>
</template>
