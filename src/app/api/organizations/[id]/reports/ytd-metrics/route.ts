import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportYtdMetrics } from '@/lib/reports/data/ytdQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/ytd-metrics?brand=<brandId>
// Metrik YTD per platform: akumulasi sepanjang periode KPI brand, plus jendela
// sepanjang itu tepat sebelumnya sebagai pembanding.
//
// Tanpa year/month — sama seperti kpi-targets. Jendelanya milik periode KPI,
// bukan periode report; memotongnya ke bulan report akan membuat "YTD" hanya
// mencakup satu bulan.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const brandId = req.nextUrl.searchParams.get('brand')
    if (!brandId) return NextResponse.json({ error: 'Missing brand.' }, { status: 400 })

    const data = await getReportYtdMetrics(orgId, brandId)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/ytd-metrics]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
