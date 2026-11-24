import { useState } from 'react'
import { Alert, View } from 'react-native'
import { router } from 'expo-router'
import { BackHeader } from '@/components/back-header'
import { Button, Card, H2, Muted, Screen } from '@/components/ui'
import { importAsClient, pickPackFile } from '@/features/import-pack'
import { sendPairAckFromDevice } from '@/features/pairing'

export default function JoinAsClientScreen() {
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)

  async function handlePick() {
    setBusy(true)
    try {
      const pack = await pickPackFile()
      if (!pack) return
      const outcome = await importAsClient(pack)
      Alert.alert(outcome.title, outcome.message)
      if (outcome.ok && pack.kind === 'invite') setConnected(true)
    } catch (caught) {
      Alert.alert('Could not import', caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleAck() {
    setBusy(true)
    try {
      await sendPairAckFromDevice()
      Alert.alert(
        'Confirmation sent',
        'Ask your designer to open that file. Once they do, they can send you project updates.',
        [{ text: 'Continue', onPress: () => router.replace('/(client)/home') }]
      )
    } catch (caught) {
      Alert.alert('Could not send', caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <BackHeader title="Join as client" />

      <Card>
        <H2>Step 1 · Open your invite</H2>
        <Muted>
          Your designer sends a small file ending in .sbpack. Open it here once. It contains their
          public key, which lets this phone verify every future update they send you.
        </Muted>
        <Button title={busy ? 'Opening…' : 'Choose invite file'} onPress={handlePick} disabled={busy} />
        <Button
          title="Scan QR instead"
          variant="secondary"
          onPress={() => router.push('/pair/scan')}
        />
      </Card>

      <Card>
        <H2>Step 2 · Confirm your device</H2>
        <Muted>
          Send the confirmation file back so your designer knows this phone belongs to you. Without
          it they cannot trust your expense requests.
        </Muted>
        <View style={{ marginTop: 4 }}>
          <Button
            title={busy ? 'Preparing…' : 'Send my key to designer'}
            onPress={handleAck}
            disabled={busy || !connected}
            variant={connected ? 'primary' : 'secondary'}
          />
        </View>
        {!connected ? <Muted>Open your invite first.</Muted> : null}
      </Card>

      <Card>
        <H2>What this device stores</H2>
        <Muted>
          Only the project summaries your designer shared, plus the expenses you submit. Nothing is
          uploaded, and you cannot see anyone else&apos;s projects.
        </Muted>
      </Card>
    </Screen>
  )
}
