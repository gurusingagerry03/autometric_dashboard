import pool from '@/lib/db'
import { windowsFromRange, type CustomRange } from './range'
import type {
  OverviewKpi, TrendSeries, DashPlatform, ContributorRow, RelevanceTierRow, UgcPost,
} from '@/components/dashboard/data'
import { fmtNum, fmtInt, compact, compactSigned } from './format'
import type { Translator } from '@/lib/i18n/translate'

/**
 * Data access for the Audience Deep Dive dashboard, scoped to one organization.
 *
 * Gold-first sources (per docs §5 Audience):
 *  - KPIs & Follower Growth : l2_gold.brand_metric_daily (follower_count_eod, profile_*)
 *  - Age / Gender           : l2_gold.audience_demographics_daily (audience_type='follower_demographics')
 *  - Cities                 : l2_gold.audience_geo_daily (geo_level='city')
 *  - Community Contributors : l2_gold.community_contributors
 *  - Comment Relevance      : l2_gold.comment_relevance_distribution (counts) +
 *                             feature.comment_relevance_scores + unified_comment (sample text)
 *  - UGC Tagged Posts       : l2_gold.ugc_tagged_posts
 *
 * Grain: audience_* `brand_id` = social_accounts.id (scope via brand_social_accounts);
 * brand_metric_daily / ugc / relevance_distribution `brand_id` = umbrella (scope via
 * brands). In the current seed only Instagram carries demographic (age/gender/city) data.
 */

export type PlatformParam = 'all' | DashPlatform

export interface AudiencePayload {
  kpis: OverviewKpi[]
  /** `value` = share (%), `count` = the follower headcount behind it. */
  age: { bucket: string; value: number; count: number; color: string }[]
  ageInsight: string
  /** `female`/`male` are shares (%); the `*Count` pair is the headcount behind them. */
  gender: { platform: DashPlatform; female: number; male: number; femaleCount: number; maleCount: number }[]
  relevanceTiers: RelevanceTierRow[]
  relevanceSignal: string
  contributors: ContributorRow[]
  superFanNote: string
  cities: { city: string; value: number; count: number }[]
  followerTrend: TrendSeries[]
  followerLabels: string[]
  ugc: UgcPost[]
  ugcInsight: string
  empty: boolean
}

const PALETTE = ['#1B8A80', '#e0a458', '#5fa783', '#d97a7a', '#8b7fc7', '#5b94b8']
const AGE_LABELS: [string, string][] = [
  ['age_13_17', '13–17'], ['age_18_24', '18–24'], ['age_25_34', '25–34'],
  ['age_35_44', '35–44'], ['age_45_54', '45–54'], ['age_55_64', '55–64'], ['age_65_plus', '65+'],
]
const UGC_FORMAT: Record<string, string> = {
  CAROUSEL_ALBUM: 'Carousel', IMAGE: 'Image', VIDEO: 'Video', REELS: 'Reel',
}
const TIER_LABEL: Record<string, ContributorRow['tier']> = {
  super_fan: 'Super Fan', active: 'Active', casual: 'Casual',
}
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0)
function deltaStr(cur: number, prev: number): { delta: string; good: boolean } {
  if (prev <= 0) return { delta: cur > 0 ? 'new' : '0%', good: cur >= 0 }
  const d = ((cur - prev) / prev) * 100
  return { delta: `${d >= 0 ? '+' : ''}${d.toFixed(d >= 10 || d <= -10 ? 0 : 1)}%`, good: d >= 0 }
}
function initials(name: string): string {
  const parts = name.replace(/[@_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}
const fmtDateLabel = (iso: string, t: Translator) => { const [, m, d] = iso.split('-'); return `${+d} ${t(MONTH_ABBR[+m - 1])}` }
const fmtShort = (d: Date, t: Translator) => `${d.getUTCDate()} ${t(MONTH_ABBR[d.getUTCMonth()])}`

const PLAT = `($2 = 'all' OR {col}.platform = $2)`

interface Window { start: string; end: string }

async function resolveWindows(orgId: string, platform: PlatformParam, days: number, brandId: string | null, custom: CustomRange | null = null) {
  if (custom) return windowsFromRange(custom)
  // anchor on gold metric dates (audience KPIs/trend live in brand_metric_daily)
  const { rows } = await pool.query<{ d: string | null }>(
    `SELECT to_char(max(bmd.metric_date), 'YYYY-MM-DD') d
       FROM l2_gold.brand_metric_daily bmd
       JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'bmd')})
        AND ($3::uuid IS NULL OR bmd.brand_id = $3)`,
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

// ── KPIs + follower sparks from unified_profile ───────────────────────────────
interface ProfDay { d: string; foll: number; igReach: number; tkVisit: number; fbVisit: number }

async function profileDaily(orgId: string, platform: PlatformParam, w: Window, brandId: string | null): Promise<ProfDay[]> {
  const { rows } = await pool.query<ProfDay>(
    `SELECT to_char(bmd.metric_date, 'YYYY-MM-DD') d,
            COALESCE(SUM(bmd.follower_count_eod),0)::float                                        foll,
            COALESCE(SUM(bmd.profile_reach_sum) FILTER (WHERE bmd.platform='instagram'),0)::float  "igReach",
            COALESCE(SUM(bmd.profile_visit_sum) FILTER (WHERE bmd.platform='tiktok'),0)::float      "tkVisit",
            COALESCE(SUM(bmd.profile_visit_sum) FILTER (WHERE bmd.platform='facebook'),0)::float    "fbVisit"
       FROM l2_gold.brand_metric_daily bmd
       JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'bmd')})
        AND bmd.metric_date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR bmd.brand_id = $5)
      GROUP BY bmd.metric_date ORDER BY bmd.metric_date`,
    [orgId, platform, w.start, w.end, brandId],
  )
  return rows
}

function buildKpis(cur: ProfDay[], prev: ProfDay[], t: Translator): OverviewKpi[] {
  const sum = (rows: ProfDay[], k: keyof ProfDay) => rows.reduce((s, r) => s + (r[k] as number), 0)
  const follCur = cur.length ? cur[cur.length - 1].foll : 0
  const follStart = cur.length ? cur[0].foll : 0
  const igCur = sum(cur, 'igReach'), igPrev = sum(prev, 'igReach')
  const tkCur = sum(cur, 'tkVisit'), tkPrev = sum(prev, 'tkVisit')
  const fbCur = sum(cur, 'fbVisit'), fbPrev = sum(prev, 'fbVisit')
  return [
    { key: 'foll', label: t('Total Tracked Followers'), icon: 'group', ...compact(follCur), ...deltaStr(follCur, follStart), spark: cur.length ? cur.map(r => Math.round(r.foll)) : [0] },
    { key: 'igr', label: t('IG Profile Reach'), icon: 'ads_click', ...compact(igCur), ...deltaStr(igCur, igPrev), spark: cur.length ? cur.map(r => Math.round(r.igReach)) : [0] },
    { key: 'tkv', label: t('TT Profile Views'), icon: 'visibility', ...compact(tkCur), ...deltaStr(tkCur, tkPrev), spark: cur.length ? cur.map(r => Math.round(r.tkVisit)) : [0] },
    { key: 'fbv', label: t('FB Profile Visits'), icon: 'person', ...compact(fbCur), ...deltaStr(fbCur, fbPrev), spark: cur.length ? cur.map(r => Math.round(r.fbVisit)) : [0] },
  ]
}

// ── Age distribution (latest snapshot) ────────────────────────────────────────
async function ageDistribution(orgId: string, platform: PlatformParam, brandId: string | null, t: Translator) {
  const sums = AGE_LABELS.map(([col]) => `COALESCE(SUM(u.${col}),0)::float "${col}"`).join(',\n            ')
  const { rows } = await pool.query<Record<string, number>>(
    `SELECT ${sums}
       FROM l2_gold.audience_demographics_daily u
       JOIN public.brand_social_accounts bsa ON bsa.social_account_id = u.brand_id
       JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'u')})
        AND u.audience_type = 'follower_demographics'
        AND u.audience_date = (
          SELECT max(u2.audience_date) FROM l2_gold.audience_demographics_daily u2
          JOIN public.brand_social_accounts bsa2 ON bsa2.social_account_id = u2.brand_id
          JOIN public.brands b2 ON b2.id = bsa2.brand_id AND b2.deleted_at IS NULL
          WHERE b2.organization_id = $1 AND (${PLAT.replace('{col}', 'u2')}) AND u2.audience_type='follower_demographics'
            AND ($3::uuid IS NULL OR bsa2.brand_id = $3))
        AND ($3::uuid IS NULL OR bsa.brand_id = $3)`,
    [orgId, platform, brandId],
  )
  const r = rows[0] ?? {}
  const total = AGE_LABELS.reduce((s, [col]) => s + (r[col] ?? 0), 0)
  // `count` rides along with the share so the hover can report how many people a
  // percentage actually stands for — 4% of 2M and 4% of 2K read very differently.
  const age = AGE_LABELS.map(([col, label], i) => ({
    bucket: label,
    value: total > 0 ? Math.round(pct(r[col] ?? 0, total)) : 0,
    count: Math.round(r[col] ?? 0),
    color: PALETTE[i % PALETTE.length],
  }))
  const top = age.slice().sort((a, b) => b.value - a.value)[0]
  const insight = total > 0 && top
    ? t('The {bucket} segment dominates the audience ({pct}%) — tune tone and format for this age group.',
        { bucket: top.bucket, pct: top.value })
    : t('No age demographic data in this period.')
  return { age, ageInsight: insight }
}

// ── Gender split per platform (latest snapshot) ───────────────────────────────
async function genderSplit(orgId: string, platform: PlatformParam, brandId: string | null) {
  const { rows } = await pool.query<{ platform: DashPlatform; f: number; m: number }>(
    `SELECT u.platform,
            COALESCE(SUM(u.gender_female),0)::float f,
            COALESCE(SUM(u.gender_male),0)::float   m
       FROM l2_gold.audience_demographics_daily u
       JOIN public.brand_social_accounts bsa ON bsa.social_account_id = u.brand_id
       JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'u')})
        AND u.audience_type = 'follower_demographics'
        AND u.audience_date = (
          SELECT max(u2.audience_date) FROM l2_gold.audience_demographics_daily u2
          JOIN public.brand_social_accounts bsa2 ON bsa2.social_account_id = u2.brand_id
          JOIN public.brands b2 ON b2.id = bsa2.brand_id AND b2.deleted_at IS NULL
          WHERE b2.organization_id = $1 AND (${PLAT.replace('{col}', 'u2')}) AND u2.audience_type='follower_demographics'
            AND ($3::uuid IS NULL OR bsa2.brand_id = $3))
        AND ($3::uuid IS NULL OR bsa.brand_id = $3)
      GROUP BY u.platform`,
    [orgId, platform, brandId],
  )
  // The headcounts ride along with the shares for the same reason the age bars
  // carry theirs: "62% female" answers a different question than "1,284 women",
  // and only one of the two is worth hovering for.
  return rows
    .filter(r => r.f + r.m > 0)
    .map(r => {
      const female = Math.round(pct(r.f, r.f + r.m))
      return {
        platform: r.platform,
        female, male: 100 - female,
        femaleCount: Math.round(r.f), maleCount: Math.round(r.m),
      }
    })
}

// ── Top audience cities (latest snapshot, jsonb) ──────────────────────────────
async function topCities(orgId: string, platform: PlatformParam, brandId: string | null) {
  const { rows } = await pool.query<{ city: string; v: number }>(
    `SELECT u.geo_key city, SUM(u.audience_count)::float v
       FROM l2_gold.audience_geo_daily u
       JOIN public.brand_social_accounts bsa ON bsa.social_account_id = u.brand_id
       JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'u')})
        AND u.geo_level = 'city'
        AND u.audience_date = (
          SELECT max(u2.audience_date) FROM l2_gold.audience_geo_daily u2
          JOIN public.brand_social_accounts bsa2 ON bsa2.social_account_id = u2.brand_id
          JOIN public.brands b2 ON b2.id = bsa2.brand_id AND b2.deleted_at IS NULL
          WHERE b2.organization_id = $1 AND (${PLAT.replace('{col}', 'u2')}) AND u2.geo_level='city'
            AND ($3::uuid IS NULL OR bsa2.brand_id = $3))
        AND ($3::uuid IS NULL OR bsa.brand_id = $3)
      GROUP BY u.geo_key ORDER BY v DESC LIMIT 8`,
    [orgId, platform, brandId],
  )
  const total = rows.reduce((s, r) => s + r.v, 0)
  return rows.map(r => ({
    city: r.city,
    value: total > 0 ? Math.round(pct(r.v, total)) : 0,
    count: Math.round(r.v),
  }))
}

// ── Follower growth trend (per brand, weekly) ─────────────────────────────────
async function followerTrend(orgId: string, platform: PlatformParam, w: Window, brandId: string | null, t: Translator) {
  const { rows } = await pool.query<{ brand: string; wk: string; f: number }>(
    `WITH daily AS (
        SELECT b.name brand, bmd.metric_date d, SUM(bmd.follower_count_eod)::float f
          FROM l2_gold.brand_metric_daily bmd
          JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
         WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'bmd')})
           AND bmd.metric_date BETWEEN $3 AND $4
           AND ($5::uuid IS NULL OR bmd.brand_id = $5)
         GROUP BY b.name, bmd.metric_date)
     SELECT brand, to_char(date_trunc('week', d), 'YYYY-MM-DD') wk, AVG(f)::float f
       FROM daily GROUP BY brand, date_trunc('week', d)
      ORDER BY wk`,
    [orgId, platform, w.start, w.end, brandId],
  )
  const weeks = [...new Set(rows.map(r => r.wk))].sort()
  const idx = new Map(weeks.map((wk, i) => [wk, i]))
  const totByBrand = new Map<string, number>()
  for (const r of rows) totByBrand.set(r.brand, Math.max(totByBrand.get(r.brand) ?? 0, r.f))
  const brands = [...totByBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0])
  const series: TrendSeries[] = brands.map((brand, i) => {
    const data = new Array(weeks.length).fill(0)
    for (const r of rows) if (r.brand === brand) data[idx.get(r.wk)!] = Math.round(r.f)
    return { name: brand, color: PALETTE[i % PALETTE.length], data }
  })
  return { followerTrend: series, followerLabels: weeks.length ? weeks.map(iso => fmtDateLabel(iso, t)) : [''] }
}

// ── Comment relevance tiers (gold distribution counts + feature/silver samples) ──
const REL_TIERS = [
  { key: 'high', tier: 'High Relevance', range: '>75', desc: 'Contextual — tied to the plot or caption, character debates', color: '#5fa783', min: 75, max: 101 },
  { key: 'mid', tier: 'Mid Relevance', range: '40–75', desc: 'General positive reactions, short praise', color: '#e0a458', min: 40, max: 75 },
  { key: 'low', tier: 'Low Relevance', range: '<40', desc: 'Spam, emoji only, off-topic', color: '#d97a7a', min: -1, max: 40 },
]
// normalise score to 0..100 whether the source stores 0..1 or 0..100
const REL_NORM = `(CASE WHEN f.relevance_score <= 1 THEN f.relevance_score * 100 ELSE f.relevance_score END)`

/** Which tier a single score falls into, or undefined if it is out of range. */
function tierOf(score: number): string | undefined {
  return REL_TIERS.find(t => score >= t.min && score < t.max)?.key
}

/**
 * Choose the sample comments shown under each relevance tier.
 *
 * Scores are per COMMENT ROW, and the same sentence typed by ten different
 * people is ten rows — each scored independently, so the scorer's noise can land
 * copies of one identical text in two different tiers. On screen that reads as a
 * bug ("how is the same comment both high and low relevance?") and the repeats
 * crowd out the variety the panel exists to show.
 *
 * So: group by the normalised text and file each distinct text under exactly ONE
 * tier — the tier most of its own occurrences land in. Assigning by the mean
 * score instead would look tidier but starves a tier whose comments straddle a
 * boundary: a text sitting 90% in Mid and 10% in Low averages its way out of Mid
 * entirely, and the panel then shows a tier with a count but no examples.
 */
function pickSamples(rows: { s: number | string; txt: string | null }[]): Map<string, string[]> {
  interface Group { text: string; perTier: Map<string, number>; total: number }
  const byText = new Map<string, Group>()

  for (const r of rows) {
    const text = (r.txt ?? '').trim()
    if (!text) continue
    // node-postgres hands NUMERIC back as a string; `Number()` here is what keeps
    // the comparisons numeric instead of lexicographic.
    const score = Number(r.s)
    if (!Number.isFinite(score)) continue
    const tier = tierOf(score)
    if (!tier) continue

    // Case and inner whitespace differences are the same comment to a reader.
    const key = text.toLowerCase().replace(/\s+/g, ' ')
    const g = byText.get(key) ?? { text, perTier: new Map<string, number>(), total: 0 }
    g.perTier.set(tier, (g.perTier.get(tier) ?? 0) + 1)
    g.total += 1
    byText.set(key, g)
  }

  // Each distinct text claims its modal tier; ties fall to the first tier in
  // REL_TIERS order, which is deterministic run to run.
  const claimed = new Map<string, { text: string; hits: number; total: number }[]>()
  for (const g of byText.values()) {
    let best: { tier: string; hits: number } | null = null
    for (const t of REL_TIERS) {
      const hits = g.perTier.get(t.key) ?? 0
      if (hits > (best?.hits ?? 0)) best = { tier: t.key, hits }
    }
    if (!best) continue
    const bucket = claimed.get(best.tier) ?? []
    bucket.push({ text: g.text, hits: best.hits, total: g.total })
    claimed.set(best.tier, bucket)
  }

  const out = new Map<string, string[]>()
  for (const t of REL_TIERS) {
    const picked = (claimed.get(t.key) ?? [])
      // Most-seen first: the more often a text appears, the more representative
      // of the tier it is.
      .sort((a, b) => b.hits - a.hits || b.total - a.total)
      .slice(0, 3)
      .map(v => v.text)
    out.set(t.key, picked)
  }
  return out
}

async function commentRelevance(orgId: string, platform: PlatformParam, brandId: string | null, t: Translator) {
  // Distribution counts come from the gold rollup; sample texts per tier are joined
  // on the fly from feature.comment_relevance_scores + unified_comment (per docs §5).
  const [dist, samp] = await Promise.all([
    pool.query<{ tier: string; cnt: number }>(
      `SELECT crd.tier, SUM(crd.comment_count)::int cnt
         FROM l2_gold.comment_relevance_distribution crd
         JOIN public.brands b ON b.id = crd.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'crd')})
          AND ($3::uuid IS NULL OR crd.brand_id = $3)
        GROUP BY crd.tier`,
      [orgId, platform, brandId],
    ).catch(() => ({ rows: [] as { tier: string; cnt: number }[] })),
    // `s` is typed as it actually arrives: NUMERIC comes back as a string.
    pool.query<{ s: string; txt: string | null }>(
      `SELECT ${REL_NORM} s, c.comment_text txt
         FROM feature.comment_relevance_scores f
         JOIN l1_silver.unified_comment c
           ON c.comment_id = f.comment_id AND c.platform = f.platform
         JOIN public.brand_social_accounts bsa ON bsa.social_account_id = c.brand_id
         JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'c')})
          AND f.relevance_score IS NOT NULL
          AND ($3::uuid IS NULL OR bsa.brand_id = $3)`,
      [orgId, platform, brandId],
    ).catch(() => ({ rows: [] as { s: string; txt: string | null }[] })),
  ])

  const countByTier = new Map(dist.rows.map(r => [r.tier, r.cnt]))
  const total = [...countByTier.values()].reduce((s, c) => s + c, 0)
  const samplesByTier = pickSamples(samp.rows)

  const tiers: RelevanceTierRow[] = REL_TIERS.map(rel => {
    const count = countByTier.get(rel.key) ?? 0
    return {
      tier: rel.tier, range: rel.range, count,
      pct: total > 0 ? Math.round(pct(count, total)) : 0,
      desc: t(rel.desc), color: rel.color, samples: samplesByTier.get(rel.key) ?? [],
    }
  })
  const high = tiers[0]
  const signal = total > 0
    ? t('{pct}% of comments score as highly relevant (>75) — a sign of deep audience involvement. Open-ended captions push this share higher.',
        { pct: high.pct })
    : t('No comment relevance distribution in this period yet.')
  return { relevanceTiers: tiers, relevanceSignal: signal }
}

// ── Top community contributors (gold) ─────────────────────────────────────────
async function contributors(orgId: string, platform: PlatformParam, days: number, brandId: string | null, t: Translator): Promise<{ contributors: ContributorRow[]; superFanNote: string }> {
  const windowDays = [7, 30, 90].includes(days) ? days : 30
  const { rows } = await pool.query<{
    uname: string; platform: DashPlatform; comments: number; likes: number
    relevance: number | null; tier: string
  }>(
    // composite_score orders the rows but is never selected — see ContributorRow.
    `SELECT cc.normalized_username uname, cc.platform,
            cc.comments_count::int comments, cc.likes_received::int likes,
            cc.avg_relevance::float relevance, cc.tier
       FROM l2_gold.community_contributors cc
       JOIN public.brands b ON b.id = cc.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'cc')})
        AND cc.window_days = $3
        AND ($4::uuid IS NULL OR cc.brand_id = $4)
      ORDER BY cc.composite_score DESC, cc.comments_count DESC
      LIMIT 12`,
    [orgId, platform, windowDays, brandId],
  )
  const list: ContributorRow[] = rows.map((r, i) => ({
    rank: i + 1,
    initials: initials(r.uname),
    username: r.uname.startsWith('@') ? r.uname : `@${r.uname}`,
    platform: r.platform,
    comments: r.comments,
    likes: r.likes,
    daily: +(r.comments / windowDays).toFixed(1),
    relevance: Math.round(r.relevance ?? 0),
    tier: TIER_LABEL[r.tier] ?? 'Casual',
    color: PALETTE[i % PALETTE.length],
  }))
  const sf = list.find(c => c.tier === 'Super Fan') ?? list[0]
  const note = list.length
    ? t('{user} leads with {comments} comments over the last {days} days — a candidate for a fan/ambassador programme.',
        { user: sf.username, comments: sf.comments, days: windowDays })
    : t('No community contributor data in this period yet.')
  return { contributors: list, superFanNote: note }
}

// ── UGC tagged posts (L0 harmonization) ───────────────────────────────────────
async function ugcPosts(orgId: string, w: Window, brandId: string | null, t: Translator) {
  const { rows } = await pool.query<{
    username: string; post_type: string | null; caption: string | null
    likes: number; comments: number; post_date: Date; link: string | null
  }>(
    `SELECT tp.username, tp.post_type, tp.caption, tp.link_post AS link,
            COALESCE(tp.like_count,0)::int likes, COALESCE(tp.comment_count,0)::int comments,
            tp.post_date
       FROM l2_gold.ugc_tagged_posts tp
       JOIN public.brands b ON b.id = tp.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1
        AND tp.post_date::date BETWEEN $2 AND $3
        AND ($4::uuid IS NULL OR tp.brand_id = $4)
      ORDER BY COALESCE(tp.total_engagement, tp.like_count + tp.comment_count) DESC
      LIMIT 10`,
    [orgId, w.start, w.end, brandId],
  )
  const ugc: UgcPost[] = rows.map(r => ({
    username: r.username?.startsWith('@') ? r.username : `@${r.username ?? 'unknown'}`,
    format: UGC_FORMAT[r.post_type ?? ''] ?? (r.post_type ?? 'Image'),
    caption: (r.caption ?? '').replace(/\s+/g, ' ').trim() || t('(no caption)'),
    likes: r.likes, comments: r.comments, total: r.likes + r.comments,
    date: fmtShort(new Date(r.post_date), t),
    link: r.link,
  }))
  const avg = ugc.length ? Math.round(ugc.reduce((s, p) => s + p.total, 0) / ugc.length) : 0
  const insight = ugc.length
    ? t('Tagged posts from the audience average {avg} interactions — reposting high-performing UGC is the cheapest reach multiplier available.',
        { avg: fmtNum(avg) })
    : t('No tagged UGC posts in this period yet.')
  return { ugc, ugcInsight: insight }
}

// ── orchestrator ──────────────────────────────────────────────────────────────
export async function getAudienceData(
  orgId: string, platform: PlatformParam, days: number, brandId: string | null = null,
  custom: CustomRange | null = null,
  // Insight sentences and KPI labels are composed here, so the language has to
  // reach this far in — the client cannot translate a sentence it did not build.
  t: Translator = (k: string) => k,
): Promise<AudiencePayload> {
  const win = await resolveWindows(orgId, platform, days, brandId, custom)
  if (!win) {
    return {
      kpis: [], age: [], ageInsight: '', gender: [], relevanceTiers: [], relevanceSignal: '',
      contributors: [], superFanNote: '', cities: [], followerTrend: [], followerLabels: [''],
      ugc: [], ugcInsight: '', empty: true,
    }
  }
  const [curP, prevP, age, gender, cities, trend, rel, contrib, ugc] = await Promise.all([
    profileDaily(orgId, platform, win.cur, brandId),
    profileDaily(orgId, platform, win.prev, brandId),
    ageDistribution(orgId, platform, brandId, t),
    genderSplit(orgId, platform, brandId),
    topCities(orgId, platform, brandId),
    followerTrend(orgId, platform, win.cur, brandId, t),
    commentRelevance(orgId, platform, brandId, t),
    contributors(orgId, platform, days, brandId, t),
    ugcPosts(orgId, win.cur, brandId, t),
  ])
  return {
    kpis: buildKpis(curP, prevP, t),
    ...age,
    gender,
    ...rel,
    ...contrib,
    cities,
    ...trend,
    ...ugc,
    empty: false,
  }
}
