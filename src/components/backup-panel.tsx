import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { Button, Card, Field, H2, Muted, colors } from './ui'
import {
  createBackup,
  getLastBackupAt,
  pickBackupText,
  restoreBackup,
} from '@/features/backup-db'
import { shortDate } from '@/lib/display'

const MIN_PASSPHRASE = 8

export function BackupPanel({ onRestored }: { onRestored?: () => void }) {
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const at = await getLastBackupAt()
      if (!cancelled) setLastBackup(at)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleBackup() {
    if (passphrase.length < MIN_PASSPHRASE) {
      Alert.alert('Passphrase too short', `Use at least ${MIN_PASSPHRASE} characters.`)
      return
    }
    if (passphrase !== confirm) {
      Alert.alert('Passphrases do not match', 'Type the same passphrase twice.')
      return
    }
    setBusy('backup')
    try {
      const result = await createBackup(passphrase)
      setPassphrase('')
      setConfirm('')
      setLastBackup(new Date().toISOString())
      Alert.alert(
        'Backup created',
        `Saved ${result.rows.toLocaleString('en-IN')} records.\n\nStore “${result.fileName}” somewhere outside this phone — Drive, email or a computer. Without it, deleting the app loses everything.`,
      )
    } catch (cause) {
      Alert.alert('Could not back up', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  function handleRestore() {
    if (passphrase.length < MIN_PASSPHRASE) {
      Alert.alert('Enter your passphrase', 'The one you chose when the backup was created.')
      return
    }
    Alert.alert(
      'Replace everything?',
      'Restoring replaces all data currently on this device with the contents of the backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose file', onPress: runRestore },
      ]
    )
  }

  async function runRestore() {
    setBusy('restore')
    try {
      const text = await pickBackupText()
      if (!text) return
      const result = await restoreBackup(text, passphrase)
      setPassphrase('')
      setConfirm('')
      Alert.alert(
        'Restored',
        `${result.rows.toLocaleString('en-IN')} records across ${result.tables} tables.${
          result.identityRestored ? ' Your signing identity was restored too.' : ''
        }`,
        [{ text: 'Continue', onPress: () => onRestored?.() }]
      )
    } catch (cause) {
      Alert.alert('Could not restore', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <H2>Backup &amp; restore</H2>
      <Muted>
        Deleting the app deletes every project on this phone. There is no server copy, so a backup is
        your only recovery.
      </Muted>
      <Text style={styles.status}>
        Last backup: {lastBackup ? shortDate(lastBackup) : 'never'}
      </Text>

      <Field
        label="Passphrase"
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        autoCapitalize="none"
        placeholder="At least 8 characters"
      />
      <Field
        label="Confirm passphrase"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        placeholder="Repeat it (needed to create)"
      />

      <Muted>
        The file is encrypted with this passphrase. If you forget it, nobody can open the backup —
        not even SiteBooks.
      </Muted>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            title={busy === 'backup' ? 'Creating…' : 'Create backup'}
            onPress={handleBackup}
            disabled={busy !== null}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={busy === 'restore' ? 'Restoring…' : 'Restore'}
            variant="secondary"
            onPress={handleRestore}
            disabled={busy !== null}
          />
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  status: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
})
