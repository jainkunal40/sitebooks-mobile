/**
 * Attachments (site photos, receipts).
 *
 * Files are copied into the app's document directory and only a RELATIVE path
 * is stored — on iOS the container UUID changes between installs, so an
 * absolute URI saved today will not resolve tomorrow.
 */
import { Directory, File, Paths } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { getDatabase, nowIso } from '@/db'
import { createId } from '@/lib/random'

export interface AttachmentRow {
  id: string
  owner_id: string
  project_id: string
  expense_id: string | null
  kind: string
  file_name: string
  relative_path: string
  mime_type: string | null
  size: number | null
  created_at: string
}

const FOLDER = 'attachments'

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

export function attachmentUri(row: AttachmentRow): string {
  return new File(Paths.document, row.relative_path).uri
}

export async function listAttachments(
  ownerId: string,
  projectId: string
): Promise<AttachmentRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<AttachmentRow>(
    'SELECT * FROM attachment WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC',
    [ownerId, projectId]
  )
}

export async function addImageAttachment(
  ownerId: string,
  projectId: string,
  expenseId: string | null = null
): Promise<AttachmentRow | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  })
  if (result.canceled || !result.assets?.[0]) return null

  const asset = result.assets[0]
  const id = createId('att')
  const extension = extensionOf(asset.uri, asset.mimeType)
  const fileName = `${id}.${extension}`
  const destination = new File(folder(), fileName)

  await new File(asset.uri).copy(destination)

  const row: AttachmentRow = {
    id,
    owner_id: ownerId,
    project_id: projectId,
    expense_id: expenseId,
    kind: 'image',
    file_name: fileName,
    relative_path: `${FOLDER}/${fileName}`,
    mime_type: asset.mimeType ?? null,
    size: asset.fileSize ?? null,
    created_at: nowIso(),
  }

  const db = await getDatabase()
  await db.runAsync(
    `INSERT INTO attachment
      (id, owner_id, project_id, expense_id, kind, file_name, relative_path, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.owner_id,
      row.project_id,
      row.expense_id,
      row.kind,
      row.file_name,
      row.relative_path,
      row.mime_type,
      row.size,
      row.created_at,
    ]
  )

  return row
}

export async function deleteAttachment(ownerId: string, attachmentId: string): Promise<void> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<AttachmentRow>(
    'SELECT * FROM attachment WHERE id = ? AND owner_id = ?',
    [attachmentId, ownerId]
  )
  if (!row) return

  try {
    const file = new File(Paths.document, row.relative_path)
    if (file.exists) file.delete()
  } catch {
    // The row is still removed even if the file was already gone.
  }

  await db.runAsync('DELETE FROM attachment WHERE id = ? AND owner_id = ?', [attachmentId, ownerId])
}

function extensionOf(uri: string, mimeType?: string | null): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(uri)
  if (match) return match[1].toLowerCase()
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('webp')) return 'webp'
  return 'jpg'
}
