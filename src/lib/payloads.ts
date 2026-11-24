/**
 * Payload shapes carried inside a Pack, one per kind.
 *
 * These are deliberately small: a client receives a summary of the project,
 * never the owner's full ledger, and the owner receives one expense request at
 * a time rather than a client's whole dataset.
 */

export interface ProjectSharePayload {
  project: {
    id: string
    name: string
    status: string
    siteAddress: string | null
    budget: number
    startDate: string | null
    endDate: string | null
  }
  clientName: string | null
  summary: {
    income: number
    totalCost: number
    clientBorneCost: number
    clientPaidToDate: number
    budgetRemaining: number
    pendingApproval: number
  }
  milestones: Array<{
    id: string
    title: string
    status: string
    dueDate: string | null
    completionDate: string | null
  }>
  /** Only what the client is allowed to see: client-paid and shared rows. */
  expenses: Array<{
    id: string
    date: string
    amount: number
    taxAmount: number
    category: string
    vendorName: string | null
    approvalStatus: string
    paidByClient: boolean
    notes: string | null
  }>
  generatedAt: string
}

export interface InvitePayload {
  /** Client record this invite is for. */
  clientId: string
  clientName: string
  /** Owner public key, repeated so the invite can bootstrap trust on its own. */
  ownerPublicKey: string
  ownerName: string
  /** Echoed back in the pair_ack so the owner knows the invite was received. */
  pairingCode: string
}

export interface PairAckPayload {
  clientId: string
  pairingCode: string
  publicKey: string
  deviceName: string
}

export interface ExpenseSubmitPayload {
  clientId: string
  projectId: string
  projectName: string
  expense: {
    clientRowId: string
    date: string
    amount: number
    taxAmount: number
    category: string
    vendorName: string | null
    paymentMode: string
    notes: string | null
  }
}

export interface ExpenseDecisionPayload {
  /** The `clientRowId` from the original expense_submit pack. */
  clientRowId: string
  decision: 'approved' | 'rejected'
  note: string | null
  decidedAt: string
}

export interface PaymentReceiptPayload {
  projectId: string
  projectName: string
  amount: number
  date: string
  mode: string
  note: string | null
}

export interface ReminderPayload {
  projectId: string
  projectName: string
  message: string
}

export interface RevokePayload {
  clientId: string
  reason: string | null
}
