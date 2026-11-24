import { router } from 'expo-router'
import { BackupPanel } from '@/components/backup-panel'
import { Button, Card, H1, H2, Muted, Screen, colors } from '@/components/ui'
import { StyleSheet, Text, View } from 'react-native'

/**
 * First launch. The app has no account system, so the phone cannot know which
 * side it is on — the user says so once, and the choice is stored as either an
 * `owner` row or a `client_profile` row. Every later launch reads that record.
 */
export default function WelcomeScreen() {
  return (
    <Screen>
      <H1>SiteBooks</H1>
      <Muted>Project finance that lives on your phone.</Muted>

      <Card>
        <H2>I&apos;m a designer</H2>
        <Muted>
          You run projects, track expenses, labour and materials, and send updates to your clients.
        </Muted>
        <Button title="Set up my workspace" onPress={() => router.push('/onboarding/owner')} />
      </Card>

      <Card>
        <H2>I&apos;m a client</H2>
        <Muted>
          Your designer sent you an invite. You will see only the projects they share with you.
        </Muted>
        <Button
          title="Join with an invite"
          variant="secondary"
          onPress={() => router.push('/onboarding/client')}
        />
      </Card>

      <Card>
        <View style={styles.noteRow}>
          <Text style={styles.dot}>•</Text>
          <Muted>One phone is either a designer or a client — not both.</Muted>
        </View>
        <View style={styles.noteRow}>
          <Text style={styles.dot}>•</Text>
          <Muted>Nothing is uploaded. There is no account to sign into.</Muted>
        </View>
        <View style={styles.noteRow}>
          <Text style={styles.dot}>•</Text>
          <Muted>Choose carefully: switching later means wiping this device.</Muted>
        </View>
      </Card>

      <BackupPanel onRestored={() => router.replace('/')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { color: colors.muted, fontSize: 14, lineHeight: 20 },
})
