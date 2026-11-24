/**
 * Statement PDF.
 *
 * Built from the same finance module the screens use, so the printed numbers
 * always match what is on screen.
 */
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import type { ProjectBundle } from '@/db/types'
import { buildStatementHtml } from '@/lib/statement-html'

export async function exportStatementPdf(bundle: ProjectBundle): Promise<void> {
  const html = buildStatementHtml(bundle)
  const { uri } = await Print.printToFileAsync({ html })
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.')
  }
  await Sharing.shareAsync(uri, {
    UTI: 'com.adobe.pdf',
    mimeType: 'application/pdf',
    dialogTitle: `${bundle.project.name} statement`,
  })
}
