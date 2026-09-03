import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportCompetitorPosts } from '@/lib/reports/data/competitorPostsQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/competitor-posts?brand=<brandId>&year=&month=
// Kumpulan post kompetitor (bulan laporan) untuk section Visual Content sisi
// competitive review. Saudara dari post-metrics, tapi sumbernya l0_raw.*_competitor_media
// karena gold tidak menyimpan cover_image / caption kompetitor.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const brandId = sp.get('brand')
    if (!brandId) return NextResponse.json({ error: 'Missing brand.' }, { status: 400 })

    const year = Number(sp.get('year'))
    const month = Number(sp.get('month'))
    if (!Number.isInteger(year) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year/month.' }, { status: 400 })
    }

    return NextResponse.json(await getReportCompetitorPosts(orgId, brandId, year, month))
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/competitor-posts]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
