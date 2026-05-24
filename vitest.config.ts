import { defineConfig } from 'vitest/config'

export default defineConfig({
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
