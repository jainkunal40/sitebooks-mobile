import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import {
  createMaterialEntry,
  createMaterialPayment,
  deleteMaterialEntry,
  deleteMaterialPayment,
  updateMaterialEntry,
} from '@/db/mutations'
import { normalizeDateInput, todayIsoDate } from '@/lib/dates'
import { shortDate } from '@/lib/display'
import { formatINR, parseAmount } from '@/lib/money'
import type { MaterialEntryRow } from '@/db/types'
import { useOwner, useProject, useProjectRefresh } from '@/state/hooks'

const CATEGORIES = [
  { value: 'materials', label: 'Materials' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'furnishing', label: 'Furnishing' },
  { value: 'misc', label: 'Misc' },
] as const

export default function MaterialsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const refresh = useProjectRefresh(owner.data?.id, id)
  const bundle = project.data

  const [editingId, setEditingId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('materials')
  const [vendorName, setVendorName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDate, setBillDate] = useState(todayIsoDate())

  const [payingEntryId, setPayingEntryId] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const entries = bundle?.materialEntries ?? []
  const bills = entries.reduce((sum, entry) => sum + entry.bill_amount, 0)
  const paid = entries.reduce(
    (sum, entry) => sum + entry.payments.reduce((inner, payment) => inner + payment.amount, 0),
    0
  )

  function resetForm() {
    setEditingId(null)
    setDescription('')
    setCategory('materials')
    setVendorName('')
    setBillAmount('')
    setBillDate(todayIsoDate())
  }

  function startEdit(entry: MaterialEntryRow) {
    setEditingId(entry.id)
    setDescription(entry.description)
    setCategory(entry.category as (typeof CATEGORIES)[number]['value'])
    setVendorName(entry.vendor_name ?? '')
    setBillAmount(String(entry.bill_amount))
    setBillDate(entry.bill_date ?? todayIsoDate())
  }

  async function handleSaveEntry() {
    if (!owner.data || !id) return
    const amount = parseAmount(billAmount)
    const date = normalizeDateInput(billDate)
    if (!description.trim()) {
      Alert.alert('Description required', 'What was bought?')
      return
    }
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter the bill value.')
      return
    }
    setBusy(true)
    try {
      if (editingId) {
        await updateMaterialEntry(owner.data.id, editingId, {
          description,
          category,
          vendorName,
          billAmount: amount,
          billDate: date,
        })
      } else {
        await createMaterialEntry(owner.data.id, id, {
          description,
          category,
          vendorName,
          billAmount: amount,
          billDate: date,
          paidByClient: bundle?.project.client_managed_expenses === 1,
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

  async function handleAddPayment(entryId: string) {
    if (!owner.data || !id) return
    const amount = parseAmount(paymentAmount)
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a payment amount.')
      return
    }
    try {
      await createMaterialPayment(owner.data.id, id, entryId, {
        amount,
        date: todayIsoDate(),
        paymentMode: 'cash',
      })
      setPaymentAmount('')
      setPayingEntryId(null)
      await refresh()
    } catch (cause) {
      Alert.alert('Could not save payment', cause instanceof Error ? cause.message : String(cause))
    }
  }

  function handleDeleteEntry(entry: MaterialEntryRow) {
    if (!owner.data) return
    Alert.alert('Delete bill?', 'Its payments are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMaterialEntry(owner.data!.id, entry.id)
          if (editingId === entry.id) resetForm()
          await refresh()
        },
      },
    ])
  }

  function handleDeletePayment(paymentId: string) {
    if (!owner.data) return
    Alert.alert('Delete payment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMaterialPayment(owner.data!.id, paymentId)
          await refresh()
        },
      },
    ])
  }

  return (
    <Screen>
      <BackHeader title="Materials" subtitle={bundle?.project.name} />

      <Card>
        <View style={styles.metricRow}>
          <Metric label="Bills" value={formatINR(bills)} />
          <Metric label="Paid" value={formatINR(paid)} />
          <Metric label="Due" value={formatINR(bills - paid)} tone="warning" />
        </View>
      </Card>

      <Card>
        <H2>{editingId ? 'Edit bill' : 'Add material bill'}</H2>
        <Field label="Description" value={description} onChangeText={setDescription} />
        <Muted>Category</Muted>
        <ChipGroup options={CATEGORIES} value={category} onChange={setCategory} />
        <Field label="Vendor (optional)" value={vendorName} onChangeText={setVendorName} />
        <Field label="Bill amount" value={billAmount} onChangeText={setBillAmount} keyboardType="numeric" />
        <Field label="Bill date" value={billDate} onChangeText={setBillDate} />
        <Button
          title={busy ? 'Saving…' : editingId ? 'Save changes' : 'Add bill'}
          onPress={handleSaveEntry}
          disabled={busy}
        />
        {editingId ? <Button title="Cancel edit" variant="secondary" onPress={resetForm} /> : null}
      </Card>

      <Card>
        <H2>Bills ({entries.length})</H2>
        {entries.length === 0 ? <Muted>No material bills yet.</Muted> : null}
        {entries.map((entry) => {
          const entryPaid = entry.payments.reduce((sum, payment) => sum + payment.amount, 0)
          const due = entry.bill_amount - entryPaid
          return (
            <View key={entry.id} style={styles.entry}>
              <Pressable onPress={() => startEdit(entry)} onLongPress={() => handleDeleteEntry(entry)}>
                <View style={styles.entryHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{entry.description}</Text>
                    <Muted>
                      {entry.vendor_name ? `${entry.vendor_name} · ` : ''}
                      {entry.bill_date ? shortDate(entry.bill_date) : 'No bill date'}
                    </Muted>
                    <Muted>
                      paid {formatINR(entryPaid)}
                      {due > 0 ? ` · due ${formatINR(due)}` : ' · settled'}
                    </Muted>
                  </View>
                  <Text style={styles.rowValue}>{formatINR(entry.bill_amount)}</Text>
                </View>
              </Pressable>

              {entry.payments.map((payment) => (
                <Pressable
                  key={payment.id}
                  onLongPress={() => handleDeletePayment(payment.id)}
                  style={styles.paymentRow}
                >
                  <Muted>
                    {shortDate(payment.date)} · {payment.payment_mode} · {formatINR(payment.amount)}
                  </Muted>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setPayingEntryId(payingEntryId === entry.id ? null : entry.id)}
              >
                <Text style={styles.link}>
                  {payingEntryId === entry.id ? 'Cancel' : 'Record payment'}
                </Text>
              </Pressable>

              {payingEntryId === entry.id ? (
                <View style={styles.paymentForm}>
                  <Field
                    label="Amount"
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    keyboardType="numeric"
                    autoFocus
                  />
                  <Button title="Save payment" onPress={() => handleAddPayment(entry.id)} />
                </View>
              ) : null}
            </View>
          )
        })}
        {entries.length > 0 ? (
          <Muted>Tap a bill to edit, long-press to delete. Long-press a payment to remove it.</Muted>
        ) : null}
      </Card>
    </Screen>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <View style={{ flex: 1 }}>
      <Muted>{label}</Muted>
      <Text style={[styles.metric, tone === 'warning' && { color: colors.warning }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: { fontSize: 15, fontWeight: '700', color: colors.text },
  entry: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  entryHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  paymentRow: { paddingLeft: 12, paddingVertical: 2 },
  link: { color: colors.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  paymentForm: { gap: 8, marginTop: 8 },
})
