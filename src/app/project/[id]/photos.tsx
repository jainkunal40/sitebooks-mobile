import { useEffect, useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { File } from 'expo-file-system'
import { BackHeader } from '@/components/back-header'
import { Button, Card, H2, Muted, Screen, colors } from '@/components/ui'
import {
  addImageAttachment,
  attachmentUri,
  deleteAttachment,
  listAttachments,
  type AttachmentRow,
} from '@/features/attachments'
import { useOwner } from '@/state/hooks'

export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const owner = useOwner()
  const [rows, setRows] = useState<AttachmentRow[]>([])
  const [busy, setBusy] = useState(false)

  const ownerId = owner.data?.id

  useEffect(() => {
    let cancelled = false
    if (!ownerId || !id) return
    ;(async () => {
      const data = await listAttachments(ownerId, id)
      if (!cancelled) setRows(data)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerId, id])

  async function refresh() {
    if (!ownerId || !id) return
    setRows(await listAttachments(ownerId, id))
  }

  async function handleAdd() {
    if (!ownerId || !id) return
    setBusy(true)
    try {
      const row = await addImageAttachment(ownerId, id)
      if (row) await refresh()
    } catch (cause) {
      Alert.alert('Could not add photo', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(row: AttachmentRow) {
    try {
      const file = new File(attachmentUri(row))
      if (await File.canPreview(file)) {
        await File.preview(file, { title: row.file_name })
      } else {
        Alert.alert('Cannot preview', 'This file type is not supported on this device.')
      }
    } catch {
      Alert.alert('Cannot open', 'The file is missing from this device.')
    }
  }

  function handleDelete(row: AttachmentRow) {
    Alert.alert('Delete photo?', 'This removes it from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!ownerId) return
          await deleteAttachment(ownerId, row.id)
          await refresh()
        },
      },
    ])
  }

  return (
    <Screen>
      <BackHeader title="Photos" />

      <Card>
        <H2>Site photos</H2>
        <Muted>Photos stay on this device. They are never uploaded.</Muted>
        <Button title={busy ? 'Adding…' : 'Add photo'} onPress={handleAdd} disabled={busy} />
      </Card>

      <View style={styles.grid}>
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => handleOpen(row)}
            onLongPress={() => handleDelete(row)}
            style={styles.tile}
          >
            <Image source={{ uri: attachmentUri(row) }} style={styles.image} />
            <Text style={styles.caption} numberOfLines={1}>
              {row.file_name}
            </Text>
          </Pressable>
        ))}
      </View>

      {rows.length === 0 ? (
        <Card>
          <Muted>No photos yet. Tap “Add photo” to attach a site picture.</Muted>
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: { width: '100%', aspectRatio: 1 },
  caption: { fontSize: 10, color: colors.muted, padding: 4 },
})
