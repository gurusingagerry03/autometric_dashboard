// Types + pure helpers for the report's Audience Sentiment & Audience Demographic
// slides. Client-safe (no server imports), mirroring how chartTypes.ts pairs with
// the server-side chartQuery.ts.
//
// WHAT COUNTS AS "AUDIENCE"
//   l2_gold.audience_sentiment_monthly carries three source_type values:
//   `comment`, `tagged_post_caption`, and `post_caption`. Only the first two are
//   the audience talking — `post_caption` is the BRAND's own copy, and folding it
//   in would let the brand's own tone inflate its audience-sentiment score. It is
//   deliberately not read here.
import type { DashPlatform } from '@/components/dashboard/data'
import type { SentimentKey } from './chartTypes'

export type { SentimentKey } from './chartTypes'

/** The two audience-voiced sources, in the order they are shown. */
export const AUDIENCE_SOURCES = ['comment', 'tagged_post'] as const
export type AudienceSource = (typeof AUDIENCE_SOURCES)[number]

/** `source_type` in the warehouse → the id used here. */
export const SOURCE_FROM_DB: Record<string, AudienceSource> = {
  comment: 'comment',
  tagged_post_caption: 'tagged_post',
}

export const SOURCE_LABEL: Record<AudienceSource, string> = {
  comment: 'Comments',
  tagged_post: 'Tagged Posts',
}

/** Slide-level source choice: both together, or one on its own. */
export type SourceFilter = 'all' | AudienceSource

export const SENTIMENT_KEYS: SentimentKey[] = ['positive', 'neutral', 'negative']

export const SENTIMENT_LABEL: Record<SentimentKey, string> = {
  positive: 'Positive', neutral: 'Neutral', negative: 'Negative',
}

/** Slide colours for the three sentiments (same hues the chart legend uses). */
export const SENTIMENT_COLOR: Record<SentimentKey, string> = {
  positive: '#22c55e', neutral: '#94a3b8', negative: '#ef4444',
}

export type SentimentCounts = Record<SentimentKey, number>

const zero = (): SentimentCounts => ({ positive: 0, neutral: 0, negative: 0 })

export interface SentimentPeriod {
  /** Absolute number of scored items in the period. */
  total: number
  counts: SentimentCounts
  /** Each sentiment's share of `total`, in percent. */
  share: SentimentCounts
}

export interface SentimentBlock {
  current: SentimentPeriod
  previous: SentimentPeriod
  /**
   * Change in SHARE between the two months, in percentage POINTS.
   *
   * Points, not percent-of-percent: "negative went from 12% to 15%" is +3pp, and
   * calling that "+25%" is the classic way a sentiment slide gets misread in a
   * client meeting. Every delta on these slides carries the `pp` unit for the
   * same reason.
   */
  shareChange: SentimentCounts
}

/** Sentiment for one channel: both sources together, plus each on its own. */
export interface ChannelSentimentSummary {
  combined: SentimentBlock
  bySource: Partial<Record<AudienceSource, SentimentBlock>>
}

export interface CloudWord { word: string; sentiment: SentimentKey; frequency: number }

/* ── demographics ─────────────────────────────────────────────────────────── */

export const AGE_BUCKETS = ['13–17', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]

/**
 * Rows to draw for one platform as [label, key into DemographicPeriod.age].
 * TikTok has no 13–17 bucket and one open-ended "55+", which the sync stores in
 * age_65_plus (55–64 stays empty) — so it shows 5 rows, the last relabelled.
 * Same rule as the Audience dashboard (lib/dashboard/audience.ts).
 */
export function ageBucketsFor(platform: string): [label: string, key: AgeBucket][] {
  if (platform === 'tiktok') {
    return [['18–24', '18–24'], ['25–34', '25–34'], ['35–44', '35–44'], ['45–54', '45–54'], ['55+', '65+']]
  }
  return AGE_BUCKETS.map(b => [b, b])
}

export interface DemographicPeriod {
  /** Share per age bucket, normalised to 100 across the buckets. */
  age: Record<string, number>
  /** Female / male share of the two combined, in percent. */
  female: number
  male: number
}

export interface ChannelDemographics {
  current: DemographicPeriod | null
  previous: DemographicPeriod | null
  /**
   * Tiga bulan terakhir s.d. bulan report, lama → baru (Post-UAT: "compare last 3
   * month seperti apa pergerakan audience nya"). Bulan tanpa snapshot = null —
   * snapshot demografi tidak bisa diisi mundur. Opsional untuk payload lama.
   */
  history?: (DemographicPeriod | null)[]
}

/* ── payload ──────────────────────────────────────────────────────────────── */

export interface AudienceMeta {
  year: number
  month: number            // 1-based
  monthLabel: string       // 'July 2026'
  prevMonthLabel: string   // 'June 2026'
  /** Label tiga bulan ChannelDemographics.history, lama → baru: ['May 2026', 'June 2026', 'July 2026']. */
  last3Labels?: string[]
}

export interface ReportAudienceMetrics {
  meta: AudienceMeta
  sentiment: Partial<Record<DashPlatform, ChannelSentimentSummary>>
  words: Partial<Record<DashPlatform, CloudWord[]>>
  demographics: Partial<Record<DashPlatform, ChannelDemographics>>
  /** Tagged post (UGC) per platform. Opsional: payload lama tidak punya. */
  tagged?: Partial<Record<DashPlatform, ChannelTagged>>
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

const PLATFORMS: DashPlatform[] = ['instagram', 'facebook', 'tiktok']

const share = (counts: SentimentCounts, total: number): SentimentCounts =>
  total > 0
    ? {
        positive: +((counts.positive / total) * 100).toFixed(1),
        neutral: +((counts.neutral / total) * 100).toFixed(1),
        negative: +((counts.negative / total) * 100).toFixed(1),
      }
    : zero()

/** Rebuild a period from raw counts so `total` and `share` can never drift apart. */
export function periodFrom(counts: SentimentCounts): SentimentPeriod {
  const total = counts.positive + counts.neutral + counts.negative
  return { total, counts, share: share(counts, total) }
}

export function blockFrom(current: SentimentCounts, previous: SentimentCounts): SentimentBlock {
  const cur = periodFrom(current)
  const prev = periodFrom(previous)
  return {
    current: cur,
    previous: prev,
    shareChange: {
      positive: +(cur.share.positive - prev.share.positive).toFixed(1),
      neutral: +(cur.share.neutral - prev.share.neutral).toFixed(1),
      negative: +(cur.share.negative - prev.share.negative).toFixed(1),
    },
  }
}

const addInto = (a: SentimentCounts, b: SentimentCounts | undefined) => {
  if (!b) return a
  a.positive += b.positive; a.neutral += b.neutral; a.negative += b.negative
  return a
}

/** Which platforms this payload actually has sentiment for. */
export function sentimentPlatforms(m: ReportAudienceMetrics | null | undefined): DashPlatform[] {
  return PLATFORMS.filter(p => m?.sentiment?.[p])
}

/** Which platforms this payload actually has demographics for. */
export function demographicPlatforms(m: ReportAudienceMetrics | null | undefined): DashPlatform[] {
  return PLATFORMS.filter(p => m?.demographics?.[p]?.current)
}

/**
 * Sentiment for a channel + source choice, or null when there is nothing to show.
 *
 * `channel` of 'all' SUMS the platforms rather than averaging them: these are
 * counts of real comments, so adding them is the honest roll-up, and the shares
 * are then recomputed from the summed counts — averaging three platforms' shares
 * would weigh a 19-comment month the same as a 739-comment one.
 */
export function sentimentFor(
  m: ReportAudienceMetrics | null | undefined,
  channel: string,
  source: SourceFilter = 'all',
): SentimentBlock | null {
  const platforms = channel === 'all' ? sentimentPlatforms(m) : [channel as DashPlatform]
  if (platforms.length === 0) return null

  const cur = zero()
  const prev = zero()
  let found = false
  for (const p of platforms) {
    const entry = m?.sentiment?.[p]
    if (!entry) continue
    const block = source === 'all' ? entry.combined : entry.bySource[source]
    if (!block) continue
    found = true
    addInto(cur, block.current.counts)
    addInto(prev, block.previous.counts)
  }
  if (!found) return null
  return blockFrom(cur, prev)
}

/** Per-source totals for a channel — the traceability line under the headline. */
export function sourceBreakdown(
  m: ReportAudienceMetrics | null | undefined,
  channel: string,
): { source: AudienceSource; total: number }[] {
  return AUDIENCE_SOURCES.map(s => ({ source: s, total: sentimentFor(m, channel, s)?.current.total ?? 0 }))
    .filter(x => x.total > 0)
}

export interface SentimentShift { sentiment: SentimentKey; change: number }

/**
 * The sentiment that moved most between the two months — the "highlight
 * perubahan sentiment terbesar" the brief asks for.
 *
 * Returns null when nothing moved (all three at 0.0pp), because a highlight
 * pointing at a non-event is worse than no highlight: it invites the reader to
 * find meaning in rounding.
 */
export function biggestShift(block: SentimentBlock | null | undefined): SentimentShift | null {
  if (!block) return null
  let best: SentimentShift | null = null
  for (const k of SENTIMENT_KEYS) {
    const change = block.shareChange[k]
    if (Math.abs(change) < 0.05) continue
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { sentiment: k, change }
  }
  return best
}

/** Word-cloud words for a channel, optionally narrowed to one sentiment. */
export function audienceWordsFor(
  m: ReportAudienceMetrics | null | undefined,
  channel: string,
  sentiment?: string,
): CloudWord[] {
  const platforms = channel === 'all' ? PLATFORMS : [channel as DashPlatform]
  // Across platforms the same word appears more than once; merge on the word and
  // keep the sentiment of its heaviest occurrence, so the cloud has one entry per
  // word instead of three overlapping copies at different sizes.
  const merged = new Map<string, CloudWord>()
  const heaviest = new Map<string, number>()   // frequency of the entry that set the sentiment
  for (const p of platforms) {
    for (const w of m?.words?.[p] ?? []) {
      const prev = merged.get(w.word)
      if (!prev) { merged.set(w.word, { ...w }); heaviest.set(w.word, w.frequency); continue }
      prev.frequency += w.frequency
      if (w.frequency > (heaviest.get(w.word) ?? 0)) {
        prev.sentiment = w.sentiment
        heaviest.set(w.word, w.frequency)
      }
    }
  }
  const all = [...merged.values()].sort((a, b) => b.frequency - a.frequency)
  return !sentiment || sentiment === 'all' ? all : all.filter(w => w.sentiment === sentiment)
}

/** Demographics for one platform, or null when that platform has none. */
export function demographicsFor(
  m: ReportAudienceMetrics | null | undefined,
  platform: DashPlatform,
): ChannelDemographics | null {
  const d = m?.demographics?.[platform]
  return d?.current ? d : null
}

/**
 * The platforms a demographic slide should draw.
 *
 * 'all' means every platform that HAS demographics — the brief's "seluruh
 * platform yang tersedia dalam report". A platform with no rows is left out
 * rather than drawn empty.
 */
export function demographicChannels(
  m: ReportAudienceMetrics | null | undefined,
  channel: string,
): DashPlatform[] {
  const available = demographicPlatforms(m)
  if (channel === 'all') return available
  return available.filter(p => p === channel)
}

/**
 * Judul blok demografi (Post-UAT brief "Audience Demographics Slide").
 *
 * "September 2026 vs August 2026" hanya ditulis kalau minimal satu panel memang
 * punya data bulan pembanding. Snapshot demografi baru dikumpulkan sejak
 * September 2026 untuk hampir semua brand dan API platform hanya memberi kondisi
 * saat ini — bulan sebelumnya tidak bisa diisi mundur. Menulis "vs August" di
 * atas kolom pertumbuhan yang semuanya "—" membuat pembaca mengira datanya
 * hilang; judul ini menyebutnya terus terang.
 */
export function demographicHeading(
  m: ReportAudienceMetrics | null | undefined,
  channels: DashPlatform[],
): { cur: string; prev: string; hasPrevious: boolean } {
  const cur = m?.meta.monthLabel ?? '—'
  const prev = m?.meta.prevMonthLabel ?? '—'
  const hasPrevious = channels.some(p => !!demographicsFor(m, p)?.previous)
  return { cur, prev, hasPrevious }
}

/** Pilihan pembanding slide demografi: bulan lalu (bawaan) atau tiga bulan terakhir. */
export type DemographicRange = 'mom' | 'last3'

/** 'July 2026' → 'Jul' */
export const shortMonth = (label: string) => label.slice(0, 3)

/**
 * Bulan-bulan riwayat 3 bulan yang berdata untuk satu platform, dengan labelnya.
 * Bulan tanpa snapshot dibuang dari gambar (bukan digambar nol).
 */
export function demographicHistory(
  m: ReportAudienceMetrics | null | undefined, platform: DashPlatform,
): { label: string; idx: number; period: DemographicPeriod }[] {
  const d = m?.demographics?.[platform]
  const labels = m?.meta.last3Labels ?? []
  const hist = d?.history ?? (d ? [null, d.previous, d.current] : [])
  const out: { label: string; idx: number; period: DemographicPeriod }[] = []
  hist.forEach((p, i) => { if (p) out.push({ label: labels[i] ?? '', idx: i, period: p }) })
  return out
}

/* ── tagged posts (slide Tagged Posts) ────────────────────────────────────────
 * Post orang lain yang menandai brand (UGC), dari l2_gold.ugc_tagged_posts —
 * sumber yang sama dengan bagian UGC Tagged Posts di dashboard Audience. Post-UAT
 * least priority: slide-nya bukan hanya angka, tapi juga memperlihatkan post-nya.
 */
export interface TaggedPost {
  postId: string
  platform: DashPlatform
  /** Tanpa '@'. */
  username: string
  /** YYYY-MM-DD */
  date: string
  likes: number
  comments: number
  engagement: number
  link: string | null
  /** Cover dari l0_raw.*_tagged_posts — kebanyakan sudah di Cloudinary. */
  image: string | null
  /** Kunci resolver gambar report ('t:<platform>:<post_id>') — hanya kalau cover
   *  belum tersimpan permanen di Cloudinary. */
  imageKey?: string
}
export interface TaggedCounts { posts: number; users: number }
export interface ChannelTagged {
  current: TaggedCounts
  previous: TaggedCounts
  /** Post bulan report, engagement tertinggi dulu (maks. TAGGED_TOP_MAX). */
  top: TaggedPost[]
}
/** Jumlah kartu post yang bisa dipilih di slide Tagged Posts. */
export const TAGGED_COUNTS = [3, 4, 5] as const
export const TAGGED_TOP_MAX = 5

/**
 * Data tagged post untuk channel slide. 'all' menjumlahkan semua platform: jumlah
 * post dijumlah, jumlah pengguna juga (akun yang sama di dua platform terhitung
 * dua — handle-nya memang tidak bisa dicocokkan lintas platform).
 */
export function taggedFor(m: ReportAudienceMetrics | null | undefined, channel: string): ChannelTagged | null {
  const all = m?.tagged
  if (!all) return null
  const list = channel === 'all'
    ? Object.values(all).filter((x): x is ChannelTagged => !!x)
    : all[channel as DashPlatform] ? [all[channel as DashPlatform]!] : []
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const sum = (k: 'current' | 'previous') => list.reduce(
    (a, x) => ({ posts: a.posts + x[k].posts, users: a.users + x[k].users }), { posts: 0, users: 0 })
  return {
    current: sum('current'),
    previous: sum('previous'),
    top: list.flatMap(x => x.top).sort((a, b) => b.engagement - a.engagement).slice(0, TAGGED_TOP_MAX),
  }
}

/** Perubahan vs bulan lalu untuk kartu angka: "+50%", "0%", atau null (tanpa pembanding). */
export function taggedChange(cur: number, prev: number): string | null {
  if (prev <= 0) return cur > 0 ? null : '0%'
  const d = ((cur - prev) / prev) * 100
  const r = Math.round(d)
  return `${r > 0 ? '+' : ''}${r}%`
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-07-31' → '31 Jul 2026' (sama dengan contoh di brief). */
export function fmtTaggedDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${Number(day)} ${MON3[Number(m) - 1] ?? m} ${y}`
}
