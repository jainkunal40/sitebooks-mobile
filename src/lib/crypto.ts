/**
 * Pure cryptography helpers (no Expo imports) so they can be unit-tested in Node.
 *
 * Identity is an Ed25519 keypair. The private key never leaves the device and is
 * stored in the OS secure store, never in SQLite and never inside a share pack.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'

const HEX = '0123456789abcdef'

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15]
  }
  return out
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Hex string must have an even length')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('Invalid hex string')
    out[i] = byte
  }
  return out
}

/** UTF-8 encode without relying on TextEncoder (not guaranteed in Hermes). */
export function utf8(input: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        i++
      }
    }
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63)
      )
    }
  }
  return Uint8Array.from(out)
}

export function fromUtf8(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const first = bytes[i]
    if (first < 0x80) {
      out += String.fromCharCode(first)
      i += 1
    } else if (first < 0xe0) {
      out += String.fromCharCode(((first & 0x1f) << 6) | (bytes[i + 1] & 63))
      i += 2
    } else if (first < 0xf0) {
      out += String.fromCharCode(
        ((first & 0x0f) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63)
      )
      i += 3
    } else {
      const code =
        ((first & 0x07) << 18) |
        ((bytes[i + 1] & 63) << 12) |
        ((bytes[i + 2] & 63) << 6) |
        (bytes[i + 3] & 63)
      const offset = code - 0x10000
      out += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
      i += 4
    }
  }
  return out
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(typeof input === 'string' ? utf8(input) : input))
}

/** 32-byte Ed25519 private key. */
export function publicKeyFromSecret(secretKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(secretKey)
}

export function signBytes(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, secretKey)
}

export function verifyBytes(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

/**
 * Deterministic JSON: object keys sorted, no whitespace. Signatures must be
 * computed over exactly the bytes that the recipient will re-create.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`
}
