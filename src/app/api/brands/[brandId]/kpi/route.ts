import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyBrandAccess } from '@/lib/brands/queries'
import { createBrandKpis, listBrandKpis } from '@/lib/kpi/queries'
import { parseKpiInput, type KpiInput } from '@/lib/kpi/types'

type Params = { params: Promise<{ brandId: string }> }

// GET /api/brands/[brandId]/kpi — daftar KPI brand ini.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    return NextResponse.json({ data: await listBrandKpis(brandId) })
  } catch (err) {
    console.error('[GET /api/brands/[brandId]/kpi]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

/**
 * POST /api/brands/[brandId]/kpi — simpan satu atau beberapa KPI sekaligus.
 *
 * Form boleh menyusun beberapa baris sebelum menekan "Set KPI", jadi body-nya
 * `{ items: [...] }`. Seluruh baris divalidasi DULU sebelum satu pun ditulis:
 * separuh tersimpan lalu berhenti di baris ketiga adalah keadaan yang tidak
 * bisa dijelaskan ke pemakai.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const raw = Array.isArray((body as { items?: unknown })?.items) ? (body as { items: unknown[] }).items : null
    if (!raw || raw.length === 0) return NextResponse.json({ error: 'Belum ada KPI yang diisi.' }, { status: 400 })

    const items: KpiInput[] = []
    for (let i = 0; i < raw.length; i++) {
      const parsed = parseKpiInput(raw[i])
      if (!parsed.ok) return NextResponse.json({ error: `KPI #${i + 1}: ${parsed.error}` }, { status: 400 })
      items.push(parsed.value)
    }

    return NextResponse.json({ data: await createBrandKpis(orgId, brandId, userId, items) }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/brands/[brandId]/kpi]', err)
    return NextResponse.json({ error: 'Gagal menyimpan KPI.' }, { status: 500 })
  }
}
