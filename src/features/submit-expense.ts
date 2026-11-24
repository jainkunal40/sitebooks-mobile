import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { saveOutboxPack, type ClientProfileRow } from '@/db/client-queries'
import { nowIso } from '@/db'
import { PACK_VERSION, encodePackFile, packFileName, packFingerprint, signPack, type Pack } from '@/lib/pack'
import type { ExpenseSubmitPayload } from '@/lib/payloads'
import { createId } from '@/lib/random'
import { loadIdentity } from '@/state/identity'

export interface ClientExpenseInput {
  projectId: string
  projectName: string
  date: string
  amount: number
  taxAmount: number
  category: string
  vendorName: string | null
  paymentMode: string
  notes: string | null
}

/**
 * Builds a signed expense request on the client device, sends it through the
 * OS share sheet, and records it in the outbox so the owner's decision can be
 * matched when it comes back.
 */
export async function submitClientExpense(
  profile: ClientProfileRow,
  input: ClientExpenseInput
): Promise<Pack> {
  const identity = await loadIdentity()
  if (!identity) throw new Error('This device has no identity key.')

  const clientRowId = createId('cex')
  const payload: ExpenseSubmitPayload = {
    clientId: profile.client_remote_id,
    projectId: input.projectId,
    projectName: input.projectName,
    expense: {
      clientRowId,
      date: input.date,
      amount: input.amount,
      taxAmount: input.taxAmount,
      category: input.category,
      vendorName: input.vendorName,
      paymentMode: input.paymentMode,
      notes: input.notes,
    },
  }

  const pack = signPack(
    {
      v: PACK_VERSION,
      id: createId('pck'),
      kind: 'expense_submit',
      sender: { id: profile.client_remote_id, name: profile.name, publicKey: identity.publicKey },
      recipientId: profile.owner_remote_id,
      createdAt: nowIso(),
      payload,
    },
    identity.secretKey
  )

  const file = new File(Paths.cache, packFileName(pack))
  if (file.exists) file.delete()
  file.create()
  await file.write(encodePackFile(pack))

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: `Send expense to ${profile.owner_name}`,
    UTI: 'public.json',
  })

  await saveOutboxPack({
    profileId: profile.id,
    packId: pack.id,
    kind: pack.kind,
    fingerprint: packFingerprint(pack),
    payload,
    status: 'sent',
  })

  return pack
}
