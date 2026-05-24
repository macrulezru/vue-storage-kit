import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createPiniaPersist } from 'vue-storage-kit/pinia'
import App from './App.vue'
import './style.css'

const pinia = createPinia()
pinia.use(createPiniaPersist({ target: 'local' }))

createApp(App).use(pinia).mount('#app')
