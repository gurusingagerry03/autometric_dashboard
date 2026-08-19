import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import pool from '@/lib/db'
import { getOrgUsage, resetOrgLimits, saveOrgLimits } from '@/lib/organizations/limits'
import { ORG_LIMIT_MAX } from '@/lib/quotas'

type Params = { params: Promise<{ orgId: string }> }

async function requireAdmin() {
  const session = await auth()
  return session?.user?.role === 'ADMIN' ? session : null
}

async function orgExists(orgId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [orgId],
  )
  return rows.length > 0
}

function parseLimit(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 0 || n > ORG_LIMIT_MAX) return null
  return n
}

// PUT /api/admin/org-limits/[orgId] — set batas akun & competitor organization ini.
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await requireAdmin()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { orgId } = await params
    if (!await orgExists(orgId)) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 })
    }

    const body                      = await req.json()
    const maxBrands                 = parseLimit(body?.maxBrands)
    const maxCompetitorsPerPlatform = parseLimit(body?.maxCompetitorsPerPlatform)

    if (maxBrands === null || maxCompetitorsPerPlatform === null) {
      return NextResponse.json(
        { error: `Both limits must be whole numbers between 0 and ${ORG_LIMIT_MAX}.` },
        { status: 400 },
      )
    }

    await saveOrgLimits(orgId, maxBrands, maxCompetitorsPerPlatform, session.user?.id ?? null)

    // Batas boleh diturunkan di bawah pemakaian sekarang — brand dan competitor
    // yang sudah ada tidak dihapus (menghapusnya berarti membuang data yang sudah
    // ditarik). Efeknya: org itu tidak bisa menambah lagi sampai turun sendiri.
    // Pemakaiannya dikembalikan supaya layar admin bisa menyebutkan itu, bukan
    // menolak diam-diam.
    const usage = await getOrgUsage(orgId)
    return NextResponse.json({
      data: { maxBrands, maxCompetitorsPerPlatform, isCustom: true },
      usage,
    })
  } catch (err) {
    console.error('[PUT /api/admin/org-limits/[orgId]]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// DELETE /api/admin/org-limits/[orgId] — kembalikan organization ke batas default.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { orgId } = await params
    await resetOrgLimits(orgId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/admin/org-limits/[orgId]]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
