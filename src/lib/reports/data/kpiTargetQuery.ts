// Target KPI brand + capaiannya untuk slide "KPI Overview". Saudara dari
// kpiQuery / chartQuery, tapi sumbernya lain: `public.kpi_setting` (target yang
// di-set di tab KPI brand) + `l2_gold.kpi_achievement` (capaiannya).
import pool from '@/lib/db'
import type { DashPlatform } from '@/components/dashboard/data'
import type { KpiMetric } from '@/lib/kpi/types'
import type { KpiTarget, ReportKpiTargets } from './kpiTargets'

const PLATFORMS: readonly string[] = ['instagram', 'facebook', 'tiktok']
const pad = (n: number) => String(n).padStart(2, '0')

interface Row {
  kpi_id: string; platform: string; metrics_target: string; operation: string
  value_target: string; start_date: string; end_date: string
  achieved_value: string | null; achievement_rate: string | null
  run_rate: string | null; time_gone: string | null; period_end: string | null
}

// Baris capaian yang dipakai = bulan report, dijepit ke [bulan mulai, bulan
// akhir] KPI: report sesudah KPI berakhir memakai bulan terakhir KPI (angka
// finalnya), report sebelum KPI mulai tidak menemukan baris → kartu "—".
//
// Urut naik menurut waktu pembuatan — BUKAN turun seperti daftar di tab KPI.
// Di tab, yang baru dibuat paling berguna di atas. Di slide, urutan kartu adalah
// tata letak: dengan urutan turun, menambah satu KPI menggeser semua kartu yang
// sudah ada ke kanan dan mendorong yang terakhir keluar dari slide.
const SELECT = `
  SELECT k.kpi_id, p.key AS platform, k.metrics_target, k.operation, k.value_target,
         to_char(k.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(k.end_date,   'YYYY-MM-DD') AS end_date,
         a.achieved_value, a.achievement_rate, a.run_rate, a.time_gone,
         to_char(a.period_end, 'YYYY-MM-DD') AS period_end
    FROM public.kpi_setting k
    JOIN public.brands b ON b.id = k.brand_id AND b.deleted_at IS NULL
    JOIN public.platforms p ON p.id = k.platform_id
    LEFT JOIN l2_gold.kpi_achievement a
           ON a.kpi_id = k.kpi_id
          AND a.period_month = date_trunc('month', LEAST($3::date, k.end_date))::date
   WHERE b.organization_id = $1 AND k.brand_id = $2 AND k.is_active
   ORDER BY k.created_at ASC`

const num = (v: string | null): number | null => (v == null ? null : Number(v))

/**
 * KPI aktif satu brand, dikelompokkan per platform, dengan capaian per akhir
 * bulan report.
 *
 * ANGKANYA DIBACA, TIDAK DIHITUNG (UAT 2026-11-08)
 *   Capaian, achievement rate, run rate, dan time gone dibaca apa adanya dari
 *   `l2_gold.kpi_achievement` — hasil `l2_gold.sp_calculate_kpi_achievement`,
 *   rumus yang sudah disetujui klien. Dulu dihitung ulang di sini (time gone per
 *   HARI), dan hasilnya meleset dari tabel (Fitbar IG followers growth Okt 2026:
 *   179.82% vs 179.32%) karena procedure-nya memakai basis BULAN.
 *
 *   Procedure menyimpan satu baris per (kpi, bulan), jadi cutoff periode report
 *   tetap terjaga: report September yang dibuka di November membaca baris
 *   September, bukan capaian sampai hari ini.
 */
export async function getReportKpiTargets(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportKpiTargets> {
  const reportMonth = `${year}-${pad(month)}-01`
  const { rows } = await pool.query<Row>(SELECT, [orgId, brandId, reportMonth])

  const out: ReportKpiTargets = {}
  for (const r of rows) {
    if (!PLATFORMS.includes(r.platform)) continue
    const platform = r.platform as DashPlatform
    const kpi: KpiTarget = {
      kpiId: r.kpi_id,
      platform,
      metric: r.metrics_target as KpiMetric,
      operation: r.operation,
      target: Number(r.value_target),
      achieved: num(r.achieved_value),
      achievementRate: num(r.achievement_rate),
      runRate: num(r.run_rate),
      timeGone: num(r.time_gone),
      startDate: r.start_date,
      endDate: r.end_date,
      asOf: r.period_end ?? undefined,
    }
    ;(out[platform] ??= []).push(kpi)
  }
  return out
}
