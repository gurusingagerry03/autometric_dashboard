import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getReportMonthlyTracker } from '@/lib/reports/data/monthlyTrackerQuery'

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/reports/monthly-tracker?brand=<id>&year=<yyyy>&month=<1-12>
// 12 bulan kalender s.d. bulan report, per platform + 'all', untuk slide
// Monthly Tracker Performance. Slide-nya sendiri yang memotong ke rentang
// pilihannya (sejak Januari / 3 / 6 / 12 bulan).
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const brandId = sp.get('brand')
    const year = Number(sp.get('year'))
    const month = Number(sp.get('month'))
    if (!brandId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Missing or invalid brand/year/month.' }, { status: 400 })
    }

    const data = await getReportMonthlyTracker(orgId, brandId, year, month)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[GET /api/organizations/[id]/reports/monthly-tracker]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
