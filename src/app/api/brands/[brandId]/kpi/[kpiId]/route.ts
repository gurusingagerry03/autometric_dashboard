import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyBrandAccess } from '@/lib/brands/queries'
import { deleteBrandKpi, setKpiActive, updateBrandKpi } from '@/lib/kpi/queries'
import { parseKpiPatch } from '@/lib/kpi/types'

type Params = { params: Promise<{ brandId: string; kpiId: string }> }

// PATCH /api/brands/[brandId]/kpi/[kpiId]
//   { isActive: boolean }                                  — nyala/mati
//   { valueTarget: number, startDate, endDate }            — ubah target & periode
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId, kpiId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const body = await req.json().catch(() => null)
    if (body && typeof body === 'object' && 'valueTarget' in body) {
      const parsed = parseKpiPatch(body)
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      const row = await updateBrandKpi(brandId, kpiId, parsed.value)
      if (!row) return NextResponse.json({ error: 'KPI not found.' }, { status: 404 })
      return NextResponse.json({ data: row })
    }
    const isActive = (body as { isActive?: unknown })?.isActive
    if (typeof isActive !== 'boolean') return NextResponse.json({ error: 'isActive harus boolean.' }, { status: 400 })

    const ok = await setKpiActive(brandId, kpiId, isActive)
    if (!ok) return NextResponse.json({ error: 'KPI not found.' }, { status: 404 })

    return NextResponse.json({ data: { kpiId, isActive } })
  } catch (err) {
    console.error('[PATCH /api/brands/[brandId]/kpi/[kpiId]]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// DELETE /api/brands/[brandId]/kpi/[kpiId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId, kpiId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const ok = await deleteBrandKpi(brandId, kpiId)
    if (!ok) return NextResponse.json({ error: 'KPI not found.' }, { status: 404 })

    return NextResponse.json({ data: { kpiId } })
  } catch (err) {
    console.error('[DELETE /api/brands/[brandId]/kpi/[kpiId]]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
