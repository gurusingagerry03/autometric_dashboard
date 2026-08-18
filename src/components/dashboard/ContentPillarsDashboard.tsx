'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead, SectionHeader } from './ui'
import { HBars } from './charts'
import DashboardChrome from './DashboardChrome'
import { PILLAR_COLORS } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import type { PillarsPayload } from '@/lib/dashboard/pillars'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

export default function ContentPillarsDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Content Pillars')} subtitle={t('Define & compare your content pillars')}>
      {(state) => <PillarsBody orgId={orgId} brandId={state.brand.id} />}
    </DashboardChrome>
  )
}

function PillarsBody({ orgId, brandId }: { orgId: string; brandId: string }) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<PillarsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(PILLAR_COLORS[0])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [comparisonRun, setComparisonRun] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null); setComparisonRun(false)
    fetch(`/api/organizations/${orgId}/dashboard/pillars?brand=${encodeURIComponent(brandId)}&lang=${lang}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: PillarsPayload) => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, lang])

  const pillars = data?.pillars ?? []
  const comparison = data?.comparison ?? []

  const addTag = () => {
    const raw = tagInput.trim()
    if (!raw) return
    const tag = raw.startsWith('#') ? raw : `#${raw}`
    if (!draftTags.includes(tag)) setDraftTags([...draftTags, tag])
    setTagInput('')
  }

  async function addPillar() {
    if (!draftName.trim() || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/organizations/${orgId}/dashboard/pillars`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, name: draftName.trim(), color: draftColor, hashtags: draftTags }),
      })
      if (r.ok) {
        setData(await r.json())
        setDraftName(''); setDraftTags([]); setComparisonRun(false)
        setDraftColor(PILLAR_COLORS[(pillars.length + 1) % PILLAR_COLORS.length])
      }
    } finally { setBusy(false) }
  }

  async function removePillar(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/organizations/${orgId}/dashboard/pillars?brand=${encodeURIComponent(brandId)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) { setData(await r.json()); setComparisonRun(false) }
    } finally { setBusy(false) }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#d1d5db] mb-2">error</span>
        <p className="text-[13px] text-[#6b7280]">{t('Failed to load data: {error}', { error })}</p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[34px] text-[#cbd1d8] animate-spin mb-2">progress_activity</span>
        <p className="text-[13px] text-[#9ca3af]">{t('Loading data…')}</p>
      </div>
    )
  }

  return (
    <>
      <SectionHeader icon="dashboard_customize" first>{t('Content Pillars')}</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <div className="px-5 pt-4 pb-1">
            <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">{t('Define Your Content Pillars')}</h3>
            <p className="text-[12.5px] text-[#9ca3af] mt-1 leading-relaxed">
              {t('Name each pillar, assign a color, and add relevant hashtags. Posts matching those hashtags are grouped under the pillar, and their performance is summed up in the comparison below.')}
            </p>
          </div>

          <div className="m-5 mt-3 rounded-xl border border-dashed border-[#d1d5db] p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder={t('Pillar name e.g. Drama')} style={PJ}
                className="flex-1 text-[13px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-3 py-2.5 outline-none focus:border-[#6c4cd6]" />
              <input type="color" value={draftColor} onChange={e => setDraftColor(e.target.value)}
                className="w-11 h-11 rounded-lg border border-[#e5e7eb] cursor-pointer p-1 bg-white" title={t('Pillar colour')} />
            </div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder={t('Add hashtag — press Enter')} style={PJ}
                className="flex-1 text-[13px] text-[#374151] bg-white border border-[#6c4cd6]/40 rounded-lg px-3 py-2.5 outline-none focus:border-[#6c4cd6]" />
              <button onClick={addTag} style={PJ} className="text-[13px] font-semibold text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-4 py-2.5 hover:border-[#d1d5db]">+ {t('Add')}</button>
            </div>
            {draftTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {draftTags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6b7280] bg-[#f3f4f6] rounded-full pl-2.5 pr-1.5 py-1">
                    {tag}
                    <button onClick={() => setDraftTags(draftTags.filter(x => x !== tag))} className="material-symbols-outlined text-[14px] text-[#9ca3af] hover:text-[#c2553f]">close</button>
                  </span>
                ))}
              </div>
            )}
            <button onClick={addPillar} disabled={busy || !draftName.trim()} style={PJ}
              className={`inline-flex items-center gap-1.5 text-[13px] font-bold text-white rounded-lg px-4 py-2.5 ${busy || !draftName.trim() ? 'bg-[#c4b7ee] cursor-not-allowed' : 'bg-[#6c4cd6] hover:bg-[#5a3fc0]'}`}>
              <span className="material-symbols-outlined text-[16px]">add</span>{t('Add Pillar')}
            </button>
          </div>

          <div className="px-5 pb-5">
            {pillars.length === 0
              ? <p className="text-center text-[12.5px] text-[#9ca3af] py-2">{t('No pillars defined yet')}</p>
              : (
                <div className="flex flex-col gap-2">
                  {pillars.map(p => (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-[#eef0f2] px-3 py-2.5">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                      <span style={PJ} className="text-[13px] font-bold text-[#374151]">{p.name}</span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {p.hashtags.map(tag => <span key={tag} className="text-[11px] text-[#9ca3af]">{tag}</span>)}
                      </div>
                      <button onClick={() => removePillar(p.id)} disabled={busy} className="material-symbols-outlined text-[16px] text-[#cbd1d8] hover:text-[#c2553f] disabled:opacity-40">delete</button>
                    </div>
                  ))}
                  <button onClick={() => setComparisonRun(true)} disabled={pillars.length < 2} style={PJ}
                    className={`self-start mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold rounded-lg px-4 py-2.5 ${
                      pillars.length < 2 ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#1f2937] text-white hover:bg-[#374151]'
                    }`}>
                    <span className="material-symbols-outlined text-[16px]">bar_chart</span>{t('Run Comparison')}
                  </button>
                </div>
              )}
          </div>
        </Card>

        <Card className="flex flex-col">
          {comparisonRun && pillars.length >= 2 ? (
            <>
              <CardHead title={t('Pillar Performance Comparison')} metricKey="pillar_performance_daily.engagement_sum" sub={t('Engagement rate averaged across each pillar')} />
              <div className="px-4 pb-5 pt-3 flex-1 flex flex-col justify-center">
                {comparison.some(c => c.posts > 0) ? (
                  <HBars items={comparison.map(c => ({
                    label: `${c.name} · ${t('{count} posts', { count: c.posts })}`, value: c.er, display: `${c.er.toFixed(1)}%`, color: c.color,
                  }))} />
                ) : (
                  <p className="text-center text-[12.5px] text-[#9ca3af] py-10">{t("No performance data for this brand's pillars yet.")}</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
              <span className="material-symbols-outlined text-[40px] text-[#cbd1d8] mb-3">account_balance</span>
              <p style={PJ} className="text-[14px] font-bold text-[#9ca3af]">{t('No comparison yet')}</p>
              <p className="text-[12.5px] text-[#9ca3af] mt-1 max-w-[320px]">{t('Add at least 2 pillars and click “Run Comparison” to see performance data')}</p>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
