import { useState } from 'react'
import { router } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { createClient } from '@/db/queries'
import { createClientInvite } from '@/features/pairing'
import { useClients, useOwner, queryKeys } from '@/state/hooks'

export default function ClientsScreen() {
  const owner = useOwner()
  const clients = useClients(owner.data?.id)
  const queryClient = useQueryClient()

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function handlePair(clientId: string) {
    if (!owner.data) return
    const client = (clients.data ?? []).find((row) => row.id === clientId)
    if (!client) return
    try {
      await createClientInvite(owner.data, client)
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients(owner.data.id) })
    } catch (cause) {
      Alert.alert('Could not create invite', cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleAdd() {
    if (!owner.data) return
    if (!name.trim()) {
      Alert.alert('Name required', 'Give the client a name.')
      return
    }
    setBusy(true)
    try {
      await createClient(owner.data.id, { name, phone, email })
      setName('')
      setPhone('')
      setEmail('')
      setAdding(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients(owner.data.id) })
    } catch (cause) {
      Alert.alert('Could not add client', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <H1>Clients</H1>
      <Muted>
        Each client belongs to you only. They receive signed project updates and can send expense
        requests back as files.
      </Muted>

      {adding ? (
        <Card>
          <H2>New client</H2>
          <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoFocus />
          <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={busy ? 'Saving…' : 'Add client'} onPress={handleAdd} disabled={busy} />
            </View>
          </View>
        </Card>
      ) : (
        <Button title="Add client" onPress={() => setAdding(true)} />
      )}

      {(clients.data ?? []).map((client) => (
        <Card key={client.id}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <H2>{client.name}</H2>
              <Muted>{client.phone || client.email || 'No contact details'}</Muted>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: client.status === 'active' ? '#ECFDF5' : '#FEF3C7' },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: client.status === 'active' ? colors.success : colors.warning },
                ]}
              >
                {client.status === 'active' ? 'Paired' : 'Not paired'}
              </Text>
            </View>
          </View>

          {client.status === 'active' ? (
            <Muted>Paired · can receive updates and send expenses.</Muted>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Show QR" onPress={() => router.push(`/pair/${client.id}`)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Send file"
                  variant="secondary"
                  onPress={() => handlePair(client.id)}
                />
              </View>
            </View>
          )}
        </Card>
      ))}

      {!clients.isLoading && (clients.data ?? []).length === 0 && !adding ? (
        <Card>
          <Muted>No clients yet. Add one to start sharing project updates.</Muted>
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
})
