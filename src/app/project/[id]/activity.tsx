import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { Card, H2, Muted, Screen, colors } from '@/components/ui'
import { listActivity } from '@/db/queries'
import type { ActivityRow } from '@/db/types'
import { shortDate } from '@/lib/display'
import { useOwner } from '@/state/hooks'

const ICONS: Record<string, string> = {
  income_added: '💰',
  expense_added: '🧾',
  expense_approved: '✅',
  expense_rejected: '⛔',
  labor_added: '👷',
  material_added: '📦',
  material_payment: '💸',
  milestone: '🏁',
  project_created: '🏗️',
}

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const [rows, setRows] = useState<ActivityRow[]>([])

  const ownerId = owner.data?.id

  useEffect(() => {
    let cancelled = false
    if (!ownerId || !id) return
    ;(async () => {
      const data = await listActivity(ownerId, id)
      if (!cancelled) setRows(data)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerId, id])

  return (
    <Screen>
      <BackHeader title="Activity" />

      <Card>
        <H2>Recent events</H2>
        {rows.length === 0 ? <Muted>Nothing has happened on this project yet.</Muted> : null}
        {rows.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.icon}>{ICONS[row.action] ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.detail}>{row.details}</Text>
              <Muted>
                {shortDate(row.created_at)} · {row.actor_type}
              </Muted>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  icon: { fontSize: 18 },
  detail: { fontSize: 14, color: colors.text },
})
