/**
 * Statement HTML, kept free of Expo imports so the report output can be tested.
 */
import { computeProjectFinance } from '../lib/finance'
import { formatINR } from '../lib/money'
import { shortDate } from '../lib/display'
import { toFinanceInput, type ProjectBundle } from '../db/types'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function row(cells: string[], options: { bold?: boolean } = {}): string {
  const style = options.bold ? ' style="font-weight:600;background:#F3F4F6"' : ''
  return `<tr${style}>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
}

export function buildStatementHtml(bundle: ProjectBundle, generatedAt = new Date()): string {
  const finance = computeProjectFinance(toFinanceInput(bundle))
  const clientName = bundle.client?.name ?? 'No client'

  const incomeRows = bundle.income
    .map((income) =>
      row([
        escapeHtml(shortDate(income.date)),
        escapeHtml(income.payment_type.replace('_', ' ')),
        escapeHtml(income.received_from ?? ''),
        escapeHtml(formatINR(income.amount)),
      ])
    )
    .join('')

  const expenseRows = bundle.expenses
    .map((expense) =>
      row([
        escapeHtml(shortDate(expense.date)),
        escapeHtml(expense.category),
        escapeHtml(expense.vendor_name ?? ''),
        escapeHtml(expense.approval_status),
        escapeHtml(formatINR(expense.amount + expense.tax_amount)),
      ])
    )
    .join('')

  const laborRows = bundle.laborEntries
    .map((labor) =>
      row([
        escapeHtml(labor.trade_type),
        escapeHtml(shortDate(labor.start_date)),
        escapeHtml(formatINR(labor.total_amount)),
        escapeHtml(formatINR(labor.advance_paid)),
        escapeHtml(formatINR(labor.total_amount - labor.advance_paid)),
      ])
    )
    .join('')

  const materialRows = bundle.materialEntries
    .map((entry) => {
      const paid = entry.payments.reduce((sum, payment) => sum + payment.amount, 0)
      return row([
        escapeHtml(entry.description),
        escapeHtml(entry.vendor_name ?? ''),
        escapeHtml(formatINR(entry.bill_amount)),
        escapeHtml(formatINR(paid)),
        escapeHtml(formatINR(entry.bill_amount - paid)),
      ])
    })
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111827; padding: 28px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: .06em; color: #6B7280; }
  .sub { color: #6B7280; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td, th { padding: 7px 8px; border-bottom: 1px solid #E5E7EB; text-align: left; }
  th { background: #F9FAFB; font-size: 11px; text-transform: uppercase; color: #6B7280; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
  .metric { flex: 1 1 30%; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px; }
  .label { font-size: 10px; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; }
  .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .danger { color: #B91C1C; }
  .ok { color: #047857; }
  .footer { margin-top: 26px; font-size: 10px; color: #9CA3AF; }
</style>
</head>
<body>
  <h1>${escapeHtml(bundle.project.name)}</h1>
  <div class="sub">${escapeHtml(clientName)} · statement generated ${escapeHtml(
    generatedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  )}</div>

  <div class="grid">
    <div class="metric"><div class="label">Budget</div><div class="value">${formatINR(finance.budget)}</div></div>
    <div class="metric"><div class="label">Total cost</div><div class="value">${formatINR(finance.totalCost)}</div></div>
    <div class="metric"><div class="label">Remaining</div><div class="value ${finance.budgetRemaining < 0 ? 'danger' : 'ok'}">${formatINR(finance.budgetRemaining)}</div></div>
    <div class="metric"><div class="label">Income received</div><div class="value">${formatINR(finance.income)}</div></div>
    <div class="metric"><div class="label">Owner net profit</div><div class="value ${finance.netProfit < 0 ? 'danger' : 'ok'}">${formatINR(finance.netProfit)}</div></div>
    <div class="metric"><div class="label">Pending payables</div><div class="value">${formatINR(finance.pendingPayables)}</div></div>
  </div>

  <h2>Income</h2>
  <table>
    <tr><th>Date</th><th>Type</th><th>From</th><th>Amount</th></tr>
    ${incomeRows || '<tr><td colspan="4">No income recorded</td></tr>'}
  </table>

  <h2>Expenses</h2>
  <table>
    <tr><th>Date</th><th>Category</th><th>Vendor</th><th>Status</th><th>Amount</th></tr>
    ${expenseRows || '<tr><td colspan="5">No expenses recorded</td></tr>'}
  </table>

  <h2>Labour</h2>
  <table>
    <tr><th>Trade</th><th>Start</th><th>Contract</th><th>Paid</th><th>Due</th></tr>
    ${laborRows || '<tr><td colspan="5">No labour contracts</td></tr>'}
  </table>

  <h2>Materials</h2>
  <table>
    <tr><th>Description</th><th>Vendor</th><th>Bill</th><th>Paid</th><th>Due</th></tr>
    ${materialRows || '<tr><td colspan="5">No material bills</td></tr>'}
  </table>

  <div class="footer">
    Generated by SiteBooks. Figures follow the shared finance rules: pending and rejected expenses
    are excluded, expenses linked to a labour entry are represented by that entry, and material
    payments count as spend while unpaid balances count as payables.
  </div>
</body>
</html>`
}

