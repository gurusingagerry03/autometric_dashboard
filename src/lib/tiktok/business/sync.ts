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
 * Jendela tarik AWAL, dalam hari. Dipakai saat akun baru disambungkan dan saat
 * initial-sync dipanggil manual.
 *
 * Naikkan lewat TIKTOK_BUSINESS_BACKFILL_DAYS kalau butuh menarik mundur lebih
 * jauh — 686, misalnya, mundur sampai 1 November 2024. Perlu diingat kalau
 * dinaikkan: jendela ini hanya menyentuh VIDEO. Metrik profil tetap dipatok
 * PROFILE_METRIC_DAYS, karena tabelnya memang tidak bisa menyimpan riwayat
 * harian (lihat alasannya di bawah).
 */
export const BACKFILL_DAYS = Number(process.env.TIKTOK_BUSINESS_BACKFILL_DAYS ?? 30)

/** Jendela sync rutin — cukup untuk menjaga yang baru tetap segar. */
export const NIGHTLY_DAYS = 30

/**
 * Rentang tanggal untuk metrik PROFIL, sengaja dipatok pendek dan TIDAK ikut
 * `days`.
 *
 * Alasannya bukan kuota, tapi bentuk tabelnya: tt_profile_snapshots berkunci
 * (social_account_id, DATE(fetched_at)), jadi satu penarikan hanya bisa
 * menghasilkan SATU baris apa pun panjang rentangnya — yang disimpan hari
 * terakhir (lihat latestDaily). Meminta 686 hari di sini tidak menambah satu
 * baris pun, hanya memperbesar respons dan menambah risiko ditolak TikTok
 * karena rentangnya melebihi batas mereka.
 */
const PROFILE_METRIC_DAYS = 30

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
  days = BACKFILL_DAYS,
): Promise<TtSyncResult> {
  console.log(`[initialTtBusinessSync] START brandId=${brandId} socialAccountId=${socialAccountId} businessId=${businessId} videoDays=${days} profileDays=${PROFILE_METRIC_DAYS}`)

  const results = await Promise.allSettled([
    (async () => {
      const raw = await fetchBusinessProfile(accessToken, businessId, PROFILE_METRIC_DAYS)
      console.log('[initialTtBusinessSync] profil field diterima:', Object.keys(raw ?? {}).join(', '))
      await saveTtProfileSnapshot(profilePayload(socialAccountId, raw, businessId))
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

  return {
    socialAccountId,
    videoId:         video.videoId,
    commentId,
    // TikTok tidak mengirim tautan komentar; tautan post-nya kita sudah punya
    // dari videonya sendiri, jadi dipakai ulang alih-alih dibiarkan kosong.
    linkPost:        video.shareUrl,
    linkComment:     strOrNull(pick(o, 'comment_url', 'link')),
    commentTime:     epochToIso(pick(o, 'create_time', 'created_at')),
    commentText:     strOrNull(pick(o, 'text', 'comment_text', 'content')),
    commentUsername: strOrNull(pick(o, 'username', 'owner', 'user_name', 'nickname')),
    likesCount:      intOrNull(pick(o, 'like_count', 'likes_count', 'digg_count')),
    repliesCount:    intOrNull(pick(o, 'reply_count', 'replies_count')),
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
 * Untuk kolom INTEGER di l0_raw. TikTok mengirim pecahan di beberapa field —
 * `video_duration` datang sebagai 15.7 — dan Postgres MENOLAK itu mentah-mentah
 * ("invalid input syntax for type integer: 15.7"), menggagalkan seluruh insert
 * video, bukan hanya kolom itu.
 */
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v)
  return n === null ? null : Math.round(n)
}

/**
 * Epoch TikTok → ISO. `create_time` dikirim sebagai STRING berisi detik
 * ("1784974952"), bukan number — jadi pemeriksaan typeof saja membuat setiap
 * tanggal post jatuh ke null tanpa error.
 */
function epochToIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) {
    const t = Date.parse(String(v))
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  // Detik atau milidetik: apa pun di bawah 1e11 dalam milidetik berarti sebelum
  // tahun 1973 — jauh lebih masuk akal dibaca sebagai detik.
  return new Date(n < 1e11 ? n * 1000 : n).toISOString()
}

/**
 * Baris metrik HARI TERAKHIR dari `data.metrics`.
 *
 * Bentuk yang dikembalikan TikTok (diverifikasi 17 Sep 2026):
 *   data.metrics = [ { date: '2026-08-21', video_views: 0, profile_views: 0, … },
 *                    { date: '2026-09-11', … }, … ]
 *
 * DUA JEBAKAN, DAN KEDUANYA SENYAP
 *   1. Array ini TIDAK TERURUT. Contoh nyata dari API: 21 Ags, 11 Sep, 17 Ags,
 *      14 Sep, 9 Sep. Mengambil elemen terakhir berarti mengambil tanggal acak,
 *      dan tidak ada apa pun yang akan memberitahu bahwa angkanya salah hari.
 *   2. Yang diambil satu hari, BUKAN jumlah seluruh rentang. Snapshot ini satu
 *      baris per hari; menjumlahkan 30 hari lalu menyimpannya sebagai nilai
 *      harian akan melipatgandakan angka di dashboard setiap kali sync jalan.
 */
function latestDaily(metrics: unknown): Record<string, unknown> | null {
  if (!Array.isArray(metrics) || !metrics.length) return null
  let best: Record<string, unknown> | null = null
  let bestKey = ''
  for (const row of metrics) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const key = String(o.date ?? '')
    // Tanggal 'YYYY-MM-DD' bisa dibandingkan sebagai teks — tanpa Date, jadi
    // tidak ada zona waktu yang bisa menggeser pilihannya.
    if (!best || key > bestKey) { best = o; bestKey = key }
  }
  return best
}

/** Demografi kosong (`[]`) berarti TikTok tidak punya datanya — disimpan null,
 *  bukan array kosong, supaya hilir tidak membacanya sebagai demografi yang sah. */
const demo = (v: unknown) => (Array.isArray(v) && v.length === 0 ? null : v ?? null)

export function profilePayload(
  socialAccountId: string, raw: BusinessProfile, businessId?: string,
): TtProfileSnapshotPayload {
  const o = (raw ?? {}) as Record<string, unknown>
  // Metrik harian TIDAK ada di level atas — semuanya bersarang di data.metrics[].
  // Membacanya dari `o` menghasilkan null untuk sembilan kolom sekaligus, tanpa
  // error apa pun; itu yang terjadi sebelum bentuk ini diverifikasi.
  const m = latestDaily(o.metrics) ?? {}
  const newF  = intOrNull(m.daily_new_followers)
  const lostF = intOrNull(m.daily_lost_followers)
  return {
    socialAccountId,
    // `open_id` Login Kit dan `business_id` Business API sama-sama identitas akun
    // di produknya masing-masing; kolomnya satu, jadi mana pun yang ada dipakai.
    // /business/get/ TIDAK mengembalikan business_id — identitas akunnya hanya
    // ada di token, jadi diteruskan dari pemanggil.
    openId:         businessId ?? strOrNull(pick(o, 'business_id', 'open_id')),
    displayName:    strOrNull(pick(o, 'display_name', 'username')),
    bioDescription: strOrNull(pick(o, 'bio_description')),
    avatarUrl:      strOrNull(pick(o, 'profile_image')),
    isVerified:     (pick(o, 'is_verified') as boolean | null) ?? null,
    // followers_count ada di dua tempat: total di level atas, dan per hari di
    // metrics. Yang dipakai level atas — itu jumlah terkini, bukan potret satu hari.
    followerCount:  intOrNull(o.followers_count) ?? intOrNull(m.followers_count),
    followingCount: intOrNull(o.following_count),
    // `total_likes` itu akumulasi seumur akun — yang dimaksud kolom likes_count.
    // `likes` juga sah tapi artinya like DALAM rentang tanggal, bukan total.
    likesCount:     intOrNull(o.total_likes),
    videoCount:     intOrNull(o.videos_count),

    demographicsAge:     demo(o.audience_ages),
    demographicsCity:    demo(o.audience_cities),
    demographicsCountry: demo(o.audience_countries),
    demographicsGender:  demo(o.audience_genders),

    videoViews:    intOrNull(m.video_views),
    // TikTok tidak menyediakan reach tingkat profil; unique_video_views padanan terdekat.
    profileReach:  intOrNull(m.unique_video_views),
    profileViews:  intOrNull(m.profile_views),
    comments:      intOrNull(m.comments),
    shares:        intOrNull(m.shares),
    newFollowers:  newF,
    lostFollowers: lostF,
    // Diturunkan, bukan diminta: TikTok hanya memberi dua angka harian terpisah.
    // Tetap null kalau salah satunya tidak ada — 0 akan terbaca sebagai
    // "pertumbuhannya datar", padahal yang benar "tidak diketahui".
    netGrowth:     newF === null || lostF === null ? null : newF - lostF,
  }
}

export function videoPayload(socialAccountId: string, v: BusinessVideo): TtVideoSnapshotItem | null {
  const o = (v ?? {}) as Record<string, unknown>
  const videoId = strOrNull(pick(o, 'item_id', 'video_id', 'id'))
  // Tanpa id, baris ini tidak punya kunci untuk upsert — dibuang, bukan disimpan
  // dengan id kosong yang akan bertabrakan dengan baris lain yang sama-sama kosong.
  if (!videoId) return null

  const rate = numOrNull(pick(o, 'full_video_watched_rate'))
  const totalWatched = numOrNull(pick(o, 'total_time_watched'))
  const views = intOrNull(pick(o, 'video_views'))

  return {
    socialAccountId,
    videoId,
    postedAt:      epochToIso(pick(o, 'create_time', 'created_at')),
    // TikTok hanya mengirim satu teks (`caption`); kolom title & description di
    // l0_raw sama-sama diisi darinya, seperti yang dilakukan jalur Login Kit.
    title:         strOrNull(pick(o, 'caption')),
    description:   strOrNull(pick(o, 'caption')),
    duration:      intOrNull(pick(o, 'video_duration')),
    coverImageUrl: strOrNull(pick(o, 'thumbnail_url')),
    shareUrl:      strOrNull(pick(o, 'share_url', 'embed_url')),
    likeCount:     intOrNull(pick(o, 'likes')),
    commentCount:  intOrNull(pick(o, 'comments')),
    shareCount:    intOrNull(pick(o, 'shares')),
    viewCount:     views,
    reachPost:     intOrNull(pick(o, 'reach')),
    // Rata-rata tonton: dipakai kalau disediakan; kalau tidak, diturunkan dari
    // total waktu tonton dibagi jumlah view — pembagian hanya dilakukan kalau
    // view-nya benar-benar > 0, supaya tidak menghasilkan Infinity.
    avgWatchTime:  numOrNull(pick(o, 'average_time_watched'))
      ?? (totalWatched !== null && views ? totalWatched / views : null),
    // Kolomnya bertipe teks di l0_raw dan dashboard membersihkannya dengan
    // regex; TikTok mengirim pecahan 0..1, jadi dijadikan persen di sini.
    completionRate: rate === null ? null : `${(rate <= 1 ? rate * 100 : rate).toFixed(2)}%`,
    // `favorites` adalah nama TikTok untuk simpan/bookmark — kolomnya `saves`.
    saves:          intOrNull(pick(o, 'favorites')),
    // engagement_rate BUKAN field video yang sah di API ini, jadi tidak diminta;
    // saveTtVideoSnapshots menghitungnya sendiri dari like+comment+share / view.
    engagementRate: null,
  }
}
