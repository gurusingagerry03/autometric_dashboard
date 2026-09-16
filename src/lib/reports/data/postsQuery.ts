// Live post pool for the Visual Analysis slide, scoped to one org + brand + month,
// keyed by channel. Sourced from l1_silver.unified_post (post-level detail — format,
// content_pillar, per-post metrics, cover image). Sibling of kpiQuery / chartQuery.
import pool from '@/lib/db'
import { normFormat, normPillar, type PostCandidate, type ReportPostMetrics } from './posts'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pad = (n: number) => String(n).padStart(2, '0')
const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`
const monthEndExcl = (y: number, m: number) => (m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`)

const num = (v: any) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v))

// completion_rate disimpan sebagai TEKS di silver (mis. '79%'), bukan numeric —
// sama seperti di dashboard Content. Dibersihkan dulu sebelum dipakai sebagai angka.
const pctText = (v: any) => {
  if (v == null) return 0
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// Broad recent pool so top/low ranking by any metric is meaningful client-side.
const LIMIT = 600

/**
 * Kolom activity per-post dari l0_extra, disatukan lintas platform.
 *
 * PERHATIAN `brand_id`: di l0_extra dan di l1_silver.unified_post kolom itu
 * menyimpan social_accounts.id (per akun), BUKAN brands.id. Join di bawah
 * menyandingkan keduanya apa adanya — memakai brandId dari argumen akan
 * mengembalikan nol baris tanpa error apa pun.
 *
 * Tanggal dikeluarkan sebagai TEKS lewat to_char, bukan date: driver pg mengubah
 * kolom date jadi Date pada tengah malam LOKAL, dan di WIB itu mundur sehari.
 */
const EXTRA_ACTIVITY = `
  SELECT brand_id, post_id, 'instagram' AS platform, is_activity, activity_name,
         submission, participant,
         to_char(start_date, 'DD Mon YYYY') AS start_date,
         to_char(end_date,   'DD Mon YYYY') AS end_date
    FROM l0_extra.instagram_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'facebook', is_activity, activity_name,
         submission, participant,
         to_char(start_date, 'DD Mon YYYY'), to_char(end_date, 'DD Mon YYYY')
    FROM l0_extra.facebook_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'tiktok', is_activity, activity_name,
         submission, participant,
         to_char(start_date, 'DD Mon YYYY'), to_char(end_date, 'DD Mon YYYY')
    FROM l0_extra.tiktok_post_extra_attribute
`

export async function getReportPostMetrics(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportPostMetrics> {
  const start = monthStart(year, month)
  const end = monthEndExcl(year, month)

  const { rows } = await pool.query<Record<string, any>>(
    `SELECT p.id, p.platform, p.cover_image, p.format, p.content_pillar,
            p.post_type, p.link, COALESCE(p.duration_s,0)::float duration_s,
            EXTRACT(EPOCH FROM p.post_date)::float           post_epoch,
            to_char(p.post_date, 'DD Mon YYYY')              post_date_txt,
            to_char(p.post_date, 'DD Mon YYYY, HH24:MI')     post_datetime_txt,
            COALESCE(p.avg_watch_time,0)::float              avg_watch_time,
            p.completion_rate,
            COALESCE(p.follows,0)::float      follows,
            COALESCE(p.reach,0)::float        reach,
            COALESCE(p.impressions,0)::float  impressions,
            COALESCE(p.views,0)::float        views,
            COALESCE(p.engagement,0)::float   engagement,
            COALESCE(p.likes,0)::float        likes,
            COALESCE(p.comments,0)::float     comments,
            COALESCE(p.saves,0)::float        saves,
            COALESCE(p.shares,0)::float       shares,
            COALESCE(p.repost_count,0)::float reposts,
            COALESCE(p.er_reach,0)::float     er_reach,
            COALESCE(p.er_views,0)::float     er_views,
            COALESCE(p.er_followers,0)::float er_followers,
            e.is_activity, e.activity_name, e.submission, e.participant,
            e.start_date, e.end_date
       FROM l1_silver.unified_post p
       JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
       JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
       LEFT JOIN (${EXTRA_ACTIVITY}) e
              ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
      WHERE b.organization_id = $1 AND bsa.brand_id = $2
        AND p.post_date >= $3 AND p.post_date < $4
        AND p.platform IN ('instagram','facebook','tiktok')
      ORDER BY p.post_date DESC
      LIMIT ${LIMIT}`,
    [orgId, brandId, start, end],
  )

  const out: ReportPostMetrics = { instagram: [], facebook: [], tiktok: [] }
  for (const r of rows) {
    const f = normFormat(r.format, { postType: r.post_type, link: r.link, durationS: num(r.duration_s) })
    const pil = normPillar(r.content_pillar)
    // Awareness: Facebook reports impressions, Instagram/TikTok report views.
    const impressionsViews = r.platform === 'facebook' ? num(r.impressions) : num(r.views)
    const cand: PostCandidate = {
      id: Number(r.id),
      image: r.cover_image || null,
      formatId: f.id, format: f.label,
      pillarId: pil.id, pillar: pil.label,
      isActivity: r.is_activity === true,
      values: {
        new_follow: num(r.follows),
        submission: num(r.submission),
        participant: num(r.participant),
        reach: num(r.reach),
        impressions_views: impressionsViews,
        likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), saves: num(r.saves),
        reposts: num(r.reposts),
        engagement: num(r.engagement),
        // silver stores er_* as a fraction (0.088) → ×100 for percent display.
        er_reach: num(r.er_reach) * 100,
        er_views: num(r.er_views) * 100,
        er_followers: num(r.er_followers) * 100,
        watch_time: num(r.avg_watch_time),
        completion_rate: pctText(r.completion_rate),
        // Epoch dipakai HANYA untuk mengurutkan; yang ditampilkan ada di `text`.
        post_date: num(r.post_epoch),
        post_datetime: num(r.post_epoch),
      },
      text: {
        post_date: r.post_date_txt ?? '—',
        post_datetime: r.post_datetime_txt ?? '—',
        activity_name: r.activity_name || '—',
        // Activity Type adalah is_activity yang dibaca orang. Dibedakan dari
        // "belum pernah diisi": null jadi '—', bukan 'No'.
        activity_type: r.is_activity === true ? 'Yes' : r.is_activity === false ? 'No' : '—',
        activity_period: r.start_date || r.end_date
          ? `${r.start_date ?? '…'} – ${r.end_date ?? '…'}`
          : '—',
      },
    }
    ;(out[r.platform] ??= []).push(cand)
  }
  return out
}
