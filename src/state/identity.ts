/**
 * Device identity.
 *
 * The Ed25519 private key lives in the OS secure store (Keychain / Keystore),
 * never in SQLite and never in a share pack. Only the public key is stored in
 * the database and shared with clients.
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { bytesToHex, hexToBytes, publicKeyFromSecret } from '@/lib/crypto'
import { randomBytes } from '@/lib/random'

const SECRET_KEY_NAME = 'sitebooks.identity.secret'

// expo-secure-store has no web implementation. Web is not a target platform,
// but keeping a memory fallback stops the dev server from crashing.
let webFallback: string | null = null

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') return webFallback
  return SecureStore.getItemAsync(SECRET_KEY_NAME)
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webFallback = value
    return
  }
  await SecureStore.setItemAsync(SECRET_KEY_NAME, value)
}

export interface DeviceIdentity {
  secretKey: Uint8Array
  publicKey: string
}

export async function loadIdentity(): Promise<DeviceIdentity | null> {
  const stored = await readRaw()
  if (!stored) return null
  try {
    const secretKey = hexToBytes(stored)
    return { secretKey, publicKey: bytesToHex(publicKeyFromSecret(secretKey)) }
  } catch {
    return null
  }
}

export async function createIdentity(): Promise<DeviceIdentity> {
  const secretKey = randomBytes(32)
  await writeRaw(bytesToHex(secretKey))
  return { secretKey, publicKey: bytesToHex(publicKeyFromSecret(secretKey)) }
}

export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  return (await loadIdentity()) ?? (await createIdentity())
}

export async function deleteIdentity(): Promise<void> {
  if (Platform.OS === 'web') {
    webFallback = null
    return
  }
  await SecureStore.deleteItemAsync(SECRET_KEY_NAME)
}

/** Restores a private key from a backup. */
export async function restoreIdentity(secretKeyHex: string): Promise<void> {
  await writeRaw(secretKeyHex)
}
