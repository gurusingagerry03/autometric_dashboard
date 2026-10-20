// Target KPI brand + capaiannya untuk slide "KPI Overview". Saudara dari
// kpiQuery / chartQuery, tapi sumbernya lain: `public.kpi_setting` (target yang
// di-set di tab KPI brand), capaiannya diagregasi dari l2_gold.
import pool from '@/lib/db'
import type { DashPlatform } from '@/components/dashboard/data'
import type { KpiMetric } from '@/lib/kpi/types'
import { EOD_GROWTH, PREV_EOD_JOIN } from '@/lib/metrics/followerGrowth'
import type { KpiTarget, ReportKpiTargets } from './kpiTargets'

const PLATFORMS: readonly string[] = ['instagram', 'facebook', 'tiktok']
const pad = (n: number) => String(n).padStart(2, '0')

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Row {
  kpi_id: string; platform: string; metrics_target: string; operation: string
  value_target: string; start_date: string; end_date: string
  brand_id: string; social_account_id: string | null
  /** LEAST(hari ini, end_date, akhir bulan report) — batas akhir capaian dihitung. */
  period_end: string
  total_days: number; days_elapsed: number
}

// Urut naik menurut waktu pembuatan — BUKAN turun seperti daftar di tab KPI.
// Di tab, yang baru dibuat paling berguna di atas. Di slide, urutan kartu adalah
// tata letak: dengan urutan turun, menambah satu KPI menggeser semua kartu yang
// sudah ada ke kanan dan mendorong yang terakhir keluar dari slide.
const SELECT = `
  SELECT k.kpi_id, p.key AS platform, k.metrics_target, k.operation, k.value_target,
         k.brand_id, k.social_account_id,
         to_char(k.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(k.end_date,   'YYYY-MM-DD') AS end_date,
         to_char(LEAST(CURRENT_DATE, k.end_date, $3::date), 'YYYY-MM-DD') AS period_end,
         ((k.end_date - k.start_date) + 1)::int AS total_days,
         GREATEST(0, LEAST(CURRENT_DATE, k.end_date, $3::date) - k.start_date + 1)::int AS days_elapsed
    FROM public.kpi_setting k
    JOIN public.brands b ON b.id = k.brand_id AND b.deleted_at IS NULL
    JOIN public.platforms p ON p.id = k.platform_id
   WHERE b.organization_id = $1 AND k.brand_id = $2 AND k.is_active
   ORDER BY k.created_at ASC`

// Rumus capaian per metrik — salinan rumus l2_gold.sp_calculate_kpi_achievement
// (milik warehouse, tidak ada di repo ini), dengan dua perbedaan yang disengaja:
//   1. batas akhirnya period_end di atas, bukan current_date (lihat
//      getReportKpiTargets);
//   2. followers_growth memakai selisih EOD (lib/metrics/followerGrowth), sama
//      dengan seluruh report, bukan net_growth_sum.
// Ekspresinya dipilih dari peta tetap ini, tidak pernah dirakit dari isi baris.
const DAILY_EXPR: Partial<Record<string, string>> = {
  followers_growth: `SUM(${EOD_GROWTH})`,
  engagement:       'SUM(bmd.engagement_sum)',
  reach:            'SUM(bmd.reach_sum)',
  impressions:      'SUM(bmd.impressions_sum)',
  views:            'SUM(bmd.views_sum)',
  video_views:      'SUM(bmd.video_views_sum)',
  likes:            'SUM(bmd.likes_sum)',
  comments:         'SUM(bmd.comments_sum)',
  shares:           'SUM(bmd.shares_sum)',
  saves:            'SUM(bmd.saves_sum)',
  post_count:       'SUM(bmd.post_count)',
  profile_visits:   'SUM(bmd.profile_visit_sum)',
  profile_reach:    'SUM(bmd.profile_reach_sum)',
  new_followers:    'SUM(bmd.new_followers_sum)',
  link_clicks:      'SUM(bmd.link_clicks_sum)',
}
const POST_EXPR: Partial<Record<string, string>> = {
  er_reach:       'SUM(p.engagement_owned) FILTER (WHERE p.reach > 0)::numeric / NULLIF(SUM(p.reach) FILTER (WHERE p.reach > 0), 0) * 100',
  avg_er_reach:   'AVG(p.er_reach) * 100',
  er_views:       'SUM(p.engagement_owned) FILTER (WHERE p.views > 0)::numeric / NULLIF(SUM(p.views) FILTER (WHERE p.views > 0), 0) * 100',
  avg_er_views:   'AVG(p.er_views) * 100',
  avg_engagement: 'SUM(p.engagement_owned)::numeric / NULLIF(COUNT(*), 0)',
  avg_reach:      'SUM(p.reach)::numeric / NULLIF(COUNT(*), 0)',
  avg_views:      'SUM(p.views)::numeric / NULLIF(COUNT(*), 0)',
  avg_likes:      'SUM(p.likes)::numeric / NULLIF(COUNT(*), 0)',
  avg_comments:   'SUM(p.comments)::numeric / NULLIF(COUNT(*), 0)',
  avg_shares:     'SUM(p.shares)::numeric / NULLIF(COUNT(*), 0)',
  avg_saves:      'SUM(p.saves)::numeric / NULLIF(COUNT(*), 0)',
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Capaian satu KPI di [start_date, period_end]; null = metrik di luar katalog. */
async function achievedFor(r: Row): Promise<number | null> {
  const args = [r.brand_id, r.platform, r.start_date, r.period_end, r.social_account_id]
  const daily = DAILY_EXPR[r.metrics_target]
  if (daily) {
    const { rows } = await pool.query<{ v: string | null }>(
      `SELECT COALESCE(${daily}, 0) AS v
         FROM l2_gold.brand_metric_daily bmd
         ${PREV_EOD_JOIN}
        WHERE bmd.brand_id = $1 AND bmd.platform = $2
          AND bmd.metric_date BETWEEN $3::date AND $4::date
          AND ($5::uuid IS NULL OR bmd.account_id = $5::uuid)`,
      args,
    )
    return Number(rows[0]?.v ?? 0)
  }
  const perPost = POST_EXPR[r.metrics_target]
  if (perPost) {
    // post_metric.brand_id = social_accounts.id → naik ke brand lewat brand_social_accounts.
    const { rows } = await pool.query<{ v: string | null }>(
      `SELECT COALESCE(${perPost}, 0) AS v
         FROM l2_gold.post_metric p
         JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
        WHERE bsa.brand_id = $1 AND p.platform = $2
          AND p.post_date::date BETWEEN $3::date AND $4::date
          AND ($5::uuid IS NULL OR p.brand_id = $5::uuid)`,
      args,
    )
    return round2(Number(rows[0]?.v ?? 0))
  }
  return null
}

/**
 * KPI aktif satu brand, dikelompokkan per platform, dengan capaian yang dihitung
 * sampai periode report.
 *
 * CUTOFF MENGIKUTI PERIODE REPORT (deck revisi Dashboard, slide 14)
 *   KPI tahunan Jan–Des di report September dihitung Jan–Sep saja, bukan sampai
 *   hari ini: report bulan September yang dibuka di bulan November tidak boleh
 *   memuat capaian Oktober. Karena itu capaiannya tidak dibaca dari
 *   `l2_gold.kpi_achievement` — procedure-nya hanya mengenal current_date dan
 *   menyimpan satu baris per KPI, jadi tidak bisa menjawab "per akhir bulan X"
 *   tanpa menimpa angka yang dipakai tab KPI. Run rate ikut batas yang sama:
 *   porsi WAKTU yang sudah lewat per akhir periode report.
 */
export async function getReportKpiTargets(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportKpiTargets> {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const reportEnd = `${year}-${pad(month)}-${pad(lastDay)}`

  const { rows } = await pool.query<Row>(SELECT, [orgId, brandId, reportEnd])
  const achieved = await Promise.all(rows.map(r => achievedFor(r).catch(err => {
    console.error('[report] kpi achievement failed for', r.kpi_id, err)
    return null
  })))

  const out: ReportKpiTargets = {}
  rows.forEach((r, i) => {
    if (!PLATFORMS.includes(r.platform)) return
    const platform = r.platform as DashPlatform
    const target = Number(r.value_target)
    const a = achieved[i]
    const kpi: KpiTarget = {
      kpiId: r.kpi_id,
      platform,
      metric: r.metrics_target as KpiMetric,
      operation: r.operation,
      target,
      achieved: a,
      achievementRate: a != null && target ? round2((a / target) * 100) : null,
      runRate: r.total_days > 0 ? round2((r.days_elapsed / r.total_days) * 100) : null,
      startDate: r.start_date,
      endDate: r.end_date,
      asOf: r.period_end,
    }
    ;(out[platform] ??= []).push(kpi)
  })
  return out
}
