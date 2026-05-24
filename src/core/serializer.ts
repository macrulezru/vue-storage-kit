import type { Serializer } from './types'

type Tagged =
  | { __type: 'Date'; value: string }
  | { __type: 'Map'; value: [unknown, unknown][] }
  | { __type: 'Set'; value: unknown[] }
  | { __type: 'undefined' }
  | { __type: 'BigInt'; value: string }

// Date.prototype.toJSON() fires before a JSON.stringify replacer, converting
// Date objects to ISO strings before we can tag them. Walking the value tree
// first and replacing special types with tagged plain objects sidesteps this.
function preProcess(value: unknown): unknown {
  if (value instanceof Date) return { __type: 'Date', value: value.toISOString() } satisfies Tagged
  if (typeof value === 'bigint') return { __type: 'BigInt', value: value.toString() } satisfies Tagged
  if (value instanceof Map) {
    return {
      __type: 'Map',
      value: [...value.entries()].map(([k, v]) => [preProcess(k), preProcess(v)]),
    } satisfies Tagged
  }
  if (value instanceof Set) {
    return { __type: 'Set', value: [...value.values()].map(preProcess) } satisfies Tagged
  }
  if (value === undefined) return { __type: 'undefined' } satisfies Tagged
  if (Array.isArray(value)) return value.map(preProcess)
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = preProcess(v)
    }
    return result
  }
  return value
}

function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && '__type' in value) {
    const tagged = value as Tagged
    if (tagged.__type === 'Date') return new Date(tagged.value)
    if (tagged.__type === 'BigInt') return BigInt(tagged.value)
    if (tagged.__type === 'Map') return new Map(tagged.value as [unknown, unknown][])
    if (tagged.__type === 'Set') return new Set(tagged.value as unknown[])
    if (tagged.__type === 'undefined') return undefined
  }
  return value
}

export function createJSONSerializer<T>(): Serializer<T> {
  return {
    serialize(value: T): string {
      return JSON.stringify(preProcess(value))
    },
    deserialize(raw: string): T {
      return JSON.parse(raw, reviver) as T
    },
  }
}
