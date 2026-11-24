import assert from 'node:assert/strict'
import test from 'node:test'
import {
  backupFileName,
  decryptBackup,
  encryptBackup,
  parseBackup,
  serializeBackup,
  type BackupEnvelope,
} from './backup'

const SALT = new Uint8Array(16).fill(9)
const IV = new Uint8Array(12).fill(4)
const CREATED = '2026-11-24T10:00:00.000Z'

function envelope(passphrase = 'correct horse battery', payload = '{"hello":"₹1,23,456"}'): BackupEnvelope {
  return encryptBackup(payload, passphrase, { salt: SALT, iv: IV }, CREATED)
}

test('round-trips a payload through encryption', () => {
  const backup = envelope()
  assert.equal(decryptBackup(backup, 'correct horse battery'), '{"hello":"₹1,23,456"}')
})

test('wrong passphrase fails cleanly', () => {
  const backup = envelope()
  assert.throws(() => decryptBackup(backup, 'wrong passphrase'), /does not open this backup/)
})

test('short passphrases are refused', () => {
  assert.throws(() => envelope('short'), /at least 8 characters/)
})

test('tampering with the ciphertext is detected', () => {
  const backup = envelope()
  const tampered: BackupEnvelope = {
    ...backup,
    data: backup.data.slice(0, -4) + 'AAAA',
  }
  assert.throws(() => decryptBackup(tampered, 'correct horse battery'), /damaged/)
})

test('envelope survives serialisation', () => {
  const backup = envelope()
  const restored = parseBackup(serializeBackup(backup))
  assert.equal(decryptBackup(restored, 'correct horse battery'), '{"hello":"₹1,23,456"}')
})

test('rejects foreign or malformed files', () => {
  assert.throws(() => parseBackup('{}'), /not a SiteBooks backup/)
  assert.throws(() => parseBackup('not json'), /not a SiteBooks backup/)
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'sitebooks', kind: 'backup', v: 99 })),
    /newer version/
  )
})

test('backup filename is dated', () => {
  assert.equal(backupFileName(CREATED), 'sitebooks-backup-2026-11-24.sbbackup')
})

test('different passphrases produce different ciphertext', () => {
  const a = envelope('passphrase-one')
  const b = envelope('passphrase-two')
  assert.notEqual(a.data, b.data)
})
