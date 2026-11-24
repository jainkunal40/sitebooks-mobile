/**
 * Builds an encrypted .sbbackup seed file from .db-backups/mobile-seed.json so
 * the mobile app can be loaded with real data through its normal restore flow.
 *
 * Usage (from the mobile folder):
 *   npx tsx scripts/make-seed-backup.ts <passphrase> [path-to-seed.json]
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bytesToHex } from '../src/lib/crypto'
import { publicKeyFromSecret } from '../src/lib/crypto'
import {
  backupFileName,
  decryptBackup,
  encryptBackup,
  parseBackup,
  serializeBackup,
  type BackupEnvelope,
} from '../src/lib/backup'

const SEED_JSON = resolve(process.argv[3] ?? 'mobile-seed.json')
const PASSPHRASE = process.argv[2] ?? 'sitebooks-test-2026'
const OUT = resolve(__dirname, '..', `sitebooks-seed-${new Date().toISOString().slice(0, 10)}.sbbackup`)

interface SeedPayload {
  schemaVersion: number
  exportedAt: string
  tables: Record<string, { columns: string[]; rows: (string | number | null)[][] }>
  identity: { secretKey: string | null; publicKey: string | null }
}

function main() {
  const seed = JSON.parse(readFileSync(SEED_JSON, 'utf8')) as SeedPayload

  // One identity for this device, so the seeded owner can sign share packs.
  const secretKey = randomBytes(32)
  const publicKey = bytesToHex(publicKeyFromSecret(secretKey))

  // Make the owner row's public_key match the identity in the backup.
  const owner = seed.tables.owner
  if (!owner) throw new Error('Seed has no owner table')
  const keyIndex = owner.columns.indexOf('public_key')
  if (keyIndex === -1) throw new Error('Owner table has no public_key column')
  for (const row of owner.rows) row[keyIndex] = publicKey

  const payload: SeedPayload = {
    ...seed,
    identity: { secretKey: bytesToHex(secretKey), publicKey },
  }

  const createdAt = new Date().toISOString()
  const envelope = encryptBackup(
    JSON.stringify(payload),
    PASSPHRASE,
    { salt: randomBytes(16), iv: randomBytes(12) },
    createdAt
  )

  writeFileSync(OUT, serializeBackup(envelope))

  // Self-check: decrypt what we just wrote and confirm it round-trips.
  const decoded: BackupEnvelope = parseBackup(readFileSync(OUT, 'utf8'))
  const restored = JSON.parse(decryptBackup(decoded, PASSPHRASE)) as SeedPayload
  const rows = Object.values(restored.tables).reduce((sum, table) => sum + table.rows.length, 0)

  console.log('wrote:', OUT)
  console.log('file name on phone:', backupFileName(createdAt))
  console.log('passphrase:', PASSPHRASE)
  console.log('tables:', Object.keys(restored.tables).length, 'rows:', rows)
  console.log('owner public key:', publicKey)
  console.log('decrypt self-check: OK')
}

main()
