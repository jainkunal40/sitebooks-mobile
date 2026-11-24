import { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { submitClientExpense } from '@/features/submit-expense'
import { normalizeDateInput, todayIsoDate } from '@/lib/dates'
import { shortDate } from '@/lib/display'
import { formatINR, parseAmount } from '@/lib/money'
import { useClientProfile, useSharedProject } from '@/state/hooks'

const CATEGORIES = [
  { value: 'materials', label: 'Materials' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'furnishing', label: 'Furnishing' },
  { value: 'labor', label: 'Labour' },
  { value: 'transport', label: 'Transport' },
  { value: 'misc', label: 'Misc' },
] as const

export default function ClientProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const profile = useClientProfile()
  const project = useSharedProject(profile.data?.id, id)

  const [date, setDate] = useState(todayIsoDate())
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('materials')
  const [vendor, setVendor] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (profile.isLoading || project.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    )
  }

  const shared = project.data
  if (!shared || !profile.data) {
    return (
      <Screen>
        <BackHeader title="Project" />
        <Muted>This project has not been shared with you.</Muted>
      </Screen>
    )
  }

  async function handleSubmit() {
    if (!profile.data) return
    const parsed = parseAmount(amount)
    const parsedDate = normalizeDateInput(date)
    if (!parsed || parsed <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.')
      return
    }
    if (!parsedDate) {
      Alert.alert('Invalid date', 'Use a date like 2026-11-24.')
      return
    }
    setBusy(true)
    try {
      await submitClientExpense(profile.data, {
        projectId: shared!.remoteProjectId,
        projectName: shared!.name,
        date: parsedDate,
        amount: parsed,
        taxAmount: parseAmount(tax) ?? 0,
        category,
        vendorName: vendor.trim() || null,
        paymentMode: 'cash',
        notes: notes.trim() || null,
      })
      setAmount('')
      setTax('')
      setVendor('')
      setNotes('')
      Alert.alert('Sent', 'Your designer will review it and send a decision back.')
    } catch (caught) {
      Alert.alert('Could not send', caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title={shared.name} subtitle={`Shared by ${profile.data.owner_name}`} />

      <Card>
        <View style={styles.row}>
          <Metric label="Budget" value={formatINR(shared.budget)} />
          <Metric label="Paid by you" value={formatINR(shared.summary.clientPaidToDate)} />
        </View>
        <View style={styles.row}>
          <Metric label="Your cost" value={formatINR(shared.summary.clientBorneCost)} />
          <Metric label="Remaining" value={formatINR(shared.summary.budgetRemaining)} />
        </View>
        <Muted>Last updated {shortDate(shared.updatedAt)}</Muted>
      </Card>

      <Card>
        <H2>Submit an expense</H2>
        <Muted>Your designer receives this as a signed file and approves or rejects it.</Muted>
        <Field label="Date" value={date} onChangeText={setDate} />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Field label="Tax (optional)" value={tax} onChangeText={setTax} keyboardType="numeric" />
        <Muted>Category</Muted>
        <ChipGroup options={CATEGORIES} value={category} onChange={setCategory} />
        <Field label="Vendor (optional)" value={vendor} onChangeText={setVendor} />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} />
        <Button title={busy ? 'Preparing…' : 'Send to designer'} onPress={handleSubmit} disabled={busy} />
      </Card>

      <Card>
        <H2>Shared expenses ({shared.expenses.length})</H2>
        {shared.expenses.length === 0 ? <Muted>Nothing shared yet.</Muted> : null}
        {shared.expenses.map((expense) => (
          <View key={expense.id} style={styles.expenseRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.expenseTitle}>{expense.category}</Text>
              <Muted>
                {shortDate(expense.date)}
                {expense.vendorName ? ` · ${expense.vendorName}` : ''}
              </Muted>
            </View>
            <Text style={styles.expenseValue}>{formatINR(expense.amount + expense.taxAmount)}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Muted>{label}</Muted>
      <Text style={styles.metric}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  metric: { fontSize: 15, fontWeight: '700', color: colors.text },
  expenseRow: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  expenseTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  expenseValue: { fontSize: 15, fontWeight: '700', color: colors.text },
})
