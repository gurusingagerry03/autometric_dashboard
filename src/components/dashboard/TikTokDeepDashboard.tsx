'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, Callout, Badge } from './ui'
import { DivergingBars, ScatterPlot, HBars, SERIES } from './charts'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import ExactValue from '@/components/ui/ExactValue'
import { fmtNum, fmtInt, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import { TabSkeleton, useAnyBuilding } from './dataReadiness'
import type { TiktokPayload } from '@/lib/dashboard/tiktok'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

function FieldTag({ children }: { children: React.ReactNode }) {
  return <span style={PJ} className="text-[11px] font-semibold text-[#6b7280] bg-[#f3f4f6] px-2.5 py-1 rounded-full">{children}</span>
}

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)
const ceilTo = (n: number, step: number) => Math.max(step, Math.ceil(n / step) * step)

export default function TikTokDeepDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    // Every query on this tab is TikTok-scoped, so the platform switcher would be
    // a control that changes nothing — locked to TikTok, it reads as a statement
    // of scope instead, and only brands with a TikTok account are offered.
    <DashboardChrome title={t('TikTok Deep')} subtitle={t('Follower growth, churn & retention on TikTok')} lockPlatform="tiktok">
      {(state) => <TikTokBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function TikTokBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<TiktokPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Ada area data yang tabelnya masih dibangun pipeline. */
  const building = useAnyBuilding()

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/tiktok?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: TiktokPayload) => { if (!cancelled) setData(d) })
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
        <p className="text-[13px] text-[#6b7280]">{t('No TikTok data for this filter yet.')}</p>
      </div>
    )
  }

  const { gained, lost, net } = data.churnTotals
  const xMax = ceilTo(Math.max(10, ...data.durationCompletion.map(p => p.x)), 10)
  const xTicks = Array.from({ length: xMax / 10 + 1 }, (_, i) => i * 10)
  const yTicks = [20, 40, 60, 80, 100]

  return (
    <>
      <SectionHeader icon="music_note" first>{t('Performance')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard area="tiktok_churn_daily" key={k.key} kpi={k} color={SERIES} />)}
      </div>

      {/* Follower churn */}
      <SectionHeader icon="sync_alt">{t('Follower Churn Analysis')}</SectionHeader>
      <Card area="tiktok_churn_daily" skeleton="chart" className="mb-3">
        <CardHead title={t('Follower Churn Analysis')} metricKey="tiktok_churn_daily.net_growth" sub={t('Only TikTok reports followers gained and lost day by day')}
          action={<FieldTag>{t('Followers gained · Followers lost · Net growth')}</FieldTag>} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 px-4 pt-1">
          {[
            { label: t('New Followers'), value: `+${fmtNum(gained)}`, exact: `+${fmtInt(gained)}`, bg: '#edf6ef', border: '#d7ebdb', color: '#3d8a5f' },
            { label: t('Followers Lost'), value: `−${fmtNum(lost)}`, exact: `−${fmtInt(lost)}`, bg: '#fcefec', border: '#f3d6d0', color: '#c2553f' },
            { label: t('Net Growth'), value: `${net >= 0 ? '+' : '−'}${fmtNum(Math.abs(net))}`, exact: `${net >= 0 ? '+' : '−'}${fmtInt(Math.abs(net))}`, bg: '#f3f1fb', border: '#e7e3f7', color: '#6c4cd6' },
          ].map(t => (
            <div key={t.label} className="rounded-xl border px-4 py-4 text-center" style={{ background: t.bg, borderColor: t.border }}>
              <ExactValue display={t.value} exact={t.exact} style={{ ...PJ, color: t.color }}
                className="block text-[26px] font-bold leading-none tabular-nums" />
              <div className="text-[12px] font-medium text-[#6b7280] mt-1.5">{t.label}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 pt-4 pb-1">
          <Badge text={t('New Followers')} color="#7cc499" />
          <Badge text={t('Lost Followers')} color="#e89aa3" />
        </div>
        <div className="px-4 pb-4 pt-1">
          {data.churnWeeks.length
            ? <DivergingBars data={data.churnWeeks} height={240} />
            : <div className="h-[240px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No churn data.')}</div>}
        </div>
        <div className="mx-4 mb-4">
          <Callout tone="danger" title={t('Churn Watch')}>{data.churnInsight}</Callout>
        </div>
      </Card>

      {/* Duration vs completion + watch time */}
      <SectionHeader icon="insights">{t('Retention Drivers')}</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card area="post_metric" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Duration vs. Completion Rate')} metricKey="post_metric.completion_rate" action={<FieldTag>{t('Video length · Completion rate')}</FieldTag>} />
          <div className="px-4 pb-4 pt-3 flex-1">
            {data.durationCompletion.length
              ? <ScatterPlot points={data.durationCompletion} xMax={xMax} yMax={100}
                  xTicks={xTicks} yTicks={yTicks}
                  xLabel={t('Video Duration (seconds)')} color={SERIES} height={260}
                  xName={t('Duration (s)')} yName={t('Completion')} />
              : <div className="h-[260px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No duration / completion data.')}</div>}
          </div>
        </Card>

        <Card area="pillar_performance_daily" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Avg Watch Time by Content Pillar')} metricKey="pillar_performance_daily.watch_time_sum" action={<FieldTag>{t('Avg watch time · Content pillar')}</FieldTag>} />
          <div className="px-4 pb-4 pt-3">
            {data.watchByPillar.length
              ? <HBars items={data.watchByPillar.map(w => ({
                  label: w.label, value: w.value, display: `${w.value}s`,
                }))} />
              : <div className="py-10 text-center text-[12px] text-[#9ca3af]">{t('No pillar data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="success" title={t('Watch-Time Driver')}>{data.watchInsight}</Callout>
          </div>
        </Card>
      </div>
    </>
  )
}
