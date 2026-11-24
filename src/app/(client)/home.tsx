import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { importAsClient, pickPackFile } from '@/features/import-pack'
import { shortDate } from '@/lib/display'
import { formatINR } from '@/lib/money'
import { useClientProfile, useOutbox, useSharedProjects } from '@/state/hooks'

export default function ClientHomeScreen() {
  const profile = useClientProfile()
  const projects = useSharedProjects(profile.data?.id)
  const outbox = useOutbox(profile.data?.id)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function handleImport() {
    setBusy(true)
    try {
      const pack = await pickPackFile()
      if (!pack) return
      const outcome = await importAsClient(pack)
      Alert.alert(outcome.title, outcome.message)
      await queryClient.invalidateQueries({
        queryKey: ['sharedProjects', profile.data?.id ?? ''],
      })
      await queryClient.invalidateQueries({ queryKey: ['outbox', profile.data?.id ?? ''] })
    } catch (caught) {
      Alert.alert('Could not import', caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  if (profile.isLoading || projects.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!profile.data) {
    return (
      <Screen>
        <H1>Not connected</H1>
        <Muted>Open your invite to connect to your designer.</Muted>
        <Button title="Go to setup" onPress={() => router.replace('/onboarding/client')} />
      </Screen>
    )
  }

  const submissions = outbox.data ?? []

  return (
    <Screen>
      <H1>{profile.data.name}</H1>
      <Muted>Connected to {profile.data.owner_name}</Muted>

      <Button
        title={busy ? 'Opening…' : 'Import shared update'}
        onPress={handleImport}
        disabled={busy}
      />

      {(projects.data ?? []).length === 0 ? (
        <Card>
          <H2>No projects shared yet</H2>
          <Muted>
            Ask {profile.data.owner_name} to send a project update, then tap “Import shared update”.
          </Muted>
        </Card>
      ) : null}

      {(projects.data ?? []).map((project) => (
        <Pressable
          key={project.id}
          onPress={() => router.push(`/(client)/shared/${project.remoteProjectId}`)}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Card>
            <H2>{project.name}</H2>
            <Muted>Updated {shortDate(project.updatedAt)}</Muted>
            <View style={styles.row}>
              <Metric label="Budget" value={formatINR(project.budget)} />
              <Metric label="Paid by you" value={formatINR(project.summary.clientPaidToDate)} />
            </View>
            <View style={styles.row}>
              <Metric label="Your total cost" value={formatINR(project.summary.clientBorneCost)} />
              <Metric label="Remaining" value={formatINR(project.summary.budgetRemaining)} />
            </View>
          </Card>
        </Pressable>
      ))}

      {submissions.length > 0 ? (
        <Card>
          <H2>Your submissions</H2>
          {submissions.map((row) => {
            const amount = readAmount(row.payload)
            return (
              <View key={row.id} style={styles.submission}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.submissionTitle}>
                    {amount ? formatINR(amount) : 'Expense'} · {row.status}
                  </Text>
                  <Muted>{shortDate(row.created_at)}</Muted>
                </View>
                <Text
                  style={[
                    styles.status,
                    {
                      color:
                        row.status === 'answered'
                          ? colors.success
                          : row.status === 'sent'
                            ? colors.warning
                            : colors.muted,
                    },
                  ]}
                >
                  {row.status === 'answered' ? 'reviewed' : row.status}
                </Text>
              </View>
            )
          })}
        </Card>
      ) : null}
    </Screen>
  )
}

function readAmount(payload: string): number | null {
  try {
    const parsed = JSON.parse(payload) as { expense?: { amount?: number } }
    return typeof parsed.expense?.amount === 'number' ? parsed.expense.amount : null
  } catch {
    return null
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Muted>{label}</Muted>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  value: { fontSize: 15, fontWeight: '700', color: colors.text },
  submission: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  submissionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  status: { fontSize: 12, fontWeight: '700' },
})
