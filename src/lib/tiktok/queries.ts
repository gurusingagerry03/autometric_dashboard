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
   * Login Kit tidak menyediakan satu pun dari ini. Semuanya OPSIONAL dan
   * ditulis dengan COALESCE di SQL: sync Login Kit mengirimnya undefined dan
   * baris yang sudah punya nilai tidak ikut dikosongkan.
   *
   * Dibedakan null vs 0 dengan sengaja — 'produknya tidak di-approve' dan
   * 'angkanya memang nol' adalah dua hal yang berbeda, dan dashboard
   * menjumlahkan kolom ini. */
  demographicsAge?:     unknown
  demographicsCity?:    unknown
  demographicsCountry?: unknown
  demographicsGender?:  unknown
  videoViews?:    number | null
  profileReach?:  number | null
  profileViews?:  number | null
  comments?:      number | null
  shares?:        number | null
  netGrowth?:     number | null
  newFollowers?:  number | null
  lostFollowers?: number | null
}

const asJson = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v))

export async function saveTtProfileSnapshot(payload: TtProfileSnapshotPayload): Promise<void> {
  await pool.query(
    `INSERT INTO l0_raw.tt_profile_snapshots (
      social_account_id,
      open_id, display_name, bio_description, avatar_url, is_verified,
      follower_count, following_count, likes_count, video_count,
      demographics_age, demographics_city, demographics_country, demographics_gender,
      video_views, profile_reach, profile_views, comments, shares,
      net_growth, new_followers, lost_followers
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb,
              $15, $16, $17, $18, $19, $20, $21, $22)
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
      demographics_gender  = COALESCE(EXCLUDED.demographics_gender,  tt_profile_snapshots.demographics_gender),
      video_views          = COALESCE(EXCLUDED.video_views,          tt_profile_snapshots.video_views),
      profile_reach        = COALESCE(EXCLUDED.profile_reach,        tt_profile_snapshots.profile_reach),
      profile_views        = COALESCE(EXCLUDED.profile_views,        tt_profile_snapshots.profile_views),
      comments             = COALESCE(EXCLUDED.comments,             tt_profile_snapshots.comments),
      shares               = COALESCE(EXCLUDED.shares,               tt_profile_snapshots.shares),
      net_growth           = COALESCE(EXCLUDED.net_growth,           tt_profile_snapshots.net_growth),
      new_followers        = COALESCE(EXCLUDED.new_followers,        tt_profile_snapshots.new_followers),
      lost_followers       = COALESCE(EXCLUDED.lost_followers,       tt_profile_snapshots.lost_followers)`,
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
      payload.videoViews    ?? null,
      payload.profileReach  ?? null,
      payload.profileViews  ?? null,
      payload.comments      ?? null,
      payload.shares        ?? null,
      payload.netGrowth     ?? null,
      payload.newFollowers  ?? null,
      payload.lostFollowers ?? null,
    ]
  )
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
