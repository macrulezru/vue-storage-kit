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
    // Cleaning is done once, up front, by the `build` script (`rm -rf dist`)
    // instead of here — tsup runs every config in this array concurrently,
    // so a `clean: true` on any one of them races the others: it was
    // observed to `rm -rf`-then-recreate `dist/` *after* the nuxt/module
    // group below had already written `dist/nuxt/module.d.ts`, silently
    // deleting that file on a fresh build (reproduced by isolating each
    // config combination — module.d.ts survived alone or paired with the
    // runtime group, but vanished only once this group's `clean: true` was
    // back in the mix).
    clean: false,
    splitting: true,
    treeshake: true,
    target: 'es2020',
    external: ['vue', '@nuxt/kit', 'pinia', '@vue/devtools-api', 'react'],
  },
  {
    // Nuxt module entry point, built separately from the main group above:
    // it only runs in Nuxt's Node build step (external: '@nuxt/kit'), and
    // unlike the runtime group below, nothing in module.ts itself touches
    // the Nuxt-only virtual alias `#imports` — tsconfig.json's own
    // `src/nuxt/runtime/**` exclusion already confirms only that subfolder
    // needs it, so `dts: true` here is safe and gives consumers real types
    // for `ModuleOptions` (the `storageKit: {...}` block in nuxt.config.ts).
    entry: {
      'nuxt/module': 'src/nuxt/module.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false,
    splitting: false,
    treeshake: true,
    target: 'es2020',
    external: ['@nuxt/kit'],
  },
  {
    // Runtime group: `#imports` is a Nuxt-only virtual alias with no real
    // module to resolve or generate types against outside of a Nuxt app
    // (see the `src/nuxt/runtime/**` exclusion in tsconfig.json), so this
    // group stays dts: false.
    entry: {
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
