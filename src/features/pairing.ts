/**
 * Pairing.
 *
 * An invite alone proves nothing: anyone could receive the owner's public key.
 * The owner mints a one-time pairing code, sends it inside the signed invite,
 * and only trusts the client when that code returns inside a signed pair_ack.
 */
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { getDatabase, nowIso } from '@/db'
import { getClientProfile, type ClientProfileRow } from '@/db/client-queries'
import type { ClientRow, OwnerRow } from '@/db/types'
import { createId, createPairingCode } from '@/lib/random'
import {
  PACK_VERSION,
  encodePackFile,
  packFileName,
  packFingerprint,
  signPack,
  verifyPackSignature,
  type Pack,
} from '@/lib/pack'
import type { InvitePayload, PairAckPayload } from '@/lib/payloads'
import { loadIdentity } from '@/state/identity'

async function sharePack(pack: Pack, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, packFileName(pack))
  if (file.exists) file.delete()
  file.create()
  await file.write(encodePackFile(pack))

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.')
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle,
    UTI: 'public.json',
  })
}

async function logOutbound(ownerId: string, client: ClientRow, pack: Pack): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT OR IGNORE INTO message
      (id, owner_id, direction, pack_id, fingerprint, kind, counterparty_id,
       counterparty_name, sender_public_key, payload, status, error, created_at, applied_at)
     VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, 'sent', NULL, ?, NULL)`,
    [
      createId('msg'),
      ownerId,
      pack.id,
      packFingerprint(pack),
      pack.kind,
      client.id,
      client.name,
      pack.sender.publicKey,
      JSON.stringify(pack.payload),
      pack.createdAt,
    ]
  )
}

/** Creates the invite pack without sending it (also used for the QR code). */
export async function buildClientInvite(owner: OwnerRow, client: ClientRow): Promise<Pack> {
  const identity = await loadIdentity()
  if (!identity) throw new Error('This device has no identity key.')

  const code = createPairingCode()
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO pairing (client_id, owner_id, code, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET code = excluded.code, created_at = excluded.created_at`,
    [client.id, owner.id, code, nowIso()]
  )

  const payload: InvitePayload = {
    clientId: client.id,
    clientName: client.name,
    ownerPublicKey: identity.publicKey,
    ownerName: owner.name,
    pairingCode: code,
  }

  return signPack(
    {
      v: PACK_VERSION,
      id: createId('pck'),
      kind: 'invite',
      sender: { id: owner.id, name: owner.name, publicKey: identity.publicKey },
      recipientId: client.id,
      createdAt: nowIso(),
      payload,
    },
    identity.secretKey
  )
}

export async function createClientInvite(owner: OwnerRow, client: ClientRow): Promise<Pack> {
  const pack = await buildClientInvite(owner, client)
  await sharePack(pack, `Send pairing invite to ${client.name}`)
  await logOutbound(owner.id, client, pack)
  return pack
}

/** Sends a QR-built invite as a file instead, keeping the same pairing code. */
export async function shareBuiltInvite(owner: OwnerRow, client: ClientRow, pack: Pack): Promise<void> {
  await sharePack(pack, `Send pairing invite to ${client.name}`)
  await logOutbound(owner.id, client, pack)
}

// ─── Owner: accept the ack ──────────────────────────────────

export async function acceptPairAck(ownerId: string, pack: Pack): Promise<string> {
  if (pack.kind !== 'pair_ack') throw new Error('This is not a pairing confirmation.')
  if (!verifyPackSignature(pack)) throw new Error('The pairing confirmation was edited.')

  const payload = pack.payload as Partial<PairAckPayload>
  if (!payload?.clientId || !payload.pairingCode || !payload.publicKey) {
    throw new Error('The pairing confirmation is missing details.')
  }
  if (payload.publicKey !== pack.sender.publicKey) {
    throw new Error('The key in the confirmation does not match the sender.')
  }

  const db = await getDatabase()
  const pairing = await db.getFirstAsync<{ code: string }>(
    'SELECT code FROM pairing WHERE client_id = ? AND owner_id = ?',
    [payload.clientId, ownerId]
  )
  if (!pairing) throw new Error('No invite has been issued to this client yet.')
  if (pairing.code !== payload.pairingCode) {
    throw new Error('The pairing code does not match the invite you sent.')
  }

  const client = await db.getFirstAsync<ClientRow>(
    'SELECT * FROM client WHERE id = ? AND owner_id = ?',
    [payload.clientId, ownerId]
  )
  if (!client) throw new Error('That client is not part of your workspace.')

  await db.runAsync(
    "UPDATE client SET public_key = ?, status = 'active', updated_at = ? WHERE id = ? AND owner_id = ?",
    [payload.publicKey, nowIso(), payload.clientId, ownerId]
  )

  return client.name
}

// ─── Client: send the ack ───────────────────────────────────

export async function sendPairAck(profile: ClientProfileRow): Promise<Pack> {
  const identity = await loadIdentity()
  if (!identity) throw new Error('This device has no identity key.')
  if (!profile.pairing_code) throw new Error('This device has no pairing code. Re-open the invite.')

  const payload: PairAckPayload = {
    clientId: profile.client_remote_id,
    pairingCode: profile.pairing_code,
    publicKey: identity.publicKey,
    deviceName: profile.name,
  }

  const pack = signPack(
    {
      v: PACK_VERSION,
      id: createId('pck'),
      kind: 'pair_ack',
      sender: { id: profile.client_remote_id, name: profile.name, publicKey: identity.publicKey },
      recipientId: profile.owner_remote_id,
      createdAt: nowIso(),
      payload,
    },
    identity.secretKey
  )

  await sharePack(pack, `Send confirmation to ${profile.owner_name}`)
  return pack
}

export async function sendPairAckFromDevice(): Promise<Pack> {
  const profile = await getClientProfile()
  if (!profile) throw new Error('Open your invite first.')
  return sendPairAck(profile)
}
