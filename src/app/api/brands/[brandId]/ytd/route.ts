import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyBrandAccess } from '@/lib/brands/queries'
import { getBrandYtd, parseYtdInput, setBrandYtd } from '@/lib/ytd/queries'

type Params = { params: Promise<{ brandId: string }> }

// GET /api/brands/[brandId]/ytd — periode YTD aktif brand ini (null kalau belum di-set).
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    if (!(await verifyBrandAccess(brandId, userId))) {
      return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })
    }
    return NextResponse.json({ data: await getBrandYtd(brandId) })
  } catch (err) {
    console.error('[GET /api/brands/[brandId]/ytd]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

/**
 * PUT /api/brands/[brandId]/ytd — simpan periode YTD, lalu hitung ulang deretnya.
 *
 * PUT, bukan POST: satu brand hanya punya SATU periode YTD aktif (constraint
 * `uq_ytd_setting_active_brand`), jadi ini mengganti, bukan menambah.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const parsed = parseYtdInput(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    return NextResponse.json({ data: await setBrandYtd(orgId, brandId, userId, parsed.start, parsed.end) })
  } catch (err) {
    console.error('[PUT /api/brands/[brandId]/ytd]', err)
    return NextResponse.json({ error: 'Gagal menyimpan periode YTD.' }, { status: 500 })
  }
}
