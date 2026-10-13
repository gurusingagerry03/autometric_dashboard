// Katalog KPI — dipakai bersama oleh form (client) dan validasi API (server),
// jadi berkas ini tidak boleh mengimpor apa pun dari sisi server.
//
// SUMBER KEBENARANNYA ADA DI PROCEDURE, BUKAN DI SINI
//   `l2_gold.sp_calculate_kpi_achievement` memetakan `metrics_target` ke kolom
//   `l2_gold.brand_metric_daily` lewat satu CASE, dan `RAISE EXCEPTION` untuk
//   key di luar daftarnya. Jadi daftar di bawah harus persis sama dengan CASE
//   itu — menambah entri di sini tanpa menambah CASE-nya membuat penyimpanan
//   KPI gagal di tengah transaksi, bukan menghasilkan angka yang salah.

export const KPI_PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const
export type KpiPlatform = (typeof KPI_PLATFORMS)[number]

/** 11 key yang dipetakan procedure. Urutannya = urutan tampil di dropdown. */
export const KPI_METRICS = [
  'followers_growth', 'engagement', 'reach', 'impressions',
  'views', 'video_views', 'likes', 'comments', 'shares', 'saves', 'post_count',
] as const
export type KpiMetric = (typeof KPI_METRICS)[number]

export const KPI_METRIC_LABEL: Record<KpiMetric, string> = {
  followers_growth: 'Followers Growth',
  engagement:       'Engagement',
  reach:            'Reach',
  impressions:      'Impressions',
  views:            'Views',
  video_views:      'Video Views',
  likes:            'Likes',
  comments:         'Comments',
  shares:           'Shares',
  saves:            'Saves',
  post_count:       'Post Count',
}

/**
 * Metrik yang boleh dipilih per platform.
 *
 * KENAPA DISARING, PADAHAL PROCEDURE MENERIMA SEMUANYA
 *   Yang disaring bukan metrik yang tidak didukung, tapi metrik yang KOLOM
 *   SUMBERNYA tidak pernah terisi untuk platform itu (dicek ke data aktual, per
 *   2026-09-10 — lihat docs/kpi/metrics-target-by-platform.md). Procedure tetap
 *   jalan untuk metrik seperti itu, hanya saja `achieved_value` selalu 0. Target
 *   yang mustahil tercapai lebih buruk daripada pilihan yang tidak ditawarkan:
 *   angkanya terlihat seperti hasil pengukuran, padahal tidak ada yang diukur.
 *
 *   Yang dibuang: `impressions` di Instagram & TikTok (selalu 0), `saves` di
 *   Facebook & TikTok (selalu 0), `reach` di TikTok (35 dari 439 baris),
 *   `views`/`video_views` di Facebook (42 dari 343 baris).
 */
export const KPI_METRICS_BY_PLATFORM: Record<KpiPlatform, readonly KpiMetric[]> = {
  instagram: ['followers_growth', 'engagement', 'reach', 'views', 'video_views', 'likes', 'comments', 'shares', 'saves', 'post_count'],
  facebook:  ['followers_growth', 'engagement', 'reach', 'impressions', 'likes', 'comments', 'shares', 'post_count'],
  tiktok:    ['followers_growth', 'engagement', 'views', 'video_views', 'likes', 'comments', 'shares', 'post_count'],
}

/**
 * Operator target. Sengaja hanya '=' untuk sekarang (permintaan klien).
 *
 * Kolom `operation` memang disimpan, tapi procedure TIDAK membacanya: capaian
 * selalu dihitung `achieved / target * 100`. Jadi menambah '>=' atau '<=' di
 * sini tidak mengubah perhitungan apa pun sampai procedure-nya ikut diubah.
 */
export const KPI_OPERATIONS = ['='] as const
export type KpiOperation = (typeof KPI_OPERATIONS)[number]

/** Satu baris KPI seperti yang dikirim API ke client. */
export interface KpiRow {
  kpiId: string
  platform: KpiPlatform
  metric: KpiMetric
  operation: string
  valueTarget: number
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
  isActive: boolean
}

/** Payload satu KPI yang dikirim client saat menyimpan. */
export interface KpiInput {
  platform: KpiPlatform
  metric: KpiMetric
  operation: KpiOperation
  valueTarget: number
  startDate: string
  endDate: string
}

const isPlatform = (v: unknown): v is KpiPlatform =>
  typeof v === 'string' && (KPI_PLATFORMS as readonly string[]).includes(v)
const isMetric = (v: unknown): v is KpiMetric =>
  typeof v === 'string' && (KPI_METRICS as readonly string[]).includes(v)
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))

/**
 * Validasi + koersi satu payload dari client. Mengembalikan pesan kesalahan
 * (bukan null) supaya API bisa menyebut baris mana yang bermasalah.
 *
 * Dijalankan ULANG di server meski form sudah membatasi pilihannya: dropdown
 * hanya menahan orang, bukan request.
 */
export function parseKpiInput(raw: unknown): { ok: true; value: KpiInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>
  if (!isPlatform(b.platform)) return { ok: false, error: 'Platform tidak dikenal.' }
  if (!isMetric(b.metric)) return { ok: false, error: 'Metrik tidak dikenal.' }
  if (!KPI_METRICS_BY_PLATFORM[b.platform].includes(b.metric)) {
    return { ok: false, error: `${KPI_METRIC_LABEL[b.metric]} tidak tersedia untuk ${b.platform}.` }
  }
  if (!(KPI_OPERATIONS as readonly string[]).includes(b.operation as string)) {
    return { ok: false, error: 'Operator tidak dikenal.' }
  }
  const valueTarget = Number(b.valueTarget)
  if (!Number.isFinite(valueTarget) || valueTarget <= 0) return { ok: false, error: 'Nilai target harus lebih besar dari 0.' }
  if (!isDate(b.startDate) || !isDate(b.endDate)) return { ok: false, error: 'Periode belum lengkap.' }
  if (b.endDate < b.startDate) return { ok: false, error: 'Tanggal akhir mendahului tanggal mulai.' }

  return {
    ok: true,
    value: {
      platform: b.platform,
      metric: b.metric,
      operation: b.operation as KpiOperation,
      valueTarget,
      startDate: b.startDate,
      endDate: b.endDate,
    },
  }
}
