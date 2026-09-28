import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listTiktokBusinessAccounts, refreshTiktokBusinessAccounts } from '@/lib/admin/tiktok-refresh'

export const runtime = 'nodejs'

const MAX_PER_REQUEST = 100

async function requireAdmin() {
  const session = await auth()
  return session?.user?.role === 'ADMIN' ? session : null
}

// GET /api/admin/tiktok-refresh — semua akun TikTok Business beserta status tokennya.
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ data: await listTiktokBusinessAccounts() })
  } catch (err) {
    console.error('[GET /api/admin/tiktok-refresh]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// POST /api/admin/tiktok-refresh { socialAccountIds: string[] } — refresh token akun terpilih.
export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const raw  = body?.socialAccountIds
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(v => typeof v === 'string')) {
    return NextResponse.json({ error: 'Pilih minimal satu akun.' }, { status: 400 })
  }
  const ids = [...new Set(raw as string[])]
  if (ids.length > MAX_PER_REQUEST) {
    return NextResponse.json({ error: `Maksimal ${MAX_PER_REQUEST} akun sekali jalan.` }, { status: 400 })
  }

  try {
    console.log(`[admin/tiktok-refresh] ${session.user?.email} refresh ${ids.length} akun`)
    const results = await refreshTiktokBusinessAccounts(ids)
    return NextResponse.json({
      results,
      success: results.filter(r => r.ok).length,
      failed:  results.filter(r => !r.ok).length,
    })
  } catch (err) {
    console.error('[POST /api/admin/tiktok-refresh]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
