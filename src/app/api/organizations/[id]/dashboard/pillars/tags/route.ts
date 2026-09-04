import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { getTaggablePosts, savePostAttributes } from '@/lib/dashboard/pillarTags'
import type { PostAttributePatch } from '@/lib/dashboard/pillarTags'
import type { TagFilter } from '@/lib/dashboard/pillarTags'

const FILTERS: TagFilter[] = ['all', 'untagged', 'tagged']

type Params = { params: Promise<{ id: string }> }

// GET /api/organizations/[id]/dashboard/pillars/tags?brand=&limit=&offset=&q=&filter=
//   → satu halaman post + pilar yang menempel, PLUS daftar pilar brand.
//
// Pencarian dan penyaring sengaja diproses di server: kalau dilakukan di klien
// setelah pagination, orang akan mencari di dalam satu halaman saja dan mengira
// hasilnya nihil.
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const brandId = sp.get('brand') || ''
    if (!brandId) return NextResponse.json({ error: 'brand is required.' }, { status: 400 })

    const limit  = Number(sp.get('limit')  ?? 25)
    const offset = Number(sp.get('offset') ?? 0)
    const rawFilter = sp.get('filter') ?? 'all'
    const filter = (FILTERS as string[]).includes(rawFilter) ? (rawFilter as TagFilter) : 'all'

    return NextResponse.json(await getTaggablePosts(orgId, brandId, {
      limit:  Number.isFinite(limit)  ? limit  : 25,
      offset: Number.isFinite(offset) ? offset : 0,
      q:      sp.get('q') ?? '',
      filter,
      // Penyaring topbar (platform + rentang tanggal) diproses di SQL bersama
      // pencarian, supaya jumlah halaman dan progres ikut menyempit.
      platform: sp.get('platform') ?? 'all',
      start: sp.get('start'),
      end: sp.get('end'),
    }))
  } catch (err) {
    console.error('[GET /api/organizations/[id]/dashboard/pillars/tags]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// PATCH { brandId, updates: [{ postId, platform, pillars }] }
//   → menimpa daftar pilar tiap post. Dikirim sebagai batch karena aksi massal di
//     UI menyentuh puluhan post sekaligus; satu request per post akan membanjiri.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const brandId = typeof body?.brandId === 'string' ? body.brandId : ''
    const raw: unknown[] = Array.isArray(body?.updates) ? body.updates : []
    if (!brandId || raw.length === 0) {
      return NextResponse.json({ error: 'brandId and updates are required.' }, { status: 400 })
    }
    if (raw.length > 500) {
      return NextResponse.json({ error: 'Too many updates in one request.' }, { status: 400 })
    }

    const strArr = (v: unknown) =>
      Array.isArray(v) ? (v as unknown[]).filter(x => typeof x === 'string') as string[] : undefined
    const tri = (v: unknown) => (v === true || v === false || v === null ? v as boolean | null : undefined)

    // Hanya field yang benar-benar dikirim yang diteruskan — savePostAttributes
    // membiarkan sisanya apa adanya, jadi mengubah satu atribut tidak menghapus
    // atribut lain yang sudah diisi.
    const updates = raw.map(u => u as Record<string, unknown>)
      .filter(u => typeof u.postId === 'string' && typeof u.platform === 'string')
      .map(u => {
        const p: PostAttributePatch = {}
        if ('pillar'   in u) p.pillar   = typeof u.pillar === 'string' ? u.pillar : null
        if ('tags'     in u) p.tags     = strArr(u.tags) ?? []
        if ('boosted'  in u) p.boosted  = tri(u.boosted)
        if ('campaign' in u) p.campaign = tri(u.campaign)
        if ('activity' in u) p.activity = tri(u.activity)
        return { postId: u.postId as string, platform: u.platform as string, patch: p }
      })

    // Berurutan, bukan paralel: semuanya menulis ke tabel yang sama dan jumlahnya
    // terbatas, jadi menahan giliran lebih murah daripada memperebutkan koneksi pool.
    let applied = 0
    for (const u of updates) {
      if (await savePostAttributes(orgId, brandId, u.platform, u.postId, u.patch)) applied++
    }

    return NextResponse.json({ applied, requested: updates.length })
  } catch (err) {
    console.error('[PATCH /api/organizations/[id]/dashboard/pillars/tags]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
