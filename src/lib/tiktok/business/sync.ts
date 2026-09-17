import {
  fetchBusinessProfile, fetchAllBusinessVideos, fetchBusinessComments,
  type BusinessProfile, type BusinessVideo, type BusinessComment,
} from './api'
import {
  saveTtProfileSnapshot, saveTtVideoSnapshots, saveTtComments,
  TtProfileSnapshotPayload, TtVideoSnapshotItem, TtCommentItem,
} from '../queries'

export type TtSyncResult = {
  tt_profile:  { count: number; error: string | null }
  tt_videos:   { count: number; error: string | null }
  tt_comments: { count: number; error: string | null }
}

/**
 * Berapa video yang disisir komentarnya per sync.
 *
 * TikTok tidak punya endpoint "semua komentar akun ini" — komentar hanya bisa
 * diminta PER VIDEO, jadi biayanya satu panggilan (atau lebih, kalau berhalaman)
 * untuk tiap video. Jendela 30 hari sebuah brand aktif bisa berisi puluhan video,
 * dan menyisir semuanya tiap malam menghabiskan kuota untuk komentar lama yang
 * jarang berubah. 20 video terbaru menutup bagian yang benar-benar hidup.
 */
const COMMENT_VIDEO_CAP = 20

/**
 * Sync TikTok lewat API for Business — menulis ke TIGA tabel l0_raw yang sudah
 * ada (tt_profile_snapshots, tt_video_snapshots, tt_comments), hanya mengisi
 * lebih banyak kolomnya daripada jalur Login Kit.
 *
 * tt_comments sebelumnya tidak pernah ditulis dari repo ini sama sekali — 2.110
 * barisnya berasal dari impor luar yang berhenti Juli 2026. Menariknya dari sini
 * membuat dashboard Community, sentiment, dan word cloud TikTok tidak lagi
 * bergantung pada jalur yang sudah mati itu.
 *
 * KENAPA TABEL YANG SAMA, BUKAN TABEL SENDIRI
 *   Seluruh hilir — silver, gold, dashboard, report — membaca dua tabel itu.
 *   Tabel terpisah berarti menyalin ulang setiap query di hilir dan menjaga dua
 *   jalur tetap sinkron selamanya, hanya untuk membedakan asal data yang sudah
 *   tercatat di social_accounts.auth_method.
 *
 * NILAI YANG ABSEN JADI null, BUKAN 0
 *   Field yang tidak dikembalikan TikTok (produknya tidak di-approve, atau
 *   namanya berubah) ditulis null. Kolom-kolom ini dijumlahkan di dashboard;
 *   nol akan terbaca sebagai "harinya memang sepi" dan mencemari rata-rata,
 *   sementara null jujur mengatakan tidak ada datanya.
 */
export async function initialTtBusinessSync(
  socialAccountId: string,
  accessToken:     string,
  businessId:      string,
  brandId:         string,
  days = 30,
): Promise<TtSyncResult> {
  console.log(`[initialTtBusinessSync] START brandId=${brandId} socialAccountId=${socialAccountId} businessId=${businessId}`)

  const results = await Promise.allSettled([
    (async () => {
      const raw = await fetchBusinessProfile(accessToken, businessId, days)
      console.log('[initialTtBusinessSync] profil field diterima:', Object.keys(raw ?? {}).join(', '))
      await saveTtProfileSnapshot(profilePayload(socialAccountId, raw))
      return 1
    })(),

    (async () => {
      const videos = await fetchAllBusinessVideos(accessToken, businessId, days)
      console.log(`[initialTtBusinessSync] ${videos.length} video`, videos[0] ? `field: ${Object.keys(videos[0]).join(', ')}` : '')
      const items = videos.map(v => videoPayload(socialAccountId, v)).filter((v): v is TtVideoSnapshotItem => !!v)
      await saveTtVideoSnapshots(items)

      // Komentar menumpang hasil tarikan video yang sama — daftar video sudah ada
      // di tangan, jadi tidak perlu memintanya dua kali. Dikembalikan bersama
      // supaya `tt_comments` ikut terlaporkan di log sync.
      const comments = await collectComments(accessToken, businessId, socialAccountId, items)
      return { videos: items.length, comments }
    })(),
  ])

  const [profileResult, videosResult] = results
  const errMsg = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null

  console.log(`[initialTtBusinessSync] DONE brandId=${brandId}`)
  const v = videosResult.status === 'fulfilled' ? videosResult.value : null
  return {
    tt_profile: profileResult.status === 'fulfilled'
      ? { count: 1, error: null } : { count: 0, error: errMsg(profileResult) },
    tt_videos: v ? { count: v.videos, error: null } : { count: 0, error: errMsg(videosResult) },
    // Komentar berbagi nasib dengan video: kalau tarikan videonya gagal, daftar
    // videonya tidak pernah ada, jadi komentarnya memang tidak sempat dicoba.
    tt_comments: v
      ? { count: v.comments.saved, error: v.comments.error }
      : { count: 0, error: errMsg(videosResult) },
  }
}

/**
 * Komentar untuk video terbaru, dikumpulkan satu per satu.
 *
 * Kegagalan di SATU video tidak menggagalkan sisanya — akun bisa punya video
 * dengan komentar dimatikan, dan satu penolakan tidak boleh menghapus komentar
 * dari sembilan belas video lainnya. Errornya dikumpulkan dan dilaporkan sebagai
 * satu ringkasan, bukan ditelan diam-diam.
 */
async function collectComments(
  accessToken: string, businessId: string, socialAccountId: string, videos: TtVideoSnapshotItem[],
): Promise<{ saved: number; error: string | null }> {
  const targets = [...videos]
    .sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''))
    .slice(0, COMMENT_VIDEO_CAP)

  const all: TtCommentItem[] = []
  const failures: string[] = []

  for (const v of targets) {
    try {
      const raw = await fetchBusinessComments(accessToken, businessId, v.videoId)
      if (raw[0]) console.log('[initialTtBusinessSync] komentar field:', Object.keys(raw[0]).join(', '))
      for (const c of raw) {
        const item = commentPayload(socialAccountId, v, c)
        if (item) all.push(item)
      }
    } catch (e) {
      failures.push(`${v.videoId}: ${(e as Error).message}`)
    }
  }

  await saveTtComments(all)
  return {
    saved: all.length,
    error: failures.length ? `${failures.length}/${targets.length} video gagal — ${failures[0]}` : null,
  }
}

export function commentPayload(
  socialAccountId: string, video: TtVideoSnapshotItem, c: BusinessComment,
): TtCommentItem | null {
  const o = (c ?? {}) as Record<string, unknown>
  const commentId = strOrNull(pick(o, 'comment_id', 'id'))
  // comment_id adalah kunci unik tabelnya; tanpa itu baris ini tidak bisa
  // di-upsert dan hanya akan menumpuk duplikat tiap sync.
  if (!commentId) return null

  const created = pick(o, 'create_time', 'created_at')
  const createdMs = typeof created === 'number'
    ? (created < 1e11 ? created * 1000 : created)
    : created ? Date.parse(String(created)) : NaN

  return {
    socialAccountId,
    videoId:         video.videoId,
    commentId,
    // TikTok tidak mengirim tautan komentar; tautan post-nya kita sudah punya
    // dari videonya sendiri, jadi dipakai ulang alih-alih dibiarkan kosong.
    linkPost:        video.shareUrl,
    linkComment:     strOrNull(pick(o, 'comment_url', 'link')),
    commentTime:     Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    commentText:     strOrNull(pick(o, 'text', 'comment_text', 'content')),
    commentUsername: strOrNull(pick(o, 'username', 'owner', 'user_name', 'nickname')),
    likesCount:      numOrNull(pick(o, 'like_count', 'likes_count', 'digg_count')),
    repliesCount:    numOrNull(pick(o, 'reply_count', 'replies_count')),
    // 'public' = tampil; status lain (hidden/deleted) dianggap disembunyikan.
    hidden:          (() => {
      const st = strOrNull(pick(o, 'status'))
      return st === null ? null : st.toLowerCase() !== 'public'
    })(),
    parentId:        strOrNull(pick(o, 'parent_comment_id', 'parent_id')),
  }
}

/* ── pemetaan ────────────────────────────────────────────────────────────────
 * Ditulis memaafkan dengan sengaja. Katalog field TikTok berubah dan tidak tiap
 * app mendapat produk yang sama, jadi `pick()` menerima beberapa kemungkinan
 * nama untuk satu kolom dan menyerah jadi null kalau tidak satu pun ada —
 * bukan melempar error yang menggagalkan seluruh sync gara-gara satu field.
 */

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = o?.[k]
    if (v !== undefined && v !== null) return v
  }
  return null
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v)

/**
 * Metrik harian datang sebagai deret per tanggal, bukan satu angka. Snapshot ini
 * satu baris per hari, jadi yang disimpan adalah nilai HARI TERAKHIR — bukan
 * jumlah seluruh rentang, yang akan menghitung ganda setiap kali sync jalan.
 */
const latestOf = (v: unknown): unknown => {
  if (Array.isArray(v)) {
    const last = v[v.length - 1]
    if (last && typeof last === 'object') {
      const o = last as Record<string, unknown>
      return pick(o, 'value', 'count', 'metric_value')
    }
    return last ?? null
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    // Bentuk { metrics: [...] } atau { value: n }
    if (Array.isArray(o.metrics)) return latestOf(o.metrics)
    return pick(o, 'value', 'count', 'metric_value')
  }
  return v ?? null
}

const metric = (o: Record<string, unknown>, ...keys: string[]): number | null =>
  numOrNull(latestOf(pick(o, ...keys)))

export function profilePayload(socialAccountId: string, raw: BusinessProfile): TtProfileSnapshotPayload {
  const o = (raw ?? {}) as Record<string, unknown>
  return {
    socialAccountId,
    // `open_id` Login Kit dan `business_id` Business API sama-sama identitas akun
    // di produknya masing-masing; kolomnya satu, jadi mana pun yang ada dipakai.
    openId:         strOrNull(pick(o, 'business_id', 'open_id', 'core_user_id')),
    displayName:    strOrNull(pick(o, 'display_name', 'username')),
    bioDescription: strOrNull(pick(o, 'bio_description', 'signature', 'bio')),
    avatarUrl:      strOrNull(pick(o, 'profile_image', 'avatar_url')),
    isVerified:     (pick(o, 'is_verified') as boolean | null) ?? null,
    followerCount:  metric(o, 'followers_count', 'follower_count'),
    followingCount: metric(o, 'following_count'),
    likesCount:     metric(o, 'likes', 'likes_count', 'total_likes'),
    videoCount:     metric(o, 'video_count', 'videos_count'),

    demographicsAge:     pick(o, 'audience_ages', 'audience_age'),
    demographicsCity:    pick(o, 'audience_cities', 'audience_city'),
    demographicsCountry: pick(o, 'audience_countries', 'audience_country'),
    demographicsGender:  pick(o, 'audience_genders', 'audience_gender'),

    videoViews:    metric(o, 'video_views'),
    profileReach:  metric(o, 'reach', 'profile_reach'),
    profileViews:  metric(o, 'profile_views'),
    comments:      metric(o, 'comments'),
    shares:        metric(o, 'shares'),
    netGrowth:     metric(o, 'net_follower_growth', 'net_growth'),
    newFollowers:  metric(o, 'new_followers', 'followers_gained'),
    lostFollowers: metric(o, 'lost_followers', 'followers_lost'),
  }
}

export function videoPayload(socialAccountId: string, v: BusinessVideo): TtVideoSnapshotItem | null {
  const o = (v ?? {}) as Record<string, unknown>
  const videoId = strOrNull(pick(o, 'item_id', 'video_id', 'id'))
  // Tanpa id, baris ini tidak punya kunci untuk upsert — dibuang, bukan disimpan
  // dengan id kosong yang akan bertabrakan dengan baris lain yang sama-sama kosong.
  if (!videoId) return null

  const created = pick(o, 'create_time', 'created_at')
  const createdMs = typeof created === 'number'
    // Detik atau milidetik: apa pun sebelum tahun 2001 dalam milidetik jelas detik.
    ? (created < 1e11 ? created * 1000 : created)
    : created ? Date.parse(String(created)) : NaN

  const rate = numOrNull(pick(o, 'full_video_watched_rate'))
  const totalWatched = numOrNull(pick(o, 'total_time_watched'))
  const views = metric(o, 'video_views', 'views')

  return {
    socialAccountId,
    videoId,
    postedAt:      Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    title:         strOrNull(pick(o, 'caption', 'title')),
    description:   strOrNull(pick(o, 'caption', 'description')),
    duration:      numOrNull(pick(o, 'video_duration', 'duration')),
    coverImageUrl: strOrNull(pick(o, 'thumbnail_url', 'cover_image_url')),
    shareUrl:      strOrNull(pick(o, 'share_url', 'embed_url')),
    likeCount:     metric(o, 'likes', 'like_count'),
    commentCount:  metric(o, 'comments', 'comment_count'),
    shareCount:    metric(o, 'shares', 'share_count'),
    viewCount:     views,
    reachPost:     metric(o, 'reach'),
    // Rata-rata tonton: dipakai kalau disediakan; kalau tidak, diturunkan dari
    // total waktu tonton dibagi jumlah view — pembagian hanya dilakukan kalau
    // view-nya benar-benar > 0, supaya tidak menghasilkan Infinity.
    avgWatchTime:  numOrNull(pick(o, 'average_time_watched'))
      ?? (totalWatched !== null && views ? totalWatched / views : null),
    // Kolomnya bertipe teks di l0_raw dan dashboard membersihkannya dengan
    // regex; TikTok mengirim pecahan 0..1, jadi dijadikan persen di sini.
    completionRate: rate === null ? null : `${(rate <= 1 ? rate * 100 : rate).toFixed(2)}%`,
    saves:          metric(o, 'saves', 'favorites'),
    engagementRate: numOrNull(pick(o, 'engagement_rate')),
  }
}
