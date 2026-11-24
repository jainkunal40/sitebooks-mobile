/**
 * Base64 for QR payloads. Implemented directly over bytes so it works in
 * Hermes, where `btoa`/`atob` are not guaranteed.
 */
import { fromUtf8, utf8 } from './crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += ALPHABET[(chunk >> 18) & 63]
    out += ALPHABET[(chunk >> 12) & 63]
    out += ALPHABET[(chunk >> 6) & 63]
    out += ALPHABET[chunk & 63]
  }
  const remaining = bytes.length - i
  if (remaining === 1) {
    const chunk = bytes[i] << 16
    out += ALPHABET[(chunk >> 18) & 63]
    out += ALPHABET[(chunk >> 12) & 63]
    out += '=='
  } else if (remaining === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += ALPHABET[(chunk >> 18) & 63]
    out += ALPHABET[(chunk >> 12) & 63]
    out += ALPHABET[(chunk >> 6) & 63]
    out += '='
  }
  return out
}

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '')
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const a = ALPHABET.indexOf(clean[i])
    const b = ALPHABET.indexOf(clean[i + 1] ?? 'A')
    const c = ALPHABET.indexOf(clean[i + 2] ?? 'A')
    const d = ALPHABET.indexOf(clean[i + 3] ?? 'A')
    const chunk = (a << 18) | (b << 12) | (c << 6) | d
    out.push((chunk >> 16) & 255)
    if (i + 2 < clean.length) out.push((chunk >> 8) & 255)
    if (i + 3 < clean.length) out.push(chunk & 255)
  }
  return Uint8Array.from(out)
}

export function encodeBase64Text(text: string): string {
  return bytesToBase64(utf8(text))
}

export function decodeBase64Text(encoded: string): string {
  return fromUtf8(base64ToBytes(encoded))
}

/**
 * URL-safe base64 (RFC 4648 §5): `+` → `-`, `/` → `_`, padding removed.
 * Query strings mangle `+` into a space, so pairing links must use this.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalised = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalised.length % 4 === 0 ? '' : '='.repeat(4 - (normalised.length % 4))
  return base64ToBytes(normalised + padding)
}

export function encodeBase64UrlText(text: string): string {
  return bytesToBase64Url(utf8(text))
}

export function decodeBase64UrlText(encoded: string): string {
  return fromUtf8(base64UrlToBytes(encoded))
}
