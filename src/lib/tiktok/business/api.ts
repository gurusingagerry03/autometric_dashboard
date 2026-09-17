/**
 * Klien TikTok API for Business — produk yang BERBEDA dari Login Kit.
 *
 * Login Kit (`open.tiktokapis.com`, lihat ../api.ts) hanya memberi angka publik:
 * follower, like, comment, share, view. Business API menambahkan yang selama ini
 * kolomnya sudah ada di l0_raw tapi tidak pernah terisi — reach, profile views,
 * demografi audiens, pertumbuhan follower, dan watch time per video.
 *
 * TIGA HAL YANG BERBEDA DARI LOGIN KIT, DAN SEMUANYA MENGGIGIT
 *   1. App-nya lain. Didaftarkan di business-api.tiktok.com, bukan
 *      developers.tiktok.com, jadi client key/secret Login Kit TIDAK berlaku di
 *      sini — lihat TIKTOK_BUSINESS_APP_ID / _SECRET. Izin dan token-nya justru
 *      lewat OAuth TikTok yang sama (www.tiktok.com / open.tiktokapis.com); yang
 *      berbeda adalah app-nya dan daftar scope-nya.
 *   2. Panggilan DATA-nya ke business-api.tiktok.com dengan header `Access-Token`,
 *      bukan `Authorization: Bearer`.
 *   3. HTTP 200 BUKAN berarti berhasil. Kegagalan tetap balas 200 dengan
 *      `code` bukan-nol di body. Memeriksa `res.ok` saja akan menyimpan
 *      seluruh respons error sebagai "data" yang kosong — karena itu setiap
 *      panggilan di bawah lewat `call()` yang memeriksa `code`.
 *
 * NAMA FIELD PERLU DIVERIFIKASI KE DOKUMENTASI TERBARU
 *   Katalog field TikTok berubah cukup sering dan tidak semuanya aktif untuk
 *   tiap app — tergantung produk apa yang di-approve. Karena itu semua nama
 *   field dikumpulkan di konstanta di bawah, bukan disebar ke dalam fungsi, dan
 *   pemetaannya di sync sengaja memaafkan field yang absen (jadi null, bukan
 *   error). Untuk melihat apa yang BENAR-BENAR dikembalikan akun tertentu,
 *   pakai /api/brands/[brandId]/tiktok/business/debug.
 */

const BASE = 'https://business-api.tiktok.com/open_api/v1.3'

/**
 * Otorisasi PEMEGANG AKUN TIKTOK, bukan pengiklan.
 *
 * Portal TikTok menampilkan DUA URL berbeda untuk app yang sama:
 *   - Advertiser authorization URL     → business-api.tiktok.com/portal/auth
 *   - TikTok account holder auth URL   → www.tiktok.com/v2/auth/authorize   ← INI
 *
 * Yang pertama meminta user memberi akses ke akun IKLAN-nya. Dipakai untuk akun
 * organik, halamannya gagal menarik info user dan membalas "There seems to be an
 * issue getting user information associated with your account or the
 * authorization application" — pesan yang tidak menyebut sama sekali bahwa
 * pintunya yang salah. Bentuk di bawah disalin dari URL yang portal itu sendiri
 * tampilkan untuk app ini.
 */
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize'

/** Token diterbitkan oleh OAuth TikTok, bukan oleh host business-api. */
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/'

/**
 * Persis daftar yang ditampilkan portal untuk app ini. Tiga terakhir yang
 * menjadi alasan seluruh integrasi ini ada — tanpa user.insights dan
 * video.insights, reach, demografi, dan watch time tidak akan pernah terisi.
 */
const SCOPES = [
  'user.info.basic', 'user.info.username', 'user.info.stats', 'user.info.profile',
  'user.account.type', 'video.list', 'comment.list',
  'user.insights', 'video.insights', 'biz.brand.insights',
].join(',')

/* Sengaja TIDAK diminta meski di-approve: comment.list.manage, video.publish,
 * video.upload, biz.spark.auth, discovery.search.words. Tiga yang pertama
 * memberi kemampuan MENGUBAH akun klien — membalas, menghapus, mengunggah — dan
 * integrasi ini murni membaca. Meminta izin yang tidak dipakai hanya menambah
 * yang harus dipertanggungjawabkan tanpa menambah satu kolom pun. */

export const BUSINESS_APP_ID = process.env.TIKTOK_BUSINESS_APP_ID ?? ''
export const BUSINESS_SECRET = process.env.TIKTOK_BUSINESS_SECRET ?? ''

/** Terpasang atau tidak — dipakai UI untuk menyembunyikan opsinya kalau env-nya kosong. */
export const businessConfigured = () => !!BUSINESS_APP_ID && !!BUSINESS_SECRET

/* ── katalog field ───────────────────────────────────────────────────────────
 * DIVERIFIKASI 17 Sep 2026 langsung ke API, bukan dari dokumentasi.
 *
 * Mengirim satu nama field yang tidak dikenal membuat SELURUH panggilan gagal
 * dengan code 40002 — bukan mengabaikan yang satu itu saja. Tapi pesan errornya
 * menyertakan daftar lengkap field yang sah, jadi cara termurah memastikannya
 * adalah mengirim satu field karangan lalu membaca balasannya. Itu yang dipakai
 * untuk menyusun dua daftar di bawah.
 *
 * Konsekuensinya: JANGAN menambah nama di sini berdasarkan tebakan. Satu nama
 * yang salah mematikan seluruh sync profil atau seluruh sync video.
 */

/** Profil statis. Nama yang sempat salah: `video_count` — yang benar `videos_count`. */
export const PROFILE_FIELDS = [
  'username', 'display_name', 'profile_image', 'bio_description',
  'is_business_account', 'is_verified',
  'followers_count', 'following_count', 'total_likes', 'videos_count',
] as const

/**
 * Metrik harian + demografi — butuh start_date/end_date.
 *
 * TikTok tidak menyediakan `reach` di tingkat profil (itu hanya ada per video),
 * jadi `unique_video_views` yang mengisi kolom profile_reach — padanan terdekat
 * yang ada. Pertumbuhan follower datang sebagai dua angka harian terpisah;
 * net_growth dihitung dari keduanya, bukan diminta sebagai field.
 */
export const PROFILE_METRIC_FIELDS = [
  'video_views', 'unique_video_views', 'profile_views', 'comments', 'shares', 'likes',
  'daily_new_followers', 'daily_lost_followers', 'daily_total_followers',
  'audience_ages', 'audience_genders', 'audience_countries', 'audience_cities',
] as const

/** Video. `favorites` yang mengisi kolom `saves`, dan `reach` di sini memang ada. */
export const VIDEO_FIELDS = [
  'item_id', 'create_time', 'thumbnail_url', 'share_url', 'embed_url', 'caption',
  'video_duration', 'media_type',
  'video_views', 'likes', 'comments', 'shares', 'favorites',
  'reach', 'full_video_watched_rate', 'total_time_watched', 'average_time_watched',
  'new_followers',
] as const

/**
 * BELUM DIVERIFIKASI. Endpoint-nya terbukti ada (ia memvalidasi video_id), tapi
 * daftar field sahnya baru bisa dipancing dengan video_id yang nyata — dan akun
 * uji belum punya video. Kalau panggilan komentar gagal dengan code 40002,
 * pesannya akan memuat daftar yang benar; salin dari situ, jangan menebak.
 */
export const COMMENT_FIELDS = [
  'comment_id', 'video_id', 'create_time', 'text', 'username',
  'like_count', 'reply_count', 'parent_comment_id', 'status', 'owner',
] as const

export interface BusinessToken {
  accessToken:  string
  refreshToken: string | null
  /** ISO. Business API memberi detik; dijadikan absolut di sini supaya pemanggilnya tidak perlu tahu. */
  expiresAt:    string
  /** Identitas akun di Business API. Dipakai sebagai business_id di semua panggilan berikutnya. */
  businessId:   string | null
  scope:        string | null
}

/**
 * Satu pintu untuk semua panggilan. Menerjemahkan dua bentuk kegagalan sekaligus
 * — HTTP bukan-2xx, dan HTTP 200 dengan `code` bukan-nol — menjadi Error yang
 * sama, supaya pemanggilnya tidak perlu mengingat keduanya.
 */
async function call<T>(url: string, init: RequestInit, what: string): Promise<T> {
  const res  = await fetch(url, init)
  const body = await res.json().catch(() => null) as
    { code?: number; message?: string; data?: T } | null

  if (!res.ok) {
    throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(body)?.slice(0, 400)}`)
  }
  if (body?.code !== 0) {
    throw new Error(`${what}: code=${body?.code} ${body?.message ?? ''}`.trim())
  }
  return body.data as T
}

const authed = (accessToken: string): RequestInit => ({
  // Diverifikasi 17 Sep 2026: `Authorization: Bearer` ditolak dengan 40104
  // "The access_token is empty" — Business API hanya membaca header ini.
  headers: { 'Access-Token': accessToken },
})

/* ── OAuth ───────────────────────────────────────────────────────────────── */

/**
 * Halaman izin TikTok untuk pemegang akun.
 *
 * `client_key` di sini adalah App ID dari portal business — app yang sama,
 * dinamai berbeda oleh dua produk. Tanpa PKCE: URL yang portal tampilkan sendiri
 * tidak membawa code_challenge, dan mengirimnya membuat permintaan ditolak.
 */
export function businessAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_key:    BUSINESS_APP_ID,
    scope:         SCOPES,
    response_type: 'code',
    redirect_uri:  redirectUri,
    state,
  })
  return `${AUTHORIZE}?${params}`
}

interface RawToken {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  open_id?: string
  scope?: string
  error?: string
  error_description?: string
}

/**
 * Tukar/refresh token lewat OAuth TikTok — form-encoded, bukan JSON, dan
 * bentuk errornya juga lain: `error` + `error_description` di body, bukan `code`
 * bukan-nol seperti panggilan business-api. Karena itu tidak lewat `call()`.
 */
async function tokenCall(body: Record<string, string>, what: string): Promise<BusinessToken> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const d = await res.json().catch(() => null) as RawToken | null
  if (!res.ok || !d?.access_token) {
    throw new Error(`${what}: ${d?.error_description ?? d?.error ?? `HTTP ${res.status}`}`)
  }
  return toToken(d)
}

const toToken = (d: RawToken): BusinessToken => ({
  accessToken:  d.access_token!,
  refreshToken: d.refresh_token ?? null,
  expiresAt:    new Date(Date.now() + (d.expires_in ?? 86400) * 1000).toISOString(),
  businessId:   d.open_id ?? null,
  scope:        d.scope ?? null,
})

/** `redirectUri` HARUS sama persis dengan yang dipakai saat meminta izin. */
export async function exchangeBusinessCode(code: string, redirectUri: string): Promise<BusinessToken> {
  return tokenCall({
    client_key:    BUSINESS_APP_ID,
    client_secret: BUSINESS_SECRET,
    code,
    grant_type:    'authorization_code',
    redirect_uri:  redirectUri,
  }, 'exchangeBusinessCode')
}

export async function refreshBusinessToken(refreshToken: string): Promise<BusinessToken> {
  const t = await tokenCall({
    client_key:    BUSINESS_APP_ID,
    client_secret: BUSINESS_SECRET,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  }, 'refreshBusinessToken')
  // TikTok tidak selalu mengirim refresh_token baru; yang lama tetap berlaku.
  return { ...t, refreshToken: t.refreshToken ?? refreshToken }
}

/* ── data ────────────────────────────────────────────────────────────────── */

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10)

/** `fields` dikirim sebagai JSON array di query string — bukan daftar dipisah koma seperti Login Kit. */
const fieldsParam = (fields: readonly string[]) => JSON.stringify(fields)

export type BusinessProfile = Record<string, unknown>

/**
 * Profil + metrik harian dalam satu panggilan.
 *
 * `days` mundur dari KEMARIN, bukan dari hari ini (lihat komentar di bawah).
 * TikTok membatasi seberapa jauh rentang ini boleh mundur; permintaan yang
 * terlalu panjang ditolak dengan code bukan-nol, bukan dipotong diam-diam.
 */
export async function fetchBusinessProfile(
  accessToken: string, businessId: string, days = 30,
): Promise<BusinessProfile> {
  // end_date TIDAK BOLEH hari ini — TikTok menolaknya dengan code 40002
  // "end_date should be earlier than today's date". Metrik hari berjalan memang
  // belum final di pihak mereka, jadi rentangnya berhenti di kemarin.
  const end   = new Date(Date.now() - 86400_000)
  const start = new Date(end.getTime() - days * 86400_000)
  const params = new URLSearchParams({
    business_id: businessId,
    fields:      fieldsParam([...PROFILE_FIELDS, ...PROFILE_METRIC_FIELDS]),
    start_date:  yyyymmdd(start),
    end_date:    yyyymmdd(end),
  })
  return call<BusinessProfile>(`${BASE}/business/get/?${params}`, authed(accessToken), 'fetchBusinessProfile')
}

export type BusinessVideo = Record<string, unknown>

/** Semua video dalam jendela `days`, mengikuti cursor sampai habis. */
export async function fetchAllBusinessVideos(
  accessToken: string, businessId: string, days = 30,
): Promise<BusinessVideo[]> {
  const cutoffSec = Math.floor((Date.now() - days * 86400_000) / 1000)
  const out: BusinessVideo[] = []
  let cursor: number | undefined
  // Pagar keras terhadap loop tak berujung. Penjaga SEBENARNYA ada di bawah
  // (`next === cursor` → berhenti); angka ini hanya jaring terakhir kalau TikTok
  // mengirim cursor yang terus berubah tapi tidak pernah kehabisan data.
  //
  // 200 halaman × 20 = 4.000 video. Jendela default cuma 30 hari, jadi angka ini
  // longgar dengan sengaja: TIKTOK_BUSINESS_BACKFILL_DAYS bisa dinaikkan kapan
  // saja, dan pemotongan di sini TIDAK memunculkan error — video tertua hanya
  // diam-diam tidak ikut tertarik. Satu brand di warehouse ini saja sudah punya
  // 1.079 post TikTok, jadi batas 1.000 yang sempat dipakai terlalu rapat.
  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams({
      business_id: businessId,
      fields:      fieldsParam(VIDEO_FIELDS),
      max_count:   '20',
    })
    if (cursor !== undefined) params.set('cursor', String(cursor))

    const data = await call<{ videos?: BusinessVideo[]; has_more?: boolean; cursor?: number }>(
      `${BASE}/business/video/list/?${params}`, authed(accessToken), 'fetchAllBusinessVideos',
    )

    const videos = data?.videos ?? []
    let reachedCutoff = false
    for (const v of videos) {
      const t = Number(v.create_time)
      if (Number.isFinite(t) && t < cutoffSec) { reachedCutoff = true; break }
      out.push(v)
    }

    const next = data?.cursor
    if (reachedCutoff || !data?.has_more || next === undefined || next === cursor) break
    cursor = next
  }
  return out
}

export type BusinessComment = Record<string, unknown>

/**
 * Komentar untuk SATU video. TikTok tidak menyediakan daftar komentar
 * se-akun — jadi pemanggilnya harus mengulang per video, dan itu sebabnya sync
 * membatasi berapa video yang disisir (lihat COMMENT_VIDEO_CAP di sync.ts).
 */
export async function fetchBusinessComments(
  accessToken: string, businessId: string, videoId: string,
): Promise<BusinessComment[]> {
  const out: BusinessComment[] = []
  let cursor: number | undefined
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      business_id: businessId,
      video_id:    videoId,
      fields:      fieldsParam(COMMENT_FIELDS),
      max_count:   '50',
    })
    if (cursor !== undefined) params.set('cursor', String(cursor))

    const data = await call<{ comments?: BusinessComment[]; has_more?: boolean; cursor?: number }>(
      `${BASE}/business/comment/list/?${params}`, authed(accessToken), 'fetchBusinessComments',
    )
    out.push(...(data?.comments ?? []))

    const next = data?.cursor
    if (!data?.has_more || next === undefined || next === cursor) break
    cursor = next
  }
  return out
}
