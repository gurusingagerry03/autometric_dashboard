'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, Callout, Badge } from './ui'
import { HBars, ComboBarLine, MultiLineChart, SERIES } from './charts'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import { fmtNum, fmtInt, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import { TabSkeleton, useAnyBuilding } from './dataReadiness'
import type { StoriesPayload } from '@/lib/dashboard/stories'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

function FieldTag({ children }: { children: React.ReactNode }) {
  return <span style={PJ} className="text-[11px] font-semibold text-[#9a6fb5] bg-[#f3eefb] px-2.5 py-1 rounded-full">{children}</span>
}

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)
// round up to a "nice" axis ceiling with ~15% headroom
function niceMax(n: number) {
  if (n <= 0) return 1
  const padded = n * 1.15
  const p = Math.pow(10, Math.floor(Math.log10(padded)))
  return Math.ceil(padded / p) * p
}

export default function StoriesDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Instagram Stories')} subtitle={t('Instagram story performance')} lockPlatform="instagram">
      {(state) => <StoriesBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function StoriesBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<StoriesPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Ada area data yang tabelnya masih dibangun pipeline. */
  const building = useAnyBuilding()

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/stories?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: StoriesPayload) => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, platform, period, start, end, lang])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#d1d5db] mb-2">error</span>
        <p className="text-[13px] text-[#6b7280]">{t('Failed to load data: {error}', { error })}</p>
      </div>
    )
  }
  /**
   * Brand yang baru dihubungkan: payload kosong BUKAN berarti datanya tidak ada, tapi
   * pipeline belum selesai membangunnya. Pesan "No data for this filter yet." di bawah
   * akan menyesatkan di titik itu, jadi selama masih ada area yang dibangun tab
   * menampilkan bentuknya dulu — dan card asli menggantikannya begitu datanya masuk.
   */
  if (building && (!data || data.empty || data.kpis.length === 0)) return <TabSkeleton />

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[34px] text-[#cbd1d8] animate-spin mb-2">progress_activity</span>
        <p className="text-[13px] text-[#9ca3af]">{t('Loading data…')}</p>
      </div>
    )
  }
  if (data.empty || data.kpis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#d1d5db] mb-2">database</span>
        <p className="text-[13px] text-[#6b7280]">{t('No story data for this filter yet.')}</p>
      </div>
    )
  }

  const reachMax = niceMax(Math.max(0, ...data.typePerf.map(s => s.reach)))
  const repliesMax = niceMax(Math.max(0, ...data.typePerf.map(s => s.replies)))

  return (
    <>
      <SectionHeader icon="amp_stories" first>{t('Performance')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard area="story_metric_daily" key={k.key} kpi={k} color={SERIES} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card area="story_metric_daily" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Story Retention Funnel')} metricKey="story_metric_daily.taps_fwd_sum" sub={t('How audiences navigate through your story sequences')}
            action={<FieldTag>{t('Taps forward · Taps back · Exits')}</FieldTag>} />
          <div className="px-4 pb-4 pt-3">
            {data.funnel.some(f => f.value > 0)
              ? <HBars items={data.funnel.map(f => ({
                  label: t(f.label), value: f.value, display: fmtNum(f.value), exact: fmtInt(f.value),
                }))} />
              : <div className="py-10 text-center text-[12px] text-[#9ca3af]">{t('No story funnel data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="warning" title={t('Forward Tap Rate High')}>{data.funnelInsight}</Callout>
          </div>
        </Card>

        <Card area="story_type_daily" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Story Type Performance')} metricKey="story_type_daily.story_type" action={<FieldTag>{t('By story type')}</FieldTag>} />
          <div className="flex items-center justify-center gap-6 pb-1">
            <Badge text={t('Avg Reach')} color="#e7a6bd" />
            <Badge text={t('Avg Replies')} color="#6c4cd6" />
          </div>
          <div className="px-2 pb-3 pt-1">
            {data.typePerf.length
              ? <ComboBarLine
                  labels={data.typePerf.map(s => t(s.type))}
                  bars={data.typePerf.map(s => s.reach)}
                  line={data.typePerf.map(s => s.replies)}
                  leftMax={reachMax} rightMax={repliesMax} height={250}
                  fmtLeft={n => fmtNum(n)}
                  barName={t('Avg Reach')} lineName={t('Avg Replies')} />
              : <div className="h-[250px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No story type data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="success" title={t('Interactive Stories Win')}>{data.typeInsight}</Callout>
          </div>
        </Card>
      </div>

      <SectionHeader icon="show_chart">{t('Trend')}</SectionHeader>
      <Card area="story_metric_daily" skeleton="chart">
        <CardHead title={t('Story Performance Over Time')} metricKey="story_metric_daily.story_count" sub={t('Views, exits & swipe-ups by week')} />
        <div className="px-4 pb-3 pt-3">
          {data.overTime.some(s => s.data.length)
            ? <MultiLineChart series={data.overTime} labels={data.overTimeLabels} height={300} dots yAxis fmtY={fmtNum} />
            : <div className="h-[300px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No story trend data.')}</div>}
        </div>
        <div className="flex items-center gap-4 px-4 pb-4 flex-wrap">
          {data.overTime.map(s => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b7280]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{t(s.name)}
            </span>
          ))}
        </div>
      </Card>
    </>
  )
}
