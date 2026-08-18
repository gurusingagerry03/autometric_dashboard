'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, Callout, Badge, PostLink, TableHeadRow } from './ui'
import { BarChart, HBars, SERIES } from './charts'
import MetricInfo from '@/components/ui/MetricInfo'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import { NumCell } from '@/components/ui/ExactValue'
import { PLATFORM_META, fmtNum, fmtInt, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import type { ContentOverviewPayload } from '@/lib/dashboard/content'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

const FORMAT_ICON: Record<string, string> = {
  Reel: 'movie', Video: 'smart_display', Carousel: 'collections', Image: 'image', Link: 'link', Story: 'amp_stories',
}
const FORMATS = ['All Formats', 'Reel', 'Video', 'Carousel', 'Image'] as const

const TABLE_COLS =
  'grid-cols-[36px_50px_minmax(220px,2.6fr)_92px_72px_72px_72px_84px_72px_60px_84px]'
const TABLE_HEADS = [
  { label: '#' },
  { label: '' },
  { label: 'Post' },
  { label: 'Format',   metricKey: 'post_metric.post_type' },
  { label: 'Reach',    metricKey: 'post_metric.reach' },
  { label: 'Views',    metricKey: 'post_metric.views' },
  { label: 'Likes',    metricKey: 'post_metric.likes' },
  { label: 'Comments', metricKey: 'post_metric.comments' },
  { label: 'Shares',   metricKey: 'post_metric.shares' },
  { label: 'ER',       metricKey: 'derived.post_er' },
  { label: 'Tag',      metricKey: 'post_metric.is_boosted' },
]

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)

export default function ContentDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Content Overview')} subtitle={t("What's working in your content")}>
      {(state) => <ContentBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function ContentBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('All Formats')
  const [data, setData] = useState<ContentOverviewPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/content?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ContentOverviewPayload) => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, platform, period, start, end, lang])

  const rows = useMemo(
    () => (!data ? [] : format === 'All Formats' ? data.topPosts : data.topPosts.filter(r => r.format === format)),
    [data, format],
  )

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
  if (data.empty || data.kpis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#d1d5db] mb-2">database</span>
        <p className="text-[13px] text-[#6b7280]">{t('No data for this filter yet.')}</p>
      </div>
    )
  }

  return (
    <>
      {/* Performance KPIs */}
      <SectionHeader icon="monitoring" first>{t('Performance')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard key={k.key} kpi={k} color={SERIES} />)}
      </div>

      {/* Post type performance + content volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card className="flex flex-col">
          <CardHead title={t('Post Type Performance')} metricKey="post_metric.post_type" sub={t('Instagram · avg reach by format')} />
          <div className="px-4 pb-4 pt-3">
            {data.postTypePerf.length
              ? <HBars items={data.postTypePerf.map(p => ({
                  label: p.label, value: p.value, display: fmtNum(p.value),
                  exact: fmtInt(p.value), exactLabel: t('Avg reach'),
                }))} />
              : <div className="py-10 text-center text-[12px] text-[#9ca3af]">{t('No Instagram format data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="success" title={t('Reels Dominate')}>{data.postTypeInsight}</Callout>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHead title={t('Content Volume by Week')} metricKey="derived.content_volume_weekly" sub={t('Posts published per week')}
            action={<Badge text={t('Posts')} color={SERIES} />} />
          <div className="px-4 pb-4 pt-3 flex-1 flex items-end">
            {data.contentVolume.length
              ? <BarChart height={200} bars={data.contentVolume.map(w => ({
                  label: w.label, value: w.value, display: String(w.value),
                }))} />
              : <div className="w-full py-10 text-center text-[12px] text-[#9ca3af]">{t('No volume data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="warning" title={t('Consistency Gap')}>{data.contentVolumeInsight}</Callout>
          </div>
        </Card>
      </div>

      {/* Top posts table */}
      <SectionHeader icon="emoji_events">{t('Top Posts — Performance Table')}</SectionHeader>
      <Card className="overflow-hidden">
        <div className="flex items-start justify-between px-4 pt-3.5 pb-2 flex-wrap gap-2">
          <div>
            <h3 style={PJ} className="flex items-center gap-1 text-[12.5px] font-bold text-[#111827] tracking-[-0.01em]">
              {t('Top Posts')}
              <MetricInfo metricKey="derived.top_posts" size={13} />
            </h3>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">{t('Ranked by engagement rate · all platforms combined')}</p>
          </div>
          <div className="flex items-center bg-[#f3f4f6] rounded-lg p-0.5">
            {FORMATS.map(f => (
              <button key={f} onClick={() => setFormat(f)} style={PJ}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors ${
                  format === f ? 'bg-white text-[#2C3079] shadow-sm' : 'text-[#6b7280] hover:text-[#374151]'
                }`}>{t(f)}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <TableHeadRow className={`grid ${TABLE_COLS}`} cols={TABLE_HEADS} />
            {rows.map((r, i) => {
              const meta = PLATFORM_META[r.platform]
              return (
                <div key={r.rank}
                  className={`group/row grid ${TABLE_COLS} gap-2 px-4 py-3 items-center text-[13px] hover:bg-[#fafbfb] ${
                    i < rows.length - 1 ? 'border-b border-[#f1f3f4]' : ''
                  }`}>
                  <span style={PJ} className="text-[12px] font-bold text-[#9ca3af] tabular-nums">{r.rank}</span>
                  <img src={meta.logo} alt={meta.label} title={meta.label} className="w-[18px] h-[18px] object-contain" />
                  <PostLink href={r.link} caption={r.caption} className="text-[#374151] font-medium" />
                  <span className="flex min-w-0 items-center gap-1 text-[12px] text-[#6b7280]" title={r.format}>
                    <span className="material-symbols-outlined shrink-0 text-[15px] text-[#9ca3af]">{FORMAT_ICON[r.format] ?? 'play_circle'}</span>
                    <span className="truncate">{t(r.format)}</span>
                  </span>
                  <NumCell value={r.reach} className="text-[#374151] tabular-nums" />
                  <NumCell value={r.views} className="text-[#374151] tabular-nums" />
                  <NumCell value={r.likes} className="font-semibold text-[#111827] tabular-nums" />
                  <NumCell value={r.comments} className="text-[#374151] tabular-nums" />
                  {r.shares == null
                    ? <span className="text-[#374151] tabular-nums">—</span>
                    : <NumCell value={r.shares} className="text-[#374151] tabular-nums" />}
                  <span className="font-semibold text-[#3d8a5f] tabular-nums">{r.er}%</span>
                  <span className={`inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    r.tag === 'Boosted' ? 'text-[#b8915a] bg-[#fbf4e8]' : 'text-[#6b7280] bg-[#f3f4f6]'
                  }`}>{t(r.tag)}</span>
                </div>
              )
            })}
            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9ca3af]">{t('No posts for this format.')}</div>
            )}
          </div>
        </div>
      </Card>

      {/* TikTok video analytics */}
      <SectionHeader icon="smart_display">{t('Video Analytics')}</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="flex flex-col">
          <CardHead title={t('TikTok Completion Rate Distribution')} metricKey="derived.completion_rate_distribution" sub={t('Share of videos by how much of them gets watched')} />
          <div className="px-4 pb-4 pt-3 flex-1 flex items-end">
            {data.completionDist.some(d => d.value > 0)
              ? <BarChart height={200} bars={data.completionDist.map(d => ({
                  label: d.label, value: d.value, display: `${d.value}%`,
                }))} />
              : <div className="w-full py-10 text-center text-[12px] text-[#9ca3af]">{t('No TikTok completion data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="success" title={t('Strong Retention')}>{data.completionInsight}</Callout>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHead title={t('Reel Watch Time by Duration')} metricKey="derived.reel_watch_by_duration" sub={t('Average watch time and completion by reel length')} />
          <div className="px-4 pb-4 pt-3 flex-1 flex items-end">
            {data.reelWatch.some(d => d.value > 0)
              ? <BarChart height={200} bars={data.reelWatch.map(d => ({
                  label: d.label, value: d.value, display: `${d.value}%`,
                }))} />
              : <div className="w-full py-10 text-center text-[12px] text-[#9ca3af]">{t('No reel watch-time data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="info" emoji="💡" title={t('Sweet Spot')}>{data.reelWatchInsight}</Callout>
          </div>
        </Card>
      </div>
    </>
  )
}
