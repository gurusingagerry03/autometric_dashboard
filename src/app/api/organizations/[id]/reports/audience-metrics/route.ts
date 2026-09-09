import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportAudienceMetrics } from '@/lib/reports/data/audienceQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/audience-metrics?brand=<brandId>&year=&month=
// Audience sentiment (comments + tagged posts, this month vs the previous one),
// the comment word cloud, and follower age/gender for both months — the data
// behind the Audience Sentiment and Audience Demographic slides. Sibling of the
// chart-metrics route.
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

    const data = await getReportAudienceMetrics(orgId, brandId, year, month)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/audience-metrics]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
