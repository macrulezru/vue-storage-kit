import { describe, it, expect, vi } from 'vitest'
import { SchemaManager } from '../core/SchemaManager'
import type { Migration, StorageError } from '../core/types'

const migrations: Migration[] = [
  {
    version: 2,
    up: (data: unknown) => {
      const d = data as { darkMode?: boolean }
      return { ...d, theme: d.darkMode ? 'dark' : 'light' }
    },
    down: (data: unknown) => {
      const d = data as { theme?: string }
      const { theme, ...rest } = d
      return { ...rest, darkMode: theme === 'dark' }
    },
  },
  {
    version: 3,
    up: (data: unknown) => {
      const d = data as { lang?: string }
      return { ...d, locale: d.lang ?? 'en' }
    },
    down: (data: unknown) => {
      const d = data as { locale?: string }
      const { locale, ...rest } = d
      return { ...rest, lang: locale }
    },
  },
]

describe('SchemaManager', () => {
  it('returns data as-is when versions match', () => {
    const result = SchemaManager.migrate({ v: 2, d: { theme: 'dark' } }, 2, migrations)
    expect(result).toEqual({ data: { theme: 'dark' }, version: 2 })
  })

  it('upgrades v1 → v3 through the full chain', () => {
    const result = SchemaManager.migrate(
      { v: 1, d: { darkMode: true } },
      3,
      migrations,
    )
    // Spread-based migrations keep old keys alongside new ones
    expect(result?.version).toBe(3)
    expect(result?.data).toMatchObject({ darkMode: true, theme: 'dark', locale: 'en' })
  })

  it('upgrades v1 → v2 (partial chain)', () => {
    const result = SchemaManager.migrate({ v: 1, d: { darkMode: false } }, 2, migrations)
    expect(result?.version).toBe(2)
    expect(result?.data).toMatchObject({ darkMode: false, theme: 'light' })
  })

  it('downgrades v3 → v1 through the full chain', () => {
    const result = SchemaManager.migrate(
      { v: 3, d: { theme: 'dark', locale: 'en' } },
      1,
      migrations,
    )
    expect(result?.version).toBe(1)
    // down() renames locale→lang and theme→darkMode, spreading the rest
    expect(result?.data).toMatchObject({ darkMode: true })
  })

  it('calls onMigrate with from/to versions', () => {
    const onMigrate = vi.fn()
    SchemaManager.migrate({ v: 1, d: {} }, 3, migrations, onMigrate)
    expect(onMigrate).toHaveBeenCalledWith(1, 3)
  })

  it('returns null and calls onError when a migration throws', () => {
    const badMigrations: Migration[] = [
      { version: 2, up: () => { throw new Error('oops') } },
    ]
    const onError = vi.fn()
    const result = SchemaManager.migrate({ v: 1, d: {} }, 2, badMigrations, undefined, onError)
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'migration-failed', from: 1, to: 2 }),
    )
  })

  it('returns null and calls onError when downgrade is missing down()', () => {
    const noDown: Migration[] = [{ version: 2, up: (d) => d }]
    const onError = vi.fn()
    const result = SchemaManager.migrate({ v: 2, d: {} }, 1, noDown, undefined, onError)
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining<Partial<StorageError>>({ type: 'migration-failed' }),
    )
  })
})
