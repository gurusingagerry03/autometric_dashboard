'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, Callout, Badge, PostLink, TableHeadRow } from './ui'
import { HBars, MultiLineChart, SERIES } from './charts'
import MetricInfo from '@/components/ui/MetricInfo'
import { ChartTooltip, useChartTooltip } from '@/components/ui/ChartTooltip'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import ExactValue, { NumCell } from '@/components/ui/ExactValue'
import { PLATFORM_META, fmtInt, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import { TabSkeleton, useAnyBuilding } from './dataReadiness'
import type { AudiencePayload } from '@/lib/dashboard/audience'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const
const FEMALE = '#d23f6f'
const MALE = '#6c4cd6'

const TIER_STYLE: Record<string, string> = {
  'Super Fan': 'text-[#1e6f55] bg-[#e7f3ed]',
  Active:      'text-[#3d6f8a] bg-[#e9f1f5]',
  Casual:      'text-[#6b7280] bg-[#f3f4f6]',
}
const UGC_ICON: Record<string, string> = { Reel: 'movie', Image: 'image', Video: 'smart_display', Carousel: 'collections' }

/**
 * Options carry a separate `value` and `label`: the value is the canonical
 * English token the rows are filtered by, the label is what the reader sees.
 * Collapsing the two would break filtering the moment the UI switches language.
 */
function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={PJ}
      className="text-[11.5px] font-semibold text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-[#d1d5db] outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

const CONTRIB_COLS = 'grid-cols-[34px_minmax(150px,1.8fr)_52px_84px_64px_60px_84px_96px]'
const CONTRIB_HEADS = [
  { label: '#' },
  { label: 'User',      metricKey: 'ugc_tagged_posts.username' },
  { label: '' },
  { label: 'Comments',  metricKey: 'community_contributors.comments_count' },
  { label: 'Likes',     metricKey: 'community_contributors.likes_received' },
  { label: 'Daily',     metricKey: 'derived.comments_per_day' },
  { label: 'Relevance', metricKey: 'community_contributors.avg_relevance' },
  { label: 'Tier',      metricKey: 'community_contributors.tier' },
]
const UGC_COLS = 'grid-cols-[minmax(130px,1.1fr)_78px_minmax(200px,2.6fr)_64px_88px_64px_70px]'
const UGC_HEADS = [
  { label: 'User',     metricKey: 'ugc_tagged_posts.username' },
  { label: 'Format',   metricKey: 'post_metric.post_type' },
  { label: 'Caption' },
  { label: 'Likes',    metricKey: 'post_metric.likes' },
  { label: 'Comments', metricKey: 'post_metric.comments' },
  { label: 'Total',    metricKey: 'ugc_tagged_posts.total_engagement' },
  { label: 'Date' },
]

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)

export default function AudienceDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Audience Deep Dive')} subtitle={t("Who's watching and how they engage")}>
      {(state) => <AudienceBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function AudienceBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<AudiencePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Ada area data yang tabelnya masih dibangun pipeline. */
  const building = useAnyBuilding()
  const [cPlatform, setCPlatform] = useState('All Platforms')
  const [cTier, setCTier] = useState('All Tiers')

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/audience?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AudiencePayload) => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, platform, period, start, end, lang])

  const platformOpts = [
    { value: 'All Platforms', label: t('All Platforms') },
    ...Object.values(PLATFORM_META).map(m => ({ value: m.label, label: m.label })),
  ]
  const tierOpts = ['All Tiers', 'Super Fan', 'Active', 'Casual'].map(v => ({ value: v, label: t(v) }))

  const contributors = useMemo(() => (data?.contributors ?? []).filter(c =>
    (cPlatform === 'All Platforms' || PLATFORM_META[c.platform].label === cPlatform) &&
    (cTier === 'All Tiers' || c.tier === cTier),
  ), [data, cPlatform, cTier])

  // The gender bars are hand-drawn rather than an HBars/Donut, so they need their
  // own tooltip to answer the question the printed % can't: how many people.
  const genderTip = useChartTooltip()

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

  const relevanceTotal = data.relevanceTiers.reduce((sum, tier) => sum + tier.count, 0)

  return (
    <>
      {/* Reach KPIs */}
      <SectionHeader icon="groups" first>{t('Audience')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard area="brand_metric_daily" key={k.key} kpi={k} color={SERIES} />)}
      </div>

      {/* Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card area="audience_demographics_daily" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Audience Age Distribution')} metricKey="audience_demographics_daily.age" sub={t('Share of followers by age group')} />
          <div className="px-4 pb-4 pt-3">
            {data.age.some(a => a.value > 0)
              ? <HBars showShare={false} items={data.age.map(a => ({
                  label: a.bucket, value: a.value, display: `${a.value}%`,
                  exact: fmtInt(a.count), exactLabel: t('Followers'),
                }))} />
              : <div className="py-10 text-center text-[12px] text-[#9ca3af]">{t('No audience age data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="info" emoji="💡" title={t('Audience Core')}>{data.ageInsight}</Callout>
          </div>
        </Card>

        <Card area="audience_demographics_daily" skeleton="chart" className="flex flex-col">
          <CardHead title={t('Gender Split by Platform')} metricKey="audience_demographics_daily.gender" sub={t('Female vs. male share per channel')} />
          <div className="flex items-center justify-center gap-6 pt-1 pb-3">
            <Badge text={t('Female')} color={FEMALE} />
            <Badge text={t('Male')} color={MALE} />
          </div>
          <div className="px-4 pb-4 flex-1 flex flex-col justify-center gap-4">
            {data.gender.length === 0 && (
              <div className="py-6 text-center text-[12px] text-[#9ca3af]">{t('No gender data.')}</div>
            )}
            {data.gender.map(g => {
              const label = PLATFORM_META[g.platform].label
              const half = (pctShare: number, count: number, name: string, bg: string) => (
                <div
                  className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-85"
                  style={{ width: `${pctShare}%`, background: bg }}
                  onMouseEnter={e => genderTip.show(e, label, [{ label: name, value: fmtInt(count), color: bg }])}
                  onMouseMove={e => genderTip.show(e, label, [{ label: name, value: fmtInt(count), color: bg }])}
                  onMouseLeave={genderTip.hide}
                >
                  <span className="text-[11.5px] font-bold text-white">{pctShare}%</span>
                </div>
              )
              return (
                <div key={g.platform} className="flex items-center gap-3">
                  <span className="w-[72px] flex-shrink-0 text-right text-[12.5px] font-medium text-[#374151]">{label}</span>
                  <div className="flex-1 flex h-10 rounded-lg overflow-hidden">
                    {half(g.female, g.femaleCount, t('Female'), FEMALE)}
                    {half(g.male, g.maleCount, t('Male'), MALE)}
                  </div>
                </div>
              )
            })}
            {data.gender.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="w-[72px] flex-shrink-0" />
                <div className="flex-1 flex justify-between">
                  {[0, 25, 50, 75, 100].map(tick => (
                    <span key={tick} className="text-[10px] text-[#9ca3af] tabular-nums">{tick}%</span>
                  ))}
                </div>
              </div>
            )}
            <ChartTooltip tip={genderTip.tip} />
          </div>
        </Card>
      </div>

      {/* Geography + growth — kept next to the age/gender demographics above, so
          everything describing WHO the audience is reads as one block before the
          engagement-behaviour sections that follow. */}
      <SectionHeader icon="public">{t('Geography & Growth')}</SectionHeader>
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Card area="audience_geo_daily" skeleton="table" span="col-span-12 lg:col-span-5">
          <CardHead title={t('Top Audience Cities')} metricKey="audience_geo_daily.geo" sub={t('Share of followers by city')} />
          <div className="px-4 pb-4 pt-3">
            {data.cities.length
              ? <HBars items={data.cities.map(c => ({
                  label: c.city, value: c.value, display: `${c.value}%`,
                  exact: fmtInt(c.count), exactLabel: t('Followers'),
                }))} />
              : <div className="py-10 text-center text-[12px] text-[#9ca3af]">{t('No audience city data.')}</div>}
          </div>
        </Card>

        <Card area="brand_metric_daily" skeleton="chart" span="col-span-12 lg:col-span-7" className="flex flex-col">
          <CardHead title={t('Follower Growth Trend')} metricKey="brand_metric_daily.follower_count_eod" sub={t('All brands · weekly')} />
          <div className="px-4 pb-3 pt-3 flex-1">
            {data.followerTrend.length
              ? <MultiLineChart series={data.followerTrend} labels={data.followerLabels} height={220} />
              : <div className="h-[220px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No follower data.')}</div>}
          </div>
          <div className="flex items-center gap-4 px-4 pb-4 flex-wrap">
            {data.followerTrend.map(s => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b7280]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.name}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Comment relevance */}
      <SectionHeader icon="forum">{t('Comment Relevance Analysis')}</SectionHeader>
      <Card area="comment_relevance_distribution" skeleton="chart" className="mb-3">
        <div className="flex items-start justify-between px-4 pt-3.5 pb-2 flex-wrap gap-2">
          <div>
            <h3 style={PJ} className="flex items-center gap-1 text-[12.5px] font-bold text-[#111827] tracking-[-0.01em]">
              {t('Comment Relevance Analysis')}
              <MetricInfo metricKey="comment_relevance.tier" size={13} />
            </h3>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">{t('Semantic scoring of each comment against its post caption — how contextually invested is the audience?')}</p>
          </div>
        </div>
        {relevanceTotal === 0 ? (
          <div className="px-4 py-10 text-center text-[12.5px] text-[#9ca3af]">{t('No comment relevance scores yet.')}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 px-4 pt-1">
              {data.relevanceTiers.map(tier => (
                <div key={tier.tier} className="bg-[#fafbfb] border border-[#eef0f2] rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: tier.color }} />
                    <span className="text-[12px] font-semibold text-[#374151]">{t(tier.tier)} ({tier.range})</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <ExactValue value={tier.count} style={PJ}
                      className="text-[22px] font-bold text-[#111827] leading-none tabular-nums" />
                    <span className="text-[11.5px] text-[#9ca3af] pb-0.5">{t('{pct}% of all comments', { pct: tier.pct })}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pt-4 pb-4">
              <p style={PJ} className="text-[10.5px] font-bold uppercase tracking-widest text-[#9ca3af] mb-2.5">{t('Relevance Distribution')}</p>
              <div className="flex flex-col gap-3">
                {data.relevanceTiers.map(tier => (
                  <div key={tier.tier}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12.5px] font-semibold text-[#374151]">{t(tier.tier).replace(' Relevance', '')} ({tier.range})</span>
                      <span style={PJ} className="text-[12.5px] font-bold text-[#111827]">{tier.pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#f3f4f6] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${tier.pct}%`, background: tier.color }} />
                    </div>
                    <p className="text-[11px] text-[#9ca3af] mt-1">{tier.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {relevanceTotal > 0 && (
        <Card area="comment_relevance_distribution" skeleton="table" className="mb-1">
          <CardHead title={t('Sample Comments by Tier')} metricKey="comment_relevance.tier" sub={t('Representative comments from each relevance band')} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-4 pt-1 pb-2">
            {data.relevanceTiers.map(tier => (
              <div key={tier.tier}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: tier.color }} />
                  <span style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{t('{tier} Samples', { tier: t(tier.tier) })}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {tier.samples.map((sample, i) => (
                    <p key={i} className="text-[12px] leading-snug text-[#4b5563] bg-[#fafbfb] border border-[#eef0f2] rounded-lg px-3 py-2">“{sample}”</p>
                  ))}
                  {/* A band can hold comments yet show no example: each distinct
                      comment text is filed under the ONE band most of its copies
                      land in, so a sentence that is scored into two bands only
                      appears under the heavier one. Saying so beats a bare dash
                      next to a non-zero count. */}
                  {tier.samples.length === 0 && (
                    <p className="text-[11.5px] leading-snug text-[#9ca3af]">
                      {tier.count > 0
                        ? t('No distinct comment sits mainly in this band — each one is shown under the band most of its copies fall into.')
                        : '—'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mx-4 mb-4 mt-2">
            <Callout tone="info" emoji="💡" title={t('Relevance Signal')}>{data.relevanceSignal}</Callout>
          </div>
        </Card>
      )}

      {/* Top contributors */}
      <SectionHeader icon="workspace_premium">{t('Top Community Contributors')}</SectionHeader>
      <Card area="community_contributors" skeleton="table" className="overflow-hidden">
        <div className="flex items-start justify-between px-4 pt-3.5 pb-2 flex-wrap gap-2">
          <div>
            <h3 style={PJ} className="flex items-center gap-1 text-[12.5px] font-bold text-[#111827] tracking-[-0.01em]">
              {t('Top Community Contributors')}
              <MetricInfo metricKey="community_contributors.composite_score" size={13} />
            </h3>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">{t('Ranked by how often they comment and how relevant those comments are')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={cPlatform} onChange={setCPlatform} options={platformOpts} />
            <Select value={cTier} onChange={setCTier} options={tierOpts} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <TableHeadRow className={`grid ${CONTRIB_COLS}`} cols={CONTRIB_HEADS} />
            {contributors.map((c, i) => (
              <div key={c.username}
                className={`grid ${CONTRIB_COLS} gap-2 px-4 py-3 items-center text-[13px] hover:bg-[#fafbfb] ${
                  i < contributors.length - 1 ? 'border-b border-[#f1f3f4]' : ''
                }`}>
                <span style={PJ} className="text-[12px] font-bold text-[#9ca3af] tabular-nums">{c.rank}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10.5px] font-bold flex-shrink-0" style={{ background: c.color }}>{c.initials}</span>
                  <span className="font-medium text-[#374151] truncate">{c.username}</span>
                </div>
                <img src={PLATFORM_META[c.platform].logo} alt={PLATFORM_META[c.platform].label} className="w-[18px] h-[18px] object-contain" />
                <NumCell value={c.comments} className="text-[#374151] tabular-nums" />
                <NumCell value={c.likes} className="text-[#374151] tabular-nums" />
                <span className="text-[#374151] tabular-nums">{c.daily}</span>
                <span className="font-semibold text-[#3d8a5f] tabular-nums">{c.relevance}%</span>
                <span className={`inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${TIER_STYLE[c.tier]}`}>{t(c.tier)}</span>
              </div>
            ))}
            {contributors.length === 0 && (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9ca3af]">{t('No contributors match these filters.')}</div>
            )}
          </div>
        </div>
        <div className="mx-4 my-4">
          <Callout tone="success" title={t('Super Fan Programme')}>{data.superFanNote}</Callout>
        </div>
      </Card>

      {/* UGC */}
      <SectionHeader icon="loyalty">{t('User-Generated Content — Tagged Posts')}</SectionHeader>
      <Card area="ugc_tagged_posts" skeleton="table" className="overflow-hidden">
        <CardHead title={t('Tagged Posts')} metricKey="ugc_tagged_posts.total_engagement" sub={t('Instagram posts that tagged you, with their likes and comments')} />
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <TableHeadRow className={`grid ${UGC_COLS}`} cols={UGC_HEADS} />
            {data.ugc.map((p, i) => (
              <div key={p.username + i}
                className={`group/row grid ${UGC_COLS} gap-2 px-4 py-3 items-center text-[13px] hover:bg-[#fafbfb] ${
                  i < data.ugc.length - 1 ? 'border-b border-[#f1f3f4]' : ''
                }`}>
                <span className="font-medium text-[#374151] truncate">{p.username}</span>
                <span className="inline-flex items-center gap-1 text-[12px] text-[#6b7280]">
                  <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">{UGC_ICON[p.format] ?? 'image'}</span>
                  {t(p.format)}
                </span>
                <PostLink href={p.link} caption={`“${p.caption}”`} className="text-[#374151]" />
                <NumCell value={p.likes} className="text-[#374151] tabular-nums" />
                <NumCell value={p.comments} className="text-[#374151] tabular-nums" />
                <NumCell value={p.total} className="font-semibold text-[#111827] tabular-nums" />
                <span className="text-[#9ca3af] text-[12px]">{p.date}</span>
              </div>
            ))}
            {data.ugc.length === 0 && (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9ca3af]">{t('No tagged UGC posts in this period.')}</div>
            )}
          </div>
        </div>
        <div className="mx-4 my-4">
          <Callout tone="info" emoji="💡" title={t('UGC Opportunity')}>{data.ugcInsight}</Callout>
        </div>
      </Card>
    </>
  )
}
