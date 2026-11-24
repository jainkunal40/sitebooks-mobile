import { useState } from 'react'
import { Alert, StyleSheet, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { BackHeader } from '@/components/back-header'
import { ChipGroup } from '@/components/pickers'
import { Button, Card, Field, H2, Muted, Screen, colors } from '@/components/ui'
import { createProject } from '@/db/queries'
import { parseAmount } from '@/lib/money'
import { queryKeys, useClients, useOwner } from '@/state/hooks'

const STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
] as const

export default function NewProjectScreen() {
  const owner = useOwner()
  const clients = useClients(owner.data?.id)
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [budget, setBudget] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]['value']>('active')
  const [clientManaged, setClientManaged] = useState(true)
  const [busy, setBusy] = useState(false)

  const clientOptions = [
    { value: '', label: 'No client' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ]

  async function handleCreate() {
    if (!owner.data) return
    if (!name.trim()) {
      Alert.alert('Name required', 'Give the project a name.')
      return
    }
    setBusy(true)
    try {
      const project = await createProject(owner.data.id, {
        name,
        clientId: clientId || null,
        budget: parseAmount(budget) ?? 0,
        siteAddress,
        status,
        clientManagedExpenses: clientManaged,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects(owner.data.id) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.owner })
      router.replace(`/project/${project.id}`)
    } catch (cause) {
      Alert.alert('Could not create', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="New project" />

      <Card>
        <Field
          label="Project name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Raskar pariwar"
          autoFocus
        />

        <Muted>Client</Muted>
        <ChipGroup options={clientOptions} value={clientId} onChange={setClientId} />
        {(clients.data ?? []).length === 0 ? (
          <Muted>No clients yet — add one from the Clients tab and it will appear here.</Muted>
        ) : null}

        <Field label="Budget" value={budget} onChangeText={setBudget} keyboardType="numeric" />
        <Field label="Site address (optional)" value={siteAddress} onChangeText={setSiteAddress} />

        <Muted>Status</Muted>
        <ChipGroup options={STATUSES} value={status} onChange={setStatus} />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Client pays for expenses</Text>
            <Muted>New expenses default to “paid by client” and stay out of your P&amp;L.</Muted>
          </View>
          <Switch value={clientManaged} onValueChange={setClientManaged} />
        </View>

        <Button title={busy ? 'Creating…' : 'Create project'} onPress={handleCreate} disabled={busy} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
})
