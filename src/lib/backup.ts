/**
 * Encrypted backups.
 *
 * A backup is the entire local database plus the device identity, encrypted
 * with AES-256-GCM under a key derived from a passphrase with scrypt. The
 * result is a single file the owner can keep in Drive, email to themselves, or
 * put on a pen drive — anywhere EXCEPT inside the app.
 *
 * This module is pure (all randomness is passed in) so it can be tested.
 *
 * There is deliberately no recovery of a forgotten passphrase: the file is
 * encrypted, so nobody — including us — can open it without the passphrase.
 */
import { gcm } from '@noble/ciphers/aes.js'
import { scrypt } from '@noble/hashes/scrypt.js'
import { base64ToBytes, bytesToBase64 } from './base64'
import { fromUtf8, utf8 } from './crypto'

export const BACKUP_VERSION = 1
export const BACKUP_APP = 'sitebooks'
export const BACKUP_KIND = 'backup'

// ~100-200 ms on a phone: enough to make guessing expensive, fast enough to
// not annoy the user.
export const KDF_PARAMS = { N: 1 << 14, r: 8, p: 1 } as const
const DK_LEN = 32
const IV_LEN = 12
const SALT_LEN = 16
const MIN_PASSPHRASE = 8

export interface BackupKdf {
  name: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
}

export interface BackupEnvelope {
  app: typeof BACKUP_APP
  kind: typeof BACKUP_KIND
  v: number
  createdAt: string
  cipher: 'aes-256-gcm'
  kdf: BackupKdf
  iv: string
  data: string
}

export interface BackupRandom {
  salt: Uint8Array
  iv: Uint8Array
}

export function deriveKey(passphrase: string, salt: Uint8Array, params: BackupKdf): Uint8Array {
  return scrypt(utf8(passphrase), salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: DK_LEN,
  })
}

export function encryptBackup(
  plaintext: string,
  passphrase: string,
  random: BackupRandom,
  createdAt: string
): BackupEnvelope {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`)
  }
  if (random.salt.length !== SALT_LEN) throw new Error('Invalid salt length')
  if (random.iv.length !== IV_LEN) throw new Error('Invalid IV length')

  const kdf: BackupKdf = { name: 'scrypt', ...KDF_PARAMS, salt: bytesToBase64(random.salt) }
  const key = deriveKey(passphrase, random.salt, kdf)
  const ciphertext = gcm(key, random.iv).encrypt(utf8(plaintext))

  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    createdAt,
    cipher: 'aes-256-gcm',
    kdf,
    iv: bytesToBase64(random.iv),
    data: bytesToBase64(ciphertext),
  }
}

export function decryptBackup(envelope: BackupEnvelope, passphrase: string): string {
  const salt = base64ToBytes(envelope.kdf.salt)
  const iv = base64ToBytes(envelope.iv)
  const key = deriveKey(passphrase, salt, envelope.kdf)
  let plaintext: Uint8Array
  try {
    plaintext = gcm(key, iv).decrypt(base64ToBytes(envelope.data))
  } catch {
    throw new Error('That passphrase does not open this backup, or the file is damaged.')
  }
  return fromUtf8(plaintext)
}

export function serializeBackup(envelope: BackupEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

export function parseBackup(text: string): BackupEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not a SiteBooks backup.')
  }
  const value = parsed as Partial<BackupEnvelope>
  if (value?.app !== BACKUP_APP || value?.kind !== BACKUP_KIND) {
    throw new Error('This file is not a SiteBooks backup.')
  }
  if (typeof value.v !== 'number' || value.v > BACKUP_VERSION) {
    throw new Error('This backup was created by a newer version of SiteBooks.')
  }
  if (value.cipher !== 'aes-256-gcm' || !value.kdf || value.kdf.name !== 'scrypt') {
    throw new Error('Unsupported backup format.')
  }
  if (!value.iv || !value.data || !value.kdf.salt) {
    throw new Error('This backup is incomplete.')
  }
  return value as BackupEnvelope
}

export function backupFileName(createdAt: string): string {
  return `sitebooks-backup-${createdAt.slice(0, 10)}.sbbackup`
}
