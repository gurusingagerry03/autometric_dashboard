// Data slide Monthly Tracker Performance: 12 bulan kalender s.d. bulan report,
// per platform + gabungan ('all'), dari l2_gold.brand_metric_daily. Sibling
// kpiQuery / chartQuery; tipe & formatnya di monthlyTracker.ts.
//
//   - metrik aliran   → SUM sepanjang bulan (reach, engagement, impressions,
//                        profile visits/reach, post_count, net growth, likes,
//                        comments, shares)
//   - Followers       → angka terakhir tiap akun di bulan itu, lalu dijumlah
//   - Engagement Rate → SUM(engagement) / SUM(er_denominator), dihitung ulang
//                        untuk 'all' dari jumlahnya, bukan rata-rata persen
import pool from '@/lib/db'
import type { DashPlatform } from '@/components/dashboard/data'
import type { ReportMonthlyTracker, TrackerMonth, TrackerValues } from './monthlyTracker'

const PLATFORMS: DashPlatform[] = ['instagram', 'facebook', 'tiktok']
const pad = (n: number) => String(n).padStart(2, '0')

/** 12 bulan (YYYY-MM), lama → baru, berakhir di bulan report. */
function monthsEndingAt(year: number, month: number, n = 12): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
  }
  return out
}

interface Sums { reach: number; eng: number; impr: number; pv: number; pr: number; posts: number; growth: number; erden: number; likes: number; comments: number; shares: number; followers: number | null }
const empty = (): Sums => ({ reach: 0, eng: 0, impr: 0, pv: 0, pr: 0, posts: 0, growth: 0, erden: 0, likes: 0, comments: 0, shares: 0, followers: null })

function toValues(s: Sums | undefined): TrackerValues {
  // Bulan tanpa satu baris gold pun = tidak ada data, bukan nol.
  if (!s) return {}
  return {
    followers: s.followers,
    followers_growth: s.growth,
    reach: s.reach,
    profile_views: s.pv,
    profile_reach: s.pr,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    total_posts: s.posts,
    engagement: s.eng,
    impressions: s.impr,
    er: s.erden > 0 ? (s.eng / s.erden) * 100 : null,
  }
}

export async function getReportMonthlyTracker(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportMonthlyTracker> {
  const months = monthsEndingAt(year, month)
  const start = `${months[0]}-01`
  const endExcl = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`

  const [flows, fol] = await Promise.all([
    pool.query<{ platform: DashPlatform; m: string; reach: number; eng: number; impr: number; pv: number; pr: number; posts: number; growth: number; erden: number; likes: number; comments: number; shares: number }>(
      `SELECT bmd.platform, to_char(date_trunc('month', bmd.metric_date), 'YYYY-MM') m,
              COALESCE(SUM(bmd.reach_sum),0)::float reach,
              COALESCE(SUM(bmd.engagement_sum),0)::float eng,
              COALESCE(SUM(bmd.impressions_sum),0)::float impr,
              COALESCE(SUM(bmd.profile_visit_sum),0)::float pv,
              COALESCE(SUM(bmd.profile_reach_sum),0)::float pr,
              COALESCE(SUM(bmd.likes_sum),0)::float likes,
              COALESCE(SUM(bmd.comments_sum),0)::float comments,
              COALESCE(SUM(bmd.shares_sum),0)::float shares,
              COALESCE(SUM(bmd.post_count),0)::float posts,
              COALESCE(SUM(bmd.net_growth_sum),0)::float growth,
              COALESCE(SUM(bmd.er_denominator_sum),0)::float erden
         FROM l2_gold.brand_metric_daily bmd
         JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1 AND bmd.brand_id = $2
          AND bmd.metric_date >= $3 AND bmd.metric_date < $4
          AND bmd.platform IN ('instagram','facebook','tiktok')
        GROUP BY 1, 2`,
      [orgId, brandId, start, endExcl],
    ),
    pool.query<{ platform: DashPlatform; m: string; f: number }>(
      `SELECT platform, m, SUM(f)::float f FROM (
         SELECT DISTINCT ON (bmd.account_id, bmd.platform, date_trunc('month', bmd.metric_date))
                bmd.platform, to_char(date_trunc('month', bmd.metric_date), 'YYYY-MM') m,
                bmd.follower_count_eod f
           FROM l2_gold.brand_metric_daily bmd
           JOIN public.brands b ON b.id = bmd.brand_id AND b.deleted_at IS NULL
          WHERE b.organization_id = $1 AND bmd.brand_id = $2
            AND bmd.metric_date >= $3 AND bmd.metric_date < $4
            AND bmd.platform IN ('instagram','facebook','tiktok')
            AND bmd.follower_count_eod IS NOT NULL
          ORDER BY bmd.account_id, bmd.platform, date_trunc('month', bmd.metric_date), bmd.metric_date DESC
       ) x GROUP BY 1, 2`,
      [orgId, brandId, start, endExcl],
    ),
  ])

  // platform → month → sums
  const by = new Map<string, Map<string, Sums>>()
  const slot = (p: string, m: string) => {
    if (!by.has(p)) by.set(p, new Map())
    const pm = by.get(p)!
    if (!pm.has(m)) pm.set(m, empty())
    return pm.get(m)!
  }
  for (const r of flows.rows) {
    for (const p of [r.platform, 'all']) {
      const s = slot(p, r.m)
      s.reach += r.reach; s.eng += r.eng; s.impr += r.impr; s.pv += r.pv; s.pr += r.pr
      s.posts += r.posts; s.growth += r.growth; s.erden += r.erden
      s.likes += r.likes; s.comments += r.comments; s.shares += r.shares
    }
  }
  for (const r of fol.rows) {
    for (const p of [r.platform, 'all']) {
      const s = slot(p, r.m)
      s.followers = (s.followers ?? 0) + r.f
    }
  }

  const out: ReportMonthlyTracker = {}
  for (const p of [...PLATFORMS, 'all'] as const) {
    const pm = by.get(p)
    if (!pm) continue
    out[p] = months.map((m): TrackerMonth => ({ month: m, values: toValues(pm.get(m)) }))
  }
  return out
}
