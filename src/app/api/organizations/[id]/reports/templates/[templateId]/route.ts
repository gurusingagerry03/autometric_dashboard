import { NextRequest, NextResponse } from 'next/server'
import { requireOrgMemberById } from '@/lib/reports/access'
import { deleteReportTemplate, updateReportTemplate } from '@/lib/reports/queries'
import type { ReportTemplateConfig } from '@/lib/reports/data/slideModel'

export const runtime = 'nodejs'

interface UpdateTemplateBody {
  name: string
  sourceBrandName: string | null
  config: ReportTemplateConfig
}

// PUT — overwrite an existing template so a report picked up later can be saved
// back onto the same template instead of spawning a new one.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: orgId, templateId } = await params
  const access = await requireOrgMemberById(orgId)
  if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

  let body: UpdateTemplateBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Template name is required.' }, { status: 400 })
  if (!body.config || !Array.isArray(body.config.slides)) {
    return NextResponse.json({ error: 'Invalid template config.' }, { status: 400 })
  }

  try {
    const updated = await updateReportTemplate(access.orgId, templateId, {
      name,
      sourceBrandName: body.sourceBrandName ?? null,
      config: body.config,
    })
    if (!updated) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reports/templates] DB update failed:', e)
    return NextResponse.json({ error: 'Could not update template.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> },
) {
  const { id: orgId, templateId } = await params
  const access = await requireOrgMemberById(orgId)
  if (!access) return NextResponse.json({ error: 'Not authorized for this organization.' }, { status: 401 })

  const deleted = await deleteReportTemplate(access.orgId, templateId)
  if (!deleted) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
