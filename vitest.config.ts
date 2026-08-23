import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Nuxt's virtual auto-import alias, unresolvable outside a real Nuxt
      // build. Aliased to a stub so Vite can resolve it in tests; the actual
      // behavior comes from vi.mock('#imports', ...) where needed.
      '#imports': fileURLToPath(new URL('./src/__tests__/__mocks__/nuxtImports.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**',
        'src/composables/**',
        'src/adapters/**',
        'src/crypto/**',
        'src/sync/**',
        'src/compress/**',
        'src/pinia/**',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/nuxt/**',
        'src/**/index.ts',
        'src/adapters/IndexedDBAdapter.ts',
        'src/sync/LeaderElection.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
