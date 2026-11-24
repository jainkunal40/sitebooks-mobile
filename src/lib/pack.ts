/**
 * Share packs — the only way data moves between an owner's device and a
 * client's device.
 *
 * Design rules
 * ------------
 * 1. A pack is self-contained JSON. It travels as a file through WhatsApp,
 *    email, AirDrop, etc. There is no server and no shared database.
 * 2. Every pack is signed by the sender's Ed25519 key. The recipient verifies
 *    the signature against a public key it already trusts, so a client cannot
 *    forge an "approved by owner" decision and an owner cannot be impersonated.
 * 3. Names, amounts and the signature cover a canonical serialisation, so
 *    editing any field invalidates the pack.
 * 4. The private key is never included. Only the public key travels.
 */
import { z } from 'zod'
import {
  bytesToHex,
  canonicalize,
  hexToBytes,
  sha256Hex,
  signBytes,
  utf8,
  verifyBytes,
} from './crypto'

export const PACK_VERSION = 1

export const PACK_KINDS = [
  'invite',
  'pair_ack',
  'project_share',
  'expense_submit',
  'expense_decision',
  'payment_receipt',
  'reminder',
  'revoke',
] as const

export type PackKind = (typeof PACK_KINDS)[number]

export const PACK_KIND_LABELS: Record<PackKind, string> = {
  invite: 'Pairing invite',
  pair_ack: 'Pairing confirmation',
  project_share: 'Project update',
  expense_submit: 'Expense submitted',
  expense_decision: 'Expense decision',
  payment_receipt: 'Payment recorded',
  reminder: 'Reminder',
  revoke: 'Access revoked',
}

const HEX_32 = /^[0-9a-f]{64}$/
const HEX_64 = /^[0-9a-f]{128}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

export const packSenderSchema = z.object({
  /** Stable user id. Owners and clients share the same id space. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Ed25519 public key, hex encoded (32 bytes). */
  publicKey: z.string().regex(HEX_32, 'Invalid public key'),
})

export const packSchema = z.object({
  v: z.literal(PACK_VERSION),
  id: z.string().min(1),
  kind: z.enum(PACK_KINDS),
  sender: packSenderSchema,
  recipientId: z.string().min(1).nullable(),
  createdAt: z.string().regex(ISO_DATE, 'Invalid timestamp'),
  payload: z.unknown(),
  sig: z.string().regex(HEX_64, 'Invalid signature'),
})

export type PackSender = z.infer<typeof packSenderSchema>
export type Pack = z.infer<typeof packSchema>
export type UnsignedPack = Omit<Pack, 'sig'>

/** The exact object that gets signed. `undefined` and `null` must not differ. */
function signableOf(pack: UnsignedPack): Record<string, unknown> {
  return {
    v: pack.v,
    id: pack.id,
    kind: pack.kind,
    sender: {
      id: pack.sender.id,
      name: pack.sender.name,
      publicKey: pack.sender.publicKey,
    },
    recipientId: pack.recipientId ?? null,
    createdAt: pack.createdAt,
    payload: pack.payload ?? null,
  }
}

export function signPack(unsigned: UnsignedPack, secretKey: Uint8Array): Pack {
  const body = signableOf(unsigned)
  const signature = signBytes(secretKey, utf8(canonicalize(body)))
  return { ...(body as Omit<Pack, 'sig'>), sig: bytesToHex(signature) }
}

/** True only when the signature matches the sender's own public key. */
export function verifyPackSignature(pack: Pack): boolean {
  if (!packSchema.safeParse(pack).success) return false
  return verifyBytes(
    hexToBytes(pack.sig),
    utf8(canonicalize(signableOf(pack))),
    hexToBytes(pack.sender.publicKey)
  )
}

/**
 * Signature check plus a trust check against keys this device already knows.
 * A valid signature from an unknown key must still be rejected.
 */
export function verifyPack(pack: Pack, trustedPublicKeys: Iterable<string>): boolean {
  if (!verifyPackSignature(pack)) return false
  for (const key of trustedPublicKeys) {
    if (key === pack.sender.publicKey) return true
  }
  return false
}

/** Stable fingerprint used for de-duplication when the same file arrives twice. */
export function packFingerprint(pack: Pack): string {
  return sha256Hex(canonicalize(signableOf(pack)))
}

export interface PackFile {
  app: 'sitebooks'
  kind: 'pack'
  version: number
  pack: Pack
}

export function encodePackFile(pack: Pack): string {
  const file: PackFile = { app: 'sitebooks', kind: 'pack', version: PACK_VERSION, pack }
  return JSON.stringify(file, null, 2)
}

export function decodePackFile(text: string): Pack {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('This file is not a SiteBooks share file.')
  }
  const file = parsed as Partial<PackFile>
  if (file?.app !== 'sitebooks' || file?.kind !== 'pack' || !file.pack) {
    throw new Error('This file is not a SiteBooks share file.')
  }
  const result = packSchema.safeParse(file.pack)
  if (!result.success) throw new Error('The share file is malformed or was edited.')
  return result.data
}

/** Human-readable filename, e.g. sitebooks-expense-submit-2026-11-24.sbpack */
export function packFileName(pack: Pack): string {
  const date = pack.createdAt.slice(0, 10)
  return `sitebooks-${pack.kind.replace(/_/g, '-')}-${date}.sbpack`
}

/** Validates an already-parsed object as a pack (used by QR payloads). */
export function parsePack(value: unknown): Pack {
  const result = packSchema.safeParse(value)
  if (!result.success) throw new Error('The share data is malformed or was edited.')
  return result.data
}
