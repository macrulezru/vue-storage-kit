// Stub for Nuxt's virtual '#imports' alias, aliased in vitest.config.ts so
// Vite can resolve the specifier in tests. Actual behavior is provided via
// vi.mock('#imports', ...) in the tests that need it.
export function useRequestEvent(): undefined {
  return undefined
}
