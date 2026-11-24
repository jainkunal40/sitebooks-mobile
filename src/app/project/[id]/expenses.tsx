import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { createExpense, deleteExpense, setExpenseApproval } from '@/db/mutations'
import { normalizeDateInput, todayIsoDate } from '@/lib/dates'
import { shortDate } from '@/lib/display'
import { formatINR, parseAmount } from '@/lib/money'
import { useOwner, useProject, useProjectRefresh } from '@/state/hooks'

// Material categories are intentionally absent: material spend is tracked in
// Materials (MaterialEntry + payments), matching the web app's rule.
const CATEGORIES = [
  { value: 'labor', label: 'Labour' },
  { value: 'subcontractor', label: 'Subcontract' },
  { value: 'transport', label: 'Transport' },
  { value: 'site_expense', label: 'Site' },
  { value: 'rental', label: 'Rental' },
  { value: 'utility', label: 'Utility' },
  { value: 'misc', label: 'Misc' },
] as const

const MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
] as const

export default function ExpensesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const refresh = useProjectRefresh(owner.data?.id, id)
  const bundle = project.data

  const [date, setDate] = useState(todayIsoDate())
  const [amount, setAmount] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('labor')
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('cash')
  const [vendorName, setVendorName] = useState('')
  const [notes, setNotes] = useState('')
  const [laborEntryId, setLaborEntryId] = useState<string | null>(null)
  const [paidByClient, setPaidByClient] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const effectivePaidByClient = paidByClient ?? (bundle?.project.client_managed_expenses === 1)

  async function handleAdd() {
    if (!owner.data || !id) return
    const parsedAmount = parseAmount(amount)
    const parsedDate = normalizeDateInput(date)
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.')
      return
    }
    if (!parsedDate) {
      Alert.alert('Invalid date', 'Use a date like 2026-11-24.')
      return
    }
    setBusy(true)
    try {
      await createExpense(owner.data.id, id, {
        date: parsedDate,
        amount: parsedAmount,
        taxAmount: parseAmount(taxAmount) ?? 0,
        category,
        vendorName,
        paymentMode: mode,
        notes,
        laborEntryId,
        paidByClient: effectivePaidByClient,
      })
      setAmount('')
      setTaxAmount('')
      setVendorName('')
      setNotes('')
      await refresh()
    } catch (cause) {
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function handleDecision(expenseId: string, decision: 'approved' | 'rejected') {
    if (!owner.data) return
    try {
      await setExpenseApproval(owner.data.id, expenseId, decision)
      await refresh()
    } catch (cause) {
      Alert.alert('Could not update', cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleDelete(expenseId: string) {
    if (!owner.data) return
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(owner.data!.id, expenseId)
          await refresh()
        },
      },
    ])
  }

  const laborOptions = [
    { value: '', label: 'Not linked' },
    ...(bundle?.laborEntries ?? []).map((entry) => ({
      value: entry.id,
      label: `${entry.trade_type} · ${formatINR(entry.total_amount)}`,
    })),
  ]

  return (
    <Screen>
      <BackHeader title="Expenses" subtitle={bundle?.project.name} />

      <Card>
        <H2>Add expense</H2>
        <Field label="Date" value={date} onChangeText={setDate} />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Tax (optional)" value={taxAmount} onChangeText={setTaxAmount} keyboardType="numeric" />
        <Muted>Category</Muted>
        <ChipGroup options={CATEGORIES} value={category} onChange={setCategory} />
        <Muted>Payment mode</Muted>
        <ChipGroup options={MODES} value={mode} onChange={setMode} />
        <Field label="Vendor (optional)" value={vendorName} onChangeText={setVendorName} />

        {(bundle?.laborEntries ?? []).length > 0 ? (
          <>
            <Muted>Link to labour (avoids double counting)</Muted>
            <ChipGroup
              options={laborOptions}
              value={laborEntryId ?? ''}
              onChange={(value) => setLaborEntryId(value || null)}
            />
          </>
        ) : null}

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Paid by client</Text>
            <Muted>Excluded from your P&amp;L, still counted against budget.</Muted>
          </View>
          <Switch value={effectivePaidByClient} onValueChange={setPaidByClient} />
        </View>

        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} />
        <Button title={busy ? 'Saving…' : 'Add expense'} onPress={handleAdd} disabled={busy} />
      </Card>

      <Card>
        <H2>All expenses ({(bundle?.expenses ?? []).length})</H2>
        {(bundle?.expenses ?? []).length === 0 ? <Muted>No expenses yet.</Muted> : null}
        {(bundle?.expenses ?? []).map((expense) => (
          <Pressable
            key={expense.id}
            onLongPress={() => handleDelete(expense.id)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {expense.category}
                {expense.vendor_name ? ` · ${expense.vendor_name}` : ''}
              </Text>
              <Muted>
                {shortDate(expense.date)}
                {expense.approval_status !== 'approved' ? ` · ${expense.approval_status}` : ''}
                {expense.paid_by_client ? ' · client paid' : ''}
              </Muted>
              {expense.approval_status === 'pending' ? (
                <View style={styles.actions}>
                  <Pressable onPress={() => handleDecision(expense.id, 'approved')}>
                    <Text style={[styles.actionText, { color: colors.success }]}>Approve</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDecision(expense.id, 'rejected')}>
                    <Text style={[styles.actionText, { color: colors.danger }]}>Reject</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowValue}>{formatINR(expense.amount + expense.tax_amount)}</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actionText: { fontSize: 13, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
})
