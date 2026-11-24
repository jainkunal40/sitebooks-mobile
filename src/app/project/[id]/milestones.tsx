import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { createMilestone, listMilestones, setMilestoneStatus } from '@/db/mutations'
import { shortDate } from '@/lib/display'
import type { MilestoneRow } from '@/db/types'
import { useOwner, useProject, useProjectRefresh } from '@/state/hooks'

export default function MilestonesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const refresh = useProjectRefresh(owner.data?.id, id)

  const [rows, setRows] = useState<MilestoneRow[]>([])
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  const ownerId = owner.data?.id
  const projectVersion = project.dataUpdatedAt

  useEffect(() => {
    let cancelled = false
    if (!ownerId || !id) return
    ;(async () => {
      const data = await listMilestones(ownerId, id)
      if (!cancelled) setRows(data)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerId, id, projectVersion])

  async function handleAdd() {
    if (!owner.data || !id) return
    if (!title.trim()) {
      Alert.alert('Title required', 'Name the milestone.')
      return
    }
    setBusy(true)
    try {
      await createMilestone(owner.data.id, id, {
        title,
        dueDate: dueDate || null,
      })
      setTitle('')
      setDueDate('')
      await refresh()
      setRows(await listMilestones(owner.data.id, id))
    } catch (cause) {
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(row: MilestoneRow) {
    if (!owner.data) return
    const nextStatus = row.status === 'completed' ? 'pending' : 'completed'
    await setMilestoneStatus(owner.data.id, row.id, nextStatus)
    setRows(await listMilestones(owner.data.id, id!))
  }

  return (
    <Screen>
      <BackHeader title="Milestones" subtitle={project.data?.project.name} />

      <Card>
        <H2>Add milestone</H2>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Kitchen handover" />
        <Field label="Due date (optional)" value={dueDate} onChangeText={setDueDate} placeholder="2026-12-15" />
        <Button title={busy ? 'Saving…' : 'Add milestone'} onPress={handleAdd} disabled={busy} />
      </Card>

      <Card>
        <H2>Milestones ({rows.length})</H2>
        {rows.length === 0 ? <Muted>No milestones yet.</Muted> : null}
        {rows.map((row) => (
          <Pressable key={row.id} onPress={() => toggle(row)} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.rowTitle,
                  row.status === 'completed' && { textDecorationLine: 'line-through', color: colors.muted },
                ]}
              >
                {row.title}
              </Text>
              <Muted>
                {row.status.replace('_', ' ')}
                {row.due_date ? ` · due ${shortDate(row.due_date)}` : ''}
              </Muted>
            </View>
            <Text style={styles.toggle}>{row.status === 'completed' ? '↺' : '✓'}</Text>
          </Pressable>
        ))}
        {rows.length > 0 ? <Muted>Tap a milestone to toggle completion.</Muted> : null}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggle: { fontSize: 20, color: colors.primary },
})
