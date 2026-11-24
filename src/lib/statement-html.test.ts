import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStatementHtml } from './statement-html'
import type { ProjectBundle } from '../db/types'

function bundle(overrides: Partial<ProjectBundle> = {}): ProjectBundle {
  return {
    project: {
      id: 'prj_1',
      owner_id: 'usr_1',
      client_id: 'cli_1',
      name: 'Jain Pariwar',
      description: null,
      site_address: null,
      status: 'active',
      budget: 100000,
      client_managed_expenses: 0,
      start_date: null,
      end_date: null,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    },
    client: {
      id: 'cli_1',
      owner_id: 'usr_1',
      name: 'Kunal Jain',
      phone: null,
      email: null,
      public_key: null,
      status: 'active',
      notes: null,
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
    },
    income: [],
    expenses: [],
    materialEntries: [],
    laborEntries: [],
    ...overrides,
  }
}

function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp_1',
    owner_id: 'usr_1',
    project_id: 'prj_1',
    phase_id: null,
    date: '2026-11-02',
    amount: 10000,
    tax_amount: 0,
    category: 'transport',
    vendor_id: null,
    vendor_name: 'Sopan',
    contractor_id: null,
    labor_entry_id: null,
    payment_mode: 'cash',
    bill_number: null,
    is_reimbursable: 0,
    paid_by_client: 0,
    notes: null,
    approval_status: 'approved' as const,
    submitted_by_client_id: null,
    created_at: '2026-11-02T00:00:00.000Z',
    updated_at: '2026-11-02T00:00:00.000Z',
    ...overrides,
  }
}

test('statement shows project, client and finance totals', () => {
  const html = buildStatementHtml(
    bundle({
      income: [
        {
          id: 'inc_1',
          owner_id: 'usr_1',
          project_id: 'prj_1',
          phase_id: null,
          date: '2026-11-03',
          amount: 50000,
          payment_type: 'advance',
          payment_mode: 'cash',
          received_from: 'Kunal',
          reference_number: null,
          notes: null,
          created_at: '2026-11-03T00:00:00.000Z',
        },
      ],
      expenses: [expense()],
    }),
    new Date('2026-11-24T10:00:00.000Z')
  )

  assert.match(html, /Jain Pariwar/)
  assert.match(html, /Kunal Jain/)
  // budget 1,00,000 − cost 10,000
  assert.match(html, /₹90,000/)
  // income 50,000 − owner expense 10,000
  assert.match(html, /₹40,000/)
})

test('pending expenses are listed but excluded from the summary', () => {
  const html = buildStatementHtml(
    bundle({
      expenses: [
        expense({ id: 'exp_pending', amount: 5000, approval_status: 'pending' }),
        expense({ id: 'exp_ok', amount: 10000 }),
      ],
    })
  )
  // Summary remaining = 90,000 (pending 5,000 ignored)
  assert.match(html, /₹90,000/)
  assert.match(html, /pending/)
})

test('user text is html-escaped', () => {
  const base = bundle()
  const html = buildStatementHtml({
    ...base,
    project: { ...base.project, name: 'A < B & "C"' },
  })
  assert.match(html, /A &lt; B &amp; &quot;C&quot;/)
  assert.doesNotMatch(html, /< B &/)
})

test('labour and material dues appear in the tables', () => {
  const base = bundle()
  const html = buildStatementHtml({
    ...base,
    laborEntries: [
      {
        id: 'lab_1',
        owner_id: 'usr_1',
        project_id: 'prj_1',
        phase_id: null,
        contractor_id: null,
        trade_type: 'pop',
        rate_type: 'fixed',
        rate_amount: 50000,
        quantity: 1,
        total_amount: 50000,
        advance_paid: 20000,
        start_date: '2026-11-01',
        end_date: null,
        status: 'ongoing',
        paid_by_client: 0,
        notes: null,
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ],
    materialEntries: [
      {
        id: 'mat_1',
        owner_id: 'usr_1',
        project_id: 'prj_1',
        phase_id: null,
        description: 'Plywood',
        category: 'materials',
        vendor_id: null,
        vendor_name: 'Shree Timber',
        bill_number: null,
        bill_date: '2026-11-01',
        bill_amount: 30000,
        paid_by_client: 0,
        notes: null,
        created_at: '2026-11-01T00:00:00.000Z',
        payments: [
          {
            id: 'mpp_1',
            owner_id: 'usr_1',
            material_entry_id: 'mat_1',
            amount: 12000,
            date: '2026-11-02',
            payment_mode: 'cash',
            reference_number: null,
            notes: null,
            created_at: '2026-11-02T00:00:00.000Z',
          },
        ],
      },
    ],
  })

  assert.match(html, /pop/)
  assert.match(html, /Plywood/)
  assert.match(html, /Shree Timber/)
  // labour due 30,000 and material due 18,000
  assert.match(html, /₹30,000/)
  assert.match(html, /₹18,000/)
})
