import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    crypto: 'src/crypto/index.ts',
    sync: 'src/sync/index.ts',
    pinia: 'src/pinia/index.ts',
    compress: 'src/compress/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  target: 'es2020',
  external: ['vue', '@nuxt/kit', 'pinia'],
})
