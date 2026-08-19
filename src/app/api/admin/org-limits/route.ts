import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listOrgLimits } from '@/lib/organizations/limits'
import {
  DEFAULT_MAX_BRANDS_PER_ORG,
  DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
  ORG_LIMIT_MAX,
} from '@/lib/quotas'

// GET /api/admin/org-limits — semua organization + batas & pemakaiannya.
export async function GET() {
  try {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await listOrgLimits()
    return NextResponse.json({
      data,
      // Defaultnya ikut dikirim supaya layar admin bisa menandai baris mana yang
      // masih memakai default tanpa mengimpor konstanta ke sisi klien.
      defaults: {
        maxBrands:                 DEFAULT_MAX_BRANDS_PER_ORG,
        maxCompetitorsPerPlatform: DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
      },
      max: ORG_LIMIT_MAX,
    })
  } catch (err) {
    console.error('[GET /api/admin/org-limits]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
