// Periode YTD satu brand: baca/tulis `public.ytd_setting`, lalu memanggil
// `l2_gold.sp_calculate_ytd_performance` supaya deret hariannya langsung ada.
//
// Tabel ini sudah lama ada di warehouse beserta procedure-nya, tapi belum pernah
// ada yang menulisinya — pemilih "YTD Periode" di tab KPI hanya state di layar.
// Berkas inilah sambungan yang hilang itu.
import pool from '@/lib/db'

export interface YtdSetting {
  ytdId: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
}

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))

/** Validasi payload dari client. Pesan (bukan null) supaya API bisa menyebutnya. */
export function parseYtdInput(raw: unknown): { ok: true; start: string; end: string } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>
  if (!isDate(b.startDate) || !isDate(b.endDate)) return { ok: false, error: 'Periode belum lengkap.' }
  // Constraint `ytd_setting_date_check` menolak ini juga, tapi ditolak di sini
  // supaya pemakai dapat kalimat, bukan galat constraint.
  if (b.endDate < b.startDate) return { ok: false, error: 'Tanggal akhir mendahului tanggal mulai.' }
  return { ok: true, start: b.startDate, end: b.endDate }
}

/** Periode YTD aktif brand, atau null kalau belum pernah di-set. */
export async function getBrandYtd(brandId: string): Promise<YtdSetting | null> {
  const { rows } = await pool.query<{ ytd_id: string; start_date: string; end_date: string }>(
    `SELECT ytd_id, to_char(start_date, 'YYYY-MM-DD') start_date, to_char(end_date, 'YYYY-MM-DD') end_date
       FROM public.ytd_setting WHERE brand_id = $1 AND is_active`,
    [brandId],
  )
  const r = rows[0]
  return r ? { ytdId: r.ytd_id, startDate: r.start_date, endDate: r.end_date } : null
}

/**
 * Simpan periode YTD brand, lalu hitung ulang deretnya.
 *
 * SATU BARIS AKTIF PER BRAND
 *   `uq_ytd_setting_active_brand` unik pada `brand_id` selama `is_active`, jadi
 *   baris lama dinonaktifkan dulu — bukan dihapus. Menghapusnya akan ditolak
 *   selama `l2_gold.ytd_performance` masih menunjuk ke sana lewat FK, dan deret
 *   lama itu memang tidak mengganggu: pembacaan report menyaring `y.is_active`.
 *
 * SATU TRANSAKSI UNTUK UPDATE + INSERT + CALL
 *   Procedure `RAISE EXCEPTION` untuk metrics_target di luar daftarnya. Kalau
 *   perhitungannya gagal setelah periodenya tersimpan, brand akan punya periode
 *   YTD yang tidak punya angka sama sekali, dan tidak ada apa pun di UI yang
 *   bisa menjelaskannya. Jadi ketiganya berhasil bersama atau tidak sama sekali.
 *
 *   Procedure tidak COMMIT/ROLLBACK sendiri, jadi aman dipanggil dari dalam
 *   transaksi yang sudah terbuka.
 */
export async function setBrandYtd(
  orgId: string, brandId: string, userId: string, start: string, end: string,
): Promise<YtdSetting> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE public.ytd_setting SET is_active = false WHERE brand_id = $1 AND is_active`,
      [brandId],
    )
    const { rows } = await client.query<{ ytd_id: string }>(
      `INSERT INTO public.ytd_setting
         (organization_id, brand_id, social_account_id, user_id, start_date, end_date, is_active)
       VALUES ($1, $2, NULL, $3, $4::date, $5::date, true)
       RETURNING ytd_id`,
      [orgId, brandId, userId, start, end],
    )
    const ytdId = rows[0].ytd_id

    // Dihitung per (ytd_id, platform, metrik) — procedure menuntut ketiga
    // argumennya sekaligus atau tidak sama sekali, dan "tidak sama sekali" akan
    // membangun ulang SELURUH brand di database bersama ini.
    //
    // Kombinasinya diambil dari KPI aktif brand: hanya metrik ber-KPI yang punya
    // deret YTD. Brand tanpa KPI aktif menyimpan periodenya dengan sah, cuma
    // belum ada yang bisa dihitung — itu bukan kesalahan.
    const combos = await client.query<{ platform_id: string; metrics_target: string }>(
      `SELECT DISTINCT platform_id, metrics_target
         FROM public.kpi_setting WHERE brand_id = $1 AND is_active`,
      [brandId],
    )
    for (const c of combos.rows) {
      await client.query(
        'CALL l2_gold.sp_calculate_ytd_performance($1, $2, $3)',
        [ytdId, c.platform_id, c.metrics_target],
      )
    }

    await client.query('COMMIT')
    return { ytdId, startDate: start, endDate: end }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
