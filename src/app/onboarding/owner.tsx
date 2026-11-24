import { useState } from 'react'
import { Alert, View } from 'react-native'
import { router } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { Body, Button, Card, Field, H1, Muted, Screen } from '@/components/ui'
import { createOwner, getOwner } from '@/db/queries'
import { createIdentity } from '@/state/identity'

export default function OwnerSetupScreen() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter your name so clients know who sent them data.')
      return
    }
    setBusy(true)
    try {
      const existing = await getOwner()
      if (existing) {
        router.replace('/(tabs)/dashboard')
        return
      }
      const identity = await createIdentity()
      await createOwner({ name, email, phone, publicKey: identity.publicKey })
      router.replace('/(tabs)/dashboard')
    } catch (cause) {
      Alert.alert('Could not finish setup', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="Designer setup" />
      <H1>Your workspace</H1>
      <Muted>
        Everything stays on this device. You will share project updates with clients as signed files
        — no server, no account, no cloud database.
      </Muted>

      <Card>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ratandeep Bora"
          autoCapitalize="words"
          autoFocus
        />
        <Field
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 …"
          keyboardType="phone-pad"
        />
      </Card>

      <Card>
        <Body>How your data works</Body>
        <Muted>
          Your projects live in a private database on this phone. When you share something with a
          client, the app creates a signed file that only they can verify. Clients send expense
          requests back the same way.
        </Muted>
      </Card>

      <View style={{ marginTop: 8 }}>
        <Button
          title={busy ? 'Setting up…' : 'Create my workspace'}
          onPress={handleCreate}
          disabled={busy}
        />
      </View>
    </Screen>
  )
}
