// Post data for the Visual Analysis slide. Live-only: values come from
// l1_silver.unified_post (via ReportPostContext / postsQuery). No sample/dummy
// fallback — when there is no live pool the slide shows a loading / empty state.
import { fmtPct, compactNum, groupInt, shortMetricLabel } from './format'
import { isStoredImage } from '../images/keys'

// Ordered by the Content Performance categories (Acquisition → Awareness →
// Engagement → Efficiency). "Impressions/Views" is one combined metric (Facebook
// = impressions, Instagram/TikTok = views). ER is split into Reach/Views/Followers.
// All of them are always offered as options; ones with no data render as 0.
export const POST_METRICS: { id: string; label: string; channels?: string[]; activityOnly?: boolean }[] = [
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

  // Hanya untuk slide Activity Performance. Sumbernya kolom activity di
  // l0_extra.<platform>_post_extra_attribute, yang diisi manual lewat Edit post
  // di tab Content Pillars — bukan hasil sync. `activityOnly` menjauhkannya dari
  // pemilih Visual Analysis: di sana ketujuhnya akan kosong untuk hampir semua
  // post, dan kartu berisi '—' bukan pilihan yang pantas ditawarkan.
  { id: 'activity_name',   label: 'Activity Name',   activityOnly: true },
  { id: 'activity_type',   label: 'Activity Type',   activityOnly: true },
  { id: 'submission',      label: 'Submission',      activityOnly: true },
  { id: 'participant',     label: 'Participant',     activityOnly: true },
  { id: 'activity_period', label: 'Activity Period', activityOnly: true },
]

/**
 * Metrik slide Activity Performance, DALAM URUTAN INI.
 *
 * Urutannya tidak mengikuti POST_METRICS karena bacaannya lain: kartu activity
 * dibaca sebagai "apa acaranya, jenisnya, hasilnya berapa, kapan" — identitas
 * dulu, angka, baru waktu. Dua di antaranya (New Follow, Post Date) metrik post
 * biasa yang dipakai ulang, jadi tidak ber-`activityOnly`.
 */
export const ACTIVITY_METRIC_IDS = [
  'activity_name', 'activity_type', 'submission', 'participant',
  'new_follow', 'activity_period', 'post_date',
] as const

export const metricsForActivity = () =>
  ACTIVITY_METRIC_IDS.map(id => POST_METRICS.find(m => m.id === id)!).filter(Boolean)

/** Metrik yang masuk akal untuk sebuah channel — dipakai pemilih di Visual slide. */
export const metricsForChannel = (channel: string) =>
  POST_METRICS.filter(m => !m.activityOnly && (!m.channels || m.channels.includes(channel)))

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

/** Bentuk minimal `ReportCompetitorPosts` yang dibutuhkan pemilih di bawah. Ditulis
 *  struktural, bukan diimpor dari competitorPostsQuery: modul itu membuka koneksi
 *  database dan tidak boleh ikut terbawa ke bundel klien maupun ke exporter. */
export interface CompetitorPostPool {
  competitors: { id: string; label: string; platform: string }[]
  posts: Record<string, PostCandidate[]>
}

/**
 * Kompetitor yang ditampilkan sebuah slide Visual Content, beserta kumpulan post-nya.
 * Pilihan eksplisit dipakai selama kompetitornya memang ada di channel slide ini;
 * kalau tidak, yang pertama — supaya slide tidak kosong sebelum sempat dipilih.
 *
 * Dipakai preview DAN exporter. Sebelumnya aturan ini hanya hidup di VisualSlide dan
 * exporter sama sekali tidak tahu soal mode kompetitor, jadi PPTX diam-diam berisi
 * post milik sendiri padahal di layar yang tampil post kompetitor.
 */
export function competitorPoolFor(
  data: CompetitorPostPool | null | undefined,
  channel: string,
  selectedId: string | undefined,
): { competitorId?: string; label?: string; pool: PostCandidate[] | null } {
  const inChannel = (data?.competitors ?? []).filter(c => c.platform === channel)
  const chosen = inChannel.find(c => c.id === selectedId) ?? inChannel[0]
  if (!chosen) return { pool: null }
  return { competitorId: chosen.id, label: chosen.label, pool: data?.posts?.[chosen.id] ?? null }
}

/** Metrik yang nilainya teks (tanggal), bukan angka yang bisa diformat. */
const TEXT_METRIC_IDS = new Set(['post_date', 'post_datetime', 'activity_name', 'activity_type', 'activity_period'])
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
  /** Permalink post — foto, #id, dan ikon open_in_new di kartu menaut ke sini. */
  link?: string
  /** Ada kalau `image` belum tersimpan permanen: slide/exporter memintanya lewat
   *  resolver gambar report (@/lib/reports/images). */
  imageKey?: string
}

// A candidate post carrying numeric metric values, fetched from
// l1_silver.unified_post. buildPosts filters/ranks/slices these into PostRow.
export interface PostCandidate {
  id: number
  image: string | null
  formatId: string; format: string
  pillarId: string; pillar: string
  /** true kalau is_activity di l0_extra bernilai true — penyaring slide Activity Performance. */
  isActivity?: boolean
  /** Permalink post di platform (unified_post.link / permalink kompetitor). */
  link?: string | null
  /** Kunci resolver gambar report — lihat @/lib/reports/images/keys. */
  imageKey?: string
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
  // "Motion" = tag editorial untuk gambar beranimasi (motion graphic), dulu digabung
  // ke Video. Post-UAT: jadi format sendiri supaya bisa dipilih & dibandingkan.
  if (s.includes('motion')) return { id: 'motion', label: 'Motion Images' }
  if (s.includes('video')) return { id: 'video', label: 'Video' }
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

const fmtValue = (id: string, v: number, compact = false) =>
  isErMetric(id) || id === 'completion_rate' ? fmtPct(v)
  : id === 'watch_time' ? v.toFixed(1) + 's'
  : compact ? compactNum(v) : groupInt(v)

// Only http(s) permalinks become hyperlinks — the value comes from scraped data
// and ends up as an <a href> in the preview and a click target in the PPTX.
function safeLink(link: string | null | undefined): string | undefined {
  const s = (link ?? '').trim()
  return /^https?:\/\//i.test(s) ? s : undefined
}

export interface PostOptions {
  format?: string
  pillar?: string
  sortMetric?: string
  source?: PostCandidate[]   // live pool; empty/absent ⇒ no posts (no sample fallback)
  /** Angka ringkas (1.23M) — ContentSlide.postNumbers === 'compact'. */
  compact?: boolean
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

  return picked.map(({ cand, tag }, i) => toPostRow(cand, i, tag, opts.compact))
}

function toPostRow(cand: PostCandidate, i: number, tag?: 'TOP' | 'LOW', compact?: boolean): PostRow {
  const metrics: Record<string, string> = {}
  POST_METRICS.forEach(m => {
    // Teks menang untuk metrik tanggal; sisanya diformat dari angkanya.
    metrics[m.id] = cand.text?.[m.id] ?? fmtValue(m.id, cand.values[m.id] ?? 0, compact)
  })
  return {
    id: i + 1, tag, image: cand.image ?? '', format: cand.format, pillar: cand.pillar, metrics, link: safeLink(cand.link),
    imageKey: cand.imageKey && !isStoredImage(cand.image) ? cand.imageKey : undefined,
  }
}

export const metricLabel = (id: string) => POST_METRICS.find(m => m.id === id)?.label ?? id
/** Label di KARTU post — disingkat (Imprs./Views) supaya sejajar dengan nilainya.
 *  Pemilih metrik tetap memakai metricLabel lengkap. */
export const cardMetricLabel = (id: string) => shortMetricLabel(metricLabel(id))

/* ── Activity Performance ─────────────────────────────────────────────────────
 * Slide ini memakai layout kartu yang sama persis dengan Visual Analysis. Yang
 * berbeda hanya tiga hal, dan ketiganya ada di bawah: kumpulan post-nya disaring
 * ke post yang ditandai activity, urutannya tetap (terbaru dulu) alih-alih
 * top/low, dan katalog metriknya ACTIVITY_METRIC_IDS.
 */

/** Post yang ditandai activity, terbaru dulu. Urutannya tetap: slide ini tidak
 *  punya pemilih Order — mengurutkan lomba berdasarkan reach tidak berarti apa-apa. */
export function activityPool(source: PostCandidate[] | undefined): PostCandidate[] {
  if (!source || !source.length) return []
  return source.filter(p => p.isActivity)
    .sort((a, b) => (b.values.post_date ?? 0) - (a.values.post_date ?? 0))
}

/** Metrik kartu Activity Performance — urutannya selalu ACTIVITY_METRIC_IDS.
 *  Tanpa pilihan sama sekali, tampilkan semuanya: tujuh field itu memang isi
 *  slide ini, bukan sekadar tambahan di atas foto. */
export function effectiveActivityMetrics(selected: string[]): string[] {
  const sel = new Set(selected)
  const shown = ACTIVITY_METRIC_IDS.filter(id => sel.has(id))
  return shown.length ? [...shown] : [...ACTIVITY_METRIC_IDS]
}

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

/* ── Format / Pillar Showcase ─────────────────────────────────────────────────
 * Post-UAT brief "All Format/Pillar Showcase": satu baris per format (atau per
 * pilar), post di tiap baris diurutkan dari yang terendah ke yang tertinggi
 * menurut metrik pilihan, dengan rata-rata metrik itu per kelompok di kiri dan
 * catatan per kelompok di kanan. Dipakai bersama ShowcaseSlide dan exporter.
 */
export type ShowcaseGroupBy = 'format' | 'pillar'
/** Paling banyak lima baris — lebih dari itu fotonya terlalu kecil untuk dibaca. */
export const SHOWCASE_MAX_GROUPS = 5
export const SHOWCASE_PER_ROW = [3, 4, 5]
/** Paling banyak empat metrik di kotak samping foto. */
export const SHOWCASE_MAX_METRICS = 4

export interface ShowcaseGroup {
  id: string
  label: string
  /** Rata-rata metrik pengurut di kelompok ini (angka mentah). */
  avg: number
  avgText: string
  count: number
  /** Kiri → kanan = terendah → tertinggi. */
  posts: PostRow[]
}

/** Kelompok yang ada di pool, urut abjad ("Other"/"No pillar" di belakang). */
export function showcaseGroupOptions(source: PostCandidate[] | undefined, by: ShowcaseGroupBy): { id: string; label: string; count: number }[] {
  const m = new Map<string, { id: string; label: string; count: number }>()
  for (const p of source ?? []) {
    const id = by === 'format' ? p.formatId : p.pillarId
    const label = by === 'format' ? p.format : p.pillar
    const e = m.get(id) ?? { id, label, count: 0 }
    e.count++
    m.set(id, e)
  }
  const last = (id: string) => (id === 'other' || id === 'none' ? 1 : 0)
  return [...m.values()].sort((a, b) => last(a.id) - last(b.id) || a.label.localeCompare(b.label))
}

/**
 * Kelompok yang ditampilkan: pilihan tersimpan yang masih ada datanya, atau —
 * tanpa pilihan — kelompok dengan post terbanyak, maksimal SHOWCASE_MAX_GROUPS.
 * Urutan tampil selalu urutan showcaseGroupOptions, bukan urutan klik.
 */
export function effectiveShowcaseGroups(source: PostCandidate[] | undefined, by: ShowcaseGroupBy, selected: string[] | undefined): string[] {
  const opts = showcaseGroupOptions(source, by)
  const valid = (selected ?? []).filter(id => opts.some(o => o.id === id))
  const pick = valid.length ? new Set(valid)
    : new Set([...opts].sort((a, b) => b.count - a.count).slice(0, SHOWCASE_MAX_GROUPS).map(o => o.id))
  return opts.filter(o => pick.has(o.id)).map(o => o.id).slice(0, SHOWCASE_MAX_GROUPS)
}

export function buildShowcase(
  source: PostCandidate[] | undefined, by: ShowcaseGroupBy, groupIds: string[],
  sortMetric: string, perRow: number, compact = false,
): ShowcaseGroup[] {
  const opts = showcaseGroupOptions(source, by)
  return groupIds.map(gid => {
    const label = opts.find(o => o.id === gid)?.label ?? gid
    const pool = (source ?? []).filter(p => (by === 'format' ? p.formatId : p.pillarId) === gid)
    const key = (p: PostCandidate) => p.values[sortMetric] ?? 0
    const asc = [...pool].sort((a, b) => key(a) - key(b))
    const avg = pool.length ? pool.reduce((s, p) => s + key(p), 0) / pool.length : 0
    // Lebih banyak post daripada slot: ambil yang tersebar rata dari terendah sampai
    // tertinggi, supaya baris tetap memperlihatkan rentangnya — bukan cuma ujung atas.
    const picked = asc.length <= perRow ? asc
      : perRow === 1 ? [asc[asc.length - 1]]
      : Array.from({ length: perRow }, (_, i) => asc[Math.round((i * (asc.length - 1)) / (perRow - 1))])
    return {
      id: gid, label, count: pool.length, avg,
      avgText: fmtValue(sortMetric, avg, compact),
      posts: picked.map((c, i) => toPostRow(c, i, undefined, compact)),
    }
  })
}

/**
 * Metrik di kotak samping foto showcase: pilihan (urutan katalog), maks. empat.
 * Metrik pengurut SELALU ikut, paling atas — baris diurutkan menurutnya, jadi
 * kartu tanpa angka itu tidak menjelaskan kenapa post-nya ada di posisi itu.
 */
export function showcaseShownMetrics(selected: string[], populated: string[], sortMetric?: string): string[] {
  const rest = effectiveShownMetrics(selected, populated).filter(m => m !== sortMetric)
  return (sortMetric ? [sortMetric, ...rest] : rest).slice(0, SHOWCASE_MAX_METRICS)
}

/**
 * Geometri showcase dalam satuan slide (cqw = % lebar, cqh = % tinggi), dipakai
 * pratinjau DAN exporter supaya ukuran foto & kotak metriknya sama persis.
 * Area isi: lebar 92cqw (padding 4cqw), tinggi 69cqh (18 → 87).
 */
export const SHOWCASE_GEOM = { bodyW: 92, bodyH: 69, leftW: 15, rightW: 21, gap: 1.2, headH: 3, rowGap: 0.8, stripW: 2.2, trackPad: 0.6, slotGap: 0.6, rowPad: 0.6, boxGap: 0.3 }
const CQW_PER_CQH = 7.5 / 13.333   // slide 16:9 — 1cqh = 0.5625cqw

export function showcaseGeometry(perRow: number, groups: number) {
  const g = SHOWCASE_GEOM
  const midW = g.bodyW - g.leftW - g.rightW - 2 * g.gap
  const trackW = midW - g.stripW - 2 * g.trackPad
  const slotW = (trackW - g.slotGap * (perRow - 1)) / perRow
  const n = Math.max(1, groups)
  const rowH = (g.bodyH - g.headH - g.rowGap * (n - 1)) / n            // cqh
  const imgH = rowH - 2 * g.rowPad                                      // cqh
  const imgW = Math.min(imgH * CQW_PER_CQH * 0.8, slotW * 0.45)         // cqw, foto 4:5
  const boxW = slotW - imgW - g.boxGap                                  // cqw
  return { midW, trackW, slotW, rowH, imgH, imgW, boxW }
}

/**
 * Ukuran huruf kotak metrik (cqw). Tiap metrik = DUA baris (label, lalu angka) —
 * "Imprs./Views: 12,121,090" dalam satu baris hanya muat di 4–5pt pada slot 4–5
 * post per baris. Sebesar mungkin sampai 0.8cqw, asal teks terpanjang muat
 * selebar kotak dan semua baris muat setinggi foto.
 */
export function showcaseMetricFs(geom: ReturnType<typeof showcaseGeometry>, metrics: number, longestChars: number): number {
  const byW = (geom.boxW - 0.5) / (Math.max(1, longestChars) * 0.58)
  const byH = (geom.imgH - 0.8) * CQW_PER_CQH / (Math.max(1, metrics * 2) * 1.2)
  return Math.max(0.45, Math.min(0.8, byW, byH))
}

/**
 * Label vertikal di strip kiri tiap baris ("PRODUCT EDUCATION"). Satu baris
 * kalau muat setinggi baris; kalau tidak, dipecah dua di spasi paling tengah
 * (strip 2.2cqw muat dua kolom huruf 0.8cqw), dan baru kecilkan huruf kalau
 * dua baris pun belum muat. Dulu `nowrap` + overflow:hidden → "PRODUCT EDUCATI".
 */
export function showcaseLabel(label: string, groups: number): { lines: string[]; fs: number } {
  const g = SHOWCASE_GEOM
  const n = Math.max(1, groups)
  const avail = ((g.bodyH - g.headH - g.rowGap * (n - 1)) / n) * CQW_PER_CQH * 0.9   // cqw sepanjang strip
  const text = label.toUpperCase().trim()
  const em = 0.78                                   // lebar rata-rata huruf kapital tebal + letter-spacing
  const fsFor = (len: number) => avail / (Math.max(1, len) * em)
  if (fsFor(text.length) >= 0.8) return { lines: [text], fs: 0.8 }
  const words = text.split(/\s+/)
  let lines = [text]
  if (words.length > 1) {
    let best = Infinity
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ')
      const len = Math.max(a.length, b.length)
      if (len < best) { best = len; lines = [a, b] }
    }
  }
  const longest = Math.max(...lines.map(l => l.length))
  return { lines, fs: Math.max(0.45, Math.min(0.8, fsFor(longest))) }
}

/** Panjang teks terpanjang di kotak metrik (label atau angka), untuk showcaseMetricFs. */
export const showcaseLongest = (groups: ShowcaseGroup[], shown: string[]): number =>
  Math.max(1, ...shown.map(m => cardMetricLabel(m).length),
    ...groups.flatMap(g => g.posts.flatMap(p => shown.map(m => (p.metrics[m] ?? '—').length))))
