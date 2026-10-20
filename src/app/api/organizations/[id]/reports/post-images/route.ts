import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { resolveReportImages, MAX_IMAGE_KEYS } from '@/lib/reports/images/resolve'

type Params = { params: Promise<{ id: string }> }

// POST /api/organizations/[id]/reports/post-images
// body: { brand: <brandId>, keys: string[] }  (key: lihat @/lib/reports/images/keys)
// → { images: { [key]: cloudinaryUrl | null } }
//
// Dipanggil slide Visual Content / Activity dan exporter PPTX untuk post yang
// tampil tapi cover-nya belum tersimpan permanen. Bisa memakan waktu hingga
// beberapa menit kalau ada post yang harus di-scrape ulang lewat Apify.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const body = await req.json().catch(() => null) as { brand?: unknown; keys?: unknown } | null
    const brandId = typeof body?.brand === 'string' ? body.brand : null
    if (!brandId) return NextResponse.json({ error: 'Missing brand.' }, { status: 400 })
    const keys = Array.isArray(body?.keys) ? body.keys.filter((k): k is string => typeof k === 'string') : []
    if (keys.length === 0) return NextResponse.json({ images: {} })
    if (keys.length > MAX_IMAGE_KEYS) {
      return NextResponse.json({ error: `At most ${MAX_IMAGE_KEYS} images per request.` }, { status: 400 })
    }

    return NextResponse.json({ images: await resolveReportImages(orgId, brandId, keys) })
  } catch (err) {
    console.error('[POST /api/organizations/[id]/reports/post-images]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
