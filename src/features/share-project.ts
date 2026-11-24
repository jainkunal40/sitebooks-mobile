import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { getDatabase, nowIso } from '@/db'
import { toFinanceInput, type ClientRow, type OwnerRow, type ProjectBundle } from '@/db/types'
import { computeProjectFinance } from '@/lib/finance'
import { PACK_VERSION, encodePackFile, packFingerprint, packFileName, signPack, type Pack } from '@/lib/pack'
import type { ProjectSharePayload } from '@/lib/payloads'
import { createId } from '@/lib/random'
import { loadIdentity } from '@/state/identity'

/** Builds the project summary a client is allowed to see. */
export function buildProjectSharePayload(bundle: ProjectBundle): ProjectSharePayload {
  const finance = computeProjectFinance(toFinanceInput(bundle))
  const clientId = bundle.client?.id

  return {
    project: {
      id: bundle.project.id,
      name: bundle.project.name,
      status: bundle.project.status,
      siteAddress: bundle.project.site_address,
      budget: bundle.project.budget,
      startDate: bundle.project.start_date,
      endDate: bundle.project.end_date,
    },
    clientName: bundle.client?.name ?? null,
    summary: {
      income: finance.income,
      totalCost: finance.totalCost,
      clientBorneCost: finance.clientBorneCost,
      clientPaidToDate: finance.clientPaidToDate,
      budgetRemaining: finance.budgetRemaining,
      pendingApproval: finance.pendingApproval,
    },
    // Milestones are not loaded by the project bundle yet; keep the field so
    // the client payload shape stays stable.
    milestones: [],
    // Only rows the client is entitled to see: client-paid bills and their own
    // submissions. Labour-linked expenses are excluded — the labour entry
    // already represents that cost.
    expenses: bundle.expenses
      .filter(
        (row) =>
          row.approval_status !== 'pending' &&
          row.labor_entry_id === null &&
          (row.paid_by_client === 1 || (!!clientId && row.submitted_by_client_id === clientId))
      )
      .map((row) => ({
        id: row.id,
        date: row.date,
        amount: row.amount,
        taxAmount: row.tax_amount,
        category: row.category,
        vendorName: row.vendor_name,
        approvalStatus: row.approval_status,
        paidByClient: row.paid_by_client === 1,
        notes: row.notes,
      })),
    generatedAt: nowIso(),
  }
}

export async function buildProjectSharePack(input: {
  owner: OwnerRow
  client: ClientRow
  bundle: ProjectBundle
}): Promise<Pack> {
  const identity = await loadIdentity()
  if (!identity) throw new Error('This device has no identity key. Set up the app again.')

  if (!input.client.public_key) {
    throw new Error('Pair this client first, then share.')
  }

  const payload = buildProjectSharePayload(input.bundle)

  return signPack(
    {
      v: PACK_VERSION,
      id: createId('pck'),
      kind: 'project_share',
      sender: {
        id: input.owner.id,
        name: input.owner.name,
        publicKey: identity.publicKey,
      },
      recipientId: input.client.id,
      createdAt: nowIso(),
      payload,
    },
    identity.secretKey
  )
}

/** Writes the pack to a file, opens the OS share sheet and logs it as sent. */
export async function shareProjectUpdate(input: {
  owner: OwnerRow
  client: ClientRow
  bundle: ProjectBundle
}): Promise<Pack> {
  const pack = await buildProjectSharePack(input)

  const file = new File(Paths.cache, packFileName(pack))
  if (file.exists) file.delete()
  file.create()
  await file.write(encodePackFile(pack))

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device.')
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: `Send ${input.bundle.project.name} to ${input.client.name}`,
    UTI: 'public.json',
  })

  const db = await getDatabase()
  await db.runAsync(
    `INSERT OR IGNORE INTO message
      (id, owner_id, direction, pack_id, fingerprint, kind, counterparty_id,
       counterparty_name, sender_public_key, payload, status, error, created_at, applied_at)
     VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, 'sent', NULL, ?, NULL)`,
    [
      createId('msg'),
      input.owner.id,
      pack.id,
      packFingerprint(pack),
      pack.kind,
      input.client.id,
      input.client.name,
      pack.sender.publicKey,
      JSON.stringify(pack.payload),
      pack.createdAt,
    ]
  )

  return pack
}
