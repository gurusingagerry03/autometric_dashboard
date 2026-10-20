// Menyalin cover post ke Cloudinary HANYA untuk post yang tampil di report.
//
// ALUR PER POST
//   1. Sudah ada di report_post_images      → pakai itu.
//   2. URL CDN yang tersimpan masih hidup    → unduh, unggah ke Cloudinary.
//   3. Gagal / kosong / sudah kedaluwarsa    → scrape ulang post itu lewat Apify
//      dari permalink-nya, lalu unggah cover yang baru. (oEmbed TikTok tidak bisa
//      dipakai: per Okt 2026 responsnya tidak lagi memuat thumbnail_url.)
//   Hasilnya disimpan di report_post_images (lihat migration 058) supaya post yang
//   sama tidak pernah diunggah atau di-scrape dua kali.
//
// Permalink yang tidak tersimpan dibentuk dari yang ada: shortcode IG, username +
// id video TikTok, atau id post Facebook. Post kompetitor yang ter-scrape ulang
// ikut disimpan kembali ke l0_raw — metriknya ikut segar, dan permalink yang tadi
// dibentuk jadi tersimpan.
import pool from '@/lib/db'
import cloudinary from '@/lib/cloudinary/client'
import {
  fetchIgPostsByUrls, fetchTiktokPostsByUrls, fetchFbPostsByUrls,
  type ApifyIgPost, type ApifyTiktokPost,
} from '@/lib/apify/client'
import { saveIgCompetitorMedias, saveTiktokCompetitorMedias } from '@/lib/apify/queries'
import { parseImageKey, MAX_IMAGE_KEYS, type ImageKind } from './keys'

export { MAX_IMAGE_KEYS }
/** Post yang gagal di-scrape tidak dicoba lagi sebelum jeda ini lewat. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000
/**
 * Gambar pengganti untuk post yang dipastikan tidak bisa diambil — scrape ulangnya
 * jalan tapi post-nya tidak ditemukan (dihapus/diarsipkan/privat). Kegagalan Apify
 * sendiri (token, jaringan) TIDAK memakai ini: kartunya tetap kosong dan dicoba
 * lagi, karena post-nya mungkin masih ada.
 */
export const UNAVAILABLE_POST_IMAGE =
  'https://res.cloudinary.com/doxqrjzg7/image/upload/v1792517819/Screenshot_2026-10-21_003550_kxfwwt.png'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

interface Target {
  key: string
  kind: ImageKind
  platform: string
  postId: string
  accountId: string | null
  username: string | null
  image: string | null
  link: string | null
}

function configured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  )
}

/** Cloudinary menolak sebagian karakter di public_id; id post bisa memuat apa saja. */
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)

/**
 * URL CDN yang masa berlakunya sudah lewat — tidak perlu dicoba diunduh.
 * Instagram/Facebook menulisnya di `oe=` (hex epoch), TikTok di `x-expires=`.
 * Tanpa penanda itu dianggap masih mungkin hidup dan dicoba saja.
 */
function isExpired(url: string): boolean {
  const now = Date.now() / 1000
  const oe = /[?&]oe=([0-9A-Fa-f]{8})\b/.exec(url)
  if (oe) return parseInt(oe[1], 16) < now + 60
  const xe = /[?&]x-expires=(\d+)/.exec(url)
  if (xe) return Number(xe[1]) < now + 60
  return false
}

/**
 * Unduh gambar lalu unggah isinya ke Cloudinary.
 *
 * Diunduh sendiri, bukan dengan memberi URL-nya ke Cloudinary: CDN TikTok menolak
 * pengambil di luar browser, dan itu sebabnya sebagian besar cover TikTok gagal
 * tersalin waktu penyalinan masih dilakukan saat sync. Disimpan sebagai JPG supaya
 * cover HEIC/WebP tetap tampil di semua browser dan di PowerPoint.
 */
async function storeImage(platform: string, postId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null
    const up = await cloudinary.uploader.upload(`data:${type};base64,${buf.toString('base64')}`, {
      folder:        `autometric/report-posts/${platform}`,
      public_id:     safeId(postId),
      overwrite:     true,
      resource_type: 'image',
      format:        'jpg',
    })
    return up.secure_url
  } catch (err) {
    console.error(`[report-images] ${platform}/${postId} gagal disimpan:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Permalink post — yang tersimpan, atau dibentuk dari bagian yang ada. */
function permalinkFor(t: Target): string | null {
  if (t.link && /^https?:\/\//i.test(t.link)) return t.link
  if (t.platform === 'tiktok' && t.username) {
    return `https://www.tiktok.com/@${t.username.replace(/^@/, '')}/video/${t.postId}`
  }
  if (t.platform === 'facebook') return `https://www.facebook.com/${t.postId}`
  return null
}

const igShortcode = (url: string) => /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([^/?#]+)/i.exec(url)?.[1] ?? null
const tiktokVideoId = (url: string) => /\/(?:video|photo)\/(\d+)/.exec(url)?.[1] ?? null
const stripQuery = (url: string) => url.split(/[?#]/)[0]

// ── Lookup: hanya post milik brand / kompetitor brand di org ini ──────────────

async function loadTargets(orgId: string, brandId: string, keys: string[]): Promise<Target[]> {
  const refs = keys.map(k => ({ key: k, ref: parseImageKey(k) })).filter(x => x.ref) as { key: string; ref: NonNullable<ReturnType<typeof parseImageKey>> }[]
  const brandRefs = refs.filter(r => r.ref.kind === 'b')
  const igComp = refs.filter(r => r.ref.kind === 'c' && r.ref.platform === 'instagram').map(r => r.ref.postId)
  const ttComp = refs.filter(r => r.ref.kind === 'c' && r.ref.platform === 'tiktok').map(r => r.ref.postId)
  const out: Target[] = []

  if (brandRefs.length) {
    // PERHATIAN: unified_post.brand_id menyimpan social_accounts.id, bukan brands.id.
    const { rows } = await pool.query<Record<string, string | null>>(
      `SELECT p.platform, p.post_id, p.brand_id::text acct, sa.username, p.cover_image image, p.link
         FROM l1_silver.unified_post p
         JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
         JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
         LEFT JOIN public.social_accounts sa ON sa.id = p.brand_id
        WHERE b.organization_id = $1::uuid AND bsa.brand_id = $2::uuid
          AND (p.platform, p.post_id) IN (SELECT * FROM unnest($3::text[], $4::text[]))`,
      [orgId, brandId, brandRefs.map(r => r.ref.platform), brandRefs.map(r => r.ref.postId)],
    )
    for (const r of rows) {
      out.push({
        key: `b:${r.platform}:${r.post_id}`, kind: 'b', platform: r.platform!, postId: r.post_id!,
        accountId: r.acct, username: r.username, image: r.image, link: r.link,
      })
    }
  }

  if (igComp.length || ttComp.length) {
    const { rows } = await pool.query<Record<string, string | null>>(
      `SELECT 'instagram' platform, m.media_id post_id, m.social_account_id::text acct, sa.username,
              m.cover_image image,
              COALESCE(m.permalink, CASE WHEN m.shortcode IS NOT NULL
                                         THEN 'https://www.instagram.com/p/' || m.shortcode || '/' END) link
         FROM l0_raw.ig_competitor_media m
         JOIN public.brand_competitors bc ON bc.social_account_id = m.social_account_id
         JOIN public.brands b ON b.id = bc.brand_id AND b.deleted_at IS NULL
         JOIN public.social_accounts sa ON sa.id = m.social_account_id
        WHERE b.organization_id = $1::uuid AND b.id = $2::uuid AND m.media_id = ANY($3::text[])
       UNION ALL
       SELECT 'tiktok', m.post_id, m.social_account_id::text, sa.username, m.cover_image, m.url
         FROM l0_raw.tiktok_competitor_media m
         JOIN public.brand_competitors bc ON bc.social_account_id = m.social_account_id
         JOIN public.brands b ON b.id = bc.brand_id AND b.deleted_at IS NULL
         JOIN public.social_accounts sa ON sa.id = m.social_account_id
        WHERE b.organization_id = $1::uuid AND b.id = $2::uuid AND m.post_id = ANY($4::text[])`,
      [orgId, brandId, igComp, ttComp],
    )
    for (const r of rows) {
      out.push({
        key: `c:${r.platform}:${r.post_id}`, kind: 'c', platform: r.platform!, postId: r.post_id!,
        accountId: r.acct, username: r.username, image: r.image, link: r.link,
      })
    }
  }

  // Satu post bisa muncul lewat dua akun (mis. kolaborasi) — cukup sekali.
  const seen = new Set<string>()
  return out.filter(t => (seen.has(t.key) ? false : (seen.add(t.key), true)))
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheRow { platform: string; post_id: string; image_url: string | null; failed_at: Date | null }

async function readCache(targets: Target[]): Promise<Map<string, CacheRow>> {
  const { rows } = await pool.query<CacheRow>(
    `SELECT platform, post_id, image_url, failed_at FROM report_post_images
      WHERE (platform, post_id) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
    [targets.map(t => t.platform), targets.map(t => t.postId)],
  )
  return new Map(rows.map(r => [`${r.platform}:${r.post_id}`, r]))
}

async function writeCache(t: Target, imageUrl: string | null, sourceUrl: string | null): Promise<void> {
  // Kegagalan tidak pernah menimpa gambar yang sudah berhasil tersimpan.
  await pool.query(
    `INSERT INTO report_post_images (platform, post_id, social_account_id, image_url, source_url, failed_at)
     VALUES ($1, $2, $3::uuid, $4, $5, CASE WHEN $4::text IS NULL THEN now() END)
     ON CONFLICT (platform, post_id) DO UPDATE SET
       image_url         = COALESCE(EXCLUDED.image_url, report_post_images.image_url),
       source_url        = COALESCE(EXCLUDED.source_url, report_post_images.source_url),
       social_account_id = COALESCE(report_post_images.social_account_id, EXCLUDED.social_account_id),
       failed_at         = CASE WHEN COALESCE(EXCLUDED.image_url, report_post_images.image_url) IS NULL
                                THEN now() END,
       updated_at        = now()`,
    [t.platform, t.postId, t.accountId, imageUrl, sourceUrl],
  ).catch(err => console.error(`[report-images] cache ${t.platform}/${t.postId} gagal ditulis:`, err))
}

// ── Scrape ulang ──────────────────────────────────────────────────────────────

/** Hasil scrape ulang: URL cover segar per key, dan key yang scrape-nya benar-benar
 *  berjalan. Post yang tidak ada di `ran` gagal karena Apify sendiri bermasalah
 *  (token, jaringan) — itu sementara dan tidak boleh ditandai gagal permanen. */
interface Rescrape { fresh: Map<string, string>; ran: Set<string> }

async function rescrapeInstagram(targets: Target[], r: Rescrape): Promise<void> {
  const byCode = new Map<string, Target>()
  for (const t of targets) {
    const link = permalinkFor(t)
    const code = link ? igShortcode(link) : null
    if (code) byCode.set(code, t)
  }
  if (byCode.size === 0) return
  let items: ApifyIgPost[]
  try {
    items = await fetchIgPostsByUrls([...byCode.keys()].map(c => `https://www.instagram.com/p/${c}/`))
  } catch (err) {
    console.error('[report-images] Apify Instagram gagal:', err instanceof Error ? err.message : err)
    return
  }
  for (const t of byCode.values()) r.ran.add(t.key)
  const compItems = new Map<string, ApifyIgPost[]>()
  for (const it of items) {
    const code = it.shortCode ?? (it.url ? igShortcode(it.url) : null)
    const t = code ? byCode.get(code) : undefined
    if (!t) continue
    if (it.displayUrl) r.fresh.set(t.key, it.displayUrl)
    if (t.kind === 'c' && t.accountId) (compItems.get(t.accountId) ?? compItems.set(t.accountId, []).get(t.accountId)!).push(it)
  }
  for (const [acct, list] of compItems) {
    await saveIgCompetitorMedias(acct, list)
      .catch(err => console.error('[report-images] simpan ulang post IG kompetitor gagal:', err))
  }
}

async function rescrapeTiktok(targets: Target[], r: Rescrape): Promise<void> {
  const rest: { t: Target; link: string; id: string }[] = []
  for (const t of targets) {
    const link = permalinkFor(t)
    if (link) rest.push({ t, link: stripQuery(link), id: tiktokVideoId(link) ?? t.postId })
  }
  if (rest.length === 0) return
  let items: ApifyTiktokPost[]
  try {
    items = await fetchTiktokPostsByUrls(rest.map(x => x.link))
  } catch (err) {
    console.error('[report-images] Apify TikTok gagal:', err instanceof Error ? err.message : err)
    return
  }
  for (const x of rest) r.ran.add(x.t.key)
  const byId = new Map(rest.map(x => [x.id, x.t]))
  const compItems = new Map<string, ApifyTiktokPost[]>()
  for (const it of items) {
    const t = it.id ? byId.get(String(it.id)) : undefined
    if (!t) continue
    if (it.videoMeta?.coverUrl) r.fresh.set(t.key, it.videoMeta.coverUrl)
    if (t.kind === 'c' && t.accountId) (compItems.get(t.accountId) ?? compItems.set(t.accountId, []).get(t.accountId)!).push(it)
  }
  for (const [acct, list] of compItems) {
    await saveTiktokCompetitorMedias(acct, list)
      .catch(err => console.error('[report-images] simpan ulang post TikTok kompetitor gagal:', err))
  }
}

async function rescrapeFacebook(targets: Target[], r: Rescrape): Promise<void> {
  const withLink = targets.map(t => ({ t, link: permalinkFor(t) })).filter(x => x.link) as { t: Target; link: string }[]
  if (withLink.length === 0) return
  let items
  try {
    items = await fetchFbPostsByUrls(withLink.map(x => x.link))
  } catch (err) {
    console.error('[report-images] Apify Facebook gagal:', err instanceof Error ? err.message : err)
    return
  }
  for (const x of withLink) r.ran.add(x.t.key)
  // Id Graph API berbentuk "<page>_<post>", Apify memakai bagian <post>-nya saja;
  // permalink-nya juga berakhir dengan id itu.
  const ids = (x: { t: Target; link: string }) => new Set([
    x.t.postId, x.t.postId.split('_').pop()!, /\/(\d+)\/?(?:[?#].*)?$/.exec(x.link)?.[1] ?? '',
  ].filter(Boolean))
  for (const it of items) {
    const pic = it.media?.map(m => m.image?.uri).find(u => typeof u === 'string' && u.length > 0)
    if (!pic) continue
    const hit = withLink.find(x => (it.postId && ids(x).has(String(it.postId)))
      || [it.url, it.topLevelUrl].some(u => u && stripQuery(u) === stripQuery(x.link)))
      ?? (withLink.length === 1 && items.length === 1 ? withLink[0] : undefined)
    if (hit) r.fresh.set(hit.t.key, pic)
  }
}

async function rescrape(targets: Target[]): Promise<Rescrape> {
  const r: Rescrape = { fresh: new Map(), ran: new Set() }
  const on = (p: string) => targets.filter(t => t.platform === p)
  await Promise.all([
    rescrapeInstagram(on('instagram'), r),
    rescrapeTiktok(on('tiktok'), r),
    rescrapeFacebook(on('facebook'), r),
  ])
  return r
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * URL Cloudinary per key; null = belum/tidak bisa didapat. Key yang bukan milik
 * brand (atau kompetitor brand) di org ini diabaikan diam-diam — endpoint-nya
 * memicu biaya Apify, jadi tidak boleh bisa disuruh men-scrape post sembarang.
 */
export async function resolveReportImages(
  orgId: string, brandId: string, keys: string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  if (!configured()) {
    console.warn('[report-images] Cloudinary belum dikonfigurasi — gambar report tidak disalin')
    return out
  }
  const targets = await loadTargets(orgId, brandId, [...new Set(keys)].slice(0, MAX_IMAGE_KEYS))
  if (targets.length === 0) return out

  const cache = await readCache(targets)
  const pending: Target[] = []
  for (const t of targets) {
    const c = cache.get(`${t.platform}:${t.postId}`)
    if (c?.image_url) out[t.key] = c.image_url
    else if (c?.failed_at && Date.now() - c.failed_at.getTime() < RETRY_AFTER_MS) out[t.key] = UNAVAILABLE_POST_IMAGE
    else pending.push(t)
  }
  if (pending.length === 0) return out

  // 2. URL CDN yang tersimpan — selama belum kedaluwarsa.
  const needScrape: Target[] = []
  for (let i = 0; i < pending.length; i += 5) {
    await Promise.all(pending.slice(i, i + 5).map(async t => {
      const url = t.image && /^https?:\/\//i.test(t.image) && !isExpired(t.image) ? t.image : null
      const stored = url ? await storeImage(t.platform, t.postId, url) : null
      if (stored) { out[t.key] = stored; await writeCache(t, stored, url) }
      else needScrape.push(t)
    }))
  }
  if (needScrape.length === 0) return out

  // 3. Scrape ulang dari permalink.
  const { fresh, ran } = await rescrape(needScrape)
  for (let i = 0; i < needScrape.length; i += 5) {
    await Promise.all(needScrape.slice(i, i + 5).map(async t => {
      const url = fresh.get(t.key) ?? null
      const stored = url ? await storeImage(t.platform, t.postId, url) : null
      out[t.key] = stored
      if (stored) await writeCache(t, stored, url)
      // Scrape-nya jalan tapi post ini tetap tanpa gambar (dihapus, privat, atau
      // memang post teks) — tandai supaya tidak di-scrape ulang tiap report dibuka,
      // dan tampilkan gambar pengganti.
      else if (ran.has(t.key) || !permalinkFor(t)) {
        out[t.key] = UNAVAILABLE_POST_IMAGE
        await writeCache(t, null, url)
      }
    }))
  }
  const unavailable = Object.values(out).filter(v => v === UNAVAILABLE_POST_IMAGE).length
  console.log(`[report-images] ${targets.length} post: ${Object.values(out).filter(Boolean).length - unavailable} bergambar, ${unavailable} tidak tersedia, ${needScrape.length} lewat scrape ulang`)
  return out
}
