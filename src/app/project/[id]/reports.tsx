import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { Button, Card, H2, Muted, Screen, colors } from '@/components/ui'
import { computeProjectFinance } from '@/lib/finance'
import { toFinanceInput } from '@/db/types'
import { exportStatementPdf } from '@/features/statement-pdf'
import { formatINR } from '@/lib/money'
import { pct } from '@/lib/display'
import { useOwner, useProject } from '@/state/hooks'

export default function ReportsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const [busy, setBusy] = useState(false)

  const bundle = project.data
  if (!bundle) {
    return (
      <Screen>
        <BackHeader title="Reports" />
        <Muted>Project not found.</Muted>
      </Screen>
    )
  }

  const finance = computeProjectFinance(toFinanceInput(bundle))

  // Category breakdown uses the same exclusions as the finance module.
  const byCategory = new Map<string, number>()
  for (const expense of bundle.expenses) {
    if (expense.approval_status === 'pending' || expense.approval_status === 'rejected') continue
    if (expense.labor_entry_id) continue
    const key = expense.category
    byCategory.set(key, (byCategory.get(key) ?? 0) + expense.amount + expense.tax_amount)
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  const materialDue = bundle.materialEntries
    .map((entry) => ({
      label: entry.description,
      sub: entry.vendor_name ?? '',
      due: entry.bill_amount - entry.payments.reduce((sum, payment) => sum + payment.amount, 0),
    }))
    .filter((entry) => entry.due > 0)
    .sort((a, b) => b.due - a.due)

  const laborDue = bundle.laborEntries
    .map((entry) => ({
      label: entry.trade_type,
      sub: entry.status,
      due: entry.total_amount - entry.advance_paid,
    }))
    .filter((entry) => entry.due > 0)
    .sort((a, b) => b.due - a.due)

  async function handleExport() {
    setBusy(true)
    try {
      await exportStatementPdf(bundle!)
    } catch (cause) {
      Alert.alert('Could not export', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="Reports" subtitle={bundle.project.name} />

      <Card>
        <H2>Profit &amp; loss</H2>
        <Line label="Income received" value={formatINR(finance.income)} />
        <Line label="Owner expenses" value={`− ${formatINR(finance.ownerExpenses)}`} />
        <Line label="Owner labour" value={`− ${formatINR(finance.ownerLabor)}`} />
        <View style={styles.divider} />
        <Line
          label="Net profit"
          value={formatINR(finance.netProfit)}
          strong
          tone={finance.netProfit < 0 ? 'danger' : 'success'}
        />
        <Muted>Margin {finance.profitMargin.toFixed(1)}%</Muted>
      </Card>

      <Card>
        <H2>Budget</H2>
        <Line label="Budget" value={formatINR(finance.budget)} />
        <Line label="Committed cost" value={formatINR(finance.totalCost)} />
        <Line
          label="Remaining"
          value={formatINR(finance.budgetRemaining)}
          tone={finance.budgetRemaining < 0 ? 'danger' : 'success'}
        />
        <Muted>Utilisation {pct(finance.totalCost, finance.budget)}</Muted>
      </Card>

      <Card>
        <H2>Spend by category</H2>
        {categories.length === 0 ? <Muted>No expenses yet.</Muted> : null}
        {categories.map(([category, amount]) => (
          <Line key={category} label={category.replace('_', ' ')} value={formatINR(amount)} />
        ))}
      </Card>

      <Card>
        <H2>Payables ({formatINR(finance.pendingPayables)})</H2>
        {materialDue.length === 0 && laborDue.length === 0 ? (
          <Muted>Nothing outstanding.</Muted>
        ) : null}
        {materialDue.map((entry) => (
          <Line key={`m-${entry.label}`} label={entry.label} value={formatINR(entry.due)} tone="warning" />
        ))}
        {laborDue.map((entry) => (
          <Line
            key={`l-${entry.label}`}
            label={`${entry.label} (labour)`}
            value={formatINR(entry.due)}
            tone="warning"
          />
        ))}
      </Card>

      <Button title={busy ? 'Preparing…' : 'Export statement PDF'} onPress={handleExport} disabled={busy} />
    </Screen>
  )
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'success' | 'danger' | 'warning'
}) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.text
  return (
    <View style={styles.line}>
      <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.value, strong && styles.strong, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 14, color: colors.muted, flex: 1 },
  value: { fontSize: 14, fontWeight: '600' },
  strong: { fontSize: 16, fontWeight: '700', color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 6 },
})
