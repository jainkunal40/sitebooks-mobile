import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { createIncome, deleteIncome, updateIncome } from '@/db/mutations'
import { normalizeDateInput, todayIsoDate } from '@/lib/dates'
import { shortDate } from '@/lib/display'
import { formatINR, parseAmount } from '@/lib/money'
import type { IncomeRow } from '@/db/types'
import { useOwner, useProject, useProjectRefresh } from '@/state/hooks'

const PAYMENT_TYPES = [
  { value: 'advance', label: 'Advance' },
  { value: 'milestone_payment', label: 'Milestone' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'final_payment', label: 'Final' },
  { value: 'other', label: 'Other' },
] as const

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
] as const

export default function IncomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const refresh = useProjectRefresh(owner.data?.id, id)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [date, setDate] = useState(todayIsoDate())
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<(typeof PAYMENT_TYPES)[number]['value']>('advance')
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]['value']>('cash')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const bundle = project.data
  const rows = bundle?.income ?? []
  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  function resetForm() {
    setEditingId(null)
    setDate(todayIsoDate())
    setAmount('')
    setPaymentType('advance')
    setPaymentMode('cash')
    setReceivedFrom('')
    setNotes('')
  }

  function startEdit(row: IncomeRow) {
    setEditingId(row.id)
    setDate(row.date)
    setAmount(String(row.amount))
    setPaymentType(row.payment_type as (typeof PAYMENT_TYPES)[number]['value'])
    setPaymentMode(row.payment_mode as (typeof PAYMENT_MODES)[number]['value'])
    setReceivedFrom(row.received_from ?? '')
    setNotes(row.notes ?? '')
  }

  async function handleSave() {
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
      if (editingId) {
        await updateIncome(owner.data.id, editingId, {
          date: parsedDate,
          amount: parsedAmount,
          paymentType,
          paymentMode,
          receivedFrom,
          notes,
        })
      } else {
        await createIncome(owner.data.id, id, {
          date: parsedDate,
          amount: parsedAmount,
          paymentType,
          paymentMode,
          receivedFrom,
          notes,
        })
      }
      resetForm()
      await refresh()
    } catch (cause) {
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  function handleDelete(row: IncomeRow) {
    if (!owner.data) return
    Alert.alert('Delete payment?', `${formatINR(row.amount)} on ${shortDate(row.date)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteIncome(owner.data!.id, row.id)
          if (editingId === row.id) resetForm()
          await refresh()
        },
      },
    ])
  }

  return (
    <Screen>
      <BackHeader title="Income" subtitle={bundle?.project.name} />

      <Card>
        <H2>Total received</H2>
        <Muted>{formatINR(total)}</Muted>
      </Card>

      <Card>
        <H2>{editingId ? 'Edit payment' : 'Add payment'}</H2>
        <Field label="Date" value={date} onChangeText={setDate} placeholder="2026-11-24" />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Muted>Type</Muted>
        <ChipGroup options={PAYMENT_TYPES} value={paymentType} onChange={setPaymentType} />
        <Muted>Mode</Muted>
        <ChipGroup options={PAYMENT_MODES} value={paymentMode} onChange={setPaymentMode} />
        <Field label="Received from" value={receivedFrom} onChangeText={setReceivedFrom} />
        <Field label="Notes" value={notes} onChangeText={setNotes} />
        <Button
          title={busy ? 'Saving…' : editingId ? 'Save changes' : 'Add income'}
          onPress={handleSave}
          disabled={busy}
        />
        {editingId ? (
          <Button title="Cancel edit" variant="secondary" onPress={resetForm} />
        ) : null}
      </Card>

      <Card>
        <H2>History</H2>
        {rows.length === 0 ? <Muted>Nothing recorded yet.</Muted> : null}
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => startEdit(row)}
            onLongPress={() => handleDelete(row)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{formatINR(row.amount)}</Text>
              <Muted>
                {shortDate(row.date)} · {row.payment_type.replace('_', ' ')}
                {row.received_from ? ` · ${row.received_from}` : ''}
              </Muted>
            </View>
            <Text style={styles.edit}>Edit</Text>
          </Pressable>
        ))}
        {rows.length > 0 ? <Muted>Tap to edit, long-press to delete.</Muted> : null}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  edit: { fontSize: 13, fontWeight: '600', color: colors.primary },
})
