// Ambient types for Nuxt-only build-time constructs used under
// src/nuxt/runtime/**. That directory is excluded from the main tsconfig
// program (see tsconfig.json) because '#imports' and import.meta.server only
// really exist inside a Nuxt app's own build — but test files are allowed to
// dynamically import runtime modules (e.g. to unit test them with mocks),
// which pulls those files back into the type-check graph. These declarations
// keep that path type-checkable without needing a real Nuxt project.

declare module '#imports' {
  import type { H3Event } from 'h3'

  export function useRequestEvent(): H3Event | undefined
  export function useRuntimeConfig(): { public: Record<string, unknown> }
  export function defineNuxtPlugin<T>(fn: (nuxtApp: { vueApp: import('vue').App }) => T): T
}

interface ImportMeta {
  readonly server?: boolean
  readonly client?: boolean
}
