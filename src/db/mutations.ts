/**
 * Write operations.
 *
 * These mirror the rules in src/lib/finance.ts. The important one: a labor
 * entry's `advance_paid` is adjusted by deltas, never recomputed from linked
 * expenses, because recomputing silently erases advances the owner typed in by
 * hand.
 */
import { isCountedExpense } from '@/lib/finance'
import { createId } from '@/lib/random'
import { getDatabase, nowIso } from './index'
import type { ExpenseRow, LaborEntryRow, MaterialEntryRow, MilestoneRow } from './types'

async function logActivity(input: {
  ownerId: string
  projectId: string | null
  action: string
  entityType: string
  entityId: string
  details: string
  actorType?: 'owner' | 'client' | 'system'
  actorId?: string | null
}): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO activity_log
      (id, owner_id, project_id, actor_type, actor_id, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('act'),
      input.ownerId,
      input.projectId,
      input.actorType ?? 'owner',
      input.actorId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      input.details,
      nowIso(),
    ]
  )
}

// ─── Income ─────────────────────────────────────────────────

export interface IncomeInput {
  date: string
  amount: number
  paymentType: string
  paymentMode: string
  receivedFrom?: string | null
  referenceNumber?: string | null
  notes?: string | null
  phaseId?: string | null
}

export async function createIncome(
  ownerId: string,
  projectId: string,
  input: IncomeInput
): Promise<string> {
  const db = await getDatabase()
  const id = createId('inc')
  await db.runAsync(
    `INSERT INTO income
      (id, owner_id, project_id, phase_id, date, amount, payment_type, payment_mode,
       received_from, reference_number, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      projectId,
      input.phaseId ?? null,
      input.date,
      input.amount,
      input.paymentType,
      input.paymentMode,
      input.receivedFrom?.trim() || null,
      input.referenceNumber?.trim() || null,
      input.notes?.trim() || null,
      nowIso(),
    ]
  )
  await logActivity({
    ownerId,
    projectId,
    action: 'income_added',
    entityType: 'income',
    entityId: id,
    details: `Income of ₹${input.amount.toLocaleString('en-IN')} recorded`,
  })
  return id
}

// ─── Labour paid accounting ─────────────────────────────────

async function adjustLaborPaid(ownerId: string, laborEntryId: string, delta: number): Promise<void> {
  if (!laborEntryId || !Number.isFinite(delta) || delta === 0) return
  const db = await getDatabase()
  const entry = await db.getFirstAsync<{ advance_paid: number }>(
    'SELECT advance_paid FROM labor_entry WHERE id = ? AND owner_id = ?',
    [laborEntryId, ownerId]
  )
  if (!entry) return
  await db.runAsync(
    'UPDATE labor_entry SET advance_paid = ? WHERE id = ? AND owner_id = ?',
    [Math.max(0, entry.advance_paid + delta), laborEntryId, ownerId]
  )
}

// ─── Expenses ───────────────────────────────────────────────

export interface ExpenseInput {
  date: string
  amount: number
  taxAmount?: number
  category: string
  vendorName?: string | null
  vendorId?: string | null
  contractorId?: string | null
  laborEntryId?: string | null
  paymentMode: string
  billNumber?: string | null
  isReimbursable?: boolean
  paidByClient?: boolean
  notes?: string | null
  approvalStatus?: 'approved' | 'pending' | 'rejected'
  submittedByClientId?: string | null
}

const MAX_LABOR_DELTA = 0.000001

function contribution(row: {
  amount: number
  approval_status?: string | null
  labor_entry_id?: string | null
}): number {
  if (!row.labor_entry_id) return 0
  return isCountedExpense({ amount: row.amount, approvalStatus: row.approval_status ?? null })
    ? row.amount
    : 0
}

export async function createExpense(
  ownerId: string,
  projectId: string,
  input: ExpenseInput
): Promise<string> {
  const db = await getDatabase()
  const id = createId('exp')
  const now = nowIso()

  await db.runAsync(
    `INSERT INTO expense
      (id, owner_id, project_id, phase_id, date, amount, tax_amount, category, vendor_id,
       vendor_name, contractor_id, labor_entry_id, payment_mode, bill_number, is_reimbursable,
       paid_by_client, notes, approval_status, submitted_by_client_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      projectId,
      input.date,
      input.amount,
      input.taxAmount ?? 0,
      input.category,
      input.vendorId ?? null,
      input.vendorName?.trim() || null,
      input.contractorId ?? null,
      input.laborEntryId ?? null,
      input.paymentMode,
      input.billNumber?.trim() || null,
      input.isReimbursable ? 1 : 0,
      input.paidByClient ? 1 : 0,
      input.notes?.trim() || null,
      input.approvalStatus ?? 'approved',
      input.submittedByClientId ?? null,
      now,
      now,
    ]
  )

  if (input.laborEntryId && input.approvalStatus !== 'pending' && input.approvalStatus !== 'rejected') {
    await adjustLaborPaid(ownerId, input.laborEntryId, input.amount)
  }

  await logActivity({
    ownerId,
    projectId,
    action: 'expense_added',
    entityType: 'expense',
    entityId: id,
    details: `Expense of ₹${input.amount.toLocaleString('en-IN')} added (${input.category})`,
    actorType: input.submittedByClientId ? 'client' : 'owner',
    actorId: input.submittedByClientId ?? null,
  })

  return id
}

export async function updateExpense(
  ownerId: string,
  expenseId: string,
  input: Partial<ExpenseInput>
): Promise<void> {
  const db = await getDatabase()
  const old = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expense WHERE id = ? AND owner_id = ?',
    [expenseId, ownerId]
  )
  if (!old) throw new Error('Expense not found')

  const next = {
    date: input.date ?? old.date,
    amount: input.amount ?? old.amount,
    tax_amount: input.taxAmount ?? old.tax_amount,
    category: input.category ?? old.category,
    vendor_name: input.vendorName !== undefined ? input.vendorName : old.vendor_name,
    contractor_id: input.contractorId !== undefined ? input.contractorId : old.contractor_id,
    labor_entry_id: input.laborEntryId !== undefined ? input.laborEntryId : old.labor_entry_id,
    payment_mode: input.paymentMode ?? old.payment_mode,
    bill_number: input.billNumber !== undefined ? input.billNumber : old.bill_number,
    paid_by_client: input.paidByClient !== undefined ? (input.paidByClient ? 1 : 0) : old.paid_by_client,
    notes: input.notes !== undefined ? input.notes : old.notes,
    approval_status: input.approvalStatus ?? old.approval_status,
  }

  await db.runAsync(
    `UPDATE expense SET date = ?, amount = ?, tax_amount = ?, category = ?, vendor_name = ?,
       contractor_id = ?, labor_entry_id = ?, payment_mode = ?, bill_number = ?, paid_by_client = ?,
       notes = ?, approval_status = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?`,
    [
      next.date,
      next.amount,
      next.tax_amount,
      next.category,
      next.vendor_name,
      next.contractor_id,
      next.labor_entry_id,
      next.payment_mode,
      next.bill_number,
      next.paid_by_client,
      next.notes,
      next.approval_status,
      nowIso(),
      expenseId,
      ownerId,
    ]
  )

  // Move only the delta between the old and new contribution.
  const oldContribution = contribution(old)
  const newContribution = contribution({
    amount: next.amount,
    approval_status: next.approval_status,
    labor_entry_id: next.labor_entry_id,
  })

  if (old.labor_entry_id && old.labor_entry_id === next.labor_entry_id) {
    await adjustLaborPaid(ownerId, old.labor_entry_id, newContribution - oldContribution)
  } else {
    if (old.labor_entry_id) await adjustLaborPaid(ownerId, old.labor_entry_id, -oldContribution)
    if (next.labor_entry_id) await adjustLaborPaid(ownerId, next.labor_entry_id, newContribution)
  }
}

export async function deleteExpense(ownerId: string, expenseId: string): Promise<void> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expense WHERE id = ? AND owner_id = ?',
    [expenseId, ownerId]
  )
  if (!row) return

  await db.runAsync('DELETE FROM expense WHERE id = ? AND owner_id = ?', [expenseId, ownerId])

  if (row.labor_entry_id) {
    await adjustLaborPaid(ownerId, row.labor_entry_id, -contribution(row))
  }
}

export async function setExpenseApproval(
  ownerId: string,
  expenseId: string,
  decision: 'approved' | 'rejected'
): Promise<void> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expense WHERE id = ? AND owner_id = ?',
    [expenseId, ownerId]
  )
  if (!row) throw new Error('Expense not found')

  const wasCounted = isCountedExpense({
    amount: row.amount,
    approvalStatus: row.approval_status,
  })

  await db.runAsync(
    'UPDATE expense SET approval_status = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
    [decision, nowIso(), expenseId, ownerId]
  )

  if (row.labor_entry_id) {
    const delta =
      decision === 'approved' && !wasCounted
        ? row.amount
        : decision === 'rejected' && wasCounted
          ? -row.amount
          : 0
    if (Math.abs(delta) > MAX_LABOR_DELTA) {
      await adjustLaborPaid(ownerId, row.labor_entry_id, delta)
    }
  }

  await logActivity({
    ownerId,
    projectId: row.project_id,
    action: decision === 'approved' ? 'expense_approved' : 'expense_rejected',
    entityType: 'expense',
    entityId: expenseId,
    details: `Expense of ₹${row.amount.toLocaleString('en-IN')} ${decision}`,
  })
}

// ─── Labour ─────────────────────────────────────────────────

export interface LaborInput {
  contractorId?: string | null
  tradeType: string
  rateType?: string
  rateAmount?: number
  quantity?: number
  totalAmount: number
  advancePaid?: number
  startDate?: string | null
  endDate?: string | null
  status?: string
  paidByClient?: boolean
  notes?: string | null
}

export async function createLaborEntry(
  ownerId: string,
  projectId: string,
  input: LaborInput
): Promise<string> {
  const db = await getDatabase()
  const id = createId('lab')
  await db.runAsync(
    `INSERT INTO labor_entry
      (id, owner_id, project_id, phase_id, contractor_id, trade_type, rate_type, rate_amount,
       quantity, total_amount, advance_paid, start_date, end_date, status, paid_by_client, notes, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      projectId,
      input.contractorId ?? null,
      input.tradeType,
      input.rateType ?? 'fixed',
      input.rateAmount ?? input.totalAmount,
      input.quantity ?? 1,
      input.totalAmount,
      input.advancePaid ?? 0,
      input.startDate ?? null,
      input.endDate ?? null,
      input.status ?? 'ongoing',
      input.paidByClient ? 1 : 0,
      input.notes?.trim() || null,
      nowIso(),
    ]
  )
  await logActivity({
    ownerId,
    projectId,
    action: 'labor_added',
    entityType: 'labor',
    entityId: id,
    details: `Labour entry for ${input.tradeType} (₹${input.totalAmount.toLocaleString('en-IN')})`,
  })
  return id
}

export async function deleteLaborEntry(ownerId: string, laborEntryId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM labor_entry WHERE id = ? AND owner_id = ?', [
    laborEntryId,
    ownerId,
  ])
}

export async function listLaborEntries(ownerId: string, projectId: string): Promise<LaborEntryRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<LaborEntryRow>(
    'SELECT * FROM labor_entry WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC',
    [ownerId, projectId]
  )
}

// ─── Materials ──────────────────────────────────────────────

export interface MaterialInput {
  description: string
  category?: string
  vendorName?: string | null
  vendorId?: string | null
  billNumber?: string | null
  billDate?: string | null
  billAmount: number
  paidByClient?: boolean
  notes?: string | null
}

export async function createMaterialEntry(
  ownerId: string,
  projectId: string,
  input: MaterialInput
): Promise<string> {
  const db = await getDatabase()
  const id = createId('mat')
  await db.runAsync(
    `INSERT INTO material_entry
      (id, owner_id, project_id, phase_id, description, category, vendor_id, vendor_name,
       bill_number, bill_date, bill_amount, paid_by_client, notes, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      projectId,
      input.description.trim(),
      input.category ?? 'materials',
      input.vendorId ?? null,
      input.vendorName?.trim() || null,
      input.billNumber?.trim() || null,
      input.billDate ?? null,
      input.billAmount,
      input.paidByClient ? 1 : 0,
      input.notes?.trim() || null,
      nowIso(),
    ]
  )
  await logActivity({
    ownerId,
    projectId,
    action: 'material_added',
    entityType: 'material',
    entityId: id,
    details: `Material entry added: ${input.description.trim()}`,
  })
  return id
}

export async function createMaterialPayment(
  ownerId: string,
  projectId: string,
  materialEntryId: string,
  input: { amount: number; date: string; paymentMode: string; referenceNumber?: string | null; notes?: string | null }
): Promise<string> {
  const db = await getDatabase()
  const id = createId('mpp')
  await db.runAsync(
    `INSERT INTO material_payment
      (id, owner_id, material_entry_id, amount, date, payment_mode, reference_number, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      materialEntryId,
      input.amount,
      input.date,
      input.paymentMode,
      input.referenceNumber?.trim() || null,
      input.notes?.trim() || null,
      nowIso(),
    ]
  )
  await logActivity({
    ownerId,
    projectId,
    action: 'material_payment',
    entityType: 'material',
    entityId: materialEntryId,
    details: `Material payment of ₹${input.amount.toLocaleString('en-IN')} recorded`,
  })
  return id
}

export async function listMaterialEntries(
  ownerId: string,
  projectId: string
): Promise<MaterialEntryRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<MaterialEntryRow>(
    'SELECT * FROM material_entry WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC',
    [ownerId, projectId]
  )
}

// ─── Milestones ─────────────────────────────────────────────

export interface MilestoneInput {
  title: string
  description?: string | null
  dueDate?: string | null
  status?: string
}

export async function createMilestone(
  ownerId: string,
  projectId: string,
  input: MilestoneInput
): Promise<string> {
  const db = await getDatabase()
  const id = createId('mil')
  await db.runAsync(
    `INSERT INTO milestone
      (id, owner_id, project_id, phase_id, title, description, due_date, completion_date, status, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      ownerId,
      projectId,
      input.title.trim(),
      input.description?.trim() || null,
      input.dueDate ?? null,
      input.status ?? 'pending',
      nowIso(),
    ]
  )
  return id
}

export async function setMilestoneStatus(
  ownerId: string,
  milestoneId: string,
  status: string
): Promise<void> {
  const db = await getDatabase()
  const completion = status === 'completed' ? nowIso() : null
  await db.runAsync(
    'UPDATE milestone SET status = ?, completion_date = ? WHERE id = ? AND owner_id = ?',
    [status, completion, milestoneId, ownerId]
  )
}

export async function listMilestones(ownerId: string, projectId: string): Promise<MilestoneRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<MilestoneRow>(
    'SELECT * FROM milestone WHERE owner_id = ? AND project_id = ? ORDER BY COALESCE(due_date, created_at)',
    [ownerId, projectId]
  )
}

// ─── Updates and deletes ────────────────────────────────────

export async function updateIncome(
  ownerId: string,
  incomeId: string,
  input: Partial<IncomeInput>
): Promise<void> {
  const db = await getDatabase()
  const old = await db.getFirstAsync<{ date: string; amount: number; payment_type: string; payment_mode: string; received_from: string | null; reference_number: string | null; notes: string | null }>(
    'SELECT * FROM income WHERE id = ? AND owner_id = ?',
    [incomeId, ownerId]
  )
  if (!old) throw new Error('Income not found')

  await db.runAsync(
    `UPDATE income SET date = ?, amount = ?, payment_type = ?, payment_mode = ?,
       received_from = ?, reference_number = ?, notes = ?
     WHERE id = ? AND owner_id = ?`,
    [
      input.date ?? old.date,
      input.amount ?? old.amount,
      input.paymentType ?? old.payment_type,
      input.paymentMode ?? old.payment_mode,
      input.receivedFrom !== undefined ? input.receivedFrom : old.received_from,
      input.referenceNumber !== undefined ? input.referenceNumber : old.reference_number,
      input.notes !== undefined ? input.notes : old.notes,
      incomeId,
      ownerId,
    ]
  )
}

export async function deleteIncome(ownerId: string, incomeId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM income WHERE id = ? AND owner_id = ?', [incomeId, ownerId])
}

export async function updateLaborEntry(
  ownerId: string,
  laborEntryId: string,
  input: Partial<LaborInput>
): Promise<void> {
  const db = await getDatabase()
  const old = await db.getFirstAsync<LaborEntryRow>(
    'SELECT * FROM labor_entry WHERE id = ? AND owner_id = ?',
    [laborEntryId, ownerId]
  )
  if (!old) throw new Error('Labour entry not found')

  await db.runAsync(
    `UPDATE labor_entry SET trade_type = ?, total_amount = ?, advance_paid = ?,
       start_date = ?, end_date = ?, status = ?, notes = ?
     WHERE id = ? AND owner_id = ?`,
    [
      input.tradeType ?? old.trade_type,
      input.totalAmount ?? old.total_amount,
      input.advancePaid ?? old.advance_paid,
      input.startDate !== undefined ? input.startDate : old.start_date,
      input.endDate !== undefined ? input.endDate : old.end_date,
      input.status ?? old.status,
      input.notes !== undefined ? input.notes : old.notes,
      laborEntryId,
      ownerId,
    ]
  )
}

export async function updateMaterialEntry(
  ownerId: string,
  entryId: string,
  input: Partial<MaterialInput>
): Promise<void> {
  const db = await getDatabase()
  const old = await db.getFirstAsync<MaterialEntryRow>(
    'SELECT * FROM material_entry WHERE id = ? AND owner_id = ?',
    [entryId, ownerId]
  )
  if (!old) throw new Error('Material entry not found')

  await db.runAsync(
    `UPDATE material_entry SET description = ?, category = ?, vendor_name = ?,
       bill_number = ?, bill_date = ?, bill_amount = ?
     WHERE id = ? AND owner_id = ?`,
    [
      input.description?.trim() || old.description,
      input.category ?? old.category,
      input.vendorName !== undefined ? input.vendorName : old.vendor_name,
      input.billNumber !== undefined ? input.billNumber : old.bill_number,
      input.billDate !== undefined ? input.billDate : old.bill_date,
      input.billAmount ?? old.bill_amount,
      entryId,
      ownerId,
    ]
  )
}

/** Deleting an entry cascades to its payments (foreign_keys is ON). */
export async function deleteMaterialEntry(ownerId: string, entryId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM material_entry WHERE id = ? AND owner_id = ?', [entryId, ownerId])
}

export async function deleteMaterialPayment(ownerId: string, paymentId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM material_payment WHERE id = ? AND owner_id = ?', [
    paymentId,
    ownerId,
  ])
}
