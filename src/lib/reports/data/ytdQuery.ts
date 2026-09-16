// Nilai slide "YTD Performance". Periodenya dari `public.ytd_setting`; isinya
// dua sumber yang sengaja dijaga sepadan (lihat ytdMetrics.ts):
//
//   - metrik ber-KPI  → dibaca dari `l2_gold.ytd_performance` (hasil procedure)
//   - metrik dashboard → diagregasi di sini dari medallion, jendela yang sama
//
// JENDELANYA MILIK ytd_setting, BUKAN PROCEDURE
//   Dulu jendela slide ini lahir dari baris `ytd_performance`, jadi brand yang
//   sudah menyimpan periode YTD tapi belum punya KPI aktif tidak punya jendela
//   sama sekali — dan karena metrik dashboard tidak butuh KPI, itu akan membuat
//   mereka ikut hilang. Sekarang jendelanya dibaca langsung dari `ytd_setting`.
//
// SATU `asOf` UNTUK SELURUH BRAND
//   Procedure hanya dijalankan ulang saat periode YTD disimpan (lihat
//   lib/ytd/queries.ts), jadi deretnya berhenti di tanggal build TERAKHIR, bukan
//   hari ini. Agregat dashboard di bawah dipotong di tanggal yang sama supaya
//   kedua sumber menghitung rentang yang identik; tanpa itu, dua kartu di slide
//   yang sama diam-diam berhenti di hari yang berbeda dan selisihnya terbaca
//   sebagai performa. Tanpa baris procedure sama sekali, batasnya jatuh ke
//   LEAST(hari ini, end_date) — arti "year to date" yang biasa.
import pool from '@/lib/db'
import type { DashPlatform } from '@/components/dashboard/data'
import { KPI_METRICS } from '@/lib/kpi/types'
import {
  ytdDashDefsFor, ytdDashKey,
  type ReportYtdMetrics, type YtdChannel, type YtdRow, type YtdWindow,
} from './ytdMetrics'

const PLATFORMS: readonly string[] = ['instagram', 'facebook', 'tiktok']

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v))
const numOrNull = (v: any): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
const round2 = (n: number) => Math.round(n * 100) / 100

/** Periode YTD aktif brand, batas atas "sampai hari ini" ikut dihitung di SQL. */
const WINDOW_SQL = `
  SELECT to_char(y.start_date, 'YYYY-MM-DD') AS start_date,
         to_char(y.end_date,   'YYYY-MM-DD') AS end_date,
         to_char(LEAST(CURRENT_DATE, y.end_date), 'YYYY-MM-DD') AS today_as_of
    FROM public.ytd_setting y
    JOIN public.brands b ON b.id = y.brand_id AND b.deleted_at IS NULL
   WHERE b.organization_id = $1 AND y.brand_id = $2 AND y.is_active`

/**
 * Baris terakhir tiap (platform, metrik) — akumulasi "sampai hari terakhir build".
 *
 * `ytd_performance` adalah deret HARIAN: satu baris per hari per metrik. Yang
 * dibutuhkan kartu hanyalah hari terakhir, jadi DISTINCT ON memungut itu saja
 * di database — menarik 258 baris per metrik ke Node lalu membuang 257 di
 * antaranya akan membebani jaringan tanpa alasan.
 */
const PROC_SQL = `
  SELECT DISTINCT ON (p.key, yp.metrics_target)
         p.key AS platform, yp.metrics_target,
         yp.cumulative_value, yp.prior_year_value, yp.percentage, yp.run_rate,
         to_char(yp.metric_date, 'YYYY-MM-DD') AS as_of
    FROM l2_gold.ytd_performance yp
    JOIN public.ytd_setting y ON y.ytd_id = yp.ytd_id
    JOIN public.brands b ON b.id = y.brand_id AND b.deleted_at IS NULL
    JOIN public.platforms p ON p.id = yp.platform_id
   WHERE b.organization_id = $1 AND y.brand_id = $2 AND y.is_active
   ORDER BY p.key, yp.metrics_target, yp.metric_date DESC`

/**
 * Batas jendela pembanding + porsi periode yang sudah lewat.
 *
 * Dihitung di Postgres, bukan di Node: `- INTERVAL '1 year'` punya aturan sendiri
 * di 29 Februari (jatuh ke 28), dan procedure memakai ekspresi yang sama persis.
 * Menirunya dengan aritmetika hari di JS akan meleset satu hari sekali setiap
 * empat tahun, di tempat yang tidak ada yang memeriksanya.
 *
 * `elapsed_pct` mengikuti rumus `run_rate` procedure: (hari terpakai / total hari)
 * — porsi WAKTU, bukan proyeksi nilai, jadi sama untuk semua metrik.
 */
const BOUNDS_SQL = `
  SELECT to_char($1::date - INTERVAL '1 year', 'YYYY-MM-DD') AS prior_start,
         to_char($2::date - INTERVAL '1 year', 'YYYY-MM-DD') AS prior_end,
         ROUND((($2::date - $1::date) + 1)::numeric
               / NULLIF(($3::date - $1::date) + 1, 0) * 100, 2)::float AS elapsed_pct`

/* Agregat dashboard. Dua jendela sekaligus (berjalan + tahun lalu), dipisah
 * `is_cur` supaya satu kali jalan cukup — jendelanya terpaut setahun, jadi
 * rentangnya tidak pernah bertumpang tindih. Bucket yang tidak punya baris
 * sumber tidak muncul, dan itulah yang membedakan "nol" dari "belum ada data":
 * kartu tanpa baris sumber menulis "—", bukan 0. */
const GOLD_SQL = `
  SELECT bmd.platform, (bmd.metric_date >= $3::date) AS is_cur,
         SUM(bmd.reach_sum)::float          AS reach,
         SUM(bmd.impressions_sum)::float    AS impressions,
         SUM(bmd.engagement_sum)::float     AS engagement,
         SUM(bmd.likes_sum)::float          AS likes,
         SUM(bmd.comments_sum)::float       AS comments,
         SUM(bmd.saves_sum)::float          AS saves,
         SUM(bmd.shares_sum)::float         AS shares,
         SUM(bmd.reposts_sum)::float        AS reposts,
         SUM(bmd.views_sum)::float          AS views,
         SUM(bmd.profile_visit_sum)::float  AS visits,
         SUM(bmd.new_followers_sum)::float  AS new_followers,
         SUM(bmd.net_growth_sum)::float     AS growth,
         SUM(bmd.er_denominator_sum)::float AS er_den,
         -- Total Followers bukan penjumlahan: yang berlaku adalah angka hari
         -- TERAKHIR di jendela. Menjumlahkannya akan menghasilkan ratusan juta
         -- follower dari brand yang punya seratus ribu.
         CAST((array_agg(bmd.follower_count_eod ORDER BY bmd.metric_date DESC)
                 FILTER (WHERE bmd.follower_count_eod IS NOT NULL))[1] AS float) AS followers
    FROM l2_gold.brand_metric_daily bmd
    JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
   WHERE b.organization_id = $1 AND bmd.brand_id = $2
     AND bmd.platform IN ('instagram','facebook','tiktok')
     AND (bmd.metric_date BETWEEN $3::date AND $4::date
       OR bmd.metric_date BETWEEN $5::date AND $6::date)
   GROUP BY 1, 2`

const STORY_SQL = `
  SELECT sm.platform, (sm.metric_date >= $3::date) AS is_cur,
         SUM(sm.views_sum)::float AS story_views,
         SUM(sm.reach_sum)::float AS story_reach
    FROM l2_gold.story_metric_daily sm
    JOIN public.brands b ON b.id = sm.brand_id AND b.deleted_at IS NULL
   WHERE b.organization_id = $1 AND sm.brand_id = $2
     AND sm.platform IN ('instagram','facebook','tiktok')
     AND (sm.metric_date BETWEEN $3::date AND $4::date
       OR sm.metric_date BETWEEN $5::date AND $6::date)
   GROUP BY 1, 2`

// `unified_profile.brand_id` menyimpan social_account_id, bukan brand — makanya
// perjalanannya lewat brand_social_accounts, sama seperti kpiQuery.
const PROFILE_SQL = `
  SELECT up.platform, (up.profile_date >= $3::date) AS is_cur,
         SUM(up.link_clicks)::float        AS clicks,
         SUM(up.total_interactions)::float AS total_interactions
    FROM l1_silver.unified_profile up
    JOIN public.brand_social_accounts bsa ON bsa.social_account_id = up.brand_id
    JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
   WHERE b.organization_id = $1 AND bsa.brand_id = $2
     AND up.platform IN ('instagram','facebook','tiktok')
     AND (up.profile_date BETWEEN $3::date AND $4::date
       OR up.profile_date BETWEEN $5::date AND $6::date)
   GROUP BY 1, 2`

// avg_watch_time tersimpan tidak seragam (detik untuk sebagian brand, milidetik
// untuk sebagian lain) — dinormalkan per post lewat panjang klipnya, persis
// seperti kpiQuery, lalu dirata-ratakan.
const POST_SQL = `
  SELECT p.platform, (p.post_date >= $3::date) AS is_cur,
         CAST(AVG(CASE WHEN p.avg_watch_time > p.duration_s * 2
                       THEN p.avg_watch_time / 1000.0 ELSE p.avg_watch_time END)
              FILTER (WHERE p.avg_watch_time > 0 AND p.duration_s > 0) AS float) AS watch_time
    FROM l1_silver.unified_post p
    JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
    JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
   WHERE b.organization_id = $1 AND bsa.brand_id = $2
     AND p.platform IN ('instagram','facebook','tiktok')
     AND (p.post_date BETWEEN $3::date AND $4::date
       OR p.post_date BETWEEN $5::date AND $6::date)
   GROUP BY 1, 2`

interface ProcRow {
  platform: string; metrics_target: string
  cumulative_value: string; prior_year_value: string
  percentage: string | null; run_rate: string; as_of: string
}
type AggRow = Record<string, any> & { platform: string; is_cur: boolean }

/** Bucket berjalan / tahun lalu satu platform, dari satu hasil agregat. */
const bucket = (rows: AggRow[], platform: string, cur: boolean): AggRow | null =>
  rows.find(r => r.platform === platform && r.is_cur === cur) ?? null

/**
 * Metrik YTD per platform untuk satu brand.
 *
 * Tanpa parameter bulan report: periodenya milik `ytd_setting`, bukan periode
 * report — itu memang arti "year to date".
 *
 * Kosong berarti periode YTD-nya belum di-set; slide menyebut itu dan menunjuk
 * ke tab KPI brand. Brand yang periodenya sudah di-set tapi belum punya KPI
 * aktif TIDAK kosong lagi — metrik dashboard-nya tetap terhitung.
 */
export async function getReportYtdMetrics(orgId: string, brandId: string): Promise<ReportYtdMetrics> {
  const [win, proc] = await Promise.all([
    pool.query<{ start_date: string; end_date: string; today_as_of: string }>(WINDOW_SQL, [orgId, brandId]),
    pool.query<ProcRow>(PROC_SQL, [orgId, brandId]),
  ])
  const w = win.rows[0]
  if (!w) return {}

  // Deret procedure berhenti di tanggal build terakhir; itulah batas bersama.
  const asOf = proc.rows.reduce<string>((a, r) => (r.as_of > a ? r.as_of : a), '') || w.today_as_of

  const bounds = await pool.query<{ prior_start: string; prior_end: string; elapsed_pct: number | null }>(
    BOUNDS_SQL, [w.start_date, asOf, w.end_date],
  )
  const { prior_start: priorStart, prior_end: priorEnd, elapsed_pct: elapsedPct } = bounds.rows[0]
  const window: YtdWindow = { start: w.start_date, end: w.end_date, asOf, priorStart, priorEnd }

  const args = [orgId, brandId, w.start_date, asOf, priorStart, priorEnd]
  const [gold, story, profile, post] = await Promise.all([
    pool.query<AggRow>(GOLD_SQL, args),
    pool.query<AggRow>(STORY_SQL, args),
    pool.query<AggRow>(PROFILE_SQL, args),
    pool.query<AggRow>(POST_SQL, args),
  ])

  const out: ReportYtdMetrics = {}
  for (const platform of PLATFORMS) {
    const procRows = proc.rows.filter(r => r.platform === platform)
    const g = { cur: bucket(gold.rows, platform, true), prev: bucket(gold.rows, platform, false) }
    const st = { cur: bucket(story.rows, platform, true), prev: bucket(story.rows, platform, false) }
    const pf = { cur: bucket(profile.rows, platform, true), prev: bucket(profile.rows, platform, false) }
    const po = { cur: bucket(post.rows, platform, true), prev: bucket(post.rows, platform, false) }

    // Channel tanpa jejak apa pun di jendela ini tidak dibuatkan bagian: slide
    // lalu mengatakan tidak ada, alih-alih menggambar enam kartu berisi "—".
    const hasData = procRows.length > 0
      || [g, st, pf, po].some(sr => sr.cur !== null || sr.prev !== null)
    if (!hasData) continue

    const rows: YtdRow[] = []

    // 1. Metrik ber-KPI, apa adanya dari procedure — urut katalog, bukan abjad.
    for (const r of [...procRows].sort(
      (a, b) => KPI_METRICS.indexOf(a.metrics_target as never) - KPI_METRICS.indexOf(b.metrics_target as never),
    )) {
      rows.push({
        metric: r.metrics_target,
        source: 'kpi',
        cumulative: num(r.cumulative_value),
        priorYear: num(r.prior_year_value),
        // NULL di kolom ini berarti tahun lalu nol — procedure memakai
        // NULLIF(prior,0), jadi tidak ada pembagian yang bisa dilaporkan.
        percentage: numOrNull(r.percentage),
        runRate: numOrNull(r.run_rate),
      })
    }

    // 2. Metrik dashboard, diagregasi di atas. Yang kolomnya sudah diwakili
    //    baris KPI dibuang di ytdDashDefsFor — dua kartu dengan nama dan angka
    //    yang sama hanya membuat pemilihnya terasa rusak.
    const covered = procRows.map(r => r.metrics_target)
    for (const def of ytdDashDefsFor(platform, covered)) {
      // Tiap agregat memakai nama kolom yang sama dengan key metriknya, jadi
      // yang perlu disebut hanya hasil mana yang memuatnya. ER satu-satunya
      // yang bukan kolom: rasio atas jendela penuh, bukan rata-rata rasio
      // harian — sama seperti scorecard dashboard.
      const src = def.key === 'story_views' || def.key === 'story_reach' ? st
        : def.key === 'clicks' || def.key === 'total_interactions' ? pf
        : def.key === 'watch_time' ? po
        : g
      const pick = (b: AggRow | null): number | null => {
        if (!b) return null
        if (def.key !== 'er') return numOrNull(b[def.key])
        const den = numOrNull(b.er_den), eng = numOrNull(b.engagement)
        return den && den > 0 && eng != null ? (eng / den) * 100 : null
      }
      const cumulative = pick(src.cur)
      const priorYear = pick(src.prev)
      rows.push({
        metric: ytdDashKey(def.key),
        source: 'dash',
        cumulative,
        priorYear,
        // Rumus yang sama dengan procedure: indeks terhadap tahun lalu, bukan
        // selisih. ytdDelta yang mengubahnya jadi "+20%".
        percentage: cumulative != null && priorYear ? round2((cumulative / priorYear) * 100) : null,
        runRate: elapsedPct,
        format: def.format,
      })
    }

    out[platform as DashPlatform] = { window, rows } satisfies YtdChannel
  }
  return out
}
