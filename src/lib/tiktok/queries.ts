import pool from '@/lib/db'
import { mirrorImages } from '@/lib/cloudinary/mirror'
import { PoolClient } from 'pg'

export interface TtProfileSnapshotPayload {
  socialAccountId: string
  openId:          string | null
  displayName:     string | null
  bioDescription:  string | null
  avatarUrl:       string | null
  isVerified:      boolean | null
  followerCount:   number | null
  followingCount:  number | null
  likesCount:      number | null
  videoCount:      number | null

  /* ── hanya terisi lewat TikTok API for Business ──────────────────────────
   * Login Kit tidak menyediakan demografi. OPSIONAL dan ditulis dengan
   * COALESCE di SQL: sync Login Kit mengirimnya undefined dan baris yang sudah
   * punya nilai tidak ikut dikosongkan.
   *
   * Metrik harian (video_views, profile_reach, new_followers, dst.) sengaja
   * TIDAK lewat sini — lihat saveTtProfileDailyMetrics. */
  demographicsAge?:     unknown
  demographicsCity?:    unknown
  demographicsCountry?: unknown
  demographicsGender?:  unknown
}

const asJson = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v))

export async function saveTtProfileSnapshot(payload: TtProfileSnapshotPayload): Promise<void> {
  await pool.query(
    `INSERT INTO l0_raw.tt_profile_snapshots (
      social_account_id,
      open_id, display_name, bio_description, avatar_url, is_verified,
      follower_count, following_count, likes_count, video_count,
      demographics_age, demographics_city, demographics_country, demographics_gender
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb)
    ON CONFLICT (social_account_id, DATE(fetched_at AT TIME ZONE 'Asia/Jakarta'))
    -- DO NOTHING diganti DO UPDATE karena satu akun Business kini menulis dua
    -- kali sehari lewat jalur berbeda kalau metodenya baru saja ditukar. COALESCE
    -- memakai nilai baru HANYA kalau ada: snapshot Login Kit yang datang belakangan
    -- tidak boleh menghapus demografi yang sudah ditulis Business API pagi harinya.
    DO UPDATE SET
      open_id              = COALESCE(EXCLUDED.open_id,              tt_profile_snapshots.open_id),
      display_name         = COALESCE(EXCLUDED.display_name,         tt_profile_snapshots.display_name),
      bio_description      = COALESCE(EXCLUDED.bio_description,      tt_profile_snapshots.bio_description),
      avatar_url           = COALESCE(EXCLUDED.avatar_url,           tt_profile_snapshots.avatar_url),
      is_verified          = COALESCE(EXCLUDED.is_verified,          tt_profile_snapshots.is_verified),
      follower_count       = COALESCE(EXCLUDED.follower_count,       tt_profile_snapshots.follower_count),
      following_count      = COALESCE(EXCLUDED.following_count,      tt_profile_snapshots.following_count),
      likes_count          = COALESCE(EXCLUDED.likes_count,          tt_profile_snapshots.likes_count),
      video_count          = COALESCE(EXCLUDED.video_count,          tt_profile_snapshots.video_count),
      demographics_age     = COALESCE(EXCLUDED.demographics_age,     tt_profile_snapshots.demographics_age),
      demographics_city    = COALESCE(EXCLUDED.demographics_city,    tt_profile_snapshots.demographics_city),
      demographics_country = COALESCE(EXCLUDED.demographics_country, tt_profile_snapshots.demographics_country),
      demographics_gender  = COALESCE(EXCLUDED.demographics_gender,  tt_profile_snapshots.demographics_gender)`,
    [
      payload.socialAccountId,
      payload.openId,
      payload.displayName,
      payload.bioDescription,
      payload.avatarUrl,
      payload.isVerified,
      payload.followerCount,
      payload.followingCount,
      payload.likesCount,
      payload.videoCount,
      asJson(payload.demographicsAge),
      asJson(payload.demographicsCity),
      asJson(payload.demographicsCountry),
      asJson(payload.demographicsGender),
    ]
  )
}

/** Metrik satu tanggal. null = belum diketahui (TikTok belum memfinalisasi hari itu). */
export interface TtDailyMetrics {
  /** 'YYYY-MM-DD' — tanggal METRIKNYA, bukan tanggal penarikan. */
  date:          string
  videoViews:    number | null
  profileReach:  number | null
  profileViews:  number | null
  comments:      number | null
  shares:        number | null
  netGrowth:     number | null
  newFollowers:  number | null
  lostFollowers: number | null
}

/**
 * Metrik harian TikTok Business, ditulis ke baris snapshot yang TANGGALNYA SAMA
 * dengan tanggal metriknya.
 *
 * KENAPA BUKAN KE BARIS HARI INI
 *   Harmonization (sp_sync_tiktok_profile_from_raw) mengambil tanggal baris ini
 *   dari fetched_at (WIB) dan membaca video_views dkk. sebagai angka HARI ITU,
 *   lalu gold menjumlahkannya per hari. Metrik TikTok baru final 1–2 hari
 *   kemudian. Kalau ditaruh di baris hari penarikan, angka 15 Sep terbaca
 *   sebagai 18 Sep, dan terhitung dua kali kalau 15 Sep masih hari terbaru
 *   yang berisi di sync berikutnya. Keduanya sempat terjadi.
 *
 * HANYA UPDATE, TIDAK PERNAH INSERT
 *   Tanggal tanpa baris snapshot (sebelum akun disambungkan, atau hari sync-nya
 *   gagal) dilewati. Baris baru dari sini tidak punya follower_count dkk., dan
 *   harmonization mengubah null itu jadi 0, sehingga follower terbaca anjlok ke
 *   nol lalu melonjak lagi keesokan harinya.
 *
 * DITIMPA LANGSUNG, BUKAN COALESCE
 *   Berbeda dari saveTtProfileSnapshot, null di sini disengaja: artinya "belum
 *   difinalisasi TikTok", dan ia harus bisa menghapus angka salah-tanggal yang
 *   ditulis versi sync sebelumnya. Kolom-kolom ini hanya ditulis jalur Business
 *   (CSV hanya mengisi follower_count), jadi tidak ada sumber lain yang ikut
 *   terhapus.
 *
 * Mengembalikan tanggal yang benar-benar tertulis.
 */
export async function saveTtProfileDailyMetrics(
  socialAccountId: string, days: TtDailyMetrics[],
): Promise<string[]> {
  if (!days.length) return []
  const { rows } = await pool.query<{ date: string }>(
    `UPDATE l0_raw.tt_profile_snapshots p
        SET video_views    = d.video_views,
            profile_reach  = d.profile_reach,
            profile_views  = d.profile_views,
            comments       = d.comments,
            shares         = d.shares,
            net_growth     = d.net_growth,
            new_followers  = d.new_followers,
            lost_followers = d.lost_followers
       FROM jsonb_to_recordset($2::jsonb) AS d(
              date date, video_views int, profile_reach int, profile_views int,
              comments int, shares int, net_growth int, new_followers int, lost_followers int)
      WHERE p.social_account_id = $1
        AND DATE(p.fetched_at AT TIME ZONE 'Asia/Jakarta') = d.date
      RETURNING to_char(d.date, 'YYYY-MM-DD') AS date`,
    [socialAccountId, JSON.stringify(days.map(d => ({
      date:           d.date,
      video_views:    d.videoViews,
      profile_reach:  d.profileReach,
      profile_views:  d.profileViews,
      comments:       d.comments,
      shares:         d.shares,
      net_growth:     d.netGrowth,
      new_followers:  d.newFollowers,
      lost_followers: d.lostFollowers,
    })))],
  )
  return rows.map(r => r.date)
}

/** Tanggal (WIB) baris snapshot tertua akun ini — batas bawah backfill metrik harian. */
export async function earliestTtProfileSnapshotDate(socialAccountId: string): Promise<string | null> {
  const { rows } = await pool.query<{ d: string | null }>(
    `SELECT to_char(MIN(DATE(fetched_at AT TIME ZONE 'Asia/Jakarta')), 'YYYY-MM-DD') AS d
       FROM l0_raw.tt_profile_snapshots WHERE social_account_id = $1`,
    [socialAccountId],
  )
  return rows[0]?.d ?? null
}

export interface TtVideoSnapshotItem {
  socialAccountId: string
  videoId:         string
  postedAt:        string | null
  title:           string | null
  description:     string | null
  duration:        number | null
  coverImageUrl:   string | null
  shareUrl:        string | null
  likeCount:       number | null
  commentCount:    number | null
  shareCount:      number | null
  viewCount:       number | null

  /* ── hanya terisi lewat TikTok API for Business ───────────────────────────
   * Kolomnya sudah ada sejak awal di l0_raw tapi tidak pernah ditulis: dari
   * 8.632 baris, 43 punya reach_post dan 35 punya avg_watch_time — sisa impor
   * lama. Opsional dan COALESCE, jadi sync Login Kit tidak menimpanya jadi null. */
  reachPost?:       number | null
  avgWatchTime?:    number | null
  completionRate?:  string | null
  saves?:           number | null
  /** Business API mengirim ER-nya sendiri; kalau absen, dihitung dari like+comment+share / view. */
  engagementRate?:  number | null
}

const VIDEO_UPSERT_SQL = `
  INSERT INTO l0_raw.tt_video_snapshots (
    social_account_id, video_id, posted_at, title, description,
    duration, cover_image_url, share_url,
    like_count, comment_count, share_count, view_count, engagement_rate,
    reach_post, avg_watch_time, completion_rate, saves
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  ON CONFLICT (video_id, DATE(fetched_at AT TIME ZONE 'Asia/Jakarta'))
  DO UPDATE SET
    fetched_at      = NOW(),
    title           = EXCLUDED.title,
    description     = EXCLUDED.description,
    like_count      = EXCLUDED.like_count,
    comment_count   = EXCLUDED.comment_count,
    share_count     = EXCLUDED.share_count,
    view_count      = EXCLUDED.view_count,
    engagement_rate = EXCLUDED.engagement_rate,
    -- COALESCE, bukan timpa: kalau akun ini juga pernah disinkron lewat Login
    -- Kit pada hari yang sama, snapshot itu mengirim keempatnya null dan tanpa
    -- COALESCE ia akan menghapus angka yang baru ditulis Business API.
    reach_post      = COALESCE(EXCLUDED.reach_post,      tt_video_snapshots.reach_post),
    avg_watch_time  = COALESCE(EXCLUDED.avg_watch_time,  tt_video_snapshots.avg_watch_time),
    completion_rate = COALESCE(EXCLUDED.completion_rate, tt_video_snapshots.completion_rate),
    saves           = COALESCE(EXCLUDED.saves,           tt_video_snapshots.saves),
    cover_image_url = CASE WHEN tt_video_snapshots.cover_image_url LIKE '%res.cloudinary.com%'
              AND EXCLUDED.cover_image_url NOT LIKE '%res.cloudinary.com%'
         THEN tt_video_snapshots.cover_image_url ELSE EXCLUDED.cover_image_url END`

export async function saveTtVideoSnapshots(items: TtVideoSnapshotItem[]): Promise<void> {
  if (!items.length) return
  // URL cover TikTok membawa x-expires — sering hanya berlaku hitungan hari.
  const mirrored = await mirrorImages(
    items.map(i => ({ id: i.videoId, url: i.coverImageUrl })),
    { table: 'tt_video_snapshots', idColumn: 'video_id', urlColumn: 'cover_image_url', folder: 'tt-videos' },
  )
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const v of items) {
      // ER dari Business API dipakai apa adanya kalau ada; kalau tidak, dihitung
      // seperti sebelumnya supaya baris Login Kit tetap terisi.
      const engagementRate = v.engagementRate ?? (v.viewCount
        ? ((v.likeCount ?? 0) + (v.commentCount ?? 0) + (v.shareCount ?? 0)) / v.viewCount * 100
        : null)

      await client.query(VIDEO_UPSERT_SQL, [
        v.socialAccountId, // $1
        v.videoId,         // $2
        v.postedAt,        // $3
        v.title,           // $4
        v.description,     // $5
        v.duration,        // $6
        mirrored.get(v.videoId) ?? v.coverImageUrl,   // $7
        v.shareUrl,        // $8
        v.likeCount,       // $9
        v.commentCount,    // $10
        v.shareCount,      // $11
        v.viewCount,       // $12
        engagementRate,    // $13
        v.reachPost      ?? null,  // $14
        v.avgWatchTime   ?? null,  // $15
        v.completionRate ?? null,  // $16
        v.saves          ?? null,  // $17
      ])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export interface TtCommentItem {
  socialAccountId: string
  videoId:         string
  commentId:       string
  linkPost:        string | null
  linkComment:     string | null
  commentTime:     string | null
  commentText:     string | null
  commentUsername: string | null
  likesCount:      number | null
  repliesCount:    number | null
  hidden:          boolean | null
  parentId:        string | null
}

/**
 * Simpan komentar TikTok ke l0_raw.tt_comments.
 *
 * KUNCINYA comment_id SAJA (uq_tt_comment), bukan pasangan dengan tanggal seperti
 * snapshot profil/video. Komentar adalah peristiwa, bukan potret harian: menarik
 * ulang video yang sama besok harus MENIMPA baris yang sama, bukan menambah
 * salinan kedua yang akan menggandakan jumlah komentar di dashboard Community.
 *
 * likes_count dan replies_count NOT NULL di skema, jadi keduanya jatuh ke 0 kalau
 * TikTok tidak mengirimnya — satu-satunya tempat di integrasi ini yang absen
 * BOLEH menjadi nol, karena skemanya memang tidak mengizinkan null.
 */
export async function saveTtComments(items: TtCommentItem[]): Promise<void> {
  if (!items.length) return
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const c of items) {
      await client.query(
        `INSERT INTO l0_raw.tt_comments (
           social_account_id, video_id, comment_id, link_post, link_comment,
           comment_time, comment_text, comment_username,
           likes_count, replies_count, hidden, parent_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (comment_id) DO UPDATE SET
           comment_text     = EXCLUDED.comment_text,
           likes_count      = EXCLUDED.likes_count,
           replies_count    = EXCLUDED.replies_count,
           hidden           = EXCLUDED.hidden,
           -- Yang di bawah ini COALESCE: baris lama hasil impor punya link yang
           -- terisi, dan tarikan API yang tidak mengirim link tidak boleh
           -- menghapusnya. Teks dan angka memang harus ikut yang terbaru.
           link_post        = COALESCE(EXCLUDED.link_post,        tt_comments.link_post),
           link_comment     = COALESCE(EXCLUDED.link_comment,     tt_comments.link_comment),
           comment_username = COALESCE(EXCLUDED.comment_username, tt_comments.comment_username),
           comment_time     = COALESCE(EXCLUDED.comment_time,     tt_comments.comment_time)`,
        [
          c.socialAccountId, c.videoId, c.commentId, c.linkPost, c.linkComment,
          c.commentTime, c.commentText, c.commentUsername,
          c.likesCount ?? 0, c.repliesCount ?? 0, c.hidden, c.parentId,
        ],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
