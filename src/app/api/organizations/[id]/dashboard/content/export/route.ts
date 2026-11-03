import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { parseCustomRange } from '@/lib/dashboard/range'
import { exportContentPosts, type PlatformParam } from '@/lib/dashboard/content'

type Params = { params: Promise<{ id: string }> }

const PLATFORMS: PlatformParam[] = ['all', 'instagram', 'facebook', 'tiktok']
const PERIOD_DAYS: Record<string, number> = { '7 days': 7, '30 days': 30, '90 days': 90, Custom: 30 }

// RFC 4180: quote every field that carries a comma, quote or line break. A cell
// starting with = + - @ is prefixed with ' so Excel never evaluates a caption as
// a formula (CSV injection) — captions are user-generated text.
function csvCell(v: string | number): string {
  if (typeof v === 'number') return String(v)
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/organizations/[id]/dashboard/content/export?platform=&period=&brand=&start=&end=
 *
 * CSV semua post di periode & filter yang sama dengan tabel Top Posts di Content
 * Overview (Post-UAT brief "RAW Data Page", external usage).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const access = await requireOrgMemberById(orgId)
    if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const platformRaw = (sp.get('platform') ?? 'all').toLowerCase()
    const platform: PlatformParam = PLATFORMS.includes(platformRaw as PlatformParam)
      ? (platformRaw as PlatformParam) : 'all'
    const days = PERIOD_DAYS[sp.get('period') ?? '30 days'] ?? 30
    const brandId = sp.get('brand') || null
    const custom = parseCustomRange(sp)

    const data = await exportContentPosts(orgId, platform, days, brandId, custom)
    const header = data?.header ?? ['Post Date']
    const lines = [header, ...(data?.rows ?? [])].map(r => r.map(csvCell).join(','))
    // BOM supaya Excel membuka UTF-8 (caption ber-emoji / beraksen) dengan benar.
    const body = '﻿' + lines.join('\r\n') + '\r\n'
    const range = data ? `${data.window.start}_${data.window.end}` : 'empty'
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="content-posts_${platform}_${range}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/organizations/[id]/dashboard/content/export]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
