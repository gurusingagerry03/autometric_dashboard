'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead, SectionHeader, FlexKpiCard, Callout, TableHeadRow } from './ui'
import { MultiLineChart, SERIES } from './charts'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import { NumCell } from '@/components/ui/ExactValue'
import { PLATFORM_META, type PlatformFilter, type Period } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import type { CommunityPayload } from '@/lib/dashboard/community'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

const TIER_STYLE: Record<string, string> = {
  'Super Fan': 'text-[#7a4fb5] bg-[#f3eefb]',
  Active:      'text-[#3d8a5f] bg-[#e7f3ed]',
  Casual:      'text-[#6b7280] bg-[#f3f4f6]',
}

/* 24-hour comment activity; peak window (primeFrom..primeTo) emphasised. */
function HourBars({ hours, primeFrom, primeTo }: { hours: number[]; primeFrom: number; primeTo: number }) {
  const W = 600, H = 230, padL = 36, padR = 8, padT = 12, padB = 26
  const plotW = W - padL - padR, plotH = H - padT - padB
  const peakMax = Math.max(1, ...hours)
  const p = Math.pow(10, Math.floor(Math.log10(peakMax)))
  const top = Math.max(p, Math.ceil(peakMax / p) * p)
  const slot = plotW / 24
  const barW = slot * 0.66
  const y = (v: number) => padT + plotH * (1 - v / top)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(top * f))
  const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      {yTicks.map(t => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} />
          <text x={padL - 5} y={y(t) + 3} textAnchor="end" className="fill-[#9ca3af]" fontSize={9.5}>{fmt(t)}</text>
        </g>
      ))}
      {hours.map((v, i) => {
        const peak = i >= primeFrom && i <= primeTo
        return <rect key={i} x={padL + slot * i + (slot - barW) / 2} y={y(v)} width={barW}
          height={Math.max(0, padT + plotH - y(v))} rx={3} fill={peak ? '#6c4cd6' : '#bcaee8'} />
      })}
      {hours.map((_, i) => i % 2 === 0 && (
        <text key={i} x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="fill-[#9ca3af]" fontSize={9}>
          {String(i).padStart(2, '0')}:00
        </text>
      ))}
    </svg>
  )
}

const LB_COLS = 'grid-cols-[48px_minmax(150px,2fr)_72px_90px_120px_96px_96px]'
const LB_HEADS = [
  { label: 'Rank',           metricKey: 'community_contributors.rank_in_window' },
  { label: 'Username',       metricKey: 'ugc_tagged_posts.username' },
  { label: 'Platform' },
  { label: 'Comments',       metricKey: 'community_contributors.comments_count' },
  { label: 'Likes Received', metricKey: 'community_contributors.likes_received' },
  { label: 'Avg Replies',    metricKey: 'derived.replies_per_comment' },
  { label: 'Tier',           metricKey: 'community_contributors.tier' },
]

const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)

export default function CommunityDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Community')} subtitle={t('Comment activity & your most engaged audience')}>
      {(state) => <CommunityBody orgId={orgId} brandId={state.brand.id} platform={state.platform} period={state.period} start={state.start} end={state.end} />}
    </DashboardChrome>
  )
}

function CommunityBody({ orgId, brandId, platform, period, start, end }: { orgId: string; brandId: string; platform: ChromeState['platform']; period: Period; start: string | null; end: string | null }) {
  const t = useT()
  const { lang } = useLanguage()
  const [data, setData] = useState<CommunityPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null)
    const range = start && end ? `&start=${start}&end=${end}` : ''
    const url = `/api/organizations/${orgId}/dashboard/community?platform=${platformParam(platform)}&period=${encodeURIComponent(period)}${range}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CommunityPayload) => { if (!cancelled) setData(d) })
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
        <p className="text-[13px] text-[#6b7280]">{t('No community data for this filter yet.')}</p>
      </div>
    )
  }

  return (
    <>
      <SectionHeader icon="diversity_3" first>{t('Performance')}</SectionHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {data.kpis.map(k => <FlexKpiCard key={k.key} kpi={k} color={SERIES} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        <Card className="flex flex-col">
          <CardHead title={t('Comment Volume by Platform')} metricKey="comment_activity.comment_count" sub={t('Comments tracked per week')} />
          <div className="flex items-center justify-center gap-5 pb-1">
            {data.commentVolume.map(s => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b7280]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.name}
              </span>
            ))}
          </div>
          <div className="px-4 pb-4 pt-1 flex-1">
            {data.commentVolume.length
              ? <MultiLineChart series={data.commentVolume} labels={data.commentVolumeLabels} height={250} dots />
              : <div className="h-[250px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No comment volume data.')}</div>}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHead title={t('Comment Activity by Hour of Day')} metricKey="comment_activity.hour_of_day" sub={t('When your audience comments (WIB)')} />
          <div className="px-4 pb-3 pt-3">
            {data.commentByHour.some(v => v > 0)
              ? <HourBars hours={data.commentByHour} primeFrom={data.primeFrom} primeTo={data.primeTo} />
              : <div className="h-[230px] flex items-center justify-center text-[12px] text-[#9ca3af]">{t('No hourly data.')}</div>}
          </div>
          <div className="mx-4 mb-4 mt-auto">
            <Callout tone="success" title={t('Prime Window')}>{data.primeInsight}</Callout>
          </div>
        </Card>
      </div>

      <SectionHeader icon="leaderboard">{t('Top Commenters — Community Leaderboard')}</SectionHeader>
      <Card className="overflow-hidden">
        <CardHead title={t('Top Commenters — Community Leaderboard')} metricKey="community_contributors.composite_score" sub={t('Ranked by comments, likes received and replies')} />
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <TableHeadRow className={`grid ${LB_COLS}`} cols={LB_HEADS} />
            {data.contributors.map((c, i) => (
              <div key={c.username}
                className={`grid ${LB_COLS} gap-2 px-4 py-3.5 items-center text-[13px] hover:bg-[#fafbfb] ${
                  i < data.contributors.length - 1 ? 'border-b border-[#f1f3f4]' : ''
                }`}>
                <span style={PJ} className="text-[13px] font-bold text-[#6c4cd6] tabular-nums">#{c.rank}</span>
                <span className="font-medium text-[#374151] truncate">{c.username}</span>
                <span className="inline-flex items-center justify-center text-[10px] font-bold text-white rounded px-1.5 py-0.5 w-fit"
                  style={{ background: PLATFORM_META[c.platform].color }}>{PLATFORM_META[c.platform].short}</span>
                <NumCell value={c.comments} className="font-semibold text-[#111827] tabular-nums" />
                <NumCell value={c.likes} className="text-[#374151] tabular-nums" />
                <span className="text-[#374151] tabular-nums">{c.daily}</span>
                <span className={`inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit ${TIER_STYLE[c.tier]}`}>{t(c.tier)}</span>
              </div>
            ))}
            {data.contributors.length === 0 && (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9ca3af]">{t('No contributor data in this period.')}</div>
            )}
          </div>
        </div>
      </Card>
    </>
  )
}
