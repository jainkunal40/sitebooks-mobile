/**
 * Importing a share pack.
 *
 * Security model:
 *  - The signature is always verified first.
 *  - A valid signature is not enough: the sender's public key must already be
 *    trusted on this device.
 *  - Nothing is written to the books until the pack passes both checks.
 */
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { getDatabase, nowIso } from '@/db'
import {
  getClientProfile,
  markOutboxAnswered,
  saveClientProfile,
  upsertSharedProject,
} from '@/db/client-queries'
import { createExpense } from '@/db/mutations'
import { acceptPairAck } from '@/features/pairing'
import { findClientByPublicKey, getOwner } from '@/db/queries'
import { createId } from '@/lib/random'
import {
  decodePackFile,
  packFingerprint,
  verifyPackSignature,
  type Pack,
} from '@/lib/pack'
import type { ExpenseSubmitPayload, InvitePayload, ProjectSharePayload } from '@/lib/payloads'

export interface ImportOutcome {
  ok: boolean
  title: string
  message: string
}

export class ImportError extends Error {}

export async function pickPackFile(): Promise<Pack | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled || !result.assets?.[0]) return null

  const asset = result.assets[0]
  const file = new File(asset.uri)
  const text = await file.text()
  return decodePackFile(text)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ─── Owner side ─────────────────────────────────────────────

export async function importAsOwner(ownerId: string, pack: Pack): Promise<ImportOutcome> {
  if (!verifyPackSignature(pack)) {
    await recordIncoming(ownerId, pack, 'failed', 'Signature did not match the sender key.')
    throw new ImportError('This file has been edited or was not created by a SiteBooks device.')
  }

  if (pack.kind === 'pair_ack') {
    try {
      const name = await acceptPairAck(ownerId, pack)
      await recordIncoming(ownerId, pack, 'applied', null)
      return {
        ok: true,
        title: 'Client paired',
        message: `${name} can now send you expenses and receive updates.`,
      }
    } catch (cause) {
      await recordIncoming(ownerId, pack, 'failed', String(cause))
      throw cause
    }
  }

  if (pack.kind !== 'expense_submit') {
    await recordIncoming(ownerId, pack, 'failed', `Owner cannot import a ${pack.kind} pack.`)
    return {
      ok: false,
      title: 'Nothing to import',
      message: `A "${pack.kind}" file is not something an owner applies.`,
    }
  }

  const client = await findClientByPublicKey(ownerId, pack.sender.publicKey)
  if (!client) {
    await recordIncoming(ownerId, pack, 'failed', 'Sender is not a paired client.')
    throw new ImportError(
      'This file came from a device you have not paired with. Share a pairing invite first.'
    )
  }

  const payload = pack.payload as Partial<ExpenseSubmitPayload>
  const expense = payload?.expense
  if (!isRecord(expense) || typeof expense.amount !== 'number' || expense.amount <= 0) {
    await recordIncoming(ownerId, pack, 'failed', 'Malformed expense payload.')
    throw new ImportError('The expense in this file is missing required details.')
  }
  if (payload.clientId !== client.id) {
    await recordIncoming(ownerId, pack, 'failed', 'Client id mismatch.')
    throw new ImportError('This file was issued for a different client.')
  }

  await createExpense(ownerId, payload.projectId as string, {
    date: String(expense.date ?? nowIso().slice(0, 10)),
    amount: Number(expense.amount),
    taxAmount: Number(expense.taxAmount ?? 0),
    category: String(expense.category ?? 'misc'),
    vendorName: (expense.vendorName as string | null) ?? null,
    paymentMode: String(expense.paymentMode ?? 'cash'),
    notes: (expense.notes as string | null) ?? null,
    approvalStatus: 'pending',
    submittedByClientId: client.id,
  })

  await recordIncoming(ownerId, pack, 'applied', null)

  return {
    ok: true,
    title: 'Expense received',
    message: `${client.name} submitted ₹${Number(expense.amount).toLocaleString('en-IN')}. It is waiting for your approval.`,
  }
}

async function recordIncoming(
  ownerId: string,
  pack: Pack,
  status: 'applied' | 'failed',
  error: string | null
): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT OR IGNORE INTO message
      (id, owner_id, direction, pack_id, fingerprint, kind, counterparty_id,
       counterparty_name, sender_public_key, payload, status, error, created_at, applied_at)
     VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('msg'),
      ownerId,
      pack.id,
      packFingerprint(pack),
      pack.kind,
      pack.sender.id,
      pack.sender.name,
      pack.sender.publicKey,
      JSON.stringify(pack.payload),
      status,
      error,
      pack.createdAt,
      status === 'applied' ? nowIso() : null,
    ]
  )
}

// ─── Client side ────────────────────────────────────────────

export async function importAsClient(pack: Pack): Promise<ImportOutcome> {
  // One role per device. An owner phone importing a client invite would end up
  // with both records and confusing behaviour, so refuse it explicitly.
  if (await getOwner()) {
    throw new ImportError(
      'This phone is already set up as a designer. Pairing invites are opened on the client\'s phone.'
    )
  }

  if (!verifyPackSignature(pack)) {
    throw new ImportError('This file has been edited or was not created by a SiteBooks device.')
  }

  const profile = await getClientProfile()

  if (pack.kind === 'invite') {
    const payload = pack.payload as Partial<InvitePayload>
    if (!payload?.clientId || !payload.ownerPublicKey) {
      throw new ImportError('This invite is missing details.')
    }
    if (payload.ownerPublicKey !== pack.sender.publicKey) {
      throw new ImportError('The invite key does not match the sender.')
    }
    if (profile) {
      return {
        ok: false,
        title: 'Already connected',
        message: `This device is already connected to ${profile.owner_name}.`,
      }
    }
    await saveClientProfile({
      ownerRemoteId: pack.sender.id,
      ownerName: pack.sender.name,
      ownerPublicKey: pack.sender.publicKey,
      clientRemoteId: payload.clientId,
      pairingCode: payload.pairingCode ?? null,
      name: payload.clientName ?? 'Client',
    })
    return {
      ok: true,
      title: 'Connected',
      message: `You are now connected to ${pack.sender.name}. Ask them to send a project update.`,
    }
  }

  if (!profile) {
    throw new ImportError('Import your pairing invite first, then open project updates.')
  }

  // Every other kind must come from the owner we already trust.
  if (pack.sender.publicKey !== profile.owner_public_key) {
    throw new ImportError('This file came from a different owner than the one you paired with.')
  }

  if (pack.kind === 'project_share') {
    if (pack.recipientId && pack.recipientId !== profile.client_remote_id) {
      throw new ImportError('This update was not addressed to you.')
    }
    const payload = pack.payload as ProjectSharePayload
    if (!payload?.project?.id) throw new ImportError('This update is malformed.')
    await upsertSharedProject(profile.id, packFingerprint(pack), payload)
    return {
      ok: true,
      title: 'Project updated',
      message: `${payload.project.name} is now up to date.`,
    }
  }

  if (pack.kind === 'expense_decision') {
    const payload = pack.payload as { clientRowId?: string; decision?: string }
    const matched = payload.clientRowId
      ? await markOutboxAnswered(profile.id, payload.clientRowId)
      : false
    return {
      ok: true,
      title: 'Decision received',
      message: matched
        ? `Your expense was ${payload.decision ?? 'reviewed'}.`
        : 'The owner reviewed an expense, but it did not match anything you sent.',
    }
  }

  return {
    ok: true,
    title: 'Received',
    message: `A "${pack.kind}" update from ${pack.sender.name} was received.`,
  }
}

/** Chooses the right importer based on whether this device is an owner or client. */
export async function importPack(ownerId: string | null, pack: Pack): Promise<ImportOutcome> {
  if (ownerId) return importAsOwner(ownerId, pack)
  return importAsClient(pack)
}
