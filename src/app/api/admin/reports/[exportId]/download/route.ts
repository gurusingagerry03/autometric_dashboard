import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getReportExportForAdmin } from '@/lib/admin/reports'
import { readReportFile } from '@/lib/reports/storage/files'

export const runtime = 'nodejs'

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// GET /api/admin/reports/:exportId/download — unduh PPTX report org mana pun.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { exportId } = await params
  const row = await getReportExportForAdmin(exportId)
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await readReportFile(row.gcsObjectName)
  } catch (e) {
    console.error('[admin/reports] file read failed:', e)
    return NextResponse.json({ error: 'File unavailable.' }, { status: 502 })
  }

  const fileName = `${row.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'report'}.pptx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': PPTX_MIME,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
