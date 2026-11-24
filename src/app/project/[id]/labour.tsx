import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { createLaborEntry, deleteLaborEntry, updateLaborEntry } from '@/db/mutations'
import { normalizeDateInput, todayIsoDate } from '@/lib/dates'
import { shortDate } from '@/lib/display'
import { formatINR, parseAmount } from '@/lib/money'
import type { LaborEntryRow } from '@/db/types'
import { useOwner, useProject, useProjectRefresh } from '@/state/hooks'

const TRADES = [
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'painter', label: 'Painter' },
  { value: 'false_ceiling', label: 'Ceiling' },
  { value: 'tiles', label: 'Tiles' },
  { value: 'pop', label: 'POP' },
  { value: 'civil', label: 'Civil' },
  { value: 'helper', label: 'Helper' },
  { value: 'other', label: 'Other' },
] as const

const STATUSES = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending_payment', label: 'Unpaid' },
] as const

export default function LabourScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const refresh = useProjectRefresh(owner.data?.id, id)
  const bundle = project.data

  const [editingId, setEditingId] = useState<string | null>(null)
  const [trade, setTrade] = useState<(typeof TRADES)[number]['value']>('carpenter')
  const [status, setStatus] = useState<(typeof STATUSES)[number]['value']>('ongoing')
  const [total, setTotal] = useState('')
  const [advance, setAdvance] = useState('')
  const [start, setStart] = useState(todayIsoDate())
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  function resetForm() {
    setEditingId(null)
    setTrade('carpenter')
    setStatus('ongoing')
    setTotal('')
    setAdvance('')
    setStart(todayIsoDate())
    setEnd('')
    setNotes('')
  }

  function startEdit(entry: LaborEntryRow) {
    setEditingId(entry.id)
    setTrade((TRADES.find((t) => t.value === entry.trade_type)?.value ?? 'other') as (typeof TRADES)[number]['value'])
    setStatus((STATUSES.find((s) => s.value === entry.status)?.value ?? 'ongoing') as (typeof STATUSES)[number]['value'])
    setTotal(String(entry.total_amount))
    setAdvance(String(entry.advance_paid))
    setStart(entry.start_date ?? '')
    setEnd(entry.end_date ?? '')
    setNotes(entry.notes ?? '')
  }

  async function handleSave() {
    if (!owner.data || !id) return
    const totalAmount = parseAmount(total)
    if (!totalAmount || totalAmount <= 0) {
      Alert.alert('Invalid contract value', 'Enter the agreed amount.')
      return
    }
    const startDate = start ? normalizeDateInput(start) : null
    const endDate = end ? normalizeDateInput(end) : null
    if (start && !startDate) {
      Alert.alert('Invalid start date', 'Use a date like 2026-11-24.')
      return
    }
    if (end && !endDate) {
      Alert.alert('Invalid end date', 'Use a date like 2026-11-24, or leave it blank.')
      return
    }
    setBusy(true)
    try {
      if (editingId) {
        await updateLaborEntry(owner.data.id, editingId, {
          tradeType: trade,
          totalAmount,
          advancePaid: parseAmount(advance) ?? 0,
          startDate,
          endDate,
          status,
          notes,
        })
      } else {
        await createLaborEntry(owner.data.id, id, {
          tradeType: trade,
          totalAmount,
          advancePaid: parseAmount(advance) ?? 0,
          startDate,
          endDate,
          status,
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

  function handleDelete(entry: LaborEntryRow) {
    if (!owner.data) return
    Alert.alert('Delete labour entry?', 'Expenses linked to it stay, but lose the link.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLaborEntry(owner.data!.id, entry.id)
          if (editingId === entry.id) resetForm()
          await refresh()
        },
      },
    ])
  }

  const entries = bundle?.laborEntries ?? []
  const committed = entries.reduce((sum, entry) => sum + entry.total_amount, 0)
  const paid = entries.reduce((sum, entry) => sum + entry.advance_paid, 0)

  return (
    <Screen>
      <BackHeader title="Labour" subtitle={bundle?.project.name} />

      <Card>
        <View style={styles.metricRow}>
          <Metric label="Committed" value={formatINR(committed)} />
          <Metric label="Paid" value={formatINR(paid)} />
          <Metric label="Due" value={formatINR(committed - paid)} tone="warning" />
        </View>
      </Card>

      <Card>
        <H2>{editingId ? 'Edit contract' : 'Add labour contract'}</H2>
        <Muted>Trade</Muted>
        <ChipGroup options={TRADES} value={trade} onChange={setTrade} />
        <Muted>Status</Muted>
        <ChipGroup options={STATUSES} value={status} onChange={setStatus} />
        <Field label="Contract amount" value={total} onChangeText={setTotal} keyboardType="numeric" />
        <Field label="Advance paid" value={advance} onChangeText={setAdvance} keyboardType="numeric" />
        <Field label="Start date" value={start} onChangeText={setStart} />
        <Field label="End date (optional)" value={end} onChangeText={setEnd} />
        <Field label="Notes" value={notes} onChangeText={setNotes} />
        <Button
          title={busy ? 'Saving…' : editingId ? 'Save changes' : 'Add labour entry'}
          onPress={handleSave}
          disabled={busy}
        />
        {editingId ? <Button title="Cancel edit" variant="secondary" onPress={resetForm} /> : null}
      </Card>

      <Card>
        <H2>Contracts ({entries.length})</H2>
        {entries.length === 0 ? <Muted>No labour contracts yet.</Muted> : null}
        {entries.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => startEdit(entry)}
            onLongPress={() => handleDelete(entry)}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{entry.trade_type}</Text>
              <Muted>
                {shortDate(entry.start_date)}
                {entry.end_date ? ` → ${shortDate(entry.end_date)}` : ''} · {entry.status}
              </Muted>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.rowValue}>{formatINR(entry.total_amount)}</Text>
              <Muted>paid {formatINR(entry.advance_paid)}</Muted>
            </View>
          </Pressable>
        ))}
        {entries.length > 0 ? <Muted>Tap to edit, long-press to delete.</Muted> : null}
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
  row: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
})
