import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { auth } from '@/auth'
import { verifyBrandAccess } from '@/lib/brands/queries'
import { fetchBusinessProfile, fetchAllBusinessVideos, fetchBusinessComments } from '@/lib/tiktok/business/api'
import { profilePayload, dailyMetricsPayload, videoPayload, commentPayload } from '@/lib/tiktok/business/sync'

/**
 * Menampilkan apa yang BENAR-BENAR dikembalikan TikTok untuk akun ini, beserta
 * hasil pemetaannya ke kolom l0_raw — tanpa menulis apa pun.
 *
 * KENAPA ADA
 *   Katalog field Business API berubah dan tidak tiap app mendapat produk yang
 *   sama, jadi sebuah field bisa absen tanpa error: kolomnya cuma tinggal null
 *   selamanya. Membaca tabel setelah sync tidak bisa membedakan "TikTok tidak
 *   mengirimnya", "namanya berbeda", dan "angkanya memang nol". Endpoint ini
 *   memperlihatkan ketiganya sekaligus — daftar field mentah yang datang, dan
 *   kolom mana yang akhirnya terisi.
 *
 * Token tidak pernah ikut dikembalikan.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const session = await auth()
    const userId  = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    // Hanya untuk video. Metrik profil selalu 7 hari terakhir: rentang yang lebih
    // panjang mengubah bentuk datanya (lihat DAILY_WINDOW_DAYS).
    const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 7)))

    const { rows } = await pool.query<{
      id: string; oauth_token: string | null; platform_user_id: string | null; auth_method: string
    }>(
      `SELECT sa.id, sa.oauth_token, sa.platform_user_id, COALESCE(sa.auth_method,'oauth') auth_method
         FROM social_accounts sa
         JOIN brand_social_accounts bsa ON bsa.social_account_id = sa.id
         JOIN platforms p ON p.id = sa.platform_id
        WHERE bsa.brand_id = $1 AND p.key = 'tiktok' AND sa.connected = true
        LIMIT 1`,
      [brandId],
    )
    const acct = rows[0]
    if (!acct) return NextResponse.json({ error: 'Brand ini belum punya akun TikTok tersambung.' }, { status: 404 })
    if (acct.auth_method !== 'tiktok_business') {
      return NextResponse.json({
        error: 'Akun TikTok ini tersambung lewat Login Kit, bukan Business API.',
        authMethod: acct.auth_method,
      }, { status: 400 })
    }
    if (!acct.oauth_token || !acct.platform_user_id) {
      return NextResponse.json({ error: 'Token atau business_id tidak tersimpan — sambungkan ulang.' }, { status: 400 })
    }

    const out: Record<string, unknown> = { days, businessId: acct.platform_user_id }

    try {
      const raw = await fetchBusinessProfile(acct.oauth_token, acct.platform_user_id)
      const mapped = profilePayload(acct.id, raw)
      out.profile = {
        fieldsReturned: Object.keys(raw ?? {}),
        raw,
        // Kolom yang TETAP null setelah pemetaan — ini daftar yang perlu dicocokkan
        // ke dokumentasi kalau ada yang seharusnya terisi.
        columnsStillNull: Object.entries(mapped)
          .filter(([k, v]) => k !== 'socialAccountId' && (v === null || v === undefined))
          .map(([k]) => k),
        mapped,
        // Per tanggal metrik, persis yang akan ditulis ke baris bertanggal sama.
        // Baris null di ujung = hari yang belum difinalisasi TikTok.
        daily: dailyMetricsPayload(raw?.metrics),
      }
    } catch (e) {
      out.profile = { error: (e as Error).message }
    }

    try {
      const videos = await fetchAllBusinessVideos(acct.oauth_token, acct.platform_user_id, days)
      const first = videos[0]
      out.videos = {
        count: videos.length,
        fieldsReturned: first ? Object.keys(first) : [],
        sampleRaw: first ?? null,
        sampleMapped: first ? videoPayload(acct.id, first) : null,
      }
    } catch (e) {
      out.videos = { error: (e as Error).message }
    }

    // Komentar diuji pada SATU video terbaru saja — cukup untuk melihat nama
    // field yang dikembalikan, tanpa menghabiskan kuota untuk diagnosa.
    try {
      const v = (out.videos as { sampleMapped?: { videoId: string; shareUrl: string | null } } | undefined)?.sampleMapped
      if (!v) {
        out.comments = { skipped: 'tidak ada video untuk diuji' }
      } else {
        const raw = await fetchBusinessComments(acct.oauth_token, acct.platform_user_id, v.videoId)
        out.comments = {
          videoId: v.videoId,
          count: raw.length,
          fieldsReturned: raw[0] ? Object.keys(raw[0]) : [],
          sampleRaw: raw[0] ?? null,
          sampleMapped: raw[0]
            ? commentPayload(acct.id, { videoId: v.videoId, shareUrl: v.shareUrl } as never, raw[0])
            : null,
        }
      }
    } catch (e) {
      out.comments = { error: (e as Error).message }
    }

    return NextResponse.json(out)
  } catch (err) {
    console.error('[GET tiktok/business/debug]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
