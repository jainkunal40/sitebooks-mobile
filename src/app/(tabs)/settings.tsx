import { Alert, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { BackupPanel } from '@/components/backup-panel'
import { resetDatabase } from '@/db'
import { deleteIdentity } from '@/state/identity'
import { useClients, useOwner, useProjectSummaries } from '@/state/hooks'

export default function SettingsScreen() {
  const queryClient = useQueryClient()
  const owner = useOwner()
  const clients = useClients(owner.data?.id)
  const projects = useProjectSummaries(owner.data?.id)

  const publicKey = owner.data?.public_key ?? ''

  return (
    <Screen>
      <H1>Settings</H1>

      <Card>
        <H2>{owner.data?.name ?? 'Workspace'}</H2>
        <Muted>{owner.data?.email || 'No email saved'}</Muted>
        <Muted>{owner.data?.phone || 'No phone saved'}</Muted>
      </Card>

      <Card>
        <H2>Your identity</H2>
        <Muted>
          This key proves a message really came from you. Clients verify it before trusting an
          approval. The private half never leaves this device.
        </Muted>
        <View style={styles.keyBox}>
          <Text style={styles.keyText} numberOfLines={3}>
            {publicKey ? `${publicKey.slice(0, 32)}…${publicKey.slice(-8)}` : 'Not created'}
          </Text>
        </View>
        <Button
          title="Copy public key"
          variant="secondary"
          onPress={() => Clipboard.setStringAsync(publicKey)}
        />
      </Card>

      <BackupPanel
        onRestored={() => {
          queryClient.clear()
          router.replace('/')
        }}
      />

      <Card>
        <H2>Workspace</H2>
        <View style={styles.statRow}>
          <Stat label="Projects" value={String(projects.data?.length ?? 0)} />
          <Stat label="Clients" value={String(clients.data?.length ?? 0)} />
        </View>
      </Card>

      <Card>
        <H2>Where your data lives</H2>
        <Muted>
          Projects, expenses, labour and materials are stored in a SQLite database inside this app.
          Nothing is uploaded. Sharing creates a signed file you send yourself, so there is no
          server to breach and no monthly hosting bill.
        </Muted>
      </Card>

      <Card>
        <H2>Switch role</H2>
        <Muted>
          A phone is either a designer or a client. Resetting wipes every project, message and photo
          on this device and returns to the welcome screen. Create a backup first.
        </Muted>
        <Button
          title="Reset this device"
          variant="danger"
          onPress={() => {
            Alert.alert(
              'Reset this device?',
              'All local data will be deleted and you will start over. This cannot be undone without a backup.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete everything',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert('Are you absolutely sure?', 'Last chance.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Yes, reset',
                        style: 'destructive',
                        onPress: async () => {
                          await resetDatabase()
                          await deleteIdentity()
                          queryClient.clear()
                          router.replace('/')
                        },
                      },
                    ])
                  },
                },
              ]
            )
          }}
        />
      </Card>

      <Card>
        <H2>Multi-user isolation</H2>
        <Muted>
          Every record is stamped with the owner it belongs to. A client device only ever holds what
          you explicitly shared, and you never see another owner&apos;s projects.
        </Muted>
      </Card>
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  keyBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
  },
  keyText: { fontSize: 12, color: colors.muted },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statLabel: { fontSize: 12, color: colors.muted },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
})
