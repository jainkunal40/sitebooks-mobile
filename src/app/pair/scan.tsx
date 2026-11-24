import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { BackHeader } from '@/components/back-header'
import { Button, Card, H2, Muted, Screen, colors } from '@/components/ui'
import { importAsClient } from '@/features/import-pack'
import { sendPairAckFromDevice } from '@/features/pairing'
import { pairLinkToPack } from '@/lib/qr'

export default function ScanPairScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [handled, setHandled] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleScan(data: string) {
    if (handled) return
    setHandled(true)
    setBusy(true)
    try {
      const pack = pairLinkToPack(data)
      const outcome = await importAsClient(pack)
      if (!outcome.ok) {
        Alert.alert(outcome.title, outcome.message)
        setHandled(false)
        setBusy(false)
        return
      }
      await sendPairAckFromDevice()
      Alert.alert(
        'Paired',
        'Send the confirmation file to your designer. Once they open it, they can share project updates with you.',
        [{ text: 'Continue', onPress: () => router.replace('/(client)/home') }]
      )
    } catch (cause) {
      Alert.alert('Could not pair', cause instanceof Error ? cause.message : String(cause))
      setHandled(false)
    } finally {
      setBusy(false)
    }
  }

  if (!permission) {
    return (
      <Screen>
        <BackHeader title="Scan pairing code" />
        <Muted>Checking camera permission…</Muted>
      </Screen>
    )
  }

  if (!permission.granted) {
    return (
      <Screen>
        <BackHeader title="Scan pairing code" />
        <Card>
          <H2>Camera access needed</H2>
          <Muted>SiteBooks uses the camera only to read the pairing QR your designer shows you.</Muted>
          <Button title="Allow camera" onPress={requestPermission} />
        </Card>
      </Screen>
    )
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handled ? undefined : ({ data }) => handleScan(data)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <BackHeader title="Scan pairing code" />
        </View>
        <View style={styles.frame} />
        <Text style={styles.caption}>
          {busy ? 'Pairing…' : 'Point the camera at the QR code on the designer’s phone.'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  header: { paddingTop: 40 },
  frame: {
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.primaryText,
  },
  caption: { color: colors.primaryText, textAlign: 'center', fontSize: 15, paddingBottom: 30 },
})
