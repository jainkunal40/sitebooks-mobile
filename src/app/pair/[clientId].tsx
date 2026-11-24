import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import QRCode from 'react-native-qrcode-svg'
import { BackHeader } from '@/components/back-header'
import { Button, Card, H2, Muted, Screen, colors } from '@/components/ui'
import { buildClientInvite, shareBuiltInvite } from '@/features/pairing'
import { packToPairLink } from '@/lib/qr'
import type { Pack } from '@/lib/pack'
import { useClients, useOwner } from '@/state/hooks'

export default function PairQrScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const owner = useOwner()
  const clients = useClients(owner.data?.id)
  const client = (clients.data ?? []).find((row) => row.id === clientId)

  const [pack, setPack] = useState<Pack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const builtFor = useRef<string | null>(null)

  useEffect(() => {
    if (!owner.data || !client || builtFor.current === client.id) return
    builtFor.current = client.id
    const ownerRow = owner.data
    const clientRow = client
    let cancelled = false
    ;(async () => {
      try {
        const invite = await buildClientInvite(ownerRow, clientRow)
        if (!cancelled) setPack(invite)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [owner.data, client])

  const link = pack ? packToPairLink(pack) : null

  async function handleShareFile() {
    if (!owner.data || !client || !pack) return
    try {
      await shareBuiltInvite(owner.data, client, pack)
    } catch (cause) {
      Alert.alert('Could not share', cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Screen>
      <BackHeader title="Pair device" subtitle={client?.name} />

      <Card>
        <H2>Scan to pair</H2>
        <Muted>
          Ask {client?.name ?? 'your client'} to open SiteBooks → Join as client → Scan code. The
          code carries your public key and a one-time pairing secret.
        </Muted>

        <View style={styles.qrWrap}>
          {error ? (
            <Muted>{error}</Muted>
          ) : link ? (
            <QRCode value={link} size={240} backgroundColor="#FFFFFF" color="#111827" />
          ) : (
            <ActivityIndicator />
          )}
        </View>

        {link ? (
          <Text style={styles.hint} numberOfLines={3}>
            The client can scan this, or you can send it as a link. If they have not installed the
            app yet, share the invite as a file instead.
          </Text>
        ) : null}

        {link ? (
          <Button
            title="Copy invite link"
            variant="secondary"
            onPress={() => Clipboard.setStringAsync(link)}
          />
        ) : null}

        <Button
          title="Share invite as file instead"
          variant="secondary"
          onPress={handleShareFile}
          disabled={!pack}
        />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    minHeight: 260,
  },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
})
