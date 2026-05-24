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
        { name: 'useCookie', from: 'vue-storage-kit' },
      ])
    }

    // Register the plugin that installs VueStoragePlugin with prefix option
    addPlugin(resolver.resolve('./runtime/plugin'))
  },
})
