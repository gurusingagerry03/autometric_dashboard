// Data-table types. Restructured (2026-07-02) around the ROBZ LAUNCH metrics
// mapping into two channel-scoped sections — Content Level Metric &
// Channel Level Metric — plus the retained Sentiments and Brand vs Competitor
// tables. Both metric tables compare Previous vs Current period (Gap %), and
// their columns are filtered by the slide's channel (metrics are per-platform).
// Values are REAL DB numbers (via metricsQuery); no data renders "—", never dummy.
import type { DashPlatform } from '@/components/dashboard/data'
import { compactNum, groupInt, shortMetricLabel } from './format'
import { TABLE_COLUMN_TO_TRACKER, fmtTrackerMom, fmtTrackerMonth, fmtTrackerValue, trackerMom, type TrackerMetric, type TrackerMonth } from './monthlyTracker'
import { fmtYtdGrowth, fmtYtdPrior, fmtYtdRow, ytdLabel, type YtdChannel } from './ytdMetrics'

export type TableFormat = 'compact' | 'number' | 'percent' | 'time' | 'text'
export type TableRowType = 'comparison' | 'competitors' | 'sentiments' | 'platforms' | 'months' | 'ytd' | 'generic'

// `channels` omitted = available on every channel; otherwise the metric only
// exists for the listed platforms (per the ROBZ LAUNCH mapping).
export interface TableColumn {
  id: string; label: string; format: TableFormat; channels?: DashPlatform[]
  /** Judul kelompok di pemilih kolom. Dipakai tabel Cross-Level: labelnya tidak
   *  menyebut level, jadi heading inilah yang membedakan 'Profile Visit' milik
   *  Content dari milik Channel. Kosong = tidak dikelompokkan. */
  group?: string
}
export interface TableType {
  id: string
  label: string
  icon: string
  description: string
  rowType: TableRowType
  /** true = metric table whose columns are scoped to the slide channel (disabled on "all"). */
  channelScoped?: boolean
  columns: TableColumn[]
  /** core columns pre-checked when the type is picked (defaults to all when absent). */
  defaultColumns?: string[]
  /**
   * Columns used ONLY on the cross-channel "all" view. This layout follows the
   * Content/Channel Performance spec: each "SUM & AVERAGE" metric contributes a
   * SUM column plus an `Avg.` column, while "SUM Only" metrics contribute one.
   * When absent, "all" falls back to the channel-agnostic subset of `columns`.
   */
  allColumns?: TableColumn[]
  /** Pre-checked columns for the "all" view (defaults to allColumns when absent). */
  allDefaultColumns?: string[]
  /** true = not selectable (greyed out) — e.g. competitor data isn't wired into reports. */
  disabled?: boolean
}

/** A configured table on a slide. `competitorIds` applies to the competitors
 *  table only — the chosen competitor social_account_ids (undefined = all). */
export interface TableConfig {
  type: string; columns: string[]; competitorIds?: string[]
  /** 'monthly_tracker' only — isi kolom Key Highlight per bulan (YYYY-MM → teks). */
  highlights?: Record<string, string>
  /** 'monthly_tracker' only — bulan mulai (YYYY-MM); kosong = Januari tahun report. */
  fromMonth?: string
  /** Nama metrik di header: 'short' (default) = disingkat (Eng. Owned), 'full' = apa adanya. */
  labels?: 'short' | 'full'
  /** Angka: 'full' (default) = 1,234,567, 'compact' = 1.23M. Persen & waktu tidak terpengaruh. */
  numbers?: 'full' | 'compact'
  /** Tabel per-platform: tampilkan growth vs periode sebelumnya di samping tiap angka. */
  showGrowth?: boolean
}

/** Tabel yang punya opsi growth vs periode sebelumnya: baris = platform, atau
 *  Brand vs Competitor (baris = brand & tiap kompetitor). */
export const supportsGrowthOption = (typeId: string) => {
  const rt = TABLE_TYPES[typeId]?.rowType
  return rt === 'platforms' || rt === 'competitors'
}

/**
 * Kolom yang isinya SUDAH perubahan (Followers Growth, Growth %, Nett Growth) tidak
 * diberi growth lagi — "growth dari growth" membingungkan pembaca (catatan Post-UAT
 * brief, Growth Options on Table). Id berawalan ct:/ch: (Cross-Level) ikut dicek.
 */
const NO_GROWTH = new Set(['followers_growth', 'followers_growth_pct', 'followers_net_growth', 'avg_followers_net_growth'])
const skipsGrowth = (colId: string) => NO_GROWTH.has(colId.replace(/^c[th]:/, ''))

/** Growth vs periode sebelumnya sebagai baris kecil di sel ("(+12%)"). */
function growthSub(v: number | null, pv: number | null, inline: boolean): TableCell['sub'] {
  if (v == null || pv == null || pv === 0) return undefined
  // Pembagi |prev|: metrik yang bisa negatif tetap bertanda benar — naik dari -50
  // ke -10 adalah perbaikan, bukan penurunan.
  const g = ((v - pv) / Math.abs(pv)) * 100
  const flat = Math.abs(g) < 0.5
  return { text: flat ? '(0%)' : `(${g > 0 ? '+' : '-'}${groupInt(Math.abs(g))}%)`, positive: g > 0, flat, inline }
}

/** Real metric value for a comparison table: previous vs current period. */
export interface MetricPair { prev: number | null; curr: number | null }
/** Real values for one section+channel, keyed by table column id. */
export type SectionMetrics = Record<string, MetricPair>
/** Sentiments table: posts per dominant sentiment + share (per channel). */
export interface SentimentTableCell { number_of_posts: number; percentage: number }
export type SentimentTable = Record<'positive' | 'neutral' | 'negative', SentimentTableCell>
/** Table channel key: a specific platform, or 'all' (cross-channel aggregate). */
export type TableChannel = DashPlatform | 'all'
/**
 * One row of the Brand vs Competitor table: the brand itself or a competitor.
 * `values` is keyed by the brand_vs_competitor column id (null → renders "—",
 * e.g. reach columns which public competitor scraping never provides).
 */
export interface CompetitorEntity {
  id: string      // 'brand' for the brand row, else the competitor's social_account_id
  label: string   // brand name, or '@username'
  values: Record<string, number | null>
  /** Nilai periode sebelumnya, kunci sama dengan `values` — untuk opsi showGrowth. */
  prevValues?: Record<string, number | null>
}
/** Competitor comparison for one platform: the brand + every competitor with a row. */
export interface CompetitorSection {
  brand: CompetitorEntity
  competitors: CompetitorEntity[]  // all of the brand's competitors on this platform
}

/** One org custom-metric column: id + display label + value format. Its per-channel
 *  values live in the content/channel SectionMetrics (keyed by this id). */
export interface CustomMetricColumn { id: string; label: string; format: Exclude<TableFormat, 'text'> }

/**
 * Platform-comparison table values: the CURRENT-period value per platform, keyed
 * by column id (the Content/Channel Performance combined-metric ids). Backs the
 * "Content by Platform" / "Channel by Platform" tables (rows = IG/FB/TikTok).
 */
export type PlatformMetrics = Partial<Record<DashPlatform, Record<string, number | null>>>

/** Full report metrics payload: content + channel level + sentiment + competitor. */
export interface ReportTableMetrics {
  content: Partial<Record<TableChannel, SectionMetrics>>   // per channel + 'all'
  channel: Partial<Record<TableChannel, SectionMetrics>>   // per channel + 'all'
  contentByPlatform?: PlatformMetrics   // current-period content values per platform (Content by Platform table)
  channelByPlatform?: PlatformMetrics   // current-period channel values per platform (Channel by Platform table)
  contentByPlatformPrev?: PlatformMetrics   // previous-period counterpart — growth option on the by-platform tables
  channelByPlatformPrev?: PlatformMetrics
  sentiment?: Partial<Record<DashPlatform, SentimentTable>>   // per channel (comment_sentiment_post by dominant sentiment)
  competitors?: Partial<Record<DashPlatform, CompetitorSection>>  // per channel (l2_gold.competitor_*)
  customMetrics?: CustomMetricColumn[]   // org custom metrics (selectable columns)
}

/** Org custom metrics as TableColumns (for buildTable + the column picker). */
export function customColumnsFrom(metrics: ReportTableMetrics | null | undefined): TableColumn[] {
  return (metrics?.customMetrics ?? []).map(c => ({ id: c.id, label: c.label, format: c.format }))
}

// ── All-channel column sets (Content/Channel Performance spec) ────────────────
// Shared by the cross-channel aggregate tables (content_level/channel_level on the
// "all" view) AND by the per-platform comparison tables (content_by_platform /
// channel_by_platform), which show the SAME combined metrics but one row per
// platform. Each "SUM & AVERAGE" metric = a SUM column + an Avg. column; ER =
// pooled SUM (Σengagement ÷ Σdenominator) + mean Avg.; counts are SUM only.
const CONTENT_ALL_COLUMNS: TableColumn[] = [
  { id: 'new_follow_content', label: 'New Follow from Content', format: 'number' },
  { id: 'profile_visit', label: 'Profile Visit', format: 'number' },
  { id: 'avg_profile_visit', label: 'Avg. Profile Visit', format: 'number' },
  { id: 'reach', label: 'Reach', format: 'compact' },
  { id: 'avg_reach', label: 'Avg. Reach', format: 'compact' },
  { id: 'impressions_views', label: 'Impressions/Views', format: 'compact' },
  { id: 'avg_impressions_views', label: 'Avg. Impressions/Views', format: 'compact' },
  { id: 'likes', label: 'Likes', format: 'number' },
  { id: 'avg_likes', label: 'Avg. Likes', format: 'number' },
  { id: 'comments', label: 'Comments', format: 'number' },
  { id: 'avg_comments', label: 'Avg. Comments', format: 'number' },
  { id: 'shares', label: 'Shares', format: 'number' },
  { id: 'avg_shares', label: 'Avg. Shares', format: 'number' },
  { id: 'saved', label: 'Saved', format: 'number' },
  { id: 'avg_saved', label: 'Avg. Saved', format: 'number' },
  { id: 'reposts', label: 'Reposts', format: 'number' },
  { id: 'avg_reposts', label: 'Avg. Reposts', format: 'number' },
  { id: 'eng_owned', label: 'Engagement', format: 'compact' },
  { id: 'avg_eng_owned', label: 'Avg. Engagement', format: 'compact' },
  { id: 'er_reach_pooled', label: 'ER Reach', format: 'percent' },
  { id: 'er_reach', label: 'Avg. ER Reach', format: 'percent' },
  { id: 'er_views_pooled', label: 'ER Views', format: 'percent' },
  { id: 'er_views', label: 'Avg. ER Views', format: 'percent' },
  { id: 'er_followers_pooled', label: 'ER Followers', format: 'percent' },
  { id: 'er_followers', label: 'Avg. ER Followers', format: 'percent' },
  // Video efficiency — averaged over the posts that carry the metric on any channel
  // (Instagram/TikTok watch time, TikTok completion). Off by default: they only apply
  // to video formats, so on a mixed deck they'd read as "—" more often than not.
  { id: 'video_watch_time', label: 'Avg. Watch Time', format: 'time' },
  { id: 'post_completion', label: 'Completion Rate', format: 'percent' },
]
const CONTENT_ALL_DEFAULTS = [
  'new_follow_content', 'profile_visit', 'reach', 'impressions_views', 'likes', 'comments', 'shares',
  'saved', 'reposts', 'eng_owned', 'er_reach_pooled', 'er_views_pooled', 'er_followers_pooled',
]
const CHANNEL_ALL_COLUMNS: TableColumn[] = [
  { id: 'total_followers', label: 'Followers', format: 'compact' },
  { id: 'followers_net_growth', label: 'Followers Nett Growth', format: 'number' },
  { id: 'avg_followers_net_growth', label: 'Avg. Followers Nett Growth', format: 'number' },
  { id: 'new_follows', label: 'New Follow', format: 'number' },
  { id: 'avg_new_follows', label: 'Avg. New Follow', format: 'number' },
  // Two unfollow figures (deck slide 12, FAQ): the platform's own count, and the
  // one re-derived as Follows − Followers Growth so it tallies with the growth.
  { id: 'unfollows', label: 'Unfollow Meta', format: 'number' },
  { id: 'avg_unfollows', label: 'Avg. Unfollow Meta', format: 'number' },
  { id: 'unfollows_calc', label: 'Unfollow Calculation', format: 'number' },
  { id: 'avg_unfollows_calc', label: 'Avg. Unfollow Calculation', format: 'number' },
  { id: 'profile_reach', label: 'Profile Reach', format: 'compact' },
  { id: 'avg_profile_reach', label: 'Avg. Profile Reach', format: 'compact' },
  // "Profile Views" and "Profile Visit" are the same metric (glossary: Kunjungan
  // Profil) and share one gold source, so only Profile Visit is offered — the old
  // `profile_views` id, which had no source and always rendered "—", is aliased.
  { id: 'profile_visit', label: 'Profile Visit', format: 'number' },
  { id: 'avg_profile_visit', label: 'Avg. Profile Visit', format: 'number' },
  { id: 'total_posts', label: 'Total Post', format: 'number' },
  // Engagement earned across the period. Like every other Avg. column in this
  // table the average is PER DAY (the Content Performance table averages per post).
  { id: 'eng_owned', label: 'Engagement', format: 'compact' },
  { id: 'avg_eng_owned', label: 'Avg. Engagement', format: 'compact' },
  { id: 'eng_public', label: 'Engagement Public', format: 'compact' },
  { id: 'avg_eng_public', label: 'Avg. Engagement Public', format: 'compact' },
]
const CHANNEL_ALL_DEFAULTS = [
  'total_followers', 'followers_net_growth', 'new_follows', 'unfollows',
  'profile_reach', 'profile_visit', 'total_posts',
  'eng_owned', 'avg_eng_owned',
]

/**
 * Renamed column ids. A saved slide or template still stores the old id, so every
 * selection is normalized through this map before rendering / re-opening the picker
 * — otherwise the column would silently disappear from an existing report.
 */
const COLUMN_ALIASES: Record<string, string> = {
  profile_views: 'profile_visit',
  avg_profile_views: 'avg_profile_visit',
}

/** Map legacy column ids to their current ids, dropping duplicates. */
export function normalizeColumnIds(ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const mapped = COLUMN_ALIASES[id] ?? id
    if (!out.includes(mapped)) out.push(mapped)
  }
  return out
}

// Kolom per-channel untuk kedua tabel perbandingan. Diangkat jadi konstanta
// karena tabel Cross-Level memakai keduanya — kalau tetap inline, daftar
// kolomnya harus disalin dan dua salinan itu pasti menyimpang cepat atau lambat.
const CONTENT_LEVEL_COLUMNS: TableColumn[] = [
  { id: 'likes', label: 'Likes', format: 'number' },
  { id: 'comments', label: 'Comments', format: 'number' },
  { id: 'shares', label: 'Shares', format: 'number' },
  { id: 'saved', label: 'Saved', format: 'number', channels: ['instagram', 'tiktok'] },
  { id: 'reposts', label: 'Reposts', format: 'number', channels: ['instagram'] },
  { id: 'eng_owned', label: 'Engagement Owned', format: 'compact' },
  { id: 'eng_public', label: 'Engagement Public', format: 'compact' },
  { id: 'er_reach', label: 'ER Reach', format: 'percent' },
  { id: 'er_views', label: 'ER Views', format: 'percent', channels: ['instagram', 'tiktok'] },
  { id: 'er_impressions', label: 'ER Impressions', format: 'percent', channels: ['facebook'] },
  { id: 'er_followers', label: 'ER Followers', format: 'percent' },
  { id: 'reach', label: 'Reach', format: 'compact' },
  { id: 'views', label: 'Views', format: 'compact', channels: ['instagram'] },
  { id: 'impressions', label: 'Impressions', format: 'compact', channels: ['tiktok', 'facebook'] },
  { id: 'video_views', label: 'Video Views', format: 'compact', channels: ['facebook'] },
  { id: 'reels_skip_rate', label: 'Reels Skip Rate', format: 'percent', channels: ['instagram'] },
  { id: 'video_watch_time', label: 'Video Avg. Watch Time', format: 'time' },
  { id: 'post_view_time', label: 'Post Avg. View Time', format: 'time', channels: ['tiktok'] },
  { id: 'post_completion', label: 'Post Completion Rate', format: 'percent', channels: ['tiktok'] },
  { id: 'new_follow_content', label: 'New Follow from Content', format: 'number', channels: ['instagram', 'tiktok'] },
  // Profile visits driven by content = SUM(unified_post.profile_visits) over the
  // period. Left unrestricted like video_watch_time: the API only fills it for
  // Instagram, but an FPK/CSV source can supply it for any channel (else "—").
  { id: 'profile_visit', label: 'Profile Visit', format: 'number' },
]

const CHANNEL_LEVEL_COLUMNS: TableColumn[] = [
  { id: 'total_followers', label: 'Total Followers', format: 'compact' },
  { id: 'followers_net_growth', label: 'Followers Net Growth', format: 'number' },
  { id: 'new_follows', label: 'New Follows', format: 'number' },
  { id: 'unfollows', label: 'Unfollow Meta', format: 'number' },
  { id: 'unfollows_calc', label: 'Unfollow Calculation', format: 'number' },
  // Same metric the picker used to call "Profile Views" (gold profile_visit_sum),
  // renamed for consistency with the All-Channels layout; legacy id is aliased.
  { id: 'profile_visit', label: 'Profile Visit', format: 'number' },
  { id: 'profile_reach', label: 'Profile Reach', format: 'compact' },
  { id: 'avg_er_reach', label: 'Avg. ER Reach', format: 'percent' },
  { id: 'avg_er_views', label: 'Avg. ER Views', format: 'percent', channels: ['instagram', 'tiktok'] },
  { id: 'avg_er_impressions', label: 'Avg. ER Impressions', format: 'percent', channels: ['facebook'] },
  { id: 'avg_er_followers', label: 'Avg. ER Followers', format: 'percent' },
  { id: 'total_posts', label: 'Total Posts', format: 'number' },
  { id: 'avg_likes', label: 'Avg. Likes', format: 'number' },
  { id: 'avg_comments', label: 'Avg. Comments', format: 'number' },
  { id: 'avg_shares', label: 'Avg. Shares', format: 'number' },
  { id: 'avg_saved', label: 'Avg. Saved', format: 'number', channels: ['instagram', 'tiktok'] },
  { id: 'avg_reposts', label: 'Avg. Reposts', format: 'number', channels: ['instagram'] },
  { id: 'eng_owned', label: 'Engagement Owned', format: 'compact' },
  { id: 'eng_public', label: 'Engagement Public', format: 'compact' },
  { id: 'avg_eng_owned', label: 'Avg. Engagement Owned', format: 'compact' },
  { id: 'avg_eng_public', label: 'Avg. Engagement Public', format: 'compact' },
  { id: 'avg_reach', label: 'Avg. Reach', format: 'compact' },
  { id: 'avg_views', label: 'Avg. Views', format: 'compact', channels: ['instagram'] },
  { id: 'avg_impressions', label: 'Avg. Impressions', format: 'compact', channels: ['tiktok', 'facebook'] },
  { id: 'avg_video_views', label: 'Avg. Video Views', format: 'compact', channels: ['facebook'] },
]

// ── Cross-level: satu tabel yang boleh mencampur metrik Content & Channel ─────
// Kedua kumpulan metrik hidup di butiran berbeda — Content per-post, Channel
// per-hari — dan sebagian namanya bertabrakan (mis. profile_visit ada di
// dua-duanya dengan arti berbeda). Karena itu id-nya diberi awalan, bukan
// digabung begitu saja: 'ct:' untuk content, 'ch:' untuk channel. Awalan yang
// sama dipakai saat merakit nilainya di metricsContext, jadi tidak ada
// kemungkinan satu kolom diam-diam mengambil angka dari level yang salah.
//
// LEVELNYA TIDAK IKUT DI LABEL
//   Sebelumnya label membawa akhiran "· Content" / "· Channel". Di tabel laporan
//   yang diserahkan ke klien akhiran itu hanya jargon internal — pembaca laporan
//   tidak memilah metrik per level, dia membaca "Followers", bukan "Followers ·
//   Channel". Yang memang butuh pembeda adalah PEMILIH kolom, karena beberapa nama
//   ada di dua level (Profile Visit, Engagement, Engagement Public); di sana
//   pembedanya `group`, yang dirender sebagai heading per level.
const CROSS_GROUP = { content: 'Content Level', channel: 'Channel Level' } as const

const CROSS_ALL_COLUMNS: TableColumn[] = [
  ...CONTENT_ALL_COLUMNS.map(c => ({ ...c, id: 'ct:' + c.id, group: CROSS_GROUP.content })),
  ...CHANNEL_ALL_COLUMNS.map(c => ({ ...c, id: 'ch:' + c.id, group: CROSS_GROUP.channel })),
]
// Default mengikuti contoh di brief: campuran follower (channel) dengan
// engagement & ER (content), supaya begitu dipasang tabelnya langsung
// memperlihatkan gunanya — bukan tabel kosong yang harus dikonfigurasi dulu.
const CROSS_ALL_DEFAULTS = [
  'ch:total_followers', 'ch:followers_net_growth',
  'ct:eng_owned', 'ct:er_reach_pooled', 'ct:reach',
]

// Versi per-channel dari campuran yang sama. Awalan dan aturan labelnya identik
// dengan CROSS_ALL_COLUMNS; yang berbeda hanya kumpulan metrik sumbernya —
// kolom per-channel, bukan layout SUM/Avg. milik spesifikasi All-Channels.
// `channels` ikut terbawa dari kolom aslinya, jadi metrik yang cuma ada di satu
// platform tetap hilang sendiri lewat columnsForChannel.
const CROSS_COLUMNS: TableColumn[] = [
  ...CONTENT_LEVEL_COLUMNS.map(c => ({ ...c, id: 'ct:' + c.id, group: CROSS_GROUP.content })),
  ...CHANNEL_LEVEL_COLUMNS.map(c => ({ ...c, id: 'ch:' + c.id, group: CROSS_GROUP.channel })),
]
const CROSS_DEFAULTS = [
  'ch:total_followers', 'ch:followers_net_growth',
  'ct:eng_owned', 'ct:er_reach', 'ct:reach',
]

export const TABLE_TYPES: Record<string, TableType> = {
  content_level: {
    id: 'content_level', label: 'Content Level Metric', icon: 'dynamic_feed',
    description: 'Per-post metrics — this period vs last.', rowType: 'comparison', channelScoped: true,
    defaultColumns: ['reach', 'likes', 'comments', 'shares', 'eng_owned', 'er_reach'],
    // Cross-channel "all" view (Content Performance spec) — see CONTENT_ALL_COLUMNS.
    // Default = the 12 spec metrics as their primary (SUM / pooled) column; the Avg.
    // columns stay available in the picker (off by default to keep the table readable).
    allColumns: CONTENT_ALL_COLUMNS,
    allDefaultColumns: CONTENT_ALL_DEFAULTS,
    columns: CONTENT_LEVEL_COLUMNS,
  },
  channel_level: {
    id: 'channel_level', label: 'Channel Level Metric', icon: 'insights',
    description: 'Profile-wide metrics — this period vs last.', rowType: 'comparison', channelScoped: true,
    defaultColumns: ['total_followers', 'followers_net_growth', 'profile_visit', 'total_posts', 'eng_owned', 'avg_eng_owned', 'avg_er_reach'],
    // Cross-channel "all" view (Channel Performance spec) — see CHANNEL_ALL_COLUMNS.
    // Daily profile aggregates: SUM column (period total) + Avg. column (per day).
    // Followers & Total Post are SUM only.
    allColumns: CHANNEL_ALL_COLUMNS,
    allDefaultColumns: CHANNEL_ALL_DEFAULTS,
    columns: CHANNEL_LEVEL_COLUMNS,
  },
  /**
   * Cross-Level Metric — campuran Content & Channel dengan baris perbandingan
   * (periode ini vs periode lalu + Gap %), bukan baris per platform.
   *
   * BEDANYA DENGAN cross_by_platform
   *   Keduanya mencampur metrik yang sama dan memakai awalan id yang sama, tapi
   *   menjawab pertanyaan yang berbeda: yang ini "naik atau turun dibanding
   *   periode lalu", yang itu "platform mana yang menyumbang apa". Karena itu
   *   keduanya hidup berdampingan, bukan saling menggantikan.
   *
   *   Konsekuensi lain yang menguntungkan: tabel ber-rowType 'comparison' ikut
   *   terisi di jalur ekspor/AI (parts.tsx memanggil buildTable tanpa
   *   platformMetrics), jadi campuran ini bisa keluar di PPTX — sesuatu yang
   *   tidak berlaku untuk versi per-platform.
   *
   * TERSEDIA DI SEMUA CHANNEL
   *   Di channel tertentu memakai CROSS_COLUMNS, di "All Channels" memakai
   *   CROSS_ALL_COLUMNS — persis pola yang sudah dipakai content_level dan
   *   channel_level, jadi angkanya sebaris dengan tabel di sebelahnya.
   */
  cross_level: {
    id: 'cross_level', label: 'Cross-Level Metric', icon: 'stacked_bar_chart',
    description: 'Mix content & channel metrics — this period vs last.',
    rowType: 'comparison', channelScoped: true,
    columns: CROSS_COLUMNS,
    defaultColumns: CROSS_DEFAULTS,
    allColumns: CROSS_ALL_COLUMNS,
    allDefaultColumns: CROSS_ALL_DEFAULTS,
  },
  // Per-platform comparison tables — only on the "All Channels" view. Rows are the
  // platforms (Instagram / Facebook / TikTok); each cell is the CURRENT-period value.
  // They reuse the Content/Channel Performance combined-metric columns so the numbers
  // line up with the aggregate "all" tables, just broken out per platform.
  content_by_platform: {
    id: 'content_by_platform', label: 'Content by Platform', icon: 'compare_arrows',
    description: 'Compare content metrics across Instagram, Facebook & TikTok.', rowType: 'platforms',
    columns: CONTENT_ALL_COLUMNS,
    defaultColumns: CONTENT_ALL_DEFAULTS,
  },
  channel_by_platform: {
    id: 'channel_by_platform', label: 'Channel by Platform', icon: 'leaderboard',
    description: 'Compare profile metrics across Instagram, Facebook & TikTok.', rowType: 'platforms',
    columns: CHANNEL_ALL_COLUMNS,
    defaultColumns: CHANNEL_ALL_DEFAULTS,
  },
  cross_by_platform: {
    id: 'cross_by_platform', label: 'Cross-Level by Platform', icon: 'dataset',
    description: 'Mix content & channel metrics in one cumulative table, one row per platform.',
    rowType: 'platforms',
    columns: CROSS_ALL_COLUMNS,
    defaultColumns: CROSS_ALL_DEFAULTS,
  },
  brand_vs_competitor: {
    id: 'brand_vs_competitor', label: 'Brand vs Competitor', icon: 'group',
    description: 'Compare brand performance against competitors.', rowType: 'competitors', channelScoped: true,
    // Public metrics only — a competitor is measured by scraping its public
    // surface, and the three channels do not publish the same things. `channels`
    // hides a column where the platform never exposes it, so the table shows an
    // absent metric as absent rather than as a zero.
    columns: [
      // ── raw ────────────────────────────────────────────────────────────────
      { id: 'followers', label: 'Followers', format: 'compact' },
      { id: 'followers_growth', label: 'Followers Growth', format: 'compact' },
      { id: 'followers_growth_pct', label: 'Followers Growth %', format: 'percent' },
      { id: 'post_count', label: 'Post Count', format: 'number', channels: ['instagram', 'tiktok'] },
      { id: 'likes', label: 'Likes', format: 'compact' },
      { id: 'comments', label: 'Comments', format: 'compact', channels: ['instagram', 'tiktok'] },
      { id: 'shares', label: 'Shares', format: 'compact', channels: ['facebook', 'tiktok'] },
      { id: 'views', label: 'Views', format: 'compact', channels: ['instagram', 'tiktok'] },
      { id: 'saves', label: 'Saves', format: 'compact', channels: ['tiktok'] },
      { id: 'engagement', label: 'Engagement', format: 'compact' },
      // Brand: unified_post.engagement_public (IG = likes + comments). Competitor:
      // its scraped engagement, which is public by nature.
      { id: 'engagement_public', label: 'Engagement Public', format: 'compact' },

      // ── calculated ─────────────────────────────────────────────────────────
      { id: 'avg_engagement', label: 'Avg Engagement / Post', format: 'number' },
      { id: 'avg_engagement_public', label: 'Avg Engagement Public / Post', format: 'number' },
      { id: 'avg_likes', label: 'Avg Likes / Post', format: 'number' },
      { id: 'avg_comments', label: 'Avg Comments / Post', format: 'number', channels: ['instagram', 'tiktok'] },
      { id: 'avg_shares', label: 'Avg Shares / Post', format: 'number', channels: ['facebook', 'tiktok'] },
      { id: 'avg_views', label: 'Avg Views / Post', format: 'number', channels: ['instagram', 'tiktok'] },
      { id: 'avg_saves', label: 'Avg Saves / Post', format: 'number', channels: ['tiktok'] },
      { id: 'er_followers', label: 'ER Followers (%)', format: 'percent' },
      { id: 'avg_er_followers', label: 'Avg ER Followers / Post (%)', format: 'percent' },
      { id: 'views_per_follower', label: 'Views / Follower', format: 'number', channels: ['instagram', 'tiktok'] },

      // ── brand-only: no public surface exposes a competitor's reach ──────────
      { id: 'post_reach', label: 'Post Reach', format: 'compact' },
      { id: 'profile_reach', label: 'Profile Reach', format: 'compact' },
    ],
    // Tanpa ini SEMUA kolom (±19 di IG) tercentang — angkanya terpotong "1,19…"
    // di slide. Sisanya tinggal dicentang di modal.
    defaultColumns: [
      'followers', 'followers_growth', 'post_count', 'views', 'engagement',
      'avg_engagement', 'avg_views', 'er_followers',
    ],
  },
  // Monthly Tracker Performance (deck revisi Report Maker, slide 11/12): satu baris
  // per bulan, Jan → bulan report, dengan perubahan MoM di bawah tiap angka. Kolom
  // Key Highlight diisi tangan per bulan langsung di tabelnya (TableConfig.highlights).
  monthly_tracker: {
    id: 'monthly_tracker', label: 'Monthly Tracker', icon: 'calendar_month',
    description: 'Month by month, Jan → report month, with MoM change.', rowType: 'months',
    columns: [
      { id: 'followers', label: 'Followers', format: 'number' },
      { id: 'followers_growth', label: 'Followers Growth', format: 'number' },
      { id: 'reach', label: 'Channel Reach', format: 'number' },
      { id: 'profile_visit', label: 'Profile Views', format: 'number' },
      { id: 'profile_reach', label: 'Profile Reach', format: 'number' },
      { id: 'total_posts', label: 'Total Post', format: 'number' },
      { id: 'engagement', label: 'Total Engagement', format: 'number' },
      { id: 'likes', label: 'Likes', format: 'number' },
      { id: 'comments', label: 'Comments', format: 'number' },
      { id: 'shares', label: 'Shares', format: 'number' },
      { id: 'impressions', label: 'Impressions', format: 'number' },
      { id: 'er', label: 'Engagement Rate', format: 'percent' },
      { id: 'key_highlight', label: 'Key Highlight', format: 'text' },
    ],
    defaultColumns: ['followers', 'followers_growth', 'reach', 'profile_visit', 'total_posts', 'engagement', 'key_highlight'],
  },
  /**
   * YTD Metric (Post-UAT brief, YTD Metrics): matriks Last Year / This Year /
   * Growth seperti slide YTD Performance, tapi sebagai tabel biasa sehingga bisa
   * dipasang di slide format lain. Kolomnya = metrik YTD brand di channel itu
   * (dinamis, lihat columnsForChannel); angkanya dari ReportYtdMetrics yang sama
   * dengan slide YTD, jadi kedua tempat tidak mungkin berbeda.
   */
  ytd_metrics: {
    id: 'ytd_metrics', label: 'YTD Metric', icon: 'timeline',
    description: 'Accumulated since the brand’s YTD start vs the same window last year.', rowType: 'ytd',
    columns: [],
  },
  sentiments: {
    id: 'sentiments', label: 'Sentiments', icon: 'favorite',
    description: 'Sentiment analysis breakdown.', rowType: 'sentiments',
    columns: [
      { id: 'number_of_posts', label: 'Number of Posts', format: 'number' },
      { id: 'percentage', label: 'Percentage (%)', format: 'percent' },
    ],
  },
}

const ROW_DEFS: Record<TableRowType, { id: string; label: string; isGap?: boolean }[]> = {
  comparison: [
    { id: 'prev', label: 'Previous Month' },
    { id: 'curr', label: 'Current Month' },
    { id: 'gap', label: 'Growth (%)', isGap: true },
  ],
  competitors: [
    { id: 'brand', label: 'Brand' },
    { id: 'comp_a', label: 'Competitor A' },
    { id: 'comp_b', label: 'Competitor B' },
    { id: 'comp_c', label: 'Competitor C' },
  ],
  sentiments: [
    { id: 'positive', label: 'Positive' },
    { id: 'neutral', label: 'Neutral' },
    { id: 'negative', label: 'Negative' },
  ],
  months: [],   // dinamis — satu baris per bulan dari data monthly tracker
  ytd: [
    { id: 'prior', label: 'Last Year' },
    { id: 'curr', label: 'This Year' },
    { id: 'gap', label: 'Growth (%)', isGap: true },
  ],
  platforms: [
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'tiktok', label: 'TikTok' },
  ],
  generic: [
    { id: '1', label: 'Item 1' },
    { id: '2', label: 'Item 2' },
    { id: '3', label: 'Item 3' },
  ],
}

export function firstColHeader(rowType: TableRowType): string {
  return rowType === 'comparison' || rowType === 'ytd' ? 'Period'
    : rowType === 'competitors' ? 'Brand'
    : rowType === 'sentiments' ? 'Sentiment'
    : rowType === 'platforms' ? 'Platform'
    : rowType === 'months' ? 'Month'
    : 'Category'
}

/**
 * The Sentiments table breakdown for a slide's channel. A specific platform
 * returns that platform's posts-by-sentiment; "all" (or any non-platform) combines
 * every platform (percentages recomputed). Null when there's no data for the scope.
 */
export function sentimentTableFor(
  sentiment: Partial<Record<DashPlatform, SentimentTable>> | undefined,
  channel: string,
): SentimentTable | null {
  if (!sentiment) return null
  if (channel === 'instagram' || channel === 'facebook' || channel === 'tiktok') {
    return sentiment[channel] ?? null
  }
  const acc = { positive: 0, neutral: 0, negative: 0 }
  let any = false
  for (const t of Object.values(sentiment)) {
    if (!t) continue
    any = true
    acc.positive += t.positive.number_of_posts
    acc.neutral += t.neutral.number_of_posts
    acc.negative += t.negative.number_of_posts
  }
  const total = acc.positive + acc.neutral + acc.negative
  if (!any || total === 0) return null
  const pct = (n: number) => (n / total) * 100
  return {
    positive: { number_of_posts: acc.positive, percentage: pct(acc.positive) },
    neutral: { number_of_posts: acc.neutral, percentage: pct(acc.neutral) },
    negative: { number_of_posts: acc.negative, percentage: pct(acc.negative) },
  }
}

/** A column shows on a channel when it has no `channels` restriction or lists it. */
export function isColumnOnChannel(col: TableColumn, channel: string): boolean {
  return !col.channels || col.channels.includes(channel as DashPlatform)
}

/** Columns of a type available for the given slide channel. On "all", a
 *  channel-scoped type uses its `allColumns` layout when defined (Content/Channel
 *  Performance spec), else the channel-agnostic subset of `columns`. */
export function columnsForChannel(typeId: string, channel: string, ytd?: YtdChannel | null): TableColumn[] {
  const def = TABLE_TYPES[typeId]
  if (!def) return []
  // Kolom YTD = metrik YTD yang memang dibangun untuk brand & channel ini.
  if (def.rowType === 'ytd') return (ytd?.rows ?? []).map(r => ({ id: r.metric, label: ytdLabel(r.metric), format: 'number' as const }))
  if (!def.channelScoped) return def.columns
  // On "all", only columns without a channel restriction survive — the metrics every
  // channel publishes. A column scoped to some platforms would otherwise compare a
  // TikTok-only number against blanks and read as a deficit rather than an absence.
  if (channel === 'all') return def.allColumns ?? def.columns.filter(c => isColumnOnChannel(c, 'all'))
  return def.columns.filter(c => isColumnOnChannel(c, channel))
}

/** Pre-checked columns for a type on a channel (core set, kept to what's available). */
export function defaultColumnsFor(typeId: string, channel: string, ytd?: YtdChannel | null): string[] {
  const avail = columnsForChannel(typeId, channel, ytd)
  const def = TABLE_TYPES[typeId]
  // YTD: katalognya bisa puluhan metrik (semua scorecard dashboard), jadi yang
  // tercentang hanya lima pertama — metrik ber-KPI selalu di depan.
  if (def?.rowType === 'ytd') return avail.slice(0, 5).map(c => c.id)
  const base = (channel === 'all' && def?.allColumns ? def.allDefaultColumns : def?.defaultColumns) ?? avail.map(c => c.id)
  const filtered = base.filter(id => avail.some(c => c.id === id))
  return filtered.length ? filtered : avail.map(c => c.id)
}

/**
 * Every table type is available on any channel, including "all" — content/channel
 * level now carry a cross-channel aggregate (summed counts, recomputed rates), and
 * on "all" only the channel-agnostic columns are shown (see columnsForChannel).
 */
export function isTypeEnabledForChannel(typeId: string, channel: string): boolean {
  if (!(typeId in TABLE_TYPES) || channel === '') return false
  // The per-platform comparison tables ARE the cross-channel breakdown, so they only
  // make sense on the "All Channels" view (rows = each platform).
  if (typeId === 'content_by_platform' || typeId === 'channel_by_platform' || typeId === 'cross_by_platform') {
    return channel === 'all'
  }
  // Periode YTD disimpan per platform; tidak ada agregat lintas channel.
  if (typeId === 'ytd_metrics') return channel !== 'all'
  return true
}

/** Reason a table type is greyed out for the current channel (shown in the picker). */
export function typeChannelHint(typeId: string): string {
  if (typeId === 'content_by_platform' || typeId === 'channel_by_platform' || typeId === 'cross_by_platform') {
    return 'Only available on “All Channels”.'
  }
  return 'Pick a specific channel to use this table.'
}

// Real DB values: percent keeps up to 2 decimals; time is already in seconds
// (metricsQuery normalizes avg_watch_time to seconds), shown to 1 decimal.
function fmtReal(format: TableFormat, val: number, compact = false): string {
  if (format === 'percent') return (Math.round(val * 100) / 100) + '%'
  if (format === 'time') return (Math.round(val * 10) / 10) + 's'
  // Rasio kecil (Views / Follower ≈ 0.30, rata-rata per post < 10) dulu
  // dibulatkan groupInt jadi "0" — dan tetap diberi growth, jadi terbaca "0 (-28%)".
  if (Math.abs(val) < 10 && !Number.isInteger(val)) return String(Math.round(val * 100) / 100)
  return compact ? compactNum(val) : groupInt(val)
}

export interface TableCell {
  text: string; gap?: boolean; positive?: boolean
  /** Growth row: no change (rounds to 0.0%) → "0%" in neutral black. */
  flat?: boolean
  /** Baris kedua kecil di bawah angka — perubahan MoM tabel Monthly Tracker, atau
   *  growth vs periode sebelumnya di tabel per-platform. `inline` = di samping
   *  angka, bukan di bawahnya. */
  sub?: { text: string; positive: boolean; flat: boolean; inline?: boolean }
  /** Teks bebas (Key Highlight): rata kiri, bukan font angka. */
  note?: boolean
}
export interface TableRow { id: string; label: string; isGap?: boolean; cells: Record<string, TableCell> }

// Real cell from DB metrics. Null values (missing/ambiguous data) render "—".
function realCell(rowId: string, col: TableColumn, mv: MetricPair | undefined, cx = false): TableCell {
  const prev = mv?.prev ?? null
  const curr = mv?.curr ?? null
  if (rowId === 'gap') {
    if (prev != null && curr != null && prev !== 0) {
      const g = ((curr - prev) / prev) * 100
      // "+12.3%" green / "-12.3%" red / "0%" black (anything that rounds to 0.0).
      if (Math.abs(g) < 0.05) return { text: '0%', gap: true, flat: true }
      return { text: (g > 0 ? '+' : '-') + Math.abs(g).toFixed(1) + '%', gap: true, positive: g > 0 }
    }
    return { text: '—' } // no data → neutral dash (no gap coloring)
  }
  const v = rowId === 'prev' ? prev : curr
  return { text: v == null ? '—' : fmtReal(col.format, v, cx) }
}

// Real cell for the Sentiments table (row = sentiment, col = posts / percentage).
function sentimentCell(rowId: string, col: TableColumn, s: SentimentTable, cx = false): TableCell {
  const row = s[rowId as keyof SentimentTable]
  if (!row) return { text: '—' }
  if (col.id === 'number_of_posts') return { text: fmtReal('number', row.number_of_posts, cx) }
  if (col.id === 'percentage') return { text: fmtReal('percent', row.percentage) }
  return { text: '—' }
}

// Real cell for a Brand-vs-Competitor row (value keyed by column id; null → "—").
function competitorCell(entity: CompetitorEntity, col: TableColumn, cx = false, growth = false, inline = false): TableCell {
  const v = entity.values[col.id] ?? null
  const cell: TableCell = { text: v == null ? '—' : fmtReal(col.format, v, cx) }
  if (growth && !skipsGrowth(col.id)) cell.sub = growthSub(v, entity.prevValues?.[col.id] ?? null, inline)
  return cell
}

// Row order + labels for the per-platform comparison tables.
const PLATFORM_ROW_ORDER: DashPlatform[] = ['instagram', 'facebook', 'tiktok']
const PLATFORM_ROW_LABEL: Record<DashPlatform, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
}

/**
 * Build table rows. Real DB values for a comparison table (content_level /
 * channel_level) when `metrics` is supplied, for the sentiments table when
 * `sentiment` is supplied, for the Brand-vs-Competitor table when `competitors`
 * is supplied, and for the per-platform tables when `platformMetrics` is supplied
 * — null values render "—". Without a real source (or while data loads) rows
 * render "—" too: no seeded numbers.
 */
export function buildTable(...args: Parameters<typeof buildTableRaw>): ReturnType<typeof buildTableRaw> {
  const out = buildTableRaw(...args)
  // Singkatan nama metrik hanya di header tabel; id & label asli di picker tidak
  // berubah, jadi konfigurasi tersimpan tetap terbaca apa pun pilihan labelnya.
  if (args[0].labels === 'full') return out
  return { ...out, columns: out.columns.map(c => ({ ...c, label: shortMetricLabel(c.label) })) }
}

function buildTableRaw(
  config: TableConfig,
  availableColumns: TableColumn[],
  metrics?: SectionMetrics | null,
  sentiment?: SentimentTable | null,
  competitors?: CompetitorSection | null,
  customCols: TableColumn[] = [],
  platformMetrics?: PlatformMetrics | null,
  /** 'monthly_tracker' — bulan-bulan yang ditampilkan (lihat trackerMonthsFor). */
  months?: TrackerMonth[] | null,
  /** Tabel per-platform — nilai periode sebelumnya, untuk opsi showGrowth. */
  platformPrev?: PlatformMetrics | null,
  /** 'ytd_metrics' — data YTD channel slide. */
  ytd?: YtdChannel | null,
): { header: string; columns: TableColumn[]; rows: TableRow[] } {
  const def = TABLE_TYPES[config.type] ?? TABLE_TYPES.content_level
  const cx = config.numbers === 'compact'
  // Selections saved before a column was renamed still carry the old id.
  const selected = normalizeColumnIds(config.columns)
  // Custom metrics attach to the comparison metric tables only (content/channel level).
  const extra = def.rowType === 'comparison' ? customCols.filter(c => selected.includes(c.id)) : []
  // Universe = the columns available for this table on the slide's channel (per-channel
  // columns, or the all-channel Content/Channel Performance layout on "all"). Order
  // follows the universe so the all-channel SUM/AVG pairs stay in spec order.
  const columns = [...availableColumns.filter(c => selected.includes(c.id)), ...extra]

  // Competitor table: dynamic rows (Brand + chosen competitors by @username).
  // config.competitorIds picks which competitors show (undefined = all). While
  // data loads (competitors == null) fall back to placeholder rows of "—".
  if (def.rowType === 'competitors') {
    let rows: TableRow[]
    if (competitors) {
      const sel = config.competitorIds
      const chosen = sel
        ? competitors.competitors.filter(c => sel.includes(c.id))
        : competitors.competitors
      const entities = [competitors.brand, ...chosen]
      const inline = columns.length <= 6
      rows = entities.map(e => {
        const cells: Record<string, TableCell> = {}
        columns.forEach(col => { cells[col.id] = competitorCell(e, col, cx, !!config.showGrowth, inline) })
        return { id: e.id, label: e.label, cells }
      })
    } else {
      rows = ROW_DEFS.competitors.map(r => {
        const cells: Record<string, TableCell> = {}
        columns.forEach(col => { cells[col.id] = { text: '—' } })
        return { id: r.id, label: r.label, cells }
      })
    }
    return { header: firstColHeader('competitors'), columns, rows }
  }

  // YTD: Last Year / This Year / Growth per metrik, format bawaan tiap baris YTD.
  if (def.rowType === 'ytd') {
    const rows: TableRow[] = ROW_DEFS.ytd.map(r => {
      const cells: Record<string, TableCell> = {}
      columns.forEach(col => {
        const yr = ytd?.rows.find(x => x.metric === col.id)
        if (!yr) { cells[col.id] = { text: '—' }; return }
        if (r.id === 'gap') {
          const text = fmtYtdGrowth(yr)
          const d = yr.percentage == null ? null : yr.percentage - 100
          cells[col.id] = d == null ? { text } : { text, gap: true, positive: d > 0, flat: Math.abs(d) < 0.005 }
          return
        }
        cells[col.id] = { text: r.id === 'prior' ? fmtYtdPrior(yr) : fmtYtdRow(yr) }
      })
      return { id: r.id, label: r.label, isGap: r.isGap, cells }
    })
    return { header: firstColHeader('ytd'), columns, rows }
  }

  // Monthly tracker: satu baris per bulan; tiap angka membawa perubahan vs bulan
  // sebelumnya. Selama data memuat (months == null) tabelnya kosong.
  if (def.rowType === 'months') {
    const list = months ?? []
    const rows: TableRow[] = list.map((m, i) => {
      const prev = i > 0 ? list[i - 1] : null
      const cells: Record<string, TableCell> = {}
      columns.forEach(col => {
        if (col.id === 'key_highlight') {
          cells[col.id] = { text: config.highlights?.[m.month] ?? '', note: true }
          return
        }
        const metric = TABLE_COLUMN_TO_TRACKER[col.id] ?? (col.id as TrackerMetric)
        const v = m.values[metric]
        const d = prev ? trackerMom(v, prev.values[metric], metric) : null
        cells[col.id] = {
          text: fmtTrackerValue(metric, v),
          sub: d == null ? undefined : { text: fmtTrackerMom(metric, d), positive: d > 0, flat: Math.abs(d) < 0.005 },
        }
      })
      return { id: m.month, label: fmtTrackerMonth(m.month), cells }
    })
    return { header: firstColHeader('months'), columns, rows }
  }

  // Per-platform comparison table: one row per platform, current-period value per
  // column. Only the platforms present in platformMetrics get a row; while data
  // loads (platformMetrics == null) all three show as placeholders of "—".
  if (def.rowType === 'platforms') {
    const present = platformMetrics ? PLATFORM_ROW_ORDER.filter(p => platformMetrics[p]) : []
    const shown = present.length ? present : PLATFORM_ROW_ORDER
    // Growth di samping angka kalau kolomnya sedikit (seperti contoh di brief:
    // "5,381 (+73%)"); di bawahnya kalau kolomnya banyak, supaya tidak terpotong.
    const inline = columns.length <= 6
    const rows: TableRow[] = shown.map(p => {
      const vals = platformMetrics?.[p]
      const prevVals = platformPrev?.[p]
      const cells: Record<string, TableCell> = {}
      columns.forEach(col => {
        const v = vals ? vals[col.id] ?? null : null
        const cell: TableCell = { text: v == null ? '—' : fmtReal(col.format, v, cx) }
        const pv = prevVals ? prevVals[col.id] ?? null : null
        if (config.showGrowth && !skipsGrowth(col.id)) cell.sub = growthSub(v, pv, inline)
        cells[col.id] = cell
      })
      return { id: p, label: PLATFORM_ROW_LABEL[p], cells }
    })
    return { header: firstColHeader('platforms'), columns, rows }
  }

  const useReal = def.rowType === 'comparison' && metrics != null
  const useSent = def.rowType === 'sentiments' && sentiment != null
  const rows: TableRow[] = ROW_DEFS[def.rowType].map(r => {
    const cells: Record<string, TableCell> = {}
    columns.forEach(col => {
      cells[col.id] = useReal ? realCell(r.id, col, metrics![col.id], cx)
        : useSent ? sentimentCell(r.id, col, sentiment!, cx)
        : { text: '—' }
    })
    return { id: r.id, label: r.label, isGap: r.isGap, cells }
  })
  return { header: firstColHeader(def.rowType), columns, rows }
}
