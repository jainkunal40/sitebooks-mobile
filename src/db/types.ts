import type { ProjectFinanceInput } from '@/lib/finance'

/** Row shapes exactly as stored (snake_case), plus converters to app models. */

export interface OwnerRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  public_key: string
  created_at: string
  updated_at: string
}

export interface ClientRow {
  id: string
  owner_id: string
  name: string
  phone: string | null
  email: string | null
  public_key: string | null
  status: 'pending' | 'active' | 'revoked'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ProjectRow {
  id: string
  owner_id: string
  client_id: string | null
  name: string
  description: string | null
  site_address: string | null
  status: string
  budget: number
  client_managed_expenses: number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface IncomeRow {
  id: string
  owner_id: string
  project_id: string
  phase_id: string | null
  date: string
  amount: number
  payment_type: string
  payment_mode: string
  received_from: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
}

export interface ExpenseRow {
  id: string
  owner_id: string
  project_id: string
  phase_id: string | null
  date: string
  amount: number
  tax_amount: number
  category: string
  vendor_id: string | null
  vendor_name: string | null
  contractor_id: string | null
  labor_entry_id: string | null
  payment_mode: string
  bill_number: string | null
  is_reimbursable: number
  paid_by_client: number
  notes: string | null
  approval_status: 'approved' | 'pending' | 'rejected'
  submitted_by_client_id: string | null
  created_at: string
  updated_at: string
}

export interface LaborEntryRow {
  id: string
  owner_id: string
  project_id: string
  phase_id: string | null
  contractor_id: string | null
  trade_type: string
  rate_type: string
  rate_amount: number
  quantity: number
  total_amount: number
  advance_paid: number
  start_date: string | null
  end_date: string | null
  status: string
  paid_by_client: number
  notes: string | null
  created_at: string
}

export interface MaterialEntryRow {
  id: string
  owner_id: string
  project_id: string
  phase_id: string | null
  description: string
  category: string
  vendor_id: string | null
  vendor_name: string | null
  bill_number: string | null
  bill_date: string | null
  bill_amount: number
  paid_by_client: number
  notes: string | null
  created_at: string
}

export interface MaterialPaymentRow {
  id: string
  owner_id: string
  material_entry_id: string
  amount: number
  date: string
  payment_mode: string
  reference_number: string | null
  notes: string | null
  created_at: string
}

export interface MilestoneRow {
  id: string
  owner_id: string
  project_id: string
  phase_id: string | null
  title: string
  description: string | null
  due_date: string | null
  completion_date: string | null
  status: string
  created_at: string
}

export interface MessageRow {
  id: string
  owner_id: string
  direction: 'in' | 'out'
  pack_id: string
  fingerprint: string
  kind: string
  counterparty_id: string
  counterparty_name: string
  sender_public_key: string
  payload: string
  status: 'pending' | 'applied' | 'failed' | 'sent'
  error: string | null
  created_at: string
  applied_at: string | null
}

export interface ProjectBundle {
  project: ProjectRow
  client: ClientRow | null
  income: IncomeRow[]
  expenses: ExpenseRow[]
  materialEntries: (MaterialEntryRow & { payments: MaterialPaymentRow[] })[]
  laborEntries: LaborEntryRow[]
}

/**
 * Converts local rows into the shared finance shape. Keeping this in one place
 * guarantees the mobile app applies the same rules as the web app.
 */
export function toFinanceInput(bundle: ProjectBundle): ProjectFinanceInput {
  return {
    budget: bundle.project.budget,
    incomeTransactions: bundle.income.map((row) => ({ amount: row.amount })),
    expenseTransactions: bundle.expenses.map((row) => ({
      amount: row.amount,
      taxAmount: row.tax_amount,
      paidByClient: row.paid_by_client === 1,
      laborEntryId: row.labor_entry_id,
      approvalStatus: row.approval_status,
      category: row.category,
      date: row.date,
    })),
    materialEntries: bundle.materialEntries.map((entry) => ({
      billAmount: entry.bill_amount,
      paidByClient: entry.paid_by_client === 1,
      category: entry.category,
      payments: entry.payments.map((payment) => ({
        amount: payment.amount,
        date: payment.date,
      })),
    })),
    laborEntries: bundle.laborEntries.map((entry) => ({
      totalAmount: entry.total_amount,
      advancePaid: entry.advance_paid,
      paidByClient: entry.paid_by_client === 1,
      tradeType: entry.trade_type,
    })),
  }
}

export interface ActivityRow {
  id: string
  owner_id: string
  project_id: string | null
  actor_type: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string
  created_at: string
}
