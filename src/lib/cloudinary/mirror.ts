import pool from '@/lib/db'
import cloudinary from './client'

/**
 * Menyalin gambar post ke Cloudinary saat data mentah ditarik, lalu menyimpan URL
 * Cloudinary-nya — bukan URL asli dari CDN platform.
 *
 * KENAPA PERLU
 *   URL cover dari Meta dan TikTok MEMBAWA MASA BERLAKU. Instagram menyisipkan
 *   parameter `oe=`, TikTok `x-expires=`; lewat beberapa hari gambarnya berhenti
 *   tampil dan tidak ada cara memulihkannya — post lama di dashboard, di laporan
 *   PPTX yang sudah diekspor, dan di layar penandaan sama-sama jadi kotak kosong.
 *   Menyalinnya sekali saat ditarik membuat gambarnya permanen.
 *
 * URL CLOUDINARY MENGGANTIKAN YANG ASLI DI TEMPATNYA
 *   Bukan disimpan di kolom baru. Dengan begitu seluruh hilir — silver, gold,
 *   dashboard, report, penandaan pilar — langsung ikut memakai URL permanen tanpa
 *   satu pun perubahan di sana. URL CDN aslinya memang tidak berguna jangka
 *   panjang, jadi tidak ada yang hilang.
 *
 * TIDAK PERNAH MENGUNGGAH DUA KALI
 *   Sync harian menarik post yang sama berulang kali. Sebelum mengunggah, baris
 *   yang sudah punya URL Cloudinary dibaca dari database dan dipakai kembali —
 *   jadi tidak ada panggilan API, dan yang lebih penting: nilai permanen yang
 *   sudah tersimpan tidak tertimpa kembali oleh URL CDN yang akan kedaluwarsa.
 *
 * KEGAGALAN TIDAK PERNAH MENGHENTIKAN SYNC
 *   Kalau Cloudinary tidak dikonfigurasi, atau satu unggahan gagal, post itu
 *   tetap disimpan dengan URL aslinya. Gambar yang mungkin kedaluwarsa jauh lebih
 *   baik daripada baris yang gagal masuk.
 */

/** Nama tabel & kolom berasal dari pemanggil di dalam kode, tidak pernah dari
 *  input pengguna — karena itu aman dirangkai ke SQL. */
export interface MirrorTarget {
  /** Tabel l0_raw yang menyimpan gambarnya, tanpa prefix schema. */
  table:     string
  /** Kolom id yang dipakai mencocokkan baris (mis. 'media_id'). */
  idColumn:  string
  /** Kolom penyimpan URL gambar (mis. 'cover_image'). */
  urlColumn: string
  /** Sub-folder Cloudinary, mis. 'ig-media'. */
  folder:    string
}

const CLOUDINARY_HOST = 'res.cloudinary.com'
const isMirrored = (u: string | null | undefined) => !!u && u.includes(CLOUDINARY_HOST)

function configured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  )
}

/** Cloudinary menolak sebagian karakter di public_id; id post bisa memuat apa saja. */
const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)

/** Beberapa unggahan sekaligus, tapi jangan sampai satu sync membanjiri Cloudinary. */
const CONCURRENCY = 5

async function inBatches<T>(items: T[], size: number, fn: (it: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

/**
 * Mengembalikan peta id → URL yang harus disimpan. Id yang tidak ada di peta
 * berarti dipakai apa adanya oleh pemanggil (gagal unggah, tanpa gambar, atau
 * Cloudinary tidak aktif).
 */
export async function mirrorImages(
  entries: { id: string; url: string | null }[],
  target: MirrorTarget,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const withUrl = entries.filter(e => e.url && e.url.trim())
  if (withUrl.length === 0) return out

  // Yang datang sudah berupa URL Cloudinary (mis. dari pemanggil lain) dipakai apa adanya.
  const pending = withUrl.filter(e => !isMirrored(e.url))
  for (const e of withUrl) if (isMirrored(e.url)) out.set(e.id, e.url!)
  if (pending.length === 0) return out

  // Baris yang SUDAH tersalin sebelumnya: pakai ulang nilainya, jangan unggah lagi
  // dan jangan biarkan URL CDN baru menimpanya.
  try {
    const { rows } = await pool.query<{ id: string; url: string }>(
      `SELECT ${target.idColumn}::text AS id, ${target.urlColumn} AS url
         FROM l0_raw.${target.table}
        WHERE ${target.idColumn}::text = ANY($1::text[])
          AND ${target.urlColumn} LIKE '%${CLOUDINARY_HOST}%'`,
      [pending.map(e => e.id)],
    )
    for (const r of rows) out.set(r.id, r.url)
  } catch (err) {
    // Tabel/kolom tidak cocok seharusnya tidak terjadi, tapi kalau terjadi jangan
    // sampai menjatuhkan sync — teruskan tanpa memakai ulang.
    console.error(`[mirror] gagal membaca ${target.table}.${target.urlColumn}:`, err)
  }

  const toUpload = pending.filter(e => !out.has(e.id))
  if (toUpload.length === 0) return out

  if (!configured()) {
    console.warn(`[mirror] Cloudinary belum dikonfigurasi — ${toUpload.length} gambar disimpan dengan URL aslinya`)
    return out
  }

  let ok = 0
  await inBatches(toUpload, CONCURRENCY, async e => {
    try {
      const res = await cloudinary.uploader.upload(e.url!, {
        folder:        `autometric/posts/${target.folder}`,
        public_id:     safeId(e.id),
        overwrite:     false,   // sudah ada = pakai yang lama, jangan tulis ulang
        resource_type: 'image',
      })
      out.set(e.id, res.secure_url)
      ok++
    } catch (err) {
      // Sengaja tidak dilempar: post ini tetap tersimpan dengan URL aslinya.
      console.error(`[mirror] ${target.folder}/${e.id} gagal:`, err instanceof Error ? err.message : err)
    }
  })
  if (toUpload.length) console.log(`[mirror] ${target.folder}: ${ok}/${toUpload.length} gambar disalin ke Cloudinary`)

  return out
}
