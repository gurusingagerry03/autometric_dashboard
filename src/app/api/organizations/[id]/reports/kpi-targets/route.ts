import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportKpiTargets } from '@/lib/reports/data/kpiTargetQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/kpi-targets?brand=<brandId>&year=&month=
// Target KPI aktif brand + capaiannya, untuk slide KPI Overview.
//
// year/month TIDAK menyaring KPI-nya — periode sebuah KPI tetap miliknya sendiri
// (start_date..end_date, di-set di tab KPI brand), dan menyaring ke bulan report
// akan mengosongkan slide untuk KPI tahunan. Bulan report hanya memotong batas
// akhir capaiannya: KPI Jan–Des di report September dihitung Jan–Sep.
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

    const data = await getReportKpiTargets(orgId, brandId, year, month)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/kpi-targets]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
