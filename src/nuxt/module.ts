import { defineNuxtModule, addImports, addPlugin, createResolver } from '@nuxt/kit'

export interface ModuleOptions {
  prefix?: string
  autoImports?: boolean
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
  setup(options: ModuleOptions) {
    const resolver = createResolver(import.meta.url)

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
