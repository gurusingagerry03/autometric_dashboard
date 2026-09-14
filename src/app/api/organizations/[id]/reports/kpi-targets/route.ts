import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportKpiTargets } from '@/lib/reports/data/kpiTargetQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/kpi-targets?brand=<brandId>
// Target KPI aktif brand + capaiannya, untuk slide KPI Overview.
//
// Tanpa year/month — dan itu bukan kelalaian: periode sebuah KPI ditentukan oleh
// KPI itu sendiri (start_date..end_date, di-set di tab KPI brand), bukan oleh
// bulan report. Menyaringnya ke bulan report akan mengosongkan slide untuk KPI
// tahunan, yang justru bentuk paling umumnya.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const brandId = req.nextUrl.searchParams.get('brand')
    if (!brandId) return NextResponse.json({ error: 'Missing brand.' }, { status: 400 })

    const data = await getReportKpiTargets(orgId, brandId)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/kpi-targets]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
