import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname, 'demo'),
  plugins: [vue()],
  resolve: {
    alias: [
      { find: 'vue-storage-kit/pinia',    replacement: resolve(__dirname, 'src/pinia/index.ts') },
      { find: 'vue-storage-kit/compress', replacement: resolve(__dirname, 'src/compress/index.ts') },
      { find: 'vue-storage-kit/crypto',   replacement: resolve(__dirname, 'src/crypto/index.ts') },
      { find: 'vue-storage-kit/sync',     replacement: resolve(__dirname, 'src/sync/index.ts') },
      { find: 'vue-storage-kit/devtools', replacement: resolve(__dirname, 'src/devtools/index.ts') },
      { find: 'vue-storage-kit',          replacement: resolve(__dirname, 'src/index.ts') },
    ],
  },
  server: {
    port: 5173,
    open: true,
  },
})
