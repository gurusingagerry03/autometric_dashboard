// Data bulanan untuk slide Monthly Tracker Performance — dan untuk dimensi line
// chart "Monthly" serta tabel "Monthly Tracker" yang bisa dipakai slide mana pun
// (keduanya dipilih lewat ChartSelectionModal / TableSelectionModal biasa).
// Client-safe; sumber datanya di monthlyTrackerQuery.ts.
//
// Satu baris per bulan kalender, dari bulan mulai pilihan slide (bawaan: Januari
// tahun report) s.d. bulan report. Metrik
// aliran dijumlahkan sepanjang bulan; Followers adalah metrik LEVEL, jadi yang
// diambil angka terakhir tiap akun di bulan itu.
import type { DashPlatform } from '@/components/dashboard/data'
import { groupInt } from './format'

export type TrackerMetric =
  | 'followers' | 'followers_growth' | 'reach' | 'profile_views' | 'profile_reach'
  | 'total_posts' | 'engagement' | 'likes' | 'comments' | 'shares' | 'impressions' | 'er'

export type TrackerValues = Partial<Record<TrackerMetric, number | null>>
export interface TrackerMonth {
  /** YYYY-MM */
  month: string
  values: TrackerValues
}
/** Per channel, plus 'all' (gabungan tiga platform), 12 bulan s.d. bulan report. */
export type ReportMonthlyTracker = Partial<Record<DashPlatform | 'all', TrackerMonth[]>>

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/** Bulan mulai bawaan: Januari tahun report. */
export const defaultTrackerFrom = (reportYear: number): string => `${reportYear}-01`

/**
 * Pilihan "mulai dari bulan" — 12 bulan s.d. bulan report (batas data yang
 * diambil monthly-tracker), baru → lama supaya bulan-bulan terdekat di atas.
 */
export function trackerStartOptions(reportYear: number, reportMonth: number): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(reportYear, reportMonth - 1 - i, 1))
    const id = ym(d.getUTCFullYear(), d.getUTCMonth() + 1)
    out.push({ id, label: fmtTrackerMonth(id) })
  }
  return out
}

/**
 * Bulan-bulan tabel/chart: bulan mulai (`from`, bawaan Januari tahun report) →
 * bulan report, lama → baru. Bulan di awal rentang yang belum punya data sama
 * sekali dibuang — baris "—" berderet (atau garis yang merayap di nol) hanya
 * karena warehouse belum mulai menyimpan akan terbaca sebagai performa nol.
 * Bulan kosong DI TENGAH tetap ada.
 */
export function trackerMonthsFor(
  data: ReportMonthlyTracker | null | undefined, channel: string, reportYear: number, reportMonth: number,
  from?: string | null,
): TrackerMonth[] {
  const rows = data?.[channel as DashPlatform | 'all'] ?? []
  const end = ym(reportYear, reportMonth)
  const start = from && from <= end ? from : defaultTrackerFrom(reportYear)
  const inRange = rows.filter(r => r.month >= start && r.month <= end)
  const first = inRange.findIndex(r => Object.values(r.values).some(v => v != null))
  return first < 0 ? [] : inRange.slice(first)
}

/** Id kolom tabel → metrik bulanan. 'profile_visit' = id yang dipakai tabel lain
 *  untuk Profile Views (lihat COLUMN_ALIASES di tableTypes.ts). */
export const TABLE_COLUMN_TO_TRACKER: Record<string, TrackerMetric> = { profile_visit: 'profile_views' }

/** Perubahan vs bulan sebelumnya, dalam persen (ER: selisih poin). null kalau tidak bisa dihitung. */
export function trackerMom(cur: number | null | undefined, prev: number | null | undefined, metric: TrackerMetric): number | null {
  if (cur == null || prev == null) return null
  if (metric === 'er') return cur - prev
  if (prev === 0) return null
  return ((cur - prev) / Math.abs(prev)) * 100
}

export function fmtTrackerValue(metric: TrackerMetric, v: number | null | undefined): string {
  if (v == null) return '—'
  if (metric === 'er') return `${v.toFixed(2)}%`
  const s = groupInt(Math.round(v))
  return metric === 'followers_growth' && v > 0 ? `+${s}` : s
}

/** "▲ 3.20%" / "▼ 1.05pts" — kosong kalau tidak ada pembanding. */
export function fmtTrackerMom(metric: TrackerMetric, d: number | null): string {
  if (d == null) return ''
  const v = Math.abs(d) < 0.005 ? 0 : d
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '•'
  return `${arrow} ${Math.abs(v).toFixed(2)}${metric === 'er' ? 'pts' : '%'}`
}

export interface TrackerTableSizes {
  head: number; month: number; value: number; sub: number; note: number
  /** true = MoM ditulis di samping angka (satu baris), bukan di bawahnya. */
  inline: boolean
}

/**
 * Ukuran huruf tabel Monthly Tracker (cqw — 1cqw = 1% lebar slide) yang PASTI
 * muat: dihitung dari tinggi kartu tabel (`areaCqh`, % tinggi slide), jumlah
 * bulan, dan lebar kolom. Tiap baris berisi angka + MoM di bawahnya; kalau
 * ruangnya terlalu sempit untuk dua baris (banyak bulan di layout Chart + Table),
 * MoM pindah ke samping angka. Dipakai preview (TableBlock) dan PPTX (tableCard).
 */
export function trackerTableSizes(rows: number, areaCqh: number, metricCols: number, hasNote: boolean): TrackerTableSizes {
  const CQW_TO_CQH = 16 / 9
  const LINE = 1.2                       // tinggi baris teks, kelipatan ukuran huruf
  const MAX = 1.6, MIN = 0.62
  // Kartu: padding + label "MONTHLY TRACKER" + jarak + baris judul kolom.
  const rowsArea = Math.max(4, areaCqh - 11)
  const rowH = rowsArea / Math.max(1, rows)
  // Lebar satu kolom angka (cqw). Kolom bulan ±11cqw, Key Highlight 1.8× kolom angka.
  const colW = (88 - 11) / Math.max(1, metricCols + (hasNote ? 1.8 : 0))
  // Angka terpanjang ±9 karakter mono (≈0.6em per karakter); MoM ±8 karakter di 0.72×.
  const twoLine = Math.min(MAX, (rowH / (CQW_TO_CQH * LINE * 1.72)) * 0.95, colW / (9 * 0.62))
  const oneLine = Math.min(MAX, (rowH / (CQW_TO_CQH * LINE)) * 0.9, colW / ((9 + 8 * 0.72) * 0.62))
  // Pilih bentuk yang memberi angka lebih besar; MoM di bawah angka lebih rapi,
  // jadi ia menang kalau selisihnya kecil.
  const inline = oneLine > twoLine * 1.1
  const value = Math.max(MIN, inline ? oneLine : twoLine)
  return {
    value,
    sub: value * 0.72,
    month: Math.min(1.55, value * 0.97),
    note: Math.min(1.35, value * 0.85),
    head: Math.max(0.8, Math.min(1.2, value * 0.8)),
    inline,
  }
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-01' → 'Jan 2026' */
export function fmtTrackerMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTH_ABBR[Number(m) - 1] ?? m} ${y}`
}

/* ── Line chart dimensi "Monthly" ─────────────────────────────────────────────
 * Metrik line chart (LINE_METRICS di chartData.ts) dipetakan ke nilai bulanan,
 * per channel — sumbu tiap channel mulai dari bulan pertamanya yang berdata.
 */
const LINE_TO_TRACKER: Record<string, TrackerMetric> = {
  followers: 'followers',
  profile_views: 'profile_views',
  profile_reach: 'profile_reach',
  net_followers_growth: 'followers_growth',
  engagements: 'engagement',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
}

/** Data dimensi "Monthly" di konteks chart: payload bulanan + bulan report. */
export interface ChartMonthly { data: ReportMonthlyTracker | null; year: number; month: number }

export const trackerToChartMonthly = (
  data: ReportMonthlyTracker | null | undefined, year: number, month: number,
): ChartMonthly | null => (data ? { data, year, month } : null)

/**
 * Deret line chart "Monthly" untuk satu channel, mulai dari `from`. Label bulan
 * membawa tahunnya kalau rentangnya melewati pergantian tahun ("Nov '25").
 */
export function trackerLineData(
  monthly: ChartMonthly | null | undefined, channel: string, from: string | null | undefined, lineIds: string[],
): { labels: string[]; series: { id: string; data: number[] }[] } {
  if (!monthly?.data) return { labels: [], series: [] }
  const rows = trackerMonthsFor(monthly.data, channel, monthly.year, monthly.month, from)
  const crossYear = rows.length > 0 && rows[0].month.slice(0, 4) !== rows[rows.length - 1].month.slice(0, 4)
  const labels = rows.map(r => {
    const [mon, y] = fmtTrackerMonth(r.month).split(' ')
    return crossYear ? `${mon} '${y.slice(2)}` : mon
  })
  const series: { id: string; data: number[] }[] = []
  for (const id of lineIds) {
    const tm = LINE_TO_TRACKER[id]
    if (!tm) continue
    const vals = rows.map(r => r.values[tm] ?? null)
    if (vals.some(v => v != null)) series.push({ id, data: vals.map(v => v ?? 0) })
  }
  return { labels, series }
}
