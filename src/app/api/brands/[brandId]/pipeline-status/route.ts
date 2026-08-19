import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyBrandAccess } from '@/lib/brands/queries'
import { getBrandPipelineStatus } from '@/lib/brands/pipelineStatus'

type Params = { params: Promise<{ brandId: string }> }

// GET /api/brands/[brandId]/pipeline-status
// Dipolling dashboard selama data brand masih disiapkan. Sengaja no-store: hasilnya
// berubah tiap menit dan jawaban basi bikin spinner nyangkut setelah data siap.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId  = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const status = await getBrandPipelineStatus(brandId)
    return NextResponse.json(status, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[GET /api/brands/[brandId]/pipeline-status]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
