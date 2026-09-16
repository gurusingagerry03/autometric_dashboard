// Slide "YTD Performance": akumulasi berjalan sejak awal periode YTD brand,
// dibandingkan dengan periode yang sama satu tahun sebelumnya. Client-safe —
// dipakai bersama preview, exporter, dan jalur AI.
//
// DUA SUMBER, SATU JENDELA
//   1. Metrik ber-KPI dibaca apa adanya dari `l2_gold.ytd_performance`, hasil
//      `l2_gold.sp_calculate_ytd_performance`. Tidak ada yang dihitung ulang —
//      termasuk perbandingan tahun lalu, yang di procedure memakai
//      `start_date - INTERVAL '1 year'` dan tidak bisa ditiru dengan aritmetika
//      hari tanpa meleset di tahun kabisat.
//   2. Metrik DASHBOARD (katalog scorecard di kpiMetrics.ts) diagregasi langsung
//      dari medallion sepanjang jendela yang sama, dan diberi awalan `dash:`.
//      Procedure `RAISE EXCEPTION` untuk metrics_target di luar 11 key-nya, jadi
//      metrik seperti Engagement Rate atau Story Views memang tidak bisa lewat
//      sana — sementara pemakai tetap mengharapkannya ada di YTD, karena mereka
//      melihatnya tiap hari di dashboard.
//
//   Keduanya memakai jendela yang identik (lihat ytdQuery.ts: satu `asOf` untuk
//   seluruh brand), jadi angkanya sebanding — kartu di slide yang sama tidak
//   diam-diam menghitung sampai tanggal yang berbeda.
import type { DashPlatform } from '@/components/dashboard/data'
import { KPI_METRIC_LABEL, type KpiMetric } from '@/lib/kpi/types'
import { KPI_DEF_BY_KEY, formatKpiValue, kpiDefsForChannel, type KpiDef, type KpiFmt } from './kpiMetrics'
import { kpiTargetIcon } from './kpiTargets'
import { groupInt } from './format'

/** Periode YTD satu brand, beserta periode pembandingnya setahun sebelumnya. */
export interface YtdWindow {
  start: string       // YYYY-MM-DD — ytd_setting.start_date
  end: string         // YYYY-MM-DD — ytd_setting.end_date
  /** Hari terakhir yang benar-benar terhitung: LEAST(hari ini, end). */
  asOf: string
  priorStart: string  // start − 1 tahun
  priorEnd: string    // asOf − 1 tahun
}

/** Satu metrik YTD pada hari terakhir yang terhitung. */
export interface YtdRow {
  /** Key KPI ('likes') atau key dashboard ber-awalan ('dash:er'). */
  metric: string
  /** Dari mana angkanya: procedure YTD, atau agregat dashboard. */
  source: 'kpi' | 'dash'
  cumulative: number | null
  priorYear: number | null
  /** cumulative / priorYear × 100. null kalau tahun lalu tidak punya data. */
  percentage: number | null
  /** Porsi periode yang sudah lewat, dalam persen — sama untuk semua metrik. */
  runRate: number | null
  /** Format tampilan; hanya terisi untuk metrik dashboard (ER persen, dst). */
  format?: KpiFmt
}

export interface YtdChannel { window: YtdWindow; rows: YtdRow[] }
export type ReportYtdMetrics = Partial<Record<DashPlatform, YtdChannel>>

export const ytdChannelFor = (
  m: ReportYtdMetrics | null | undefined, channel: string,
): YtdChannel | null => m?.[channel as DashPlatform] ?? null

/** Metrik YTD di satu channel. undefined = tidak dibangun untuk channel itu. */
export const ytdRowFor = (
  m: ReportYtdMetrics | null | undefined, channel: string, metric: string | null,
): YtdRow | undefined =>
  metric ? ytdChannelFor(m, channel)?.rows.find(r => r.metric === metric) : undefined

/* ── Metrik dashboard di dalam YTD ──────────────────────────────────────────
 *
 * Diberi awalan supaya tidak pernah bertabrakan dengan key KPI: 'likes' ada di
 * kedua katalog, dan tanpa awalan report yang sudah tersimpan akan memungut
 * baris dari sumber yang kebetulan lebih dulu ada di array. Awalannya mengikuti
 * kebiasaan yang sama dengan 'ct:'/'ch:' di metricsContext.
 */
export const YTD_DASH_PREFIX = 'dash:'
export const ytdDashKey = (key: string): string => YTD_DASH_PREFIX + key
export const isYtdDash = (key: string): boolean => key.startsWith(YTD_DASH_PREFIX)
export const ytdDashBase = (key: string): string =>
  isYtdDash(key) ? key.slice(YTD_DASH_PREFIX.length) : key

/**
 * Metrik KPI yang membaca KOLOM YANG SAMA dengan metrik dashboard tertentu.
 *
 * Dipakai untuk membuang duplikat dari daftar dashboard: kalau brand punya KPI
 * 'likes', kartu "Likes" sudah ditawarkan dari sisi KPI, dan menawarkannya lagi
 * dari sisi dashboard hanya memberi dua pilihan dengan nama dan angka identik.
 *
 * `video_views` dan `post_count` sengaja TIDAK ada di sini: `video_views`
 * membaca `video_views_sum` sedangkan dashboard 'views' membaca `views_sum` —
 * mirip nama, beda kolom — dan `post_count` tidak punya padanan di katalog
 * dashboard.
 */
const KPI_SAME_COLUMN_AS: Partial<Record<KpiMetric, string>> = {
  followers_growth: 'growth',
  engagement: 'engagement',
  reach: 'reach',
  impressions: 'impressions',
  views: 'views',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
  saves: 'saves',
}

/**
 * Def dashboard yang layak ditawarkan di YTD untuk satu channel: katalog
 * scorecard channel itu, dikurangi metrik yang sudah diwakili baris KPI.
 */
export function ytdDashDefsFor(channel: string, kpiMetrics: readonly string[]): KpiDef[] {
  const covered = new Set(
    kpiMetrics.map(m => KPI_SAME_COLUMN_AS[m as KpiMetric]).filter((k): k is string => !!k),
  )
  return kpiDefsForChannel(channel).filter(d => !covered.has(d.key))
}

/** Baris KPI (procedure) dan baris dashboard, terpisah — untuk pemilih metrik. */
export const ytdRowsBySource = (rows: readonly YtdRow[]) => ({
  kpi: rows.filter(r => r.source === 'kpi'),
  dash: rows.filter(r => r.source === 'dash'),
})

export const ytdLabel = (metric: string): string =>
  isYtdDash(metric)
    ? KPI_DEF_BY_KEY[ytdDashBase(metric)]?.label ?? ytdDashBase(metric)
    : KPI_METRIC_LABEL[metric as KpiMetric] ?? metric

export const ytdIcon = (metric: string): string =>
  isYtdDash(metric)
    ? KPI_DEF_BY_KEY[ytdDashBase(metric)]?.icon ?? 'insights'
    : kpiTargetIcon(metric as KpiMetric)

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Nilai kartu. `format` hanya dibawa baris dashboard — metrik KPI semuanya
 * cacahan, sementara di dashboard ada Engagement Rate (persen) dan Avg. Watch
 * Time (detik) yang kalau dicetak sebagai cacahan akan terbaca "3", bukan "3s".
 */
export const fmtYtdValue = (n: number | null | undefined, format?: KpiFmt): string =>
  n == null ? '—' : format ? formatKpiValue(format, n) : groupInt(n)

/** Nilai satu baris, memakai format bawaannya. */
export const fmtYtdRow = (r: YtdRow): string => fmtYtdValue(r.cumulative, r.format)

export const fmtYtdPct = (n: number | null | undefined): string => (n == null ? '—' : round1(n) + '%')

/**
 * Selisih terhadap tahun lalu dalam persen, untuk badge kartu.
 *
 * `percentage` dari procedure adalah INDEKS (120 = 1,2× tahun lalu), bukan
 * selisih — memasangnya langsung di sebelah panah naik/turun akan terbaca
 * "naik 120%" padahal maksudnya "naik 20%". Jadi indeksnya dikurangi 100 di
 * sini, sekali, alih-alih di tiap tempat yang menggambarnya. Baris dashboard
 * memakai skala yang sama, dihitung di ytdQuery dengan rumus yang sama.
 *
 * null kalau tahun lalu tidak punya data — dan itu keadaan yang normal selama
 * warehouse belum menyimpan data setahun penuh, bukan kesalahan.
 */
export const ytdDelta = (r: YtdRow): number | null =>
  r.percentage == null ? null : round1(r.percentage - 100)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return m ? `${day} ${MON[m - 1]} ${y}` : d
}
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * Rentang sependek mungkin tanpa kehilangan ketepatan: "Jan – Dec 2026" kalau
 * pas dari awal sampai akhir bulan, tanggal penuh kalau tidak.
 *
 * Kartu di slide sempit (enam kolom), dan "1 Jan 2026 – 31 Dec 2026" tidak muat
 * di sana sementara "Jan – Dec 2026" muat dan menyebut hal yang sama.
 */
export function fmtRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  if (sm && em && sd === 1 && ed === lastDayOf(ey, em)) {
    return sy === ey ? `${MON[sm - 1]} – ${MON[em - 1]} ${ey}` : `${MON[sm - 1]} ${sy} – ${MON[em - 1]} ${ey}`
  }
  return `${fmtDay(start)} – ${fmtDay(end)}`
}

/** Periode YTD yang di-set, mis. "Jan – Dec 2026". */
export const fmtYtdRange = (w: YtdWindow): string => fmtRange(w.start, w.end)
/** Periode pembandingnya setahun sebelumnya, mis. "Jan – Sep 2025". */
export const fmtYtdPriorRange = (w: YtdWindow): string => fmtRange(w.priorStart, w.priorEnd)
