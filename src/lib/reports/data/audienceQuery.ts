// Server-side data for the report's Audience Sentiment & Audience Demographic
// slides. Sibling of chartQuery.ts / metricsQuery.ts: one round of parallel
// queries per report (brand + month), shaped into the client-safe types in
// audienceTypes.ts.
//
// SOURCES
//   l2_gold.v_audience_sentiment_mom     sentiment counts + the previous month,
//                                        already paired by the warehouse view
//   l2_gold.comment_wordcloud_sentiment  words + frequency + sentiment, per month
//   l2_gold.audience_demographics_daily  daily age/gender snapshots
//
// BRAND KEY — THE TRAP THAT COSTS AN AFTERNOON
//   `brand_id` does NOT mean the same thing in these three tables:
//     v_audience_sentiment_mom      brand_id = public.brands.id
//     comment_wordcloud_sentiment   brand_id = public.brands.id
//     audience_demographics_daily   brand_id = public.brand_social_accounts.social_account_id
//   Verified 9 Sep 2026 by joining each table both ways: the first two match
//   brands and never accounts; the third matches accounts and never brands.
//   Using the wrong one returns ZERO ROWS with no error — an empty slide that
//   looks exactly like "this brand has no data".
import pool from '@/lib/db'
import { imageKey, isStoredImage } from '../images/keys'
import type { DashPlatform } from '@/components/dashboard/data'
import {
  AGE_BUCKETS, SOURCE_FROM_DB, blockFrom,
  type AudienceSource, type ChannelDemographics, type ChannelSentimentSummary,
  type CloudWord, type DemographicPeriod, type ReportAudienceMetrics,
  type ChannelTagged, TAGGED_TOP_MAX,
  type SentimentCounts, type SentimentKey,
} from './audienceTypes'

const PLATFORMS: DashPlatform[] = ['instagram', 'facebook', 'tiktok']
const PLATFORM_LIST = `('instagram','facebook','tiktok')`

/** Top-N words kept per platform — the source holds hundreds of tokens. */
const WORDCLOUD_MAX = 60

/** Warehouse age columns, in the same order as AGE_BUCKETS. */
const AGE_COLUMNS = [
  'age_13_17', 'age_18_24', 'age_25_34', 'age_35_44', 'age_45_54', 'age_55_64', 'age_65_plus',
] as const

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** First day of a month as 'YYYY-MM-DD' — passed as text so no JS Date, and so
 *  no timezone can shift the month boundary by a day. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

interface SentimentRow {
  platform: string
  source_type: string
  pos: number; neu: number; neg: number
  prev_pos: number; prev_neu: number; prev_neg: number
}
interface WordRow { platform: string; word: string; sentiment: string; frequency: number }
interface DemoRow { platform: string; mon: string; [col: string]: string | number }

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0

const counts = (p: number, n: number, g: number): SentimentCounts =>
  ({ positive: num(p), neutral: num(n), negative: num(g) })

/**
 * Everything the two audience slides need, for one brand + report month.
 *
 * Each of the three families is independent, so one empty family never blanks the
 * others: a brand with demographics but no scored comments still gets a working
 * demographic slide.
 */
export async function getReportAudienceMetrics(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportAudienceMetrics> {
  const prev = addMonths(year, month, -1)
  const curStart = monthStart(year, month)
  const prevStart = monthStart(prev.year, prev.month)
  // Demografi diambil tiga bulan (opsi "Last 3 months" di slide demografi).
  const prev2 = addMonths(year, month, -2)
  const prev2Start = monthStart(prev2.year, prev2.month)
  const next = addMonths(year, month, 1)
  const nextStart = monthStart(next.year, next.month)

  const [sentiment, words, demo, taggedCounts, taggedTop] = await Promise.all([
    // Sentiment for the report month, with the previous month already attached by
    // the view. Only the two AUDIENCE sources — `post_caption` is the brand's own
    // copy and is deliberately excluded (see audienceTypes.ts).
    pool.query<SentimentRow>(
      `SELECT m.platform, m.source_type,
              m.positive_count pos, m.neutral_count neu, m.negative_count neg,
              m.prev_positive_count prev_pos, m.prev_neutral_count prev_neu, m.prev_negative_count prev_neg
         FROM l2_gold.v_audience_sentiment_mom m
         JOIN public.brands b ON b.id = m.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1 AND m.brand_id = $2
          AND m.period_month = $3::date
          AND m.source_type IN ('comment','tagged_post_caption')
          AND m.platform IN ${PLATFORM_LIST}`,
      [orgId, brandId, curStart],
    ),
    // Word cloud for the report month. Ranked in SQL and cut per platform, so a
    // brand with thousands of tokens does not ship them all to the browser.
    pool.query<WordRow>(
      `SELECT platform, word, sentiment, frequency FROM (
         SELECT w.platform, w.word, w.sentiment_label sentiment, w.frequency,
                row_number() OVER (PARTITION BY w.platform ORDER BY w.frequency DESC, w.word) rn
           FROM l2_gold.comment_wordcloud_sentiment w
           JOIN public.brands b ON b.id = w.brand_id AND b.deleted_at IS NULL
          WHERE b.organization_id = $1 AND w.brand_id = $2
            AND w.period_month = $3::date
            AND w.platform IN ${PLATFORM_LIST}
            AND btrim(w.word) <> ''
       ) t
       WHERE rn <= $4`,
      [orgId, brandId, curStart, WORDCLOUD_MAX],
    ),
    // Demographics: the LAST snapshot of each month, per platform.
    //
    // Last snapshot, not an average of the month's days: age & gender are a
    // standing state of the follower base, not a flow. Averaging 30 daily
    // snapshots answers a question nobody asked, while the final one answers
    // "who follows this brand at the end of the month" — which is what a
    // month-over-month comparison is about.
    pool.query<DemoRow>(
      `WITH acct AS (
         SELECT bsa.social_account_id AS sid
           FROM public.brand_social_accounts bsa
           JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
          WHERE b.organization_id = $1 AND bsa.brand_id = $2
       ),
       snap AS (
         SELECT u.platform, date_trunc('month', u.audience_date)::date mon, max(u.audience_date) last_date
           FROM l2_gold.audience_demographics_daily u
           JOIN acct ON acct.sid = u.brand_id
          WHERE u.audience_type = 'follower_demographics'
            AND u.audience_date >= $3::date AND u.audience_date < $4::date
            AND u.platform IN ${PLATFORM_LIST}
          GROUP BY 1, 2
       )
       SELECT u.platform, to_char(s.mon, 'YYYY-MM') mon,
              ${AGE_COLUMNS.map(c => `COALESCE(SUM(u.${c}),0)::float "${c}"`).join(', ')},
              COALESCE(SUM(u.gender_female),0)::float gender_female,
              COALESCE(SUM(u.gender_male),0)::float   gender_male
         FROM l2_gold.audience_demographics_daily u
         JOIN acct ON acct.sid = u.brand_id
         JOIN snap s ON s.platform = u.platform AND s.last_date = u.audience_date
        WHERE u.audience_type = 'follower_demographics'
        GROUP BY 1, 2`,
      [orgId, brandId, prev2Start, nextStart],
    ),
    // Tagged posts (UGC): jumlah post & pengguna bulan report vs bulan lalu, dan
    // post dengan engagement tertinggi. Gold menyimpan baris ganda per post (satu
    // post muncul 2× untuk sebagian brand), jadi dihitung per post_id unik. Kalau
    // query ini gagal, slide lain tetap jalan — tagged post jadi kosong saja.
    pool.query<{ platform: DashPlatform; cur: boolean; posts: number; users: number }>(
      `SELECT platform, (d >= $3::date) cur, COUNT(*)::int posts, COUNT(DISTINCT lower(username))::int users
         FROM (
           SELECT DISTINCT ON (g.platform, g.post_id) g.platform, g.post_id, g.username, g.post_date::date d
             FROM l2_gold.ugc_tagged_posts g
             JOIN public.brands b ON b.id = g.brand_id AND b.deleted_at IS NULL
            WHERE b.organization_id = $1 AND g.brand_id = $2
              AND g.post_date::date >= $4::date AND g.post_date::date < $5::date
            ORDER BY g.platform, g.post_id
         ) t
        GROUP BY 1, 2`,
      [orgId, brandId, curStart, prevStart, nextStart],
    ).catch(err => { console.error('[report] tagged counts failed:', err); return { rows: [] } }),
    pool.query<{ platform: DashPlatform; post_id: string; username: string | null; d: string; likes: number; comments: number; eng: number; link: string | null; image: string | null }>(
      `SELECT platform, post_id, username, d, likes, comments, eng, link, image FROM (
         SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t.platform ORDER BY t.eng DESC, t.post_id) rn
           FROM (
             SELECT DISTINCT ON (g.platform, g.post_id) g.platform, g.post_id, g.username,
                    to_char(g.post_date::date, 'YYYY-MM-DD') d,
                    COALESCE(g.like_count,0)::float likes, COALESCE(g.comment_count,0)::float comments,
                    COALESCE(g.total_engagement, COALESCE(g.like_count,0) + COALESCE(g.comment_count,0))::float eng,
                    g.link_post link
               FROM l2_gold.ugc_tagged_posts g
               JOIN public.brands b ON b.id = g.brand_id AND b.deleted_at IS NULL
              WHERE b.organization_id = $1 AND g.brand_id = $2
                AND g.post_date::date >= $3::date AND g.post_date::date < $4::date
              ORDER BY g.platform, g.post_id
           ) t
       ) ranked
       LEFT JOIN LATERAL (
         SELECT COALESCE(ri.image_url, x.cover_image) image FROM (
           SELECT cover_image, fetched_at FROM l0_raw.ig_tagged_posts WHERE ranked.platform = 'instagram' AND media_id = ranked.post_id
           UNION ALL SELECT cover_image, fetched_at FROM l0_raw.tt_tagged_posts WHERE ranked.platform = 'tiktok' AND media_id = ranked.post_id
           UNION ALL SELECT cover_image, fetched_at FROM l0_raw.fb_tagged_posts WHERE ranked.platform = 'facebook' AND media_id = ranked.post_id
         ) x
         LEFT JOIN report_post_images ri ON ri.platform = ranked.platform AND ri.post_id = ranked.post_id
         ORDER BY x.fetched_at DESC NULLS LAST LIMIT 1
       ) img ON true
       WHERE rn <= $5
       ORDER BY platform, eng DESC`,
      [orgId, brandId, curStart, nextStart, TAGGED_TOP_MAX],
    ).catch(err => { console.error('[report] tagged top failed:', err); return { rows: [] } }),
  ])

  /* ── sentiment ─────────────────────────────────────────────────────────── */
  const sentimentByChannel: Partial<Record<DashPlatform, ChannelSentimentSummary>> = {}
  for (const p of PLATFORMS) {
    const rows = sentiment.rows.filter(r => r.platform === p)
    if (rows.length === 0) continue

    const bySource: Partial<Record<AudienceSource, ReturnType<typeof blockFrom>>> = {}
    const curAll: SentimentCounts = { positive: 0, neutral: 0, negative: 0 }
    const prevAll: SentimentCounts = { positive: 0, neutral: 0, negative: 0 }

    for (const r of rows) {
      const src = SOURCE_FROM_DB[r.source_type]
      if (!src) continue
      const cur = counts(r.pos, r.neu, r.neg)
      const pre = counts(r.prev_pos, r.prev_neu, r.prev_neg)
      bySource[src] = blockFrom(cur, pre)
      curAll.positive += cur.positive; curAll.neutral += cur.neutral; curAll.negative += cur.negative
      prevAll.positive += pre.positive; prevAll.neutral += pre.neutral; prevAll.negative += pre.negative
    }
    if (Object.keys(bySource).length === 0) continue
    sentimentByChannel[p] = { combined: blockFrom(curAll, prevAll), bySource }
  }

  /* ── word cloud ────────────────────────────────────────────────────────── */
  const wordsByChannel: Partial<Record<DashPlatform, CloudWord[]>> = {}
  for (const p of PLATFORMS) {
    const list = words.rows
      .filter(r => r.platform === p)
      .map(r => ({
        word: r.word,
        // Anything the model did not label positive/negative is treated as
        // neutral rather than dropped — a word with an unexpected label is still
        // a word the audience used.
        sentiment: (r.sentiment === 'positive' || r.sentiment === 'negative'
          ? r.sentiment : 'neutral') as SentimentKey,
        frequency: num(r.frequency),
      }))
      .filter(w => w.frequency > 0)
    if (list.length) wordsByChannel[p] = list
  }

  /* ── demographics ──────────────────────────────────────────────────────── */
  const curMon = `${year}-${String(month).padStart(2, '0')}`
  const prevMon = `${prev.year}-${String(prev.month).padStart(2, '0')}`
  const prev2Mon = `${prev2.year}-${String(prev2.month).padStart(2, '0')}`

  const toPeriod = (row: DemoRow | undefined): DemographicPeriod | null => {
    if (!row) return null
    const raw = AGE_COLUMNS.map(c => num(row[c]))
    const ageTotal = raw.reduce((s, v) => s + v, 0)
    const female = num(row.gender_female)
    const male = num(row.gender_male)
    const genderTotal = female + male
    if (ageTotal <= 0 && genderTotal <= 0) return null
    // Normalised to 100 exactly as the Audience dashboard does, so the same brand
    // reads the same on both surfaces. The stored values are already shares for
    // every brand seen so far; normalising also makes headcount sources work.
    const age: Record<string, number> = {}
    AGE_BUCKETS.forEach((bucket, i) => {
      age[bucket] = ageTotal > 0 ? +((raw[i] / ageTotal) * 100).toFixed(1) : 0
    })
    return {
      age,
      female: genderTotal > 0 ? +((female / genderTotal) * 100).toFixed(1) : 0,
      male: genderTotal > 0 ? +((male / genderTotal) * 100).toFixed(1) : 0,
    }
  }

  const demographics: Partial<Record<DashPlatform, ChannelDemographics>> = {}
  for (const p of PLATFORMS) {
    const rows = demo.rows.filter(r => r.platform === p)
    const current = toPeriod(rows.find(r => r.mon === curMon))
    const previous = toPeriod(rows.find(r => r.mon === prevMon))
    const older = toPeriod(rows.find(r => r.mon === prev2Mon))
    if (current || previous || older) demographics[p] = { current, previous, history: [older, previous, current] }
  }

  /* ── tagged posts ──────────────────────────────────────────────────────── */
  const tagged: Partial<Record<DashPlatform, ChannelTagged>> = {}
  for (const p of PLATFORMS) {
    const cnt = taggedCounts.rows.filter(r => r.platform === p)
    const top = taggedTop.rows.filter(r => r.platform === p)
    if (cnt.length === 0 && top.length === 0) continue
    const pick = (cur: boolean) => {
      const r = cnt.find(x => x.cur === cur)
      return { posts: num(r?.posts), users: num(r?.users) }
    }
    tagged[p] = {
      current: pick(true),
      previous: pick(false),
      top: top.map(r => ({
        postId: r.post_id, platform: p, username: (r.username ?? '').replace(/^@/, '') || 'unknown',
        date: r.d, likes: num(r.likes), comments: num(r.comments), engagement: num(r.eng),
        link: r.link, image: r.image,
        imageKey: isStoredImage(r.image) ? undefined : imageKey('t', p, r.post_id),
      })),
    }
  }

  return {
    meta: {
      year, month,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      prevMonthLabel: `${MONTH_NAMES[prev.month - 1]} ${prev.year}`,
      last3Labels: [prev2, prev, { year, month }].map(x => `${MONTH_NAMES[x.month - 1]} ${x.year}`),
    },
    sentiment: sentimentByChannel,
    words: wordsByChannel,
    demographics,
    tagged,
  }
}
