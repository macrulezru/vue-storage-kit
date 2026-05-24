import type { Migration, StorageError } from './types'

interface EnvelopeLike {
  v: number
  d: unknown
}

export class SchemaManager {
  static migrate<T>(
    envelope: EnvelopeLike,
    targetVersion: number,
    migrations: Migration[],
    onMigrate?: (from: number, to: number) => void,
    onError?: (err: StorageError) => void,
  ): { data: T; version: number } | null {
    const fromVersion = envelope.v

    if (fromVersion === targetVersion) {
      return { data: envelope.d as T, version: fromVersion }
    }

    if (fromVersion < targetVersion) {
      const chain = migrations
        .filter((m) => m.version > fromVersion && m.version <= targetVersion)
        .sort((a, b) => a.version - b.version)

      try {
        let data: unknown = envelope.d
        for (const migration of chain) {
          data = migration.up(data)
        }
        onMigrate?.(fromVersion, targetVersion)
        return { data: data as T, version: targetVersion }
      } catch (error) {
        onError?.({
          type: 'migration-failed',
          from: fromVersion,
          to: targetVersion,
          error: error as Error,
        })
        return null
      }
    }

    // fromVersion > targetVersion: downgrade
    const chain = migrations
      .filter((m) => m.version > targetVersion && m.version <= fromVersion)
      .sort((a, b) => b.version - a.version)

    const hasAllDown = chain.every((m) => m.down != null)
    if (!hasAllDown) {
      onError?.({
        type: 'migration-failed',
        from: fromVersion,
        to: targetVersion,
        error: new Error('Missing down() migrations for downgrade'),
      })
      return null
    }

    try {
      let data: unknown = envelope.d
      for (const migration of chain) {
        data = migration.down!(data)
      }
      onMigrate?.(fromVersion, targetVersion)
      return { data: data as T, version: targetVersion }
    } catch (error) {
      onError?.({
        type: 'migration-failed',
        from: fromVersion,
        to: targetVersion,
        error: error as Error,
      })
      return null
    }
  }
}
