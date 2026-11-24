/**
 * Randomness and identifiers. This is the only place that talks to expo-crypto,
 * which keeps ../crypto.ts pure and testable.
 */
import { getRandomBytes } from 'expo-crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
let counter = Math.floor(Math.random() * 1296)

/** Cryptographically secure random bytes from the OS. */
export function randomBytes(length: number): Uint8Array {
  return getRandomBytes(length)
}

/**
 * Collision-resistant, sortable-ish identifier: 1 prefix + base36 timestamp +
 * 4-char counter + 10 random chars. Mirrors the cuid shape used by the web app.
 */
export function createId(prefix = 'c'): string {
  const time = Date.now().toString(36)
  counter = (counter + 1) % 1679616
  const count = counter.toString(36).padStart(4, '0')
  const bytes = randomBytes(10)
  let rand = ''
  for (let i = 0; i < bytes.length; i++) rand += ALPHABET[bytes[i] % 36]
  return `${prefix}${time}${count}${rand}`
}

/** Short human-friendly pairing code, e.g. "SB-7F3K-9QX2". */
export function createPairingCode(): string {
  const bytes = randomBytes(8)
  let raw = ''
  for (let i = 0; i < 8; i++) raw += ALPHABET[bytes[i] % 36].toUpperCase()
  return `SB-${raw.slice(0, 4)}-${raw.slice(4)}`
}
