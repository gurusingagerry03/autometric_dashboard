import {
  fetchBusinessProfile, fetchBusinessDailyMetrics, fetchAllBusinessVideos,
  fetchBusinessComments, fetchBusinessCommentReplies,
  lastRequestableDate, shiftDate, DAILY_WINDOW_DAYS,
  type BusinessProfile, type BusinessDailyRow, type BusinessVideo, type BusinessComment,
} from './api'
import {
  saveTtProfileSnapshot, saveTtProfileDailyMetrics, earliestTtProfileSnapshotDate,
  saveTtVideoSnapshots, saveTtComments,
  TtProfileSnapshotPayload, TtDailyMetrics, TtVideoSnapshotItem, TtCommentItem,
} from '../queries'

export type TtSyncResult = {
  tt_profile:  { count: number; error: string | null }
  tt_videos:   { count: number; error: string | null }
  tt_comments: { count: number; error: string | null }
}

/**
 * Berapa video yang disisir komentarnya.
 *
 * TikTok tidak punya endpoint "semua komentar akun ini" — komentar hanya bisa
 * diminta PER VIDEO, jadi biayanya minimal satu panggilan untuk tiap video.
 *
 * 0 = SEMUA video yang ditarik. Itu default untuk sync awal: tujuannya memang
 * mengambil seluruh riwayat komentar sekali jalan.
 *
 * Sync malam memakai angka kecil (NIGHTLY_COMMENT_VIDEO_CAP): komentar di video
 * lama praktis tidak berubah, dan menyisir seluruh katalog setiap malam berarti
 * ribuan panggilan untuk data yang sama.
 */
export const COMMENT_VIDEOS_ALL = 0
export const NIGHTLY_COMMENT_VIDEO_CAP = 20

/**
 * Jendela tarik AWAL, dalam hari. Dipakai saat akun baru disambungkan dan saat
 * initial-sync dipanggil manual.
 *
 * Naikkan lewat TIKTOK_BUSINESS_BACKFILL_DAYS kalau butuh menarik mundur lebih
 * jauh — 686, misalnya, mundur sampai 1 November 2024. Jendela yang sama dipakai
 * untuk mundur mengisi metrik harian profil, per blok 7 hari, tapi tidak lebih
 * jauh dari baris snapshot tertua akunnya (lihat syncTtBusinessDailyMetrics).
 */
export const BACKFILL_DAYS = Number(process.env.TIKTOK_BUSINESS_BACKFILL_DAYS ?? 30)

/**
 * Jendela sync rutin — cukup untuk menjaga yang baru tetap segar. Untuk metrik
 * harian profil artinya lima panggilan per akun, dan itu yang menutup hari-hari
 * yang saat sync sebelumnya belum difinalisasi TikTok.
 */
export const NIGHTLY_DAYS = 30

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
  /** Berapa video yang disisir komentarnya; 0 = semua. */
  commentVideoCap = COMMENT_VIDEOS_ALL,
): Promise<TtSyncResult> {
  console.log(`[initialTtBusinessSync] START brandId=${brandId} socialAccountId=${socialAccountId} businessId=${businessId} days=${days}`)

  const results = await Promise.allSettled([
    (async () => {
      const end = lastRequestableDate()
      const raw = await fetchBusinessProfile(accessToken, businessId, end)
      console.log('[initialTtBusinessSync] profil field diterima:', Object.keys(raw ?? {}).join(', '))
      // Snapshot dulu: metrik harian hanya mengisi baris yang sudah ada, dan
      // untuk akun baru baris inilah satu-satunya, sekaligus batas bawah backfill.
      await saveTtProfileSnapshot(profilePayload(socialAccountId, raw, businessId))
      return syncTtBusinessDailyMetrics(socialAccountId, accessToken, businessId, raw?.metrics, end, days)
    })(),

    (async () => {
      const videos = await fetchAllBusinessVideos(accessToken, businessId, days)
      console.log(`[initialTtBusinessSync] ${videos.length} video`, videos[0] ? `field: ${Object.keys(videos[0]).join(', ')}` : '')
      const items = videos.map(v => videoPayload(socialAccountId, v)).filter((v): v is TtVideoSnapshotItem => !!v)
      await saveTtVideoSnapshots(items)

      // Komentar menumpang hasil tarikan video yang sama — daftar video sudah ada
      // di tangan, jadi tidak perlu memintanya dua kali. Dikembalikan bersama
      // supaya `tt_comments` ikut terlaporkan di log sync.
      const comments = await collectComments(accessToken, businessId, socialAccountId, items, commentVideoCap)
      return { videos: items.length, comments }
    })(),
  ])

  const [profileResult, videosResult] = results
  const errMsg = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null

  console.log(`[initialTtBusinessSync] DONE brandId=${brandId}`)
  const v = videosResult.status === 'fulfilled' ? videosResult.value : null
  return {
    // count tetap jumlah SNAPSHOT (satuan yang ditampilkan halaman monitoring);
    // backfill metrik harian yang gagal sebagian ikut dilaporkan sebagai error.
    tt_profile: profileResult.status === 'fulfilled'
      ? { count: 1, error: profileResult.value.error } : { count: 0, error: errMsg(profileResult) },
    tt_videos: v ? { count: v.videos, error: null } : { count: 0, error: errMsg(videosResult) },
    // Komentar berbagi nasib dengan video: kalau tarikan videonya gagal, daftar
    // videonya tidak pernah ada, jadi komentarnya memang tidak sempat dicoba.
    tt_comments: v
      ? { count: v.comments.saved, error: v.comments.error }
      : { count: 0, error: errMsg(videosResult) },
  }
}

/**
 * Metrik harian profil untuk `days` hari yang berakhir di `end`, mundur per blok
 * DAILY_WINDOW_DAYS, lalu ditulis ke baris snapshot bertanggal sama (lihat
 * saveTtProfileDailyMetrics).
 *
 * Blok terbaru sudah ada di tangan karena ikut respons fetchBusinessProfile,
 * jadi yang diminta ulang hanya blok-blok sebelumnya. Mundurnya berhenti di
 * baris snapshot tertua akun ini. Tanggal sebelum itu tidak punya baris untuk
 * diisi, jadi menariknya hanya membuang kuota.
 *
 * Blok yang gagal menghentikan backfill ke belakangnya, tapi yang sudah
 * terkumpul tetap ditulis, dan errornya dilaporkan, bukan ditelan.
 */
export async function syncTtBusinessDailyMetrics(
  socialAccountId: string, accessToken: string, businessId: string,
  latest: unknown, end: string, days: number,
): Promise<{ written: number; error: string | null }> {
  const earliest = await earliestTtProfileSnapshotDate(socialAccountId)
  const windowStart = shiftDate(end, -(Math.max(days, DAILY_WINDOW_DAYS) - 1))
  // Tanggal 'YYYY-MM-DD' dibandingkan sebagai teks, tanpa Date, jadi tidak ada
  // zona waktu yang bisa menggesernya.
  const floor = earliest && earliest > windowStart ? earliest : windowStart

  const collected: BusinessDailyRow[] = Array.isArray(latest) ? [...latest as BusinessDailyRow[]] : []
  let error: string | null = null
  for (let blockEnd = shiftDate(end, -DAILY_WINDOW_DAYS); blockEnd >= floor; blockEnd = shiftDate(blockEnd, -DAILY_WINDOW_DAYS)) {
    try {
      collected.push(...await fetchBusinessDailyMetrics(accessToken, businessId, blockEnd))
    } catch (e) {
      error = `metrik harian s.d. ${blockEnd}: ${(e as Error).message}`
      break
    }
  }

  const payload = dailyMetricsPayload(collected).filter(d => d.date >= floor)
  const written = await saveTtProfileDailyMetrics(socialAccountId, payload)
  const pending = payload.filter(d => d.videoViews === null).length
  console.log(`[initialTtBusinessSync] metrik harian: ${written.length} hari tertulis (${floor}..${end}, ${pending} belum final)`)
  return { written: written.length, error }
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
  accessToken: string, businessId: string, socialAccountId: string,
  videos: TtVideoSnapshotItem[], cap: number,
): Promise<{ saved: number; error: string | null }> {
  const sorted = [...videos].sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''))
  const targets = cap > 0 ? sorted.slice(0, cap) : sorted

  const all: TtCommentItem[] = []
  const failures: string[] = []

  for (const v of targets) {
    try {
      const raw = await fetchBusinessComments(accessToken, businessId, v.videoId)
      for (const c of raw) {
        const item = commentPayload(socialAccountId, v, c)
        if (item) all.push(item)

        // Balasan tidak ikut di daftar komentar induk — hanya tercatat sebagai
        // angka di `replies`. Diambil hanya kalau angkanya > 0, jadi video biasa
        // tidak membayar satu panggilan tambahan per komentar.
        const replies = Number((c as Record<string, unknown>).replies ?? 0)
        if (!Number.isFinite(replies) || replies <= 0) continue
        const parentId = String((c as Record<string, unknown>).comment_id ?? '')
        if (!parentId) continue
        try {
          const kids = await fetchBusinessCommentReplies(accessToken, businessId, v.videoId, parentId)
          for (const k of kids) {
            const item = commentPayload(socialAccountId, v, k)
            if (item) all.push(item)
          }
        } catch (e) {
          // Balasan yang gagal tidak membatalkan komentar induknya yang sudah
          // terkumpul — dicatat sebagai kegagalan terpisah.
          failures.push(`reply ${parentId}: ${(e as Error).message}`)
        }
      }
    } catch (e) {
      failures.push(`${v.videoId}: ${(e as Error).message}`)
    }
  }

  await saveTtComments(all)
  console.log(`[initialTtBusinessSync] komentar: ${all.length} dari ${targets.length} video (cap=${cap || 'semua'})`)
  return {
    saved: all.length,
    error: failures.length ? `${failures.length} gagal dari ${targets.length} video — ${failures[0]}` : null,
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
    // Tidak ada tautan komentar di respons; kolomnya dibiarkan null.
    linkComment:     null,
    commentTime:     epochToIso(pick(o, 'create_time', 'created_at')),
    commentText:     strOrNull(pick(o, 'text')),
    // JANGAN pakai `owner` sebagai cadangan — itu boolean, bukan nama.
    commentUsername: strOrNull(pick(o, 'username', 'display_name')),
    likesCount:      intOrNull(pick(o, 'likes')),
    repliesCount:    intOrNull(pick(o, 'replies')),
    // 'public' = tampil; status lain (hidden/deleted) dianggap disembunyikan.
    hidden:          (() => {
      const st = strOrNull(pick(o, 'status'))
      return st === null ? null : st.toLowerCase() !== 'public'
    })(),
    // Hanya ada di respons /comment/reply/list/, tidak di daftar komentar induk —
    // jadi ini yang membedakan balasan dari komentar tingkat atas di l0_raw.
    parentId:        strOrNull(pick(o, 'parent_comment_id')),
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
 * data.metrics → satu TtDailyMetrics per tanggal, urut naik.
 *
 * Bentuk yang dikembalikan TikTok (diverifikasi 17–18 Sep 2026):
 *   data.metrics = [ { date: '2026-09-16', video_views: 179, profile_views: 21, … },
 *                    { date: '2026-09-11', … }, … ]
 *
 * ARRAY-NYA TIDAK TERURUT
 *   Contoh nyata dari API: 16 Sep, 17 Sep, 11 Sep, 12 Sep. Diurutkan di sini,
 *   dan tiap baris membawa tanggalnya sendiri, jadi urutan tidak pernah
 *   dipakai untuk menebak tanggal.
 *
 * HARI YANG BELUM FINAL DITULIS null, BUKAN 0
 *   Hari-hari terakhir biasanya masih nol semua karena TikTok belum
 *   memfinalisasinya. Contoh nyata akun 90rb follower: 15 Sep views 1.192.161,
 *   16 Sep semuanya 0 pukul 02.00, lalu mulai terisi siang harinya. Nol di situ
 *   artinya "belum ada", bukan "harinya sepi". Karena itu hari-hari di UJUNG
 *   deret yang semua metriknya nol (sesudah hari terakhir yang ada isinya)
 *   ditulis null, dan sync berikutnya mengisinya begitu angkanya keluar. Angka
 *   yang baru sebagian terisi juga ikut ditimpa sync berikutnya, karena
 *   saveTtProfileDailyMetrics menulis langsung, bukan COALESCE.
 *
 *   Nol di TENGAH deret tetap 0: sesudahnya ada hari yang berisi, jadi hari itu
 *   sudah final dan memang sepi. Konsekuensinya, akun yang berhenti total
 *   tersimpan null di ujungnya, bukan 0. Untuk akun mati, bedanya tidak
 *   mengubah kesimpulan apa pun.
 */
const DAILY_METRIC_KEYS = [
  'video_views', 'unique_video_views', 'profile_views', 'comments', 'shares',
  'daily_new_followers', 'daily_lost_followers',
] as const

const hasAnyMetric = (o: Record<string, unknown>) =>
  DAILY_METRIC_KEYS.some(k => (numOrNull(o[k]) ?? 0) !== 0)

export function dailyMetricsPayload(rows: unknown): TtDailyMetrics[] {
  const byDate = new Map<string, Record<string, unknown>>()
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const date = strOrNull(o.date)
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) byDate.set(date, o)
    }
  }
  // Tanggal 'YYYY-MM-DD' diurutkan sebagai teks, tanpa Date, jadi tidak ada
  // zona waktu yang bisa menggeser urutannya.
  const dates = [...byDate.keys()].sort()
  const lastFinal = dates.filter(d => hasAnyMetric(byDate.get(d)!)).at(-1) ?? ''

  return dates.map((date): TtDailyMetrics => {
    if (date > lastFinal) {
      return {
        date, videoViews: null, profileReach: null, profileViews: null, comments: null,
        shares: null, netGrowth: null, newFollowers: null, lostFollowers: null,
      }
    }
    const m = byDate.get(date)!
    const newF  = intOrNull(m.daily_new_followers)
    const lostF = intOrNull(m.daily_lost_followers)
    return {
      date,
      videoViews:    intOrNull(m.video_views),
      // TikTok tidak menyediakan reach tingkat profil; unique_video_views padanan
      // terdekat yang ada.
      profileReach:  intOrNull(m.unique_video_views),
      profileViews:  intOrNull(m.profile_views),
      comments:      intOrNull(m.comments),
      shares:        intOrNull(m.shares),
      newFollowers:  newF,
      lostFollowers: lostF,
      // Diturunkan, bukan diminta: TikTok hanya memberi dua angka terpisah.
      // (daily_total_followers ternyata bukan total follower, melainkan selisih
      // yang sama ini.)
      netGrowth:     newF === null || lostF === null ? null : newF - lostF,
    }
  })
}

/** Demografi kosong (`[]`) berarti TikTok tidak punya datanya — disimpan null,
 *  bukan array kosong, supaya hilir tidak membacanya sebagai demografi yang sah. */
const demo = (v: unknown) => (Array.isArray(v) && v.length === 0 ? null : v ?? null)

/**
 * Potret profil untuk baris HARI INI: identitas, total, dan demografi.
 *
 * Metrik harian tidak ikut di sini. Angka hari ini belum ada di TikTok, dan
 * angka hari-hari sebelumnya milik baris bertanggal sama; lihat
 * dailyMetricsPayload dan saveTtProfileDailyMetrics.
 */
export function profilePayload(
  socialAccountId: string, raw: BusinessProfile, businessId?: string,
): TtProfileSnapshotPayload {
  const o = (raw ?? {}) as Record<string, unknown>
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
    followerCount:  intOrNull(o.followers_count),
    followingCount: intOrNull(o.following_count),
    // `total_likes` itu akumulasi seumur akun — yang dimaksud kolom likes_count.
    // `likes` juga sah tapi artinya like DALAM rentang tanggal, bukan total.
    likesCount:     intOrNull(o.total_likes),
    videoCount:     intOrNull(o.videos_count),

    demographicsAge:     demo(o.audience_ages),
    demographicsCity:    demo(o.audience_cities),
    demographicsCountry: demo(o.audience_countries),
    demographicsGender:  demo(o.audience_genders),
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
