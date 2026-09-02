'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, TableHeadRow } from './ui'
import { MultiLineChart, Donut, SERIES } from './charts'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import MetricInfo from '@/components/ui/MetricInfo'
import ExactValue, { NumCell } from '@/components/ui/ExactValue'
import { TREND_METRICS, HEATMAP_DAYS, HEATMAP_TIME_LABELS, PLATFORM_META, fmtNum, fmtInt, type TrendMetric, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import { TabSkeleton, useAnyBuilding } from './dataReadiness'
import type { OverviewPayload } from '@/lib/dashboard/overview'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

const MATRIX_COLS = 'grid-cols-[1.6fr_0.9fr_1fr_1fr_1.1fr_0.8fr_0.8fr_0.7fr]'
const MATRIX_HEADS = [
  { label: 'Brand' },
  { label: 'Platform' },
  { label: 'Followers',  metricKey: 'brand_metric_daily.follower_count_eod' },
  { label: 'Reach',      metricKey: 'brand_metric_daily.reach_sum' },
  { label: 'Engagement', metricKey: 'brand_metric_daily.engagement_sum' },
  { label: 'ER',         metricKey: 'derived.blended_er' },
  { label: 'Posts',      metricKey: 'brand_metric_daily.post_count' },
  { label: 'Trend',      metricKey: 'derived.engagement_trend' },
]
const TREND_ICON = { up: 'arrow_upward', flat: 'remove', down: 'arrow_downward' } as const
const TREND_COLOR = { up: '#3d8a5f', flat: '#9ca3af', down: '#c2553f' } as const

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)

export default function OverviewDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Overview')} subtitle={t('Portfolio performance at a glance')}>
      {(state) => <OverviewBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function OverviewBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [metric, setMetric] = useState<TrendMetric>('Engagement')
  const [data, setData] = useState<OverviewPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Ada area data yang tabelnya masih dibangun pipeline. */
  const building = useAnyBuilding()

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/overview?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: OverviewPayload) => { if (!cancelled) setData(d) })
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
        <p className="text-[13px] text-[#6b7280]">{t('No data for this filter yet.')}</p>
      </div>
    )
  }

  const series = data.engagementOverTime[metric] ?? []
  const totalReach = data.platformReachShare.reduce((s, p) => s + p.value, 0)

  return (
    <>
      {/* Performance KPIs */}
      <SectionHeader icon="monitoring" first>{t('Performance')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard area="brand_metric_daily" key={k.key} kpi={k} color={SERIES} />)}
      </div>

      {/* Engagement over time + platform share */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Card area="brand_metric_daily" skeleton="chart" span="col-span-12 lg:col-span-8">
          <div className="flex items-start justify-between px-4 pt-3.5 pb-2 flex-wrap gap-2">
            <div>
              <h3 style={PJ} className="flex items-center gap-1 text-[12.5px] font-bold text-[#111827] tracking-[-0.01em]">
                {t('Engagement Over Time')}
                <MetricInfo metricKey="derived.engagement_over_time" size={13} />
              </h3>
              <p className="text-[11px] text-[#9ca3af] mt-0.5">{t('{metric} by brand', { metric: t(metric) })}</p>
            </div>
            <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5">
              {TREND_METRICS.map(m => (
                <button key={m} onClick={() => setMetric(m)} style={PJ}
                  className={`h-7 px-3 rounded-md text-[11.5px] font-semibold transition-colors ${
                    metric === m ? 'bg-white text-[#2C3079] shadow-sm' : 'text-[#6b7280] hover:text-[#374151]'
                  }`}>{t(m)}</button>
              ))}
            </div>
          </div>
          <div className="px-4 pb-3 pt-1">
            {series.length
              ? <MultiLineChart series={series} labels={data.trendLabels} height={210} />
              : <div className="h-[210px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No {metric} data.', { metric: t(metric).toLowerCase() })}</div>}
          </div>
          <div className="flex items-center gap-4 px-4 pb-4 flex-wrap">
            {series.map(s => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b7280]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.name}
              </span>
            ))}
          </div>
        </Card>

        <Card area="brand_metric_daily" skeleton="chart" span="col-span-12 lg:col-span-4" className="flex flex-col">
          <CardHead title={t('Platform Share')} metricKey="derived.platform_share" sub={t('by reach')} />
          <div className="px-4 pb-5 pt-3 flex-1 flex items-center">
            {data.platformReachShare.length
              ? <Donut size={152} valueLabel={t('Reach')}
                  segments={data.platformReachShare.map(p => ({
                    label: PLATFORM_META[p.platform].label, value: p.value, color: PLATFORM_META[p.platform].color,
                  }))}
                  centerLabel={fmtNum(totalReach)} centerExact={fmtInt(totalReach)} centerSub={t('total reach')} />
              : <div className="w-full text-center text-[12px] text-[#9ca3af] py-8">{t('No reach data.')}</div>}
          </div>
        </Card>
      </div>

      {/* Brand performance matrix */}
      <SectionHeader icon="flag">{t('Brand Performance Matrix')}</SectionHeader>
      <Card area="brand_metric_daily" skeleton="table" className="overflow-hidden">
        <CardHead title={t('Cross-brand, cross-platform benchmarking')} metricKey="derived.brand_benchmarking" sub={t('Engagement benchmarking across the portfolio')} />
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <TableHeadRow className={`grid ${MATRIX_COLS}`} cols={MATRIX_HEADS} />
            {data.brandMatrix.map((r, i) => {
              const meta = PLATFORM_META[r.platform]
              return (
                <div key={`${r.brand}-${r.platform}`}
                  className={`grid ${MATRIX_COLS} gap-2 px-4 py-3 items-center text-[13px] hover:bg-[#fafbfb] ${
                    i < data.brandMatrix.length - 1 ? 'border-b border-[#f1f3f4]' : ''
                  }`}>
                  <span className="font-semibold text-[#374151] truncate">{r.brand}</span>
                  <span className="inline-flex items-center gap-1.5 text-[#6b7280]">
                    <img src={meta.logo} alt={meta.label} className="w-[18px] h-[18px] object-contain" />
                    <span className="font-medium">{meta.short}</span>
                  </span>
                  <NumCell value={r.followers} className="font-semibold text-[#111827] tabular-nums" />
                  <NumCell value={r.reach} className="text-[#374151] tabular-nums" />
                  <NumCell value={r.engagement} className="text-[#374151] tabular-nums" />
                  <span className="text-[#374151] tabular-nums">{r.er}%</span>
                  <span className="text-[#374151] tabular-nums">{r.posts}</span>
                  <span className="material-symbols-outlined text-[17px]" style={{ color: TREND_COLOR[r.trend] }}>{TREND_ICON[r.trend]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Content attribute breakdown + best posting times */}
      <SectionHeader icon="insights">{t('Content & Timing')}</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Content attribute breakdown */}
        <Card area="content_attribute_daily" skeleton="chart" className="flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-1 gap-2">
            <span style={PJ} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#9ca3af]">
              {t('Content Attribute Breakdown')}
              <MetricInfo metricKey="derived.content_attribute_breakdown" size={12} />
            </span>
            <span style={PJ} className="text-[11px] font-semibold text-[#3d8a5f] bg-[#eaf5ef] px-2.5 py-1 rounded-full">{t('By content tag')}</span>
          </div>
          <p className="px-5 pt-1.5 pb-3 text-[12.5px] text-[#6b7280]">{t('Engagement rate by content tag — how each label performs vs. overall average')}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 px-5">
            {data.contentAttributes.map(a => (
              <div key={a.label} className="bg-[#fafbfb] border border-[#eef0f2] rounded-xl px-3 py-4 flex flex-col items-center text-center gap-0.5">
                <ExactValue value={a.count} style={PJ} className="text-[26px] font-bold leading-none tabular-nums text-[#111827]" />
                <span className="text-[12px] font-medium text-[#6b7280] mt-1">{a.label}</span>
                <span className="text-[12px] font-semibold mt-0.5 text-[#6b7280]">ER: {a.er}%</span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2.5 mx-5 mb-5 mt-auto px-4 py-3.5 rounded-xl bg-[#f3f1fb] border border-[#e7e3f7]">
            <span className="text-[15px] leading-none mt-0.5">💡</span>
            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#7a6fb5] mb-1">{t('Key Finding')}</p>
              <p className="text-[13px] leading-relaxed text-[#4b4563]">{data.contentAttrFinding}</p>
            </div>
          </div>
        </Card>

        {/* Best posting times */}
        <Card area="posting_time_heatmap" skeleton="chart" className="flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 gap-2">
            <span style={PJ} className="text-[11px] font-bold uppercase tracking-widest text-[#9ca3af]">{t('Best Posting Times')}</span>
            <span style={PJ} className="text-[10px] font-bold uppercase tracking-wide text-[#b8915a] bg-[#fbf4e8] px-2.5 py-1 rounded-full">WIB</span>
          </div>
          <div className="px-5">
            {HEATMAP_DAYS.map((day, ri) => (
              <div key={day} className="flex items-center gap-2 mb-2 last:mb-0">
                <span className="w-9 flex-shrink-0 text-[11px] font-semibold text-[#6b7280] text-right">{t(day)}</span>
                <div className="grid grid-cols-6 gap-1.5 flex-1">
                  {(data.postingHeatmap[ri] ?? new Array(6).fill(0)).map((v, ci) => (
                    <div key={ci} className="flex justify-center">
                      <span className="w-full h-8 rounded-md" style={{ background: SERIES, opacity: 0.14 + v * 0.86 }}
                        title={`${day} ${HEATMAP_TIME_LABELS[ci]} · ${Math.round(v * 100)}%`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1">
              <span className="w-9 flex-shrink-0" />
              <div className="flex-1 border-t border-[#e5e7eb]" />
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-9 flex-shrink-0" />
              <div className="grid grid-cols-6 gap-1.5 flex-1">
                {HEATMAP_TIME_LABELS.map(slot => (
                  <span key={slot} className="text-[9.5px] text-[#9ca3af] text-center">{slot}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 mx-5 mb-5 mt-auto px-4 py-3.5 rounded-xl bg-[#edf6ef] border border-[#d7ebdb]">
            <span className="material-symbols-outlined text-[18px] text-[#3d8a5f] mt-0.5">check_circle</span>
            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#3d8a5f] mb-1">{t('Top Windows')}</p>
              <p className="text-[13px] leading-relaxed text-[#4b5563]">{data.postingWindowInsight}</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
