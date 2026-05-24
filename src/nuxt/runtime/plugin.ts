import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { VueStoragePlugin } from '../../plugin'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const storageKit = (config.public as Record<string, unknown>).storageKit as
    | { prefix?: string }
    | undefined

  nuxtApp.vueApp.use(VueStoragePlugin, {
    prefix: storageKit?.prefix ?? '',
  })
})
