import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      crypto: 'src/crypto/index.ts',
      sync: 'src/sync/index.ts',
      pinia: 'src/pinia/index.ts',
      compress: 'src/compress/index.ts',
      devtools: 'src/devtools/index.ts',
      react: 'src/react/index.ts',
      testing: 'src/testing/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: true,
    treeshake: true,
    target: 'es2020',
    external: ['vue', '@nuxt/kit', 'pinia', '@vue/devtools-api', 'react'],
  },
  {
    // Nuxt module entry point. Built separately (ESM only, no dts): `module.ts`
    // only runs in Nuxt's Node build step, and `runtime/plugin.ts` references
    // the Nuxt-only virtual alias `#imports`, which has no real module to
    // resolve or generate types against outside of a Nuxt app (see the
    // `src/nuxt/runtime/**` exclusion in tsconfig.json).
    entry: {
      'nuxt/module': 'src/nuxt/module.ts',
      'nuxt/runtime/plugin': 'src/nuxt/runtime/plugin.ts',
      'nuxt/runtime/composables/useCookie': 'src/nuxt/runtime/composables/useCookie.ts',
    },
    format: ['esm'],
    dts: false,
    clean: false,
    splitting: false,
    treeshake: true,
    target: 'es2020',
    // h3 is dynamically imported only on the server branch — external so it
    // resolves against the consuming Nuxt app's own h3 instance instead of
    // being bundled into this package.
    external: ['@nuxt/kit', '#imports', 'h3'],
  },
])
