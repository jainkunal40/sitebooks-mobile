/**
 * Deep-link entry point: sitebooks://pair?d=…
 *
 * Tapping an invite link (for example from WhatsApp) lands here. It behaves
 * exactly like scanning the QR code: decode, verify, import, then offer to send
 * the confirmation back to the designer.
 */
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { importAsClient } from '@/features/import-pack'
import { sendPairAckFromDevice } from '@/features/pairing'
import { pairPayloadToPack } from '@/lib/qr'

export default function PairLinkScreen() {
  const { d } = useLocalSearchParams<{ d?: string }>()
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('Opening your invite…')
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const payload = typeof d === 'string' ? d : ''
    if (!payload || handled.current === payload) return
    handled.current = payload

    ;(async () => {
      try {
        const pack = pairPayloadToPack(payload)
        const outcome = await importAsClient(pack)
        if (!outcome.ok) {
          setStatus('error')
          setMessage(outcome.message)
          return
        }
        setMessage('Sending your confirmation to the designer…')
        await sendPairAckFromDevice()
        setStatus('done')
        setMessage(
          'You are connected. Send the confirmation file back to your designer, then open it here once they reply.'
        )
      } catch (cause) {
        setStatus('error')
        setMessage(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  }, [d])

  return (
    <Screen>
      <H1>Pairing</H1>

      <Card>
        {status === 'working' ? <ActivityIndicator /> : null}
        {status === 'done' ? <H2>Connected</H2> : null}
        {status === 'error' ? <H2>Could not pair</H2> : null}
        <Muted>{message}</Muted>

        {status === 'working' ? (
          <View style={styles.spacer} />
        ) : status === 'done' ? (
          <Button title="Continue" onPress={() => router.replace('/(client)/home')} />
        ) : (
          <>
            <Button title="Try scanning instead" onPress={() => router.replace('/pair/scan')} />
            <Button
              title="Back to setup"
              variant="secondary"
              onPress={() => router.replace('/onboarding/client')}
            />
          </>
        )}
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  spacer: { height: 8 },
})
