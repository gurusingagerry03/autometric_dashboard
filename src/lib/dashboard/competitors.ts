import pool from '@/lib/db'
import { windowsFromRange, type CustomRange } from './range'
import type { Translator } from '@/lib/i18n/translate'

/**
 * Gold-layer data access for the cross-channel competitor comparison, scoped to
 * one organization. Reads l2_gold.competitor_profile_metric_daily (followers and
 * growth) and l2_gold.competitor_post_metric (per-post engagement), both keyed by
 * `brand_id` = public.brands.id and `competitor_social_account_id`.
 *
 * Only metrics the platform publishes publicly are used — nothing here needs an
 * owned-account token. The catch is that the three channels publish different
 * things, so a naive side-by-side would read a missing metric as a zero. See
 * METRIC_SUPPORT below: the payload carries the support matrix so the UI can
 * render "not available on this channel" instead of a misleading 0.
 *
 * Facebook is deliberately absent from the results: l0_raw.fb_competitor_media is
 * being collected, but nothing harmonizes it into l1_silver.unified_competitor_post,
 * so no rows ever reach the gold tables. Once that pipeline exists this module
 * needs no change — the rows will simply appear.
 */

export type PlatformParam = 'all' | 'instagram' | 'facebook' | 'tiktok'
export type Channel = 'instagram' | 'facebook' | 'tiktok'

/** Which public metrics each channel actually exposes for a competitor. */
export const METRIC_SUPPORT: Record<Channel, Record<string, boolean>> = {
  instagram: {
    followers: true, followersGrowth: true, postCount: true,
    likes: true, comments: true, shares: false, views: true, saves: false,
  },
  facebook: {
    followers: true, followersGrowth: true, postCount: false,
    likes: true, comments: false, shares: true, views: false, saves: false,
  },
  tiktok: {
    followers: true, followersGrowth: true, postCount: true,
    likes: true, comments: true, shares: true, views: true, saves: true,
  },
}

/**
 * Engagement components per channel. Instagram publishes no shares or saves and
 * Facebook publishes no comments, so an identical formula would quietly punish
 * whichever channel is missing a term. `engagementRate` therefore uses each
 * channel's own components (most faithful per channel) while
 * `engagementRateComparable` uses likes only — the one term all three publish —
 * so the columns can be ranked against each other honestly.
 */
const ENGAGEMENT_TERMS: Record<Channel, Array<'likes' | 'comments' | 'shares' | 'saves'>> = {
  instagram: ['likes', 'comments'],
  facebook:  ['likes', 'shares'],
  tiktok:    ['likes', 'comments', 'shares', 'saves'],
}

export interface CompetitorRow {
  accountId: string
  username: string
  avatarUrl: string | null
  platform: Channel

  // ── raw, summed over the window ───────────────────────────────────────────
  followers: number | null
  followersGrowth: number | null
  postCount: number
  likes: number | null
  comments: number | null
  shares: number | null
  views: number | null
  saves: number | null

  // ── calculated ────────────────────────────────────────────────────────────
  avgLikes: number | null
  avgComments: number | null
  avgShares: number | null
  avgViews: number | null
  avgSaves: number | null
  /** % of followers engaging per post, using this channel's own components. */
  engagementRate: number | null
  /** % using likes only — the basis every channel shares. Safe to rank across channels. */
  engagementRateComparable: number | null
  postsPerWeek: number
  /** Views per follower per post; null where the channel publishes no view count. */
  viewsPerFollower: number | null
  /** Which components fed `engagementRate`, so the UI can label the basis. */
  engagementBasis: string[]

  /** Highest follower reading in the window — the yardstick for `suspect`. */
  followersPeak: number | null
  /**
   * The follower count collapsed inside the window by more than the threshold, so
   * every rate derived from it is meaningless. Set rather than silently corrected:
   * a competitor's follower history is not ours to rewrite, and the collapse is a
   * real signal that the scrape broke.
   */
  suspect: boolean
  suspectReason: string | null
}

export interface CompetitorComparePayload {
  rows: CompetitorRow[]
  support: Record<Channel, Record<string, boolean>>
  range: { start: string; end: string; days: number }
  insight: string
  /** Channels that have no rows at all in this window. */
  missingChannels: Channel[]
  empty: boolean
}

const PLAT = `($2 = 'all' OR {col}.platform = $2)`

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** Averages below 1 must not collapse to 0 — a small number is still a number. */
function avg(sum: number | null, count: number): number | null {
  if (sum === null || count <= 0) return null
  const v = sum / count
  return v > 0 && v < 1 ? round2(v) : Math.round(v)
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null
  return round2((num / den) * 100)
}

interface Window { start: string; end: string; days: number }

async function resolveWindow(
  orgId: string, platform: PlatformParam, days: number,
  brandId: string | null, custom: CustomRange | null,
): Promise<Window | null> {
  if (custom) {
    const w = windowsFromRange(custom)
    const span = Math.round(
      (new Date(w.cur.end + 'T00:00:00Z').getTime() - new Date(w.cur.start + 'T00:00:00Z').getTime()) / 86_400_000,
    ) + 1
    return { start: w.cur.start, end: w.cur.end, days: Math.max(1, span) }
  }

  const { rows } = await pool.query<{ d: string | null }>(
    `SELECT to_char(max(p.metric_date), 'YYYY-MM-DD') d
       FROM l2_gold.competitor_profile_metric_daily p
       JOIN public.brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'p')})
        AND ($3::uuid IS NULL OR p.brand_id = $3)`,
    [orgId, platform, brandId],
  )
  const anchor = rows[0]?.d
  if (!anchor) return null

  const end = new Date(anchor + 'T00:00:00Z')
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  return { start: start.toISOString().slice(0, 10), end: anchor, days }
}

interface ProfileRow {
  account_id: string
  platform: Channel
  username: string | null
  avatar_url: string | null
  followers: number | null
  growth: number | null
  post_count: number | null
  followers_peak: number | null
}

/**
 * Followers are a level, not a flow: take the newest reading inside the window
 * rather than summing.
 *
 * Two hardening rules, both earned from real data. A failed scrape writes
 * follower_count = 0 rather than NULL (aqualume.id went 558288 -> 0 and stayed
 * there), so readings of zero are excluded — the last *real* count is far closer
 * to the truth than a scrape artefact. And growth is derived from the level
 * difference across the window instead of summing followers_growth, because that
 * column faithfully recorded the phantom -558288 drop the failed scrape implied.
 */
async function profiles(orgId: string, platform: PlatformParam, w: Window, brandId: string | null) {
  const { rows } = await pool.query<ProfileRow>(
    `WITH clean AS (
       SELECT p.competitor_social_account_id AS account_id, p.platform,
              p.metric_date, p.follower_count, p.post_count
         FROM l2_gold.competitor_profile_metric_daily p
         JOIN public.brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'p')})
          AND p.metric_date BETWEEN $3 AND $4
          AND ($5::uuid IS NULL OR p.brand_id = $5)
          AND p.follower_count > 0
     ), latest AS (
       SELECT DISTINCT ON (account_id, platform) account_id, platform, follower_count, post_count
         FROM clean ORDER BY account_id, platform, metric_date DESC
     ), earliest AS (
       SELECT DISTINCT ON (account_id, platform) account_id, platform, follower_count
         FROM clean ORDER BY account_id, platform, metric_date ASC
     ), peak AS (
       SELECT account_id, platform, MAX(follower_count) AS follower_count
         FROM clean GROUP BY 1, 2
     )
     SELECT l.account_id, l.platform, sa.username, sa.avatar_url,
            l.follower_count::float                            AS followers,
            (l.follower_count - e.follower_count)::float        AS growth,
            l.post_count::float                                 AS post_count,
            pk.follower_count::float                            AS followers_peak
       FROM latest l
       LEFT JOIN earliest e ON e.account_id = l.account_id AND e.platform = l.platform
       LEFT JOIN peak pk    ON pk.account_id = l.account_id AND pk.platform = l.platform
       LEFT JOIN public.social_accounts sa ON sa.id = l.account_id`,
    [orgId, platform, w.start, w.end, brandId],
  )
  return rows
}

interface PostAgg {
  account_id: string
  platform: Channel
  posts: number
  likes: number | null
  comments: number | null
  shares: number | null
  views: number | null
  saves: number | null
}

/**
 * COUNT(col) rather than SUM(col) IS NULL decides availability: a channel that
 * never publishes a metric stores NULL, and SUM over all-NULL is NULL — which is
 * exactly the signal we want to carry through as "not available".
 */
async function postAggregates(orgId: string, platform: PlatformParam, w: Window, brandId: string | null) {
  const { rows } = await pool.query<PostAgg>(
    `SELECT m.competitor_social_account_id AS account_id, m.platform,
            COUNT(*)::float                 AS posts,
            SUM(m.like_count)::float        AS likes,
            SUM(m.comment_count)::float     AS comments,
            SUM(m.share_count)::float       AS shares,
            SUM(m.view_count)::float        AS views,
            SUM(m.save_count)::float        AS saves
       FROM l2_gold.competitor_post_metric m
       JOIN public.brands b ON b.id = m.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND (${PLAT.replace('{col}', 'm')})
        AND m.post_date_wib::date BETWEEN $3 AND $4
        AND ($5::uuid IS NULL OR m.brand_id = $5)
      GROUP BY 1, 2`,
    [orgId, platform, w.start, w.end, brandId],
  )
  return rows
}

/**
 * A follower count that falls to a fraction of its own peak inside one window is a
 * broken scrape, not churn — aqualume.id went 484081 -> 1041 on both TikTok and
 * Instagram on the same day. Five-fold is deliberately loose: real accounts do lose
 * followers, but not 80% of them in weeks.
 */
const COLLAPSE_RATIO = 5

function buildRow(p: ProfileRow, a: PostAgg | undefined, days: number): CompetitorRow {
  const support = METRIC_SUPPORT[p.platform] ?? METRIC_SUPPORT.instagram
  const posts = a ? Math.round(a.posts) : 0

  // A metric the channel does not publish stays null even when the column holds a
  // zero, so the UI never presents "0 shares on Instagram" as a real observation.
  const pick = (key: keyof typeof support, v: number | null | undefined) =>
    support[key] ? (v ?? null) : null

  const likes    = pick('likes',    a?.likes)
  const comments = pick('comments', a?.comments)
  const shares   = pick('shares',   a?.shares)
  const views    = pick('views',    a?.views)
  const saves    = pick('saves',    a?.saves)
  const followers = p.followers ?? null

  const terms = ENGAGEMENT_TERMS[p.platform] ?? ENGAGEMENT_TERMS.instagram
  const bag: Record<string, number | null> = { likes, comments, shares, saves }
  const interactions = terms.reduce((sum, k) => sum + (bag[k] ?? 0), 0)

  const peak = p.followers_peak ?? null
  const suspect = !!(peak && followers && peak / followers >= COLLAPSE_RATIO)

  // Rates divide by followers, so a collapsed denominator turns them into nonsense
  // (1342% engagement). Withhold the derived numbers, keep the raw counts visible.
  const guard = <T,>(v: T): T | null => (suspect ? null : v)

  return {
    accountId: p.account_id,
    username:  p.username ?? p.account_id,
    avatarUrl: p.avatar_url,
    platform:  p.platform,

    followers,
    followersGrowth: p.growth === null || p.growth === undefined ? null : Math.round(p.growth),
    postCount: posts,
    likes, comments, shares, views, saves,

    avgLikes:    avg(likes, posts),
    avgComments: avg(comments, posts),
    avgShares:   avg(shares, posts),
    avgViews:    avg(views, posts),
    avgSaves:    avg(saves, posts),

    engagementRate:
      guard(followers && posts > 0 ? rate(interactions / posts, followers) : null),
    engagementRateComparable:
      guard(followers && posts > 0 && likes !== null ? rate(likes / posts, followers) : null),

    postsPerWeek: days > 0 ? round1((posts / days) * 7) : 0,
    viewsPerFollower:
      guard(views !== null && followers && posts > 0 ? round2(views / posts / followers) : null),

    engagementBasis: terms,

    followersPeak: peak === null ? null : Math.round(peak),
    suspect,
    suspectReason: suspect
      ? `Follower count fell from ${Math.round(peak!).toLocaleString()} to ${Math.round(followers!).toLocaleString()} inside this window — the collector likely broke, so rates are withheld.`
      : null,
  }
}

export async function getCompetitorCompareData(
  orgId: string,
  platform: PlatformParam,
  days: number,
  brandId: string | null = null,
  custom: CustomRange | null = null,
  t: Translator = (k: string) => k,
): Promise<CompetitorComparePayload> {
  const w = await resolveWindow(orgId, platform, days, brandId, custom)
  if (!w) {
    return {
      rows: [], support: METRIC_SUPPORT, insight: '',
      range: { start: '', end: '', days },
      missingChannels: ['instagram', 'facebook', 'tiktok'], empty: true,
    }
  }

  const [profileRows, postRows] = await Promise.all([
    profiles(orgId, platform, w, brandId),
    postAggregates(orgId, platform, w, brandId),
  ])

  const byKey = new Map(postRows.map(r => [`${r.account_id}|${r.platform}`, r]))
  const rows = profileRows
    .map(p => buildRow(p, byKey.get(`${p.account_id}|${p.platform}`), w.days))
    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))

  const present = new Set(rows.map(r => r.platform))
  const missingChannels = (['instagram', 'facebook', 'tiktok'] as Channel[])
    .filter(c => !present.has(c))

  // Rank on the like-only basis: it is the only one that means the same thing on
  // every channel, so the headline never compares a 4-term rate against a 2-term one.
  const ranked = rows
    .filter(r => r.engagementRateComparable !== null)
    .sort((a, b) => (b.engagementRateComparable ?? 0) - (a.engagementRateComparable ?? 0))

  const insight = ranked[0]
    ? t('{name} leads on likes per follower at {rate}% — the one engagement basis all channels publish.', {
        name: ranked[0].username, rate: String(ranked[0].engagementRateComparable),
      })
    : t('Not enough competitor data in this period to rank engagement.')

  return {
    rows,
    support: METRIC_SUPPORT,
    range: { start: w.start, end: w.end, days: w.days },
    insight,
    missingChannels,
    empty: rows.length === 0,
  }
}
