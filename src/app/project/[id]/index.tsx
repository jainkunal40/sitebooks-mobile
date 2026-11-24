import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { shortDate } from '@/lib/display'
import { formatINR } from '@/lib/money'
import { computeProjectFinance } from '@/lib/finance'
import { toFinanceInput } from '@/db/types'
import { shareProjectUpdate } from '@/features/share-project'
import { useOwner, useProject } from '@/state/hooks'

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const project = useProject(owner.data?.id, id)
  const [sharing, setSharing] = useState(false)

  if (project.isLoading || owner.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    )
  }

  const bundle = project.data
  if (!bundle) {
    return (
      <Screen>
        <H1>Project not found</H1>
        <Muted>This project is not part of your workspace.</Muted>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    )
  }

  const finance = computeProjectFinance(toFinanceInput(bundle))
  const client = bundle.client

  async function handleShare() {
    if (!owner.data || !client) {
      Alert.alert('No client', 'Assign a client to this project before sharing.')
      return
    }
    if (!client.public_key) {
      Alert.alert(
        'Pair the client first',
        'Share a pairing invite with this client. Once they import it, you can send project updates.'
      )
      return
    }
    setSharing(true)
    try {
      await shareProjectUpdate({ owner: owner.data, client, bundle: bundle! })
    } catch (cause) {
      Alert.alert('Could not share', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSharing(false)
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <H1>{bundle.project.name}</H1>
          <Muted>{client ? client.name : 'No client assigned'}</Muted>
        </View>
      </View>

      <Card>
        <View style={styles.metricRow}>
          <Metric label="Budget" value={formatINR(finance.budget)} />
          <Metric label="Cost" value={formatINR(finance.totalCost)} />
        </View>
        <View style={styles.metricRow}>
          <Metric
            label="Remaining"
            value={formatINR(finance.budgetRemaining)}
            tone={finance.budgetRemaining < 0 ? 'danger' : 'success'}
          />
          <Metric label="Net profit" value={formatINR(finance.netProfit)} />
        </View>
        <View style={styles.metricRow}>
          <Metric label="Client paid" value={formatINR(finance.clientPaidToDate)} />
          <Metric label="Payables" value={formatINR(finance.pendingPayables)} tone="warning" />
        </View>
      </Card>

      <Button
        title={sharing ? 'Preparing…' : 'Share project update'}
        onPress={handleShare}
        disabled={sharing}
      />

      <Card>
        <H2>Manage</H2>
        <NavRow
          label="Income"
          value={formatINR(finance.income)}
          onPress={() => router.push(`/project/${bundle.project.id}/income`)}
        />
        <NavRow
          label="Expenses"
          value={formatINR(finance.expenses)}
          onPress={() => router.push(`/project/${bundle.project.id}/expenses`)}
        />
        <NavRow
          label="Labour"
          value={formatINR(finance.labor)}
          onPress={() => router.push(`/project/${bundle.project.id}/labour`)}
        />
        <NavRow
          label="Materials"
          value={formatINR(finance.materialPaid)}
          onPress={() => router.push(`/project/${bundle.project.id}/materials`)}
        />
        <NavRow
          label="Milestones"
          value=""
          onPress={() => router.push(`/project/${bundle.project.id}/milestones`)}
        />
        <NavRow
          label="Photos"
          value=""
          onPress={() => router.push(`/project/${bundle.project.id}/photos`)}
        />
        <NavRow
          label="Reports & PDF"
          value=""
          onPress={() => router.push(`/project/${bundle.project.id}/reports`)}
        />
        <NavRow
          label="Activity"
          value=""
          onPress={() => router.push(`/project/${bundle.project.id}/activity`)}
        />
      </Card>

      <Section title={`Expenses (${bundle.expenses.length})`}>
        {bundle.expenses.length === 0 ? <Muted>No expenses yet.</Muted> : null}
        {bundle.expenses.slice(0, 10).map((expense) => (
          <Row
            key={expense.id}
            title={`${expense.category}${expense.vendor_name ? ` · ${expense.vendor_name}` : ''}`}
            subtitle={`${shortDate(expense.date)}${expense.approval_status !== 'approved' ? ` · ${expense.approval_status}` : ''}`}
            value={formatINR(expense.amount + expense.tax_amount)}
          />
        ))}
      </Section>

      <Section title={`Income (${bundle.income.length})`}>
        {bundle.income.length === 0 ? <Muted>No income recorded.</Muted> : null}
        {bundle.income.slice(0, 10).map((income) => (
          <Row
            key={income.id}
            title={income.received_from || income.payment_type}
            subtitle={shortDate(income.date)}
            value={formatINR(income.amount)}
            tone="success"
          />
        ))}
      </Section>

      <Section title={`Labour (${bundle.laborEntries.length})`}>
        {bundle.laborEntries.length === 0 ? <Muted>No labour entries.</Muted> : null}
        {bundle.laborEntries.slice(0, 10).map((labor) => (
          <Row
            key={labor.id}
            title={labor.trade_type}
            subtitle={`${shortDate(labor.start_date)} · paid ${formatINR(labor.advance_paid)}`}
            value={formatINR(labor.total_amount)}
          />
        ))}
      </Section>

      <Section title={`Materials (${bundle.materialEntries.length})`}>
        {bundle.materialEntries.length === 0 ? <Muted>No material entries.</Muted> : null}
        {bundle.materialEntries.slice(0, 10).map((entry) => {
          const paid = entry.payments.reduce((sum, payment) => sum + payment.amount, 0)
          return (
            <Row
              key={entry.id}
              title={entry.description}
              subtitle={`paid ${formatINR(paid)}${entry.bill_amount !== paid ? ` · due ${formatINR(entry.bill_amount - paid)}` : ''}`}
              value={formatINR(entry.bill_amount)}
            />
          )
        })}
      </Section>
    </Screen>
  )
}

function NavRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navRow}>
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Muted>{value}</Muted>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
    </Pressable>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <H2>{title}</H2>
      {children}
    </Card>
  )
}

function Row({
  title,
  subtitle,
  value,
  tone,
}: {
  title: string
  subtitle: string
  value: string
  tone?: 'success'
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Muted>{subtitle}</Muted>
      </View>
      <Text style={[styles.rowValue, tone === 'success' && { color: colors.success }]}>{value}</Text>
    </View>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'danger' | 'success' | 'warning'
}) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.text
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  metricLabel: { fontSize: 12, color: colors.muted },
  metricValue: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
})
