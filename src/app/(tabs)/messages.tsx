import { useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { shortDate } from '@/lib/display'
import { PACK_KIND_LABELS, type PackKind } from '@/lib/pack'
import { importPack, pickPackFile } from '@/features/import-pack'
import { useMessages, useOwner, queryKeys } from '@/state/hooks'

export default function MessagesScreen() {
  const owner = useOwner()
  const messages = useMessages(owner.data?.id)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function handleImport() {
    if (!owner.data) return
    setBusy(true)
    try {
      const pack = await pickPackFile()
      if (!pack) return
      const outcome = await importPack(owner.data.id, pack)
      Alert.alert(outcome.title, outcome.message)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(owner.data.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clients(owner.data.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(owner.data.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pending(owner.data.id) }),
      ])
    } catch (caught) {
      Alert.alert('Could not import', caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <H1>Messages</H1>
      <Muted>
        Every share is a signed file. Opening one here verifies the sender before anything touches
        your books.
      </Muted>

      <Button title={busy ? 'Opening…' : 'Import a file'} onPress={handleImport} disabled={busy} />

      {(messages.data ?? []).map((message) => {
        const inbound = message.direction === 'in'
        const label = PACK_KIND_LABELS[message.kind as PackKind] ?? message.kind
        const tone =
          message.status === 'pending'
            ? colors.warning
            : message.status === 'failed'
              ? colors.danger
              : colors.success
        return (
          <Card key={message.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <H2>{label}</H2>
                <Muted>
                  {inbound ? 'From' : 'To'} {message.counterparty_name} · {shortDate(message.created_at)}
                </Muted>
              </View>
              <View style={[styles.badge, { borderColor: tone }]}>
                <Text style={[styles.badgeText, { color: tone }]}>{message.status}</Text>
              </View>
            </View>
            {message.error ? <Muted>{message.error}</Muted> : null}
          </Card>
        )
      })}

      {!messages.isLoading && (messages.data ?? []).length === 0 ? (
        <Card>
          <H2>Nothing shared yet</H2>
          <Muted>
            Pair a client from the Clients tab, then share a project update from the project screen.
            Their reply arrives here as a file you import.
          </Muted>
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  badgeText: { fontSize: 12, fontWeight: '600' },
})
