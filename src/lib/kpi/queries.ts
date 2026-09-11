// Akses data KPI: baca/tulis `public.kpi_setting`, lalu memanggil
// `l2_gold.sp_calculate_kpi_achievement` supaya capaiannya langsung ada begitu
// KPI dibuat — bukan menunggu job berikutnya.
import pool from '@/lib/db'
import type { KpiInput, KpiMetric, KpiPlatform, KpiRow } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Row {
  kpi_id: string; platform: string; metrics_target: string; operation: string
  value_target: string | number; start_date: string; end_date: string; is_active: boolean
}

const toRow = (r: Row): KpiRow => ({
  kpiId: r.kpi_id,
  platform: r.platform as KpiPlatform,
  metric: r.metrics_target as KpiMetric,
  operation: r.operation,
  valueTarget: Number(r.value_target),
  startDate: r.start_date,
  endDate: r.end_date,
  isActive: r.is_active,
})

// `platform` dikembalikan sebagai key ('instagram'), bukan uuid: form dan tabel
// berbicara dalam key, dan uuid-nya tidak berguna di client.
const SELECT = `
  SELECT k.kpi_id, p.key AS platform, k.metrics_target, k.operation,
         k.value_target, to_char(k.start_date, 'YYYY-MM-DD') start_date,
         to_char(k.end_date, 'YYYY-MM-DD') end_date, k.is_active
    FROM public.kpi_setting k
    JOIN public.platforms p ON p.id = k.platform_id`

/** KPI milik satu brand, terbaru di atas. */
export async function listBrandKpis(brandId: string): Promise<KpiRow[]> {
  const { rows } = await pool.query<Row>(
    `${SELECT} WHERE k.brand_id = $1 ORDER BY k.created_at DESC`, [brandId],
  )
  return rows.map(toRow)
}

/**
 * Simpan satu atau beberapa KPI sekaligus, lalu hitung capaiannya.
 *
 * SATU TRANSAKSI UNTUK INSERT + CALL
 *   Procedure `RAISE EXCEPTION` untuk `metrics_target` yang tidak dipetakan atau
 *   `platform_id` yang tidak ada — dua-duanya berarti payloadnya memang tidak
 *   sah. Membiarkan baris `kpi_setting` tetap tersimpan setelah perhitungannya
 *   gagal akan menghasilkan KPI yang tampil di tabel tapi tidak pernah punya
 *   angka capaian, dan tidak ada di UI yang menjelaskan kenapa. Jadi keduanya
 *   berhasil bersama atau tidak sama sekali.
 *
 *   Procedure ini tidak melakukan COMMIT/ROLLBACK sendiri, jadi aman dipanggil
 *   dari dalam transaksi yang sudah terbuka.
 */
export async function createBrandKpis(
  orgId: string, brandId: string, userId: string, inputs: KpiInput[],
): Promise<KpiRow[]> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out: KpiRow[] = []

    for (const input of inputs) {
      const { rows } = await client.query<{ kpi_id: string }>(
        `INSERT INTO public.kpi_setting
           (organization_id, brand_id, social_account_id, user_id, platform_id,
            metrics_target, operation, value_target, start_date, end_date)
         SELECT $1, $2, NULL, $3, p.id, $4, $5, $6, $7::date, $8::date
           FROM public.platforms p WHERE p.key = $9
         RETURNING kpi_id`,
        [orgId, brandId, userId, input.metric, input.operation,
         input.valueTarget, input.startDate, input.endDate, input.platform],
      )
      // Platform datang dari daftar tertutup, jadi baris kosong di sini berarti
      // tabel `platforms` yang tidak sinkron — bukan salah pemakai.
      if (!rows[0]) throw new Error(`platform '${input.platform}' tidak ada di public.platforms`)

      await client.query('CALL l2_gold.sp_calculate_kpi_achievement($1)', [rows[0].kpi_id])
      out.push({ ...input, kpiId: rows[0].kpi_id, isActive: true })
    }

    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/**
 * Nyalakan/matikan satu KPI. Dibatasi `brand_id` supaya id dari brand lain tidak
 * bisa disentuh lewat route brand ini. `false` = tidak ada baris yang cocok.
 */
export async function setKpiActive(brandId: string, kpiId: string, isActive: boolean): Promise<boolean> {
  const res = await pool.query(
    `UPDATE public.kpi_setting SET is_active = $3 WHERE kpi_id = $2 AND brand_id = $1`,
    [brandId, kpiId, isActive],
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * Hapus satu KPI beserta baris capaiannya.
 *
 * URUTANNYA TIDAK BISA DIBALIK
 *   `l2_gold.kpi_achievement.kpi_id` punya FK ke `kpi_setting` TANPA ON DELETE
 *   CASCADE, jadi menghapus setting-nya duluan akan ditolak selama baris capaian
 *   masih ada. Kepemilikan brand diperiksa dulu di dalam transaksi yang sama —
 *   tanpa itu, id milik brand lain akan kehilangan baris capaiannya sebelum
 *   penghapusan setting-nya gagal karena filter brand.
 *
 *   Capaian memang ikut dihapus, bukan ditinggal: angkanya turunan dari KPI yang
 *   sudah tidak ada, dan tidak ada satu pun tampilan yang bisa menjelaskannya.
 */
export async function deleteBrandKpi(brandId: string, kpiId: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const own = await client.query(
      `SELECT 1 FROM public.kpi_setting WHERE kpi_id = $2 AND brand_id = $1 FOR UPDATE`,
      [brandId, kpiId],
    )
    if (own.rowCount === 0) { await client.query('ROLLBACK'); return false }

    await client.query(`DELETE FROM l2_gold.kpi_achievement WHERE kpi_id = $1`, [kpiId])
    await client.query(`DELETE FROM public.kpi_setting WHERE kpi_id = $1`, [kpiId])
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
