// Post data for the Visual Analysis slide. Live-only: values come from
// l1_silver.unified_post (via ReportPostContext / postsQuery). No sample/dummy
// fallback — when there is no live pool the slide shows a loading / empty state.
import { groupInt } from './format'

// Ordered by the Content Performance categories (Acquisition → Awareness →
// Engagement → Efficiency). "Impressions/Views" is one combined metric (Facebook
// = impressions, Instagram/TikTok = views). ER is split into Reach/Views/Followers.
// All of them are always offered as options; ones with no data render as 0.
export const POST_METRICS: { id: string; label: string; channels?: string[] }[] = [
  // Kapan post tayang. Nilainya BUKAN angka untuk dibaca — tanggal disimpan
  // sebagai epoch di `values` supaya pengurutan tetap jalan, dan bentuk yang
  // dibaca orang ada di `text`. Tanpa epoch, "Rank by Post Date" akan diam-diam
  // mengurutkan berdasarkan 0.
  { id: 'post_date',     label: 'Post Date' },
  { id: 'post_datetime', label: 'Post Date & Time' },
  { id: 'new_follow', label: 'New Follow' },
  { id: 'reach', label: 'Reach' },
  { id: 'impressions_views', label: 'Impressions/Views' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Comments' },
  { id: 'shares', label: 'Shares' },
  { id: 'saves', label: 'Saved' },
  { id: 'reposts', label: 'Reposts' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'er_reach', label: 'ER Reach' },
  { id: 'er_views', label: 'ER Views' },
  { id: 'er_followers', label: 'ER Followers' },
  // TikTok-only: kolom sumbernya (avg_watch_time, completion_rate) hanya terisi
  // untuk TikTok. Ditawarkan di channel lain hanya akan menghasilkan kartu berisi
  // nol yang menyesatkan, jadi pemilihnya disaring lewat metricsForChannel().
  { id: 'watch_time',      label: 'Avg. Watch Time', channels: ['tiktok'] },
  { id: 'completion_rate', label: 'Completion Rate', channels: ['tiktok'] },
]

/** Metrik yang masuk akal untuk sebuah channel — dipakai pemilih di Visual slide. */
export const metricsForChannel = (channel: string) =>
  POST_METRICS.filter(m => !m.channels || m.channels.includes(channel))

// Kompetitor diukur dari permukaan publiknya, jadi metriknya terbatas pada yang
// benar-benar dipublikasikan platform — dan ketiganya tidak sama. ER tidak ada di
// sini dengan sengaja: menghitungnya butuh jumlah follower saat post tayang, yang
// tidak tersedia per-post untuk kompetitor.
const COMPETITOR_METRICS: Record<string, string[]> = {
  instagram: ['post_date', 'post_datetime', 'likes', 'comments', 'impressions_views', 'engagement'],
  tiktok:    ['post_date', 'post_datetime', 'likes', 'comments', 'shares', 'saves', 'impressions_views', 'engagement'],
}
export const metricsForCompetitor = (channel: string) => {
  const ids = COMPETITOR_METRICS[channel] ?? []
  return POST_METRICS.filter(m => ids.includes(m.id))
}
/** Channel yang punya data visual kompetitor sama sekali (Facebook tidak: tabel
 *  mentahnya tidak menyimpan cover image). */
export const competitorVisualSupported = (channel: string) => channel in COMPETITOR_METRICS

/** Metrik yang nilainya teks (tanggal), bukan angka yang bisa diformat. */
const TEXT_METRIC_IDS = new Set(['post_date', 'post_datetime'])
export const isTextMetric = (id: string) => TEXT_METRIC_IDS.has(id)

// ER metrics render as percentages (and get the ER highlight color in the card).
const ER_METRIC_IDS = new Set(['er_reach', 'er_views', 'er_followers'])
export const isErMetric = (id: string) => ER_METRIC_IDS.has(id)

export const POST_FILTERS: { id: string; label: string }[] = [
  { id: 'top', label: 'Top performing' },
  { id: 'low', label: 'Low performing' },
  { id: 'mixed', label: 'Top & low (mixed)' },
]

export const POST_COUNTS = [4, 6, 8]

export interface PostRow {
  id: number
  tag?: 'TOP' | 'LOW'
  image: string
  format: string   // display label, e.g. 'Reel'
  pillar: string   // display label, e.g. 'Awareness'
  metrics: Record<string, string>   // display-formatted per POST_METRICS id
}

// A candidate post carrying numeric metric values, fetched from
// l1_silver.unified_post. buildPosts filters/ranks/slices these into PostRow.
export interface PostCandidate {
  id: number
  image: string | null
  formatId: string; format: string
  pillarId: string; pillar: string
  values: Record<string, number>   // numeric per POST_METRICS id (er_* are percent numbers)
  /** Bentuk siap-baca untuk metrik yang bukan angka (tanggal). Kalau ada, dipakai
   *  apa adanya; `values` untuk id yang sama hanya dipakai mengurutkan. */
  text?: Record<string, string>
}

// Live candidate pool for a report (brand + month), keyed by channel. Built by
// postsQuery.ts, provided through ReportPostContext, consumed by the Visual slide
// and the PPTX exporter.
export type ReportPostMetrics = Record<string, PostCandidate[]>

function formatBucket(s: string): { id: string; label: string } | null {
  if (s.includes('reel')) return { id: 'reel', label: 'Reel' }
  if (s.includes('carousel')) return { id: 'carousel', label: 'Carousel' }
  if (s.includes('video') || s.includes('motion')) return { id: 'video', label: 'Video' }
  if (s.includes('photo') || s.includes('feed') || s.includes('static') || s.includes('image')) return { id: 'image', label: 'Image' }
  if (s.includes('link')) return { id: 'link', label: 'Link' }
  if (s.includes('story')) return { id: 'story', label: 'Story' }
  return null
}

// Normalize the messy source `format` (photo/Motion/Static/reels/Reels-Tiktok/…)
// into the slide's filter buckets. `format` is an editorial tag from
// l0_extra.*_post_extra_attribute and stays null unless the brand tags its posts,
// so `post` carries the platform's own media type as the fallback — without it
// every API-synced post lands in "Other".
export function normFormat(
  raw?: string | null,
  post?: { postType?: string | null; link?: string | null; durationS?: number | null },
): { id: string; label: string } {
  const s = (raw ?? '').trim().toLowerCase()
  if (s) return formatBucket(s) ?? { id: s, label: (raw ?? '').trim() }
  const pt = (post?.postType ?? '').trim().toLowerCase()
  // Instagram reports a Reel as media_type='VIDEO' — recover it from the
  // permalink or a non-zero runtime, same rule as the Content dashboard.
  if (pt === 'video' && ((post?.link ?? '').includes('/reel/') || (post?.durationS ?? 0) > 0)) {
    return { id: 'reel', label: 'Reel' }
  }
  return (pt ? formatBucket(pt) : null) ?? { id: 'other', label: 'Other' }
}

// Content pillars are brand-specific free text → slug id + verbatim label.
export function normPillar(raw?: string | null): { id: string; label: string } {
  const t = (raw ?? '').trim()
  if (!t) return { id: 'none', label: 'No pillar' }
  return { id: t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), label: t }
}

const fmtValue = (id: string, v: number) =>
  isErMetric(id) || id === 'completion_rate' ? v.toFixed(2) + '%'
  : id === 'watch_time' ? v.toFixed(1) + 's'
  : groupInt(v)

export interface PostOptions {
  format?: string
  pillar?: string
  sortMetric?: string
  source?: PostCandidate[]   // live pool; empty/absent ⇒ no posts (no sample fallback)
}

// Filter (format + pillar) → rank by the chosen metric → apply top/low/mixed → slice.
// Returns [] when there is no live pool — the slide never shows fabricated posts.
export function buildPosts(count: number, filter: string, opts: PostOptions = {}): PostRow[] {
  const cands = opts.source ?? []
  if (!cands.length) return []
  const format = opts.format ?? 'all'
  const pillar = opts.pillar ?? 'all'
  const sortMetric = opts.sortMetric ?? 'engagement'

  let pool = cands
  if (format !== 'all') pool = pool.filter(p => p.formatId === format)
  if (pillar !== 'all') pool = pool.filter(p => p.pillarId === pillar)
  const key = (p: PostCandidate) => p.values[sortMetric] ?? 0
  const sorted = [...pool].sort((a, b) => key(b) - key(a))   // best → worst by chosen metric

  let picked: { cand: PostCandidate; tag?: 'TOP' | 'LOW' }[]
  if (filter === 'low') picked = [...sorted].reverse().slice(0, count).map(cand => ({ cand }))
  else if (filter === 'mixed') {
    const half = Math.ceil(count / 2)
    const top = sorted.slice(0, half)
    const bottom = sorted.slice(half).reverse().slice(0, count - half)   // worst first, no overlap with top
    picked = [
      ...top.map(cand => ({ cand, tag: 'TOP' as const })),
      ...bottom.map(cand => ({ cand, tag: 'LOW' as const })),
    ]
  } else picked = sorted.slice(0, count).map(cand => ({ cand }))

  return picked.map(({ cand, tag }, i) => {
    const metrics: Record<string, string> = {}
    POST_METRICS.forEach(m => {
      // Teks menang untuk metrik tanggal; sisanya diformat dari angkanya.
      metrics[m.id] = cand.text?.[m.id] ?? fmtValue(m.id, cand.values[m.id] ?? 0)
    })
    return { id: i + 1, tag, image: cand.image ?? '', format: cand.format, pillar: cand.pillar, metrics }
  })
}

export const metricLabel = (id: string) => POST_METRICS.find(m => m.id === id)?.label ?? id

// ── metric availability ───────────────────────────────────────────────────────
// Every metric in POST_METRICS is always offered in the Visual slide pickers — a
// metric with no data on the channel still shows and renders as 0 / 0.00%, so the
// user can put it on the card deliberately. `populatedMetricsFor` reports which
// metrics actually carry data; it only drives defaults, never restricts choices.
export function populatedMetricsFor(source: PostCandidate[] | undefined): string[] {
  if (!source || !source.length) return []
  return POST_METRICS.filter(m => source.some(p => (p.values[m.id] ?? 0) > 0)).map(m => m.id)
    // Tanggal selalu ada isinya, tapi jangan pernah jadi default kartu — orang
    // memilih Visual Content untuk melihat performa, bukan tanggal.
    .filter(id => !isTextMetric(id))
}

const isKnownMetric = (id: string) => POST_METRICS.some(m => m.id === id)

// Ranking metric: an explicit pick is honoured as-is, even when it has no data on
// this channel. Only an unset (or retired) pick falls back to a populated metric.
export function effectiveSortMetric(metric: string | undefined, populated: string[]): string {
  if (metric && isKnownMetric(metric)) return metric
  if (populated.includes('engagement')) return 'engagement'
  return populated[0] ?? 'engagement'
}

// Which metrics show on the card — every pick is honoured, empty ones included.
// With nothing picked, default to the first few metrics that do carry data. Order
// ALWAYS follows the canonical POST_METRICS sequence (Acquisition → Awareness →
// Engagement → Efficiency), NOT the order the user clicked them.
export function effectiveShownMetrics(selected: string[], populated: string[]): string[] {
  const sel = new Set(selected)
  const shown = POST_METRICS.filter(m => sel.has(m.id)).map(m => m.id)
  return shown.length ? shown : populated.slice(0, 3)
}

// Distinct format/pillar ids present in a pool — the valid filter values.
export function availableFilterIds(source: PostCandidate[] | undefined, key: 'formatId' | 'pillarId'): string[] {
  if (!source || !source.length) return []
  return [...new Set(source.map(p => p[key]))]
}

// Resolve a saved format/pillar filter against a brand's actual data: keep it if
// the brand has that value, else fall back to 'all'. Lets a template's brand-
// specific filter apply cleanly to a different brand.
export function effectiveFilterId(selected: string | undefined, availableIds: string[]): string {
  const v = selected ?? 'all'
  return v === 'all' || availableIds.includes(v) ? v : 'all'
}
