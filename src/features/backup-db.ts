/**
 * Full database backup and restore.
 *
 * The backup contains every table plus the device identity, so a restored
 * phone keeps the same public key and existing pairings keep working.
 */
import { Directory, File, Paths } from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import { getDatabase, migrate, nowIso } from '@/db'
import { SCHEMA_VERSION } from '@/db/schema'
import {
  backupFileName,
  decryptBackup,
  encryptBackup,
  parseBackup,
  serializeBackup,
} from '@/lib/backup'
import { bytesToHex } from '@/lib/crypto'
import { randomBytes } from '@/lib/random'
import { loadIdentity, restoreIdentity } from '@/state/identity'

export interface TableDump {
  columns: string[]
  rows: unknown[][]
}

export interface BackupPayload {
  schemaVersion: number
  exportedAt: string
  tables: Record<string, TableDump>
  identity: { secretKey: string | null; publicKey: string | null }
}

const LAST_BACKUP_KEY = 'last_backup_at'
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

async function tableNames(): Promise<string[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  return rows.map((row) => row.name)
}

async function columnsOf(table: string): Promise<string[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`)
  return rows.map((row) => row.name)
}

export async function dumpDatabase(): Promise<BackupPayload> {
  const db = await getDatabase()
  const tables: Record<string, TableDump> = {}

  for (const table of await tableNames()) {
    if (!IDENTIFIER.test(table)) continue
    const columns = await columnsOf(table)
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${table}"`)
    tables[table] = {
      columns,
      rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
    }
  }

  const identity = await loadIdentity()

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    tables,
    identity: {
      secretKey: identity ? bytesToHex(identity.secretKey) : null,
      publicKey: identity?.publicKey ?? null,
    },
  }
}

/** Writes an encrypted backup and opens the share sheet. */
export async function createBackup(
  passphrase: string
): Promise<{ fileName: string; uri: string; rows: number }> {
  const payload = await dumpDatabase()
  const createdAt = nowIso()

  const envelope = encryptBackup(
    JSON.stringify(payload),
    passphrase,
    { salt: randomBytes(16), iv: randomBytes(12) },
    createdAt
  )

  const dir = new Directory(Paths.document, 'backups')
  if (!dir.exists) dir.create({ intermediates: true })
  const fileName = backupFileName(createdAt)
  const file = new File(dir, fileName)
  if (file.exists) file.delete()
  file.create()
  await file.write(serializeBackup(envelope))

  const rows = Object.values(payload.tables).reduce((sum, table) => sum + table.rows.length, 0)

  await markBackedUp(createdAt)

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your SiteBooks backup somewhere safe',
      UTI: 'public.json',
    })
  }

  return { fileName, uri: file.uri, rows }
}

export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled || !result.assets?.[0]) return null
  return new File(result.assets[0].uri).text()
}

/**
 * Restores a backup, replacing everything currently on the device.
 * Table and column names are validated against the live schema before use,
 * because the file is untrusted input.
 */
export async function restoreBackup(
  text: string,
  passphrase: string
): Promise<{ rows: number; tables: number; identityRestored: boolean }> {
  const envelope = parseBackup(text)
  const json = decryptBackup(envelope, passphrase)

  let payload: BackupPayload
  try {
    payload = JSON.parse(json) as BackupPayload
  } catch {
    throw new Error('The decrypted backup is not valid data.')
  }
  if (!payload?.tables || typeof payload.tables !== 'object') {
    throw new Error('The backup contains no tables.')
  }

  const liveTables = new Set(await tableNames())
  const db = await getDatabase()

  let rowCount = 0
  let tableCount = 0

  await db.execAsync('PRAGMA foreign_keys = OFF;')
  try {
    await db.withTransactionAsync(async () => {
      for (const table of liveTables) {
        if (!IDENTIFIER.test(table)) continue
        await db.execAsync(`DELETE FROM "${table}"`)
      }

      for (const [table, dump] of Object.entries(payload.tables)) {
        if (!liveTables.has(table) || !IDENTIFIER.test(table)) continue
        const allowed = new Set(await columnsOf(table))
        const columns = dump.columns.filter((column) => IDENTIFIER.test(column) && allowed.has(column))
        if (columns.length === 0) continue

        const placeholders = columns.map(() => '?').join(', ')
        const sql = `INSERT INTO "${table}" (${columns
          .map((column) => `"${column}"`)
          .join(', ')}) VALUES (${placeholders})`

        const columnIndexes = columns.map((column) => dump.columns.indexOf(column))
        for (const row of dump.rows) {
          const values = columnIndexes.map((index) => normalizeValue(row[index]))
          await db.runAsync(sql, values)
          rowCount++
        }
        tableCount++
      }

      await db.execAsync(`PRAGMA user_version = ${Math.min(payload.schemaVersion, SCHEMA_VERSION)}`)
    })
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;')
  }

  // Bring an older backup up to the current schema.
  await migrate(db)

  let identityRestored = false
  if (payload.identity?.secretKey) {
    await restoreIdentity(payload.identity.secretKey)
    identityRestored = true
  }

  return { rows: rowCount, tables: tableCount, identityRestored }
}

/** SQLite binds only primitives; everything here already is, but be defensive. */
function normalizeValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return JSON.stringify(value)
}

export async function getLastBackupAt(): Promise<string | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    LAST_BACKUP_KEY,
  ])
  return row?.value ?? null
}

async function markBackedUp(at: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_BACKUP_KEY, at]
  )
}
