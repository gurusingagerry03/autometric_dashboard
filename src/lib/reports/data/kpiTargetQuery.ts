// Target KPI brand + capaiannya untuk slide "KPI Overview". Saudara dari
// kpiQuery / chartQuery, tapi sumbernya lain: `public.kpi_setting` (target yang
// di-set di tab KPI brand) dan `l2_gold.kpi_achievement` (hasil procedure).
import pool from '@/lib/db'
import type { DashPlatform } from '@/components/dashboard/data'
import type { KpiMetric } from '@/lib/kpi/types'
import type { KpiTarget, ReportKpiTargets } from './kpiTargets'

const PLATFORMS: readonly string[] = ['instagram', 'facebook', 'tiktok']

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Row {
  kpi_id: string; platform: string; metrics_target: string; operation: string
  value_target: string; start_date: string; end_date: string
  achieved_value: string | null; achievement_rate: string | null; run_rate: string | null
}
const num = (v: string | null): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

// Urut naik menurut waktu pembuatan — BUKAN turun seperti daftar di tab KPI.
// Di tab, yang baru dibuat paling berguna di atas. Di slide, urutan kartu adalah
// tata letak: dengan urutan turun, menambah satu KPI menggeser semua kartu yang
// sudah ada ke kanan dan mendorong yang terakhir keluar dari slide.
const SELECT = `
  SELECT k.kpi_id, p.key AS platform, k.metrics_target, k.operation, k.value_target,
         to_char(k.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(k.end_date,   'YYYY-MM-DD') AS end_date,
         a.achieved_value, a.achievement_rate, a.run_rate
    FROM public.kpi_setting k
    JOIN public.brands b ON b.id = k.brand_id AND b.deleted_at IS NULL
    JOIN public.platforms p ON p.id = k.platform_id
    LEFT JOIN l2_gold.kpi_achievement a ON a.kpi_id = k.kpi_id
   WHERE b.organization_id = $1 AND k.brand_id = $2 AND k.is_active
   ORDER BY k.created_at ASC`

/**
 * KPI aktif satu brand, dikelompokkan per platform, dengan capaian yang baru
 * dihitung.
 *
 * KENAPA MENGHITUNG ULANG DI JALUR BACA
 *   `l2_gold.kpi_achievement` hanya berubah saat ada yang memanggil procedure-nya
 *   — saat ini hanya ketika KPI dibuat. Tanpa perhitungan ulang, report yang
 *   dibuka sebulan setelah KPI di-set akan menampilkan capaian sebulan lalu,
 *   sementara run rate-nya (yang bergantung pada `current_date`) ikut membeku di
 *   angka lama. Dua-duanya salah, dan tidak ada apa pun di slide yang menandakan
 *   angkanya basi.
 *
 *   Aman diulang: procedure-nya UPSERT per `kpi_id` dan tidak menyimpan riwayat,
 *   jadi memanggilnya lagi hanya menimpa baris yang sama dengan angka hari ini.
 *   Dipanggil per `kpi_id` — bukan tanpa argumen, yang akan menghitung ulang KPI
 *   SELURUH organisasi di database ini hanya karena satu report dibuka.
 *
 *   Kegagalannya tidak menjatuhkan permintaan: angka tersimpan yang agak lama
 *   masih jauh lebih berguna daripada slide kosong, jadi errornya dicatat dan
 *   pembacaannya tetap jalan.
 */
export async function getReportKpiTargets(orgId: string, brandId: string): Promise<ReportKpiTargets> {
  const { rows: active } = await pool.query<{ kpi_id: string }>(
    `SELECT k.kpi_id
       FROM public.kpi_setting k
       JOIN public.brands b ON b.id = k.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1 AND k.brand_id = $2 AND k.is_active`,
    [orgId, brandId],
  )
  for (const { kpi_id } of active) {
    try {
      await pool.query('CALL l2_gold.sp_calculate_kpi_achievement($1)', [kpi_id])
    } catch (err) {
      console.error('[report] kpi achievement recompute failed for', kpi_id, err)
    }
  }

  const { rows } = await pool.query<Row>(SELECT, [orgId, brandId])
  const out: ReportKpiTargets = {}
  for (const r of rows) {
    if (!PLATFORMS.includes(r.platform)) continue
    const platform = r.platform as DashPlatform
    const target: KpiTarget = {
      kpiId: r.kpi_id,
      platform,
      metric: r.metrics_target as KpiMetric,
      operation: r.operation,
      target: Number(r.value_target),
      achieved: num(r.achieved_value),
      achievementRate: num(r.achievement_rate),
      runRate: num(r.run_rate),
      startDate: r.start_date,
      endDate: r.end_date,
    }
    ;(out[platform] ??= []).push(target)
  }
  return out
}
