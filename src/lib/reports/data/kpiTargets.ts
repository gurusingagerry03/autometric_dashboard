// Slide "KPI Overview": target yang di-set di tab KPI brand, BUKAN metrik
// dashboard. Dipakai bersama preview, exporter, dan jalur AI, jadi berkas ini
// tidak boleh mengimpor apa pun dari sisi server.
//
// ANGKANYA MILIK PROCEDURE, BUKAN MILIK BERKAS INI
//   `achieved`, `achievementRate`, dan `runRate` datang apa adanya dari
//   `l2_gold.kpi_achievement` — hasil `l2_gold.sp_calculate_kpi_achievement`.
//   Tidak ada satu pun yang dihitung ulang di sini: menghitung ulang di client
//   berarti dua rumus untuk satu angka, dan yang di slide-lah yang akan diam-diam
//   berbeda dari yang tersimpan.
import type { DashPlatform } from '@/components/dashboard/data'
import { KPI_METRIC_LABEL, type KpiMetric } from '@/lib/kpi/types'
import { groupInt } from './format'

/** Satu KPI brand beserta capaiannya. */
export interface KpiTarget {
  kpiId: string
  platform: DashPlatform
  metric: KpiMetric
  operation: string
  target: number
  /** null = procedure belum pernah jalan untuk KPI ini (baris capaiannya belum ada). */
  achieved: number | null
  achievementRate: number | null   // achieved / target × 100
  runRate: number | null           // hari berjalan / total hari × 100
  startDate: string                // YYYY-MM-DD
  endDate: string                  // YYYY-MM-DD
}

/** KPI aktif per platform, untuk satu brand. */
export type ReportKpiTargets = Partial<Record<DashPlatform, KpiTarget[]>>

/** Paling banyak 6 kartu dalam satu slide — batas yang sama dengan layout KPI. */
export const KPI_TARGET_MAX = 6

/** Semua KPI aktif brand untuk satu channel — daftar pilihan di picker. */
export const kpiTargetsFor = (
  targets: ReportKpiTargets | null | undefined, channel: string,
): KpiTarget[] => targets?.[channel as DashPlatform] ?? []

/** KPI di satu slot kartu. undefined = slot kosong, atau KPI-nya sudah dihapus. */
export const kpiTargetById = (
  targets: ReportKpiTargets | null | undefined, channel: string, kpiId: string | null,
): KpiTarget | undefined =>
  kpiId ? kpiTargetsFor(targets, channel).find(t => t.kpiId === kpiId) : undefined

/**
 * Isi awal slot kartu saat slide KPI Overview dibuat: KPI aktif channel itu,
 * sebanyak kartu yang ada.
 *
 * Diisi di muka supaya slide langsung berguna — pemakai yang sudah men-set KPI
 * di tab brand tidak perlu memilih ulang satu per satu di sini hanya untuk
 * sampai ke keadaan yang sudah jelas dia mau. Slotnya tetap bisa diganti.
 */
export const autofillKpiSlots = (
  targets: ReportKpiTargets | null | undefined, channel: string, count: number,
): (string | null)[] => {
  const available = kpiTargetsFor(targets, channel)
  return Array.from({ length: KPI_TARGET_MAX }, (_, i) =>
    i < count ? available[i]?.kpiId ?? null : null,
  )
}

// Ikon per metrik — sengaja sama dengan KPI_DEFS di kpiMetrics.ts untuk metrik
// yang ada di kedua daftar, supaya satu metrik tidak tampil dengan dua ikon
// berbeda tergantung slide-nya.
const ICON: Record<KpiMetric, string> = {
  followers_growth: 'trending_up',
  engagement:       'touch_app',
  reach:            'ads_click',
  impressions:      'visibility',
  views:            'play_circle',
  video_views:      'play_circle',
  likes:            'favorite',
  comments:         'chat_bubble',
  shares:           'send',
  saves:            'bookmark',
  post_count:       'grid_view',
}

export const kpiTargetIcon = (m: KpiMetric): string => ICON[m] ?? 'flag'
export const kpiTargetLabel = (m: KpiMetric): string => KPI_METRIC_LABEL[m] ?? m

/** Angka capaian/target — bilangan bulat penuh, sama dengan tabel report. */
export const fmtKpiCount = (n: number | null): string => (n == null ? '—' : groupInt(n))

/** Persentase capaian/run rate: satu desimal, dan ribuan tetap dipisah (1.508,9%). */
export const fmtKpiRate = (n: number | null): string => {
  if (n == null) return '—'
  const r = Math.round(n * 10) / 10
  const [int, dec] = Math.abs(r).toFixed(1).split('.')
  return `${r < 0 ? '-' : ''}${groupInt(Number(int))}.${dec}%`
}

/**
 * Capaian sudah mengejar waktu yang terpakai?
 *
 * Inilah yang menggantikan "vs last period": KPI tidak punya periode sebelumnya
 * untuk dibandingkan — yang bisa dibandingkan hanya seberapa jauh capaiannya
 * terhadap seberapa jauh periodenya sudah berjalan. Achievement 40% di run rate
 * 30% berarti di depan jadwal; 40% di run rate 90% berarti tertinggal.
 *
 * null (procedure belum jalan) dianggap BELUM on pace — tidak ada bukti bahwa
 * targetnya terkejar, dan hijau tanpa bukti lebih menyesatkan daripada abu-abu.
 */
export const kpiOnPace = (t: KpiTarget): boolean =>
  t.achievementRate != null && t.runRate != null && t.achievementRate >= t.runRate

// Bulan ditulis pendek dalam bahasa Inggris — sama seperti di seluruh report,
// yang memang berbahasa Inggris apa pun bahasa antarmukanya.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Periode KPI dalam satu baris pendek: "1 Jul – 13 Sep 2026".
 *
 * Tahun ditulis di ujung saja selama rentangnya tidak melompat tahun; kalau
 * melompat, kedua tahun ditulis — 12 bulan dari September berakhir di Agustus
 * tahun berikutnya, dan tanpa tahun di kedua sisi rentang itu terbaca mundur.
 */
export function fmtKpiPeriod(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  if (!sm || !em) return `${start} – ${end}`
  const left = `${sd} ${MON[sm - 1]}${sy === ey ? '' : ` ${sy}`}`
  return `${left} – ${ed} ${MON[em - 1]} ${ey}`
}
