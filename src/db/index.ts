import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { SCHEMA_SQL, SCHEMA_V2_SQL, SCHEMA_V3_SQL, SCHEMA_VERSION } from './schema'

export const DATABASE_NAME = 'sitebooks.db'

let dbPromise: Promise<SQLiteDatabase> | null = null

/** Opens the local database once and brings the schema up to date. */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) dbPromise = openAndMigrate()
  return dbPromise
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME)
  // WAL keeps reads fast while a write is in flight.
  await db.execAsync('PRAGMA journal_mode = WAL;')
  await db.execAsync('PRAGMA foreign_keys = ON;')
  await migrate(db)
  return db
}

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const current = row?.user_version ?? 0
  if (current >= SCHEMA_VERSION) return

  await db.withTransactionAsync(async () => {
    if (current < 1) {
      await db.execAsync(SCHEMA_SQL)
    }
    if (current < 2) {
      await db.execAsync(SCHEMA_V2_SQL)
    }
    if (current < 3) {
      await db.execAsync(SCHEMA_V3_SQL)
    }
    // Future versions append `if (current < 2) { ... }` blocks here.
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}

/** Development helper: wipes every table. Never wired to a user-facing action. */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase()
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  )
  await db.withTransactionAsync(async () => {
    for (const { name } of tables) {
      await db.execAsync(`DELETE FROM "${name}"`)
    }
    await db.execAsync('PRAGMA user_version = 0')
  })
  await migrate(db)
}

export function nowIso(): string {
  return new Date().toISOString()
}
