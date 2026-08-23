import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createPiniaPersist } from 'vue-storage-kit/pinia'
import { setupDevtools } from 'vue-storage-kit/devtools'
import App from './App.vue'
import './style.css'

const pinia = createPinia()
pinia.use(createPiniaPersist({ target: 'local' }))

const app = createApp(App).use(pinia)
setupDevtools(app)
app.mount('#app')
