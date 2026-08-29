import { defineNuxtModule, addImports, addPlugin, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  prefix?: string
  autoImports?: boolean
}

declare module '@nuxt/schema' {
  interface NuxtConfig {
    storageKit?: ModuleOptions
  }
  interface NuxtOptions {
    storageKit: ModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vue-storage-kit',
    configKey: 'storageKit',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    autoImports: true,
  },
  setup(options: ModuleOptions, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Nuxt's own auto-reference machinery (@nuxt/kit's writeTypes) only ever references
    // this package's root `types` entry (dist/index.d.ts) — it resolves `modules: [...]`
    // entries back to their nearest package.json, which is the package root regardless of
    // which subpath was actually imported. That entry never touches ModuleOptions (defined
    // here, in dist/nuxt/module.d.ts), so nuxt.config.ts's `storageKit: {...}` block would
    // silently type as untyped/`any` without this explicit reference.
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ types: 'vue-storage-kit/nuxt' })
    })

    if (options.autoImports) {
      addImports([
        { name: 'useStorage', from: 'vue-storage-kit' },
        { name: 'useLocalStorage', from: 'vue-storage-kit' },
        { name: 'useSessionStorage', from: 'vue-storage-kit' },
        { name: 'useIndexedDB', from: 'vue-storage-kit' },
        { name: 'useIDBRef', from: 'vue-storage-kit' },
        // SSR-aware variant: reads/writes through the H3 request/response on
        // the server (supports httpOnly, reflects real cookie state during
        // SSR) instead of the client-only document.cookie version.
        { name: 'useCookie', from: resolver.resolve('./runtime/composables/useCookie') },
      ])
    }

    // Register the plugin that installs VueStoragePlugin with prefix option
    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})
