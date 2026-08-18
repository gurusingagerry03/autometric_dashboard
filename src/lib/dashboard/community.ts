import pool from '@/lib/db'
import { windowsFromRange, type CustomRange } from './range'
import type { OverviewKpi, TrendSeries, DashPlatform, ContributorRow } from '@/components/dashboard/data'
import { fmtNum, fmtInt, compact, compactSigned } from './format'
import type { Translator } from '@/lib/i18n/translate'

/**
 * Gold-layer data access for the Community dashboard, scoped to one organization.
 *  - KPIs + Comment Volume + By-Hour : l2_gold.comment_activity_daily / _hourly
 *  - Leaderboard                     : l2_gold.community_contributors
 * All gold (`brand_id` = public.brands.id).
 */

export type PlatformParam = 'all' | DashPlatform

export interface CommunityPayload {
  kpis: OverviewKpi[]
  commentVolume: TrendSeries[]
  commentVolumeLabels: string[]
  commentByHour: number[]      // length 24
  primeFrom: number            // peak window start hour (inclusive)
  primeTo: number              // peak window end hour (inclusive)
  primeInsight: string
  contributors: ContributorRow[]
  empty: boolean
}

const PALETTE = ['#1B8A80', '#e0a458', '#5fa783', '#d97a7a', '#8b7fc7', '#5b94b8']
const PLAT_SERIES: { platform: DashPlatform; name: string; color: string }[] = [
  { platform: 'instagram', name: 'Instagram', color: '#d23f6f' },
  { platform: 'tiktok', name: 'TikTok', color: '#111827' },
  { platform: 'facebook', name: 'Facebook', color: '#3d7eea' },
]
const TIER_LABEL: Record<string, ContributorRow['tier']> = { super_fan: 'Super Fan', active: 'Active', casual: 'Casual' }
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDateLabel = (iso: string, t: Translator) => { const [, m, d] = iso.split('-'); return `${+d} ${t(MONTH_ABBR[+m - 1])}` }

const ratio = (num: number, den: number) => (den > 0 ? num / den : 0)
function deltaStr(cur: number, prev: number): { delta: string; good: boolean } {
  if (prev <= 0) return { delta: cur > 0 ? 'new' : '0%', good: cur >= 0 }
  const d = ((cur - prev) / prev) * 100
  return { delta: `${d >= 0 ? '+' : ''}${d.toFixed(d >= 10 || d <= -10 ? 0 : 1)}%`, good: d >= 0 }
}
function initials(name: string): string {
  const parts = name.replace(/[@_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

const PLAT = `($2 = 'all' OR {col}.platform = $2)`

interface Window { start: string; end: string }

async function resolveWindows(orgId: string, platform: PlatformParam, days: number, brandId: string | null, custom: CustomRange | null = null) {
  if (custom) return windowsFromRange(custom)
  const { rows } = await pool.query<{ d: string | null }>(
    `SELECT to_char(max(c.metric_date), 'YYYY-MM-DD') d
       FROM l2_gold.comment_activity_daily c
       JOIN public.brands b ON b.id = c.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
        AND ($3::uuid IS NULL OR c.brand_id = $3)`,
    [orgId, platform, brandId],
  )
  const anchor = rows[0]?.d
  if (!anchor) return null
  const a = new Date(anchor + 'T00:00:00Z')
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const minus = (base: Date, n: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() - n); return d }
  const cur: Window = { start: iso(minus(a, days - 1)), end: anchor }
  const prev: Window = { start: iso(minus(a, days * 2 - 1)), end: iso(minus(a, days)) }
  return { anchor, cur, prev }
}

// ── KPI totals (gold) ─────────────────────────────────────────────────────────
interface KpiTotals {
  total: number; igRep: number; igCom: number
  tkCom: number; tkLik: number; fbLik: number; fbCom: number
  /**
   * Rows PRESENT per platform, which is a different question from the sums.
   * `comment_activity_daily` simply has no TikTok rows in some workspaces, and
   * without this the ratio would come out 0 and render as a measured zero.
   */
  igRows: number; tkRows: number; fbRows: number
}
const KPI_SELECT = `
   COALESCE(SUM(c.comment_count),0)::float                                          total,
   COALESCE(SUM(c.replies_sum)   FILTER (WHERE c.platform='instagram'),0)::float    "igRep",
   COALESCE(SUM(c.comment_count) FILTER (WHERE c.platform='instagram'),0)::float    "igCom",
   COALESCE(SUM(c.comment_count) FILTER (WHERE c.platform='tiktok'),0)::float        "tkCom",
   COALESCE(SUM(c.likes_sum)     FILTER (WHERE c.platform='tiktok'),0)::float        "tkLik",
   COALESCE(SUM(c.likes_sum)     FILTER (WHERE c.platform='facebook'),0)::float      "fbLik",
   COALESCE(SUM(c.comment_count) FILTER (WHERE c.platform='facebook'),0)::float      "fbCom",
   COUNT(*) FILTER (WHERE c.platform='instagram')::int                               "igRows",
   COUNT(*) FILTER (WHERE c.platform='tiktok')::int                                  "tkRows",
   COUNT(*) FILTER (WHERE c.platform='facebook')::int                                "fbRows"`

async function kpiTotals(orgId: string, platform: PlatformParam, w: Window, brandId: string | null): Promise<KpiTotals> {
  const { rows } = await pool.query(
    `SELECT ${KPI_SELECT}
       FROM l2_gold.comment_activity_daily c
       JOIN public.brands b ON b.id = c.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
        AND c.metric_date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR c.brand_id = $5)`,
    [orgId, platform, w.start, w.end, brandId],
  )
  return rows[0]
}

async function kpiDaily(orgId: string, platform: PlatformParam, w: Window, brandId: string | null) {
  const { rows } = await pool.query<KpiTotals>(
    `SELECT ${KPI_SELECT}
       FROM l2_gold.comment_activity_daily c
       JOIN public.brands b ON b.id = c.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
        AND c.metric_date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR c.brand_id = $5)
      GROUP BY c.metric_date ORDER BY c.metric_date`,
    [orgId, platform, w.start, w.end, brandId],
  )
  return {
    total: rows.map(r => Math.round(r.total)),
    igRep: rows.map(r => +ratio(r.igRep, r.igCom).toFixed(2)),
    tkLikes: rows.map(r => +ratio(r.tkLik, r.tkCom).toFixed(1)),
    fbLik: rows.map(r => +ratio(r.fbLik, r.fbCom).toFixed(2)),
  }
}

function buildKpis(cur: KpiTotals, prev: KpiTotals, s: Awaited<ReturnType<typeof kpiDaily>>, t: Translator): OverviewKpi[] {
  const igCur = ratio(cur.igRep, cur.igCom), igPrev = ratio(prev.igRep, prev.igCom)
  const tkCur = ratio(cur.tkLik, cur.tkCom), tkPrev = ratio(prev.tkLik, prev.tkCom)
  const fbCur = ratio(cur.fbLik, cur.fbCom), fbPrev = ratio(prev.fbLik, prev.fbCom)
  return [
    { key: 'c-total', label: t('Total Comments Tracked'), icon: 'forum', ...compact(cur.total), ...deltaStr(cur.total, prev.total), spark: s.total.length ? s.total : [0] },
    { key: 'c-igr', label: t('IG Avg. Replies/Comment'), icon: 'reply', value: igCur.toFixed(1), ...deltaStr(igCur, igPrev), spark: s.igRep.length ? s.igRep : [0], unavailable: cur.igRows === 0 },
    { key: 'c-tkr', label: t('TT Avg. Likes/Comment'), icon: 'thumb_up', ...compact(tkCur), ...deltaStr(tkCur, tkPrev), spark: s.tkLikes.length ? s.tkLikes : [0], unavailable: cur.tkRows === 0 },
    { key: 'c-fbl', label: t('FB Avg. Likes/Comment'), icon: 'favorite', value: fbCur.toFixed(1), ...deltaStr(fbCur, fbPrev), spark: s.fbLik.length ? s.fbLik : [0], unavailable: cur.fbRows === 0 },
  ]
}

// ── comment volume by platform (weekly) ───────────────────────────────────────
async function commentVolume(orgId: string, platform: PlatformParam, w: Window, brandId: string | null, t: Translator) {
  const { rows } = await pool.query<{ platform: DashPlatform; wk: string; c: number }>(
    `SELECT c.platform, to_char(date_trunc('week', c.metric_date), 'YYYY-MM-DD') wk,
            COALESCE(SUM(c.comment_count),0)::float c
       FROM l2_gold.comment_activity_daily c
       JOIN public.brands b ON b.id = c.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
        AND c.metric_date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR c.brand_id = $5)
      GROUP BY c.platform, date_trunc('week', c.metric_date)
      ORDER BY wk`,
    [orgId, platform, w.start, w.end, brandId],
  )
  const weeks = [...new Set(rows.map(r => r.wk))].sort()
  const idx = new Map(weeks.map((wk, i) => [wk, i]))
  const series: TrendSeries[] = PLAT_SERIES
    .filter(ps => rows.some(r => r.platform === ps.platform))
    .map(ps => {
      const data = new Array(weeks.length).fill(0)
      for (const r of rows) if (r.platform === ps.platform) data[idx.get(r.wk)!] = Math.round(r.c)
      return { name: ps.name, color: ps.color, data }
    })
  return { commentVolume: series, commentVolumeLabels: weeks.length ? weeks.map(iso => fmtDateLabel(iso, t)) : [''] }
}

// ── comments by hour of day ───────────────────────────────────────────────────
async function commentByHour(orgId: string, platform: PlatformParam, w: Window, brandId: string | null, t: Translator) {
  const { rows } = await pool.query<{ h: number; c: number }>(
    `SELECT c.hour_of_day h, COALESCE(SUM(c.comment_count),0)::int c
       FROM l2_gold.comment_activity_hourly c
       JOIN public.brands b ON b.id = c.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
        AND c.metric_date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR c.brand_id = $5)
      GROUP BY c.hour_of_day`,
    [orgId, platform, w.start, w.end, brandId],
  )
  const hours = new Array(24).fill(0)
  for (const r of rows) if (r.h >= 0 && r.h < 24) hours[r.h] = r.c
  // peak 4-hour window (sliding sum)
  let best = { from: 0, sum: -1 }
  for (let i = 0; i <= 20; i++) {
    const sum = hours[i] + hours[i + 1] + hours[i + 2] + hours[i + 3]
    if (sum > best.sum) best = { from: i, sum }
  }
  const total = hours.reduce((s, v) => s + v, 0)
  const primeFrom = best.from, primeTo = best.from + 3
  const pad = (h: number) => String(h).padStart(2, '0')
  const insight = total > 0
    ? t('Comments peak {from}:00–{to}:00 WIB ({pct}% of the total). Replying inside this window deepens the reply threads.',
        { from: pad(primeFrom), to: pad(primeTo + 1), pct: Math.round((best.sum / total) * 100) })
    : t('No hourly comment activity in this period yet.')
  return { commentByHour: hours, primeFrom, primeTo, primeInsight: insight }
}

// ── leaderboard (gold community_contributors) ─────────────────────────────────
async function leaderboard(orgId: string, platform: PlatformParam, days: number, brandId: string | null): Promise<ContributorRow[]> {
  const windowDays = [7, 30, 90].includes(days) ? days : 30
  const { rows } = await pool.query<{
    uname: string; platform: DashPlatform; comments: number; likes: number
    replies: number; relevance: number | null; tier: string
  }>(
    // composite_score orders the rows but is never selected: it has no column on
    // screen any more, so reading it into the payload would be dead weight.
    `SELECT cc.normalized_username uname, cc.platform,
            cc.comments_count::int comments, cc.likes_received::int likes,
            cc.replies_sum::int replies, cc.avg_relevance::float relevance,
            cc.tier
       FROM l2_gold.community_contributors cc
       JOIN public.brands b ON b.id = cc.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'cc')})
        AND cc.window_days = $3
        AND ($4::uuid IS NULL OR cc.brand_id = $4)
      ORDER BY cc.composite_score DESC, cc.comments_count DESC
      LIMIT 12`,
    [orgId, platform, windowDays, brandId],
  )
  return rows.map((r, i) => ({
    rank: i + 1,
    initials: initials(r.uname),
    username: r.uname.startsWith('@') ? r.uname : `@${r.uname}`,
    platform: r.platform,
    comments: r.comments,
    likes: r.likes,
    daily: +ratio(r.replies, r.comments).toFixed(1),   // "Avg Replies" column = replies per comment
    relevance: Math.round(r.relevance ?? 0),
    tier: TIER_LABEL[r.tier] ?? 'Casual',
    color: PALETTE[i % PALETTE.length],
  }))
}

export async function getCommunityData(
  orgId: string, platform: PlatformParam, days: number, brandId: string | null = null,
  custom: CustomRange | null = null,
  // Insight sentences and KPI labels are composed here, so the language has to
  // reach this far in — the client cannot translate a sentence it did not build.
  t: Translator = (k: string) => k,
): Promise<CommunityPayload> {
  const win = await resolveWindows(orgId, platform, days, brandId, custom)
  if (!win) {
    return {
      kpis: [], commentVolume: [], commentVolumeLabels: [''], commentByHour: new Array(24).fill(0),
      primeFrom: 0, primeTo: 0, primeInsight: '', contributors: [], empty: true,
    }
  }
  const [cur, prev, daily, vol, hour, lb] = await Promise.all([
    kpiTotals(orgId, platform, win.cur, brandId),
    kpiTotals(orgId, platform, win.prev, brandId),
    kpiDaily(orgId, platform, win.cur, brandId),
    commentVolume(orgId, platform, win.cur, brandId, t),
    commentByHour(orgId, platform, win.cur, brandId, t),
    leaderboard(orgId, platform, days, brandId),
  ])
  return {
    kpis: buildKpis(cur, prev, daily, t),
    ...vol,
    ...hour,
    contributors: lb,
    empty: false,
  }
}
