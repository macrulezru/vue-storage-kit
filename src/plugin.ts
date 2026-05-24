import type { App } from 'vue'
import type { StorageTarget, Serializer, StorageError, EncryptOptions } from './core/types'

export interface VueStoragePluginOptions {
  prefix?: string
  defaultTarget?: StorageTarget
  defaultSerializer?: Serializer<unknown>
  defaultEncrypt?: EncryptOptions
  onError?: (err: StorageError) => void
}

const PLUGIN_OPTIONS_KEY = Symbol('vue-storage-kit')

let _globalOptions: VueStoragePluginOptions = {}

export function getGlobalOptions(): VueStoragePluginOptions {
  return _globalOptions
}

export const VueStoragePlugin = {
  install(app: App, options: VueStoragePluginOptions = {}): void {
    _globalOptions = options
    app.provide(PLUGIN_OPTIONS_KEY, options)
  },
}
