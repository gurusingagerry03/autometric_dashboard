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
import type { DashPlatform } from '@/components/dashboard/data'
import {
  AGE_BUCKETS, SOURCE_FROM_DB, blockFrom,
  type AudienceSource, type ChannelDemographics, type ChannelSentimentSummary,
  type CloudWord, type DemographicPeriod, type ReportAudienceMetrics,
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
  const next = addMonths(year, month, 1)
  const nextStart = monthStart(next.year, next.month)

  const [sentiment, words, demo] = await Promise.all([
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
      [orgId, brandId, prevStart, nextStart],
    ),
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
    if (current || previous) demographics[p] = { current, previous }
  }

  return {
    meta: {
      year, month,
      monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      prevMonthLabel: `${MONTH_NAMES[prev.month - 1]} ${prev.year}`,
    },
    sentiment: sentimentByChannel,
    words: wordsByChannel,
    demographics,
  }
}
