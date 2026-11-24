import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Alert } from 'react-native'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { deleteProject } from '@/db/queries'
import { queryKeys } from '@/state/hooks'
import { money, pct } from '@/lib/display'
import { useOwner, useProjectSummaries } from '@/state/hooks'

export default function DashboardScreen() {
  const owner = useOwner()
  const summaries = useProjectSummaries(owner.data?.id)
  const queryClient = useQueryClient()

  if (owner.isLoading || summaries.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    )
  }

  const projects = summaries.data ?? []
  const totals = projects.reduce(
    (acc, item) => ({
      income: acc.income + item.finance.income,
      cost: acc.cost + item.finance.totalCost,
      profit: acc.profit + item.finance.netProfit,
      due: acc.due + item.finance.pendingPayables,
    }),
    { income: 0, cost: 0, profit: 0, due: 0 }
  )

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <H1>Your Projects</H1>
          <Muted>{owner.data ? `Signed in as ${owner.data.name}` : 'Local workspace'}</Muted>
        </View>
      </View>

      <Card>
        <View style={styles.metricRow}>
          <Metric label="Income" value={money(totals.income)} />
          <Metric label="Cost" value={money(totals.cost)} />
        </View>
        <View style={styles.metricRow}>
          <Metric
            label="Net profit"
            value={money(totals.profit)}
            tone={totals.profit < 0 ? 'danger' : 'success'}
          />
          <Metric label="Payables" value={money(totals.due)} tone={totals.due > 0 ? 'warning' : undefined} />
        </View>
      </Card>

      <Button title="New project" onPress={() => router.push('/project/new')} />

      {projects.length === 0 ? (
        <Card>
          <H2>No projects yet</H2>
          <Muted>Create a project to start tracking income, expenses, labour and materials.</Muted>
        </Card>
      ) : (
        projects.map(({ project, client, finance }) => {
          const over = finance.budget > 0 && finance.budgetRemaining < 0
          return (
            <Pressable
              key={project.id}
              onPress={() => router.push(`/project/${project.id}`)}
              onLongPress={() => {
                if (!owner.data) return
                Alert.alert('Delete project?', project.name, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteProject(owner.data!.id, project.id)
                      await queryClient.invalidateQueries({
                        queryKey: queryKeys.projects(owner.data!.id),
                      })
                    },
                  },
                ])
              }}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card>
                <View style={styles.projectHeader}>
                  <View style={{ flex: 1 }}>
                    <H2>{project.name}</H2>
                    <Muted>{client ? client.name : 'No client assigned'}</Muted>
                  </View>
                  <Text style={[styles.status, { color: over ? colors.danger : colors.success }]}>
                    {finance.budget > 0 ? pct(finance.totalCost, finance.budget) : '—'}
                  </Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, Math.max(0, finance.budget ? (finance.totalCost / finance.budget) * 100 : 0))}%`,
                        backgroundColor: over ? colors.danger : colors.primary,
                      },
                    ]}
                  />
                </View>

                <View style={styles.metricRow}>
                  <Metric label="Budget" value={money(finance.budget)} small />
                  <Metric label="Cost" value={money(finance.totalCost)} small />
                  <Metric
                    label="Left"
                    value={money(finance.budgetRemaining)}
                    small
                    tone={over ? 'danger' : 'success'}
                  />
                </View>

                {finance.pendingApproval > 0 ? (
                  <Muted>⏳ {money(finance.pendingApproval)} awaiting your approval</Muted>
                ) : null}
              </Card>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}

function Metric({
  label,
  value,
  tone,
  small,
}: {
  label: string
  value: string
  tone?: 'success' | 'danger' | 'warning'
  small?: boolean
}) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.text
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[small ? styles.metricValueSmall : styles.metricValue, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  metricRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metricLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  metricValueSmall: { fontSize: 14, fontWeight: '600' },
  projectHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  status: { fontSize: 13, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 6, borderRadius: 3 },
})
