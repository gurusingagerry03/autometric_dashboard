// Kumpulan post KOMPETITOR untuk slide Visual Content, satu bulan laporan.
//
// KENAPA BUKAN DARI GOLD
//   l2_gold.competitor_post_metric hanya menyimpan angka — tidak ada cover_image,
//   caption, maupun tautan. Untuk section visual justru itu yang dibutuhkan, jadi
//   sumbernya l0_raw.*_competitor_media yang memang membawanya (diverifikasi
//   3 Sep 2026: 173 post IG dan 168 post TikTok, semuanya punya cover + caption).
//
// HANYA DATA PUBLIK
//   Kompetitor diukur dengan menyalin permukaan publiknya, jadi metriknya terbatas
//   pada yang benar-benar dipublikasikan. Ketiga platform tidak sama:
//     Instagram — likes, comments, views
//     TikTok    — likes, comments, shares, saves, plays
//     Facebook  — TIDAK didukung di sini: fb_competitor_media tidak punya kolom
//                 cover_image sama sekali, dan section visual tanpa gambar tidak
//                 ada gunanya. Lebih baik absen daripada menampilkan kotak kosong.
//   ER sengaja tidak dihitung: butuh jumlah follower pada saat post tayang, dan itu
//   tidak tersedia per-post untuk kompetitor. Menghitungnya dari follower hari ini
//   akan menghasilkan angka yang terlihat wajar tapi salah.
import pool from '@/lib/db'
import type { PostCandidate } from './posts'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pad = (n: number) => String(n).padStart(2, '0')
const num = (v: any) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v))

export interface CompetitorEntity {
  id: string        // social_accounts.id kompetitor
  label: string     // @username
  platform: string
}

export interface ReportCompetitorPosts {
  competitors: CompetitorEntity[]
  /** Post per kompetitor, dikunci id akun kompetitor. */
  posts: Record<string, PostCandidate[]>
}

/** Post kompetitor tidak punya format editorial maupun pilar — keduanya milik
 *  brand sendiri. Diisi label netral supaya penyaring di slide tetap konsisten. */
const NO_FORMAT = { formatId: 'other', format: 'Other' }
const NO_PILLAR = { pillarId: 'none', pillar: 'No pillar' }

export async function getReportCompetitorPosts(
  orgId: string, brandId: string, year: number, month: number,
): Promise<ReportCompetitorPosts> {
  const start = `${year}-${pad(month)}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`

  const { rows: comps } = await pool.query<{ id: string; username: string; platform: string }>(
    `SELECT sa.id::text, COALESCE(sa.username, sa.platform_user_id, '—') username, p.key platform
       FROM public.brand_competitors bc
       JOIN public.social_accounts sa ON sa.id = bc.social_account_id
       JOIN public.platforms p        ON p.id = sa.platform_id
       JOIN public.brands b           ON b.id = bc.brand_id AND b.deleted_at IS NULL
      WHERE b.organization_id = $1::uuid AND b.id = $2::uuid
        AND p.key IN ('instagram', 'tiktok')
      ORDER BY p.key, sa.username`,
    [orgId, brandId],
  )

  const competitors: CompetitorEntity[] = comps.map(c => ({
    id: c.id, label: '@' + c.username, platform: c.platform,
  }))
  const posts: Record<string, PostCandidate[]> = {}
  if (competitors.length === 0) return { competitors, posts }

  const ids = competitors.map(c => c.id)

  // Kedua platform diseragamkan ke bentuk yang sama supaya pemetaannya satu jalur.
  const { rows } = await pool.query<Record<string, any>>(
    `SELECT social_account_id::text acct, 'instagram' platform, media_id post_id,
            cover_image, caption, permalink url, posted_at post_date,
            like_count, comment_count, view_count plays, 0 shares, 0 saves
       FROM l0_raw.ig_competitor_media
      WHERE social_account_id = ANY($1::uuid[]) AND posted_at >= $2 AND posted_at < $3
     UNION ALL
     SELECT social_account_id::text, 'tiktok', post_id,
            cover_image, caption, url, post_date,
            like_count, comment_count, play_count, share_count, saved_count
       FROM l0_raw.tiktok_competitor_media
      WHERE social_account_id = ANY($1::uuid[]) AND post_date >= $2 AND post_date < $3
     ORDER BY post_date DESC
     LIMIT 600`,
    [ids, start, end],
  )

  let seq = 0
  for (const r of rows) {
    const likes = num(r.like_count), comments = num(r.comment_count)
    const shares = num(r.shares), saves = num(r.saves)
    const d = r.post_date ? new Date(r.post_date) : null
    const txt = d
      ? {
          post_date: `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
          post_datetime: `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
        }
      : { post_date: '—', post_datetime: '—' }

    const cand: PostCandidate = {
      id: ++seq,
      image: r.cover_image || null,
      ...NO_FORMAT, ...NO_PILLAR,
      values: {
        likes, comments, shares, saves,
        impressions_views: num(r.plays),
        // Engagement publik = jumlah interaksi yang benar-benar terlihat dari luar.
        engagement: likes + comments + shares + saves,
        post_date: d ? d.getTime() / 1000 : 0,
        post_datetime: d ? d.getTime() / 1000 : 0,
      },
      text: txt,
    }
    ;(posts[r.acct] ??= []).push(cand)
  }

  return { competitors, posts }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
