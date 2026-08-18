'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHead, SectionHeader } from './ui'
import { HBars, BarChart } from './charts'
import DashboardChrome, { type ChromeState } from './DashboardChrome'
import { PILLAR_META, PLATFORM_META, PALETTE, fmtInt, type PlatformFilter } from './data'
import { useLanguage, useT } from '@/lib/i18n/LanguageContext'
import type { CampaignPostRow, CampaignAnalysis } from '@/lib/dashboard/campaign'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

const fmt1 = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n))
const platformParam = (p: PlatformFilter) => (p === 'All' ? 'all' : p)

// Pillar colour/label: use the known map, else a stable hashed colour + raw name
// (real content_pillar values from the DB rarely match the seed keys).
function pillarMeta(pillar: string): { label: string; color: string } {
  const known = PILLAR_META[pillar]
  if (known) return known
  let h = 0
  for (let i = 0; i < pillar.length; i++) h = (h * 31 + pillar.charCodeAt(i)) >>> 0
  return { label: pillar, color: PALETTE[h % PALETTE.length] }
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={PJ}
      className="text-[12.5px] font-semibold text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 cursor-pointer hover:border-[#d1d5db] outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function PostCard({ post, selected, onToggle }: { post: CampaignPostRow; selected: boolean; onToggle: () => void }) {
  const t = useT()
  const pm = pillarMeta(post.pillar)
  const plat = PLATFORM_META[post.platform]
  return (
    // The card itself is the select toggle, so the permalink can't live inside it
    // (an <a> nested in a <button> is invalid) — it sits alongside as an overlay.
    <div className="group/card relative flex">
      {post.link && (
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          title={t('Open the post on its platform')}
          className="absolute top-2.5 right-2.5 z-10 w-6 h-6 flex items-center justify-center rounded-md text-[#9ca3af] opacity-0 group-hover/card:opacity-100 hover:text-[#6c4cd6] hover:bg-white transition"
        >
          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
        </a>
      )}
    <button onClick={onToggle} style={PJ}
      className={`w-full text-left rounded-xl border p-3.5 transition-all flex flex-col gap-2.5 ${
        selected ? 'border-[#6c4cd6] ring-2 ring-[#6c4cd6]/25 bg-[#f6f3fd]' : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
      }`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: plat.color, background: `${plat.color}14` }}>{plat.short}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: pm.color, background: `${pm.color}14` }}>{pm.label}</span>
        {post.boosted && <span className="text-[10px] font-semibold text-[#b8915a] bg-[#fbf4e8] px-1.5 py-0.5 rounded">{t('Boosted')}</span>}
      </div>
      <p className="text-[13px] font-semibold text-[#1f2937] leading-snug line-clamp-2">{post.caption}</p>
      <div className="flex items-center gap-3 text-[11.5px] text-[#9ca3af]">
        <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span>{post.date}</span>
        <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-[#d6447a]">favorite</span>{fmt1(post.likes)}</span>
        <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">mode_comment</span>{fmt1(post.comments)}</span>
      </div>
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6b7280]">
        <span className="material-symbols-outlined text-[14px] text-[#9ca3af]">bar_chart</span>{t('{er}% ER', { er: post.er })}
      </span>
      {post.hashtags.length > 0 && <p className="text-[11px] text-[#bcc2c9] truncate">{post.hashtags.join(' ')}</p>}
    </button>
    </div>
  )
}

export default function CampaignDashboard({ orgId }: { orgId: string }) {
  const t = useT()
  return (
    <DashboardChrome title={t('Campaign Analysis')} subtitle={t('Select posts, run analysis & compare content pillars')}>
      {(state) => <CampaignBody orgId={orgId} brandId={state.brand.id} platform={state.platform} />}
    </DashboardChrome>
  )
}

function CampaignBody({ orgId, brandId, platform }: { orgId: string; brandId: string; platform: ChromeState['platform'] }) {
  const t = useT()
  const { lang } = useLanguage()
  const [posts, setPosts] = useState<CampaignPostRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pillarFilter, setPillarFilter] = useState('all')
  const [analysis, setAnalysis] = useState<CampaignAnalysis | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPosts(null); setError(null); setSelected(new Set()); setAnalysis(null)
    const url = `/api/organizations/${orgId}/dashboard/campaign?platform=${platformParam(platform)}&brand=${encodeURIComponent(brandId)}&lang=${lang}`
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { posts: CampaignPostRow[] }) => { if (!cancelled) setPosts(d.posts) })
      .catch(e => { if (!cancelled) setError(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, platform, lang])

  const filtered = useMemo(
    () => (posts ?? []).filter(p => pillarFilter === 'all' || p.pillar === pillarFilter),
    [posts, pillarFilter],
  )
  const selectedPosts = (posts ?? []).filter(p => selected.has(p.id))
  const totalEng = selectedPosts.reduce((s, p) => s + p.likes + p.comments, 0) || 1

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAll = () => setSelected(new Set(filtered.map(p => p.id)))
  const clear = () => { setSelected(new Set()); setAnalysis(null) }

  async function runAnalysis() {
    setRunning(true)
    try {
      const res = await fetch(`/api/organizations/${orgId}/dashboard/campaign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: [...selected] }),
      })
      setAnalysis(res.ok ? await res.json() : { timeline: [], wordcloud: [] })
    } catch {
      setAnalysis({ timeline: [], wordcloud: [] })
    } finally {
      setRunning(false)
    }
  }

  const pillarOpts = [
    { value: 'all', label: t('All Pillars / Posts') },
    ...[...new Set((posts ?? []).map(p => p.pillar))].map(k => ({ value: k, label: pillarMeta(k).label })),
  ]

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[40px] text-[#d1d5db] mb-2">error</span>
        <p className="text-[13px] text-[#6b7280]">{t('Failed to load data: {error}', { error })}</p>
      </div>
    )
  }
  if (!posts) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="material-symbols-outlined text-[34px] text-[#cbd1d8] animate-spin mb-2">progress_activity</span>
        <p className="text-[13px] text-[#9ca3af]">{t('Loading data…')}</p>
      </div>
    )
  }

  return (
    <>
      <SectionHeader icon="campaign" first>{t('Campaign Analysis')}</SectionHeader>
      <Card className="mb-3">
        <div className="px-5 pt-4 pb-1">
          <h3 style={PJ} className="text-[15px] font-bold text-[#111827] tracking-[-0.01em]">{t('Campaign Analysis')}</h3>
          <p className="text-[12.5px] text-[#9ca3af] mt-1">{t('Select posts by pillar or individually. Run analysis to see per-post contribution, comment timeline distribution, and cleaned word cloud.')}</p>
        </div>
        <div className="flex items-center gap-2.5 px-5 pt-3 pb-1 flex-wrap">
          <Select value={pillarFilter} onChange={setPillarFilter} options={pillarOpts} />
          <button onClick={selectAll} style={PJ} className="text-[12.5px] font-semibold text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-3.5 py-2 hover:border-[#d1d5db]">{t('Select All')}</button>
          <button onClick={clear} style={PJ} className="text-[12.5px] font-semibold text-[#6b7280] bg-white border border-[#e5e7eb] rounded-lg px-3.5 py-2 hover:border-[#d1d5db]">{t('Clear')}</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 p-5 pt-3">
          {filtered.map(p => <PostCard key={p.id} post={p} selected={selected.has(p.id)} onToggle={() => toggle(p.id)} />)}
          {filtered.length === 0 && <p className="col-span-full text-center text-[12.5px] text-[#9ca3af] py-8">{t('No campaign posts for this filter yet.')}</p>}
        </div>
      </Card>

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span style={PJ} className="text-[12.5px] font-bold text-white bg-[#6c4cd6] rounded-full px-3.5 py-1.5">{t('{count} posts selected', { count: selected.size })}</span>
            <span className="text-[12.5px] text-[#9ca3af]">{selected.size === 0 ? t('Select posts above, then run analysis') : t('Ready — run the analysis')}</span>
          </div>
          <button onClick={runAnalysis} disabled={selected.size === 0 || running} style={PJ}
            className={`inline-flex items-center gap-2 text-[13px] font-bold rounded-lg px-5 py-2.5 transition-colors ${
              selected.size === 0 || running ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
            }`}>
            <span className={`material-symbols-outlined text-[16px] ${running ? 'animate-spin' : ''}`}>{running ? 'progress_activity' : 'play_arrow'}</span>
            {running ? t('Analyzing…') : t('Run Campaign Analysis')}
          </button>
        </div>
      </Card>

      {analysis && selectedPosts.length > 0 && (
        <div className="grid grid-cols-12 gap-3 mb-3">
          <Card span="col-span-12 lg:col-span-7">
            <CardHead title={t('Per-Post Contribution')} metricKey="post_metric.engagement_owned" sub={t('Share of campaign engagement (likes + comments)')} />
            <div className="px-4 pb-4 pt-3">
              <HBars items={[...selectedPosts].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).map(p => {
                const eng = p.likes + p.comments
                return { label: p.caption.length > 34 ? p.caption.slice(0, 34) + '…' : p.caption, value: eng, display: `${fmt1(eng)} · ${Math.round((eng / totalEng) * 100)}%`, exact: fmtInt(eng), exactLabel: t('Engagement') }
              })} />
            </div>
          </Card>

          <Card span="col-span-12 lg:col-span-5" className="flex flex-col">
            <CardHead title={t('Comment Timeline Distribution')} metricKey="post_comment_timeline.days_since_post" sub={t('Comments by days since post')} />
            <div className="px-4 pb-4 pt-3 flex-1 flex items-end">
              {analysis.timeline.length > 0
                ? <BarChart height={200} bars={analysis.timeline.map(b => ({ label: b.label, value: b.value, display: fmt1(b.value), exact: fmtInt(b.value) }))} />
                : <p className="w-full text-center text-[12.5px] text-[#9ca3af] py-10">{t('No comment timeline data for the selected posts.')}</p>}
            </div>
          </Card>

          <Card span="col-span-12">
            <CardHead title={t('Cleaned Word Cloud')} metricKey="post_wordcloud.word" sub={t('Stop-words & emojis removed · weighted by frequency')} />
            {analysis.wordcloud.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-7">
                {analysis.wordcloud.map((w, i) => (
                  <span key={w.word} style={{ fontSize: 13 + w.weight * 24, color: PALETTE[i % PALETTE.length], opacity: 0.5 + w.weight * 0.5, ...PJ }}
                    className="font-bold leading-none">{w.word}</span>
                ))}
              </div>
            ) : (
              <p className="text-center text-[12.5px] text-[#9ca3af] py-10">{t('No word cloud for the selected posts.')}</p>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
