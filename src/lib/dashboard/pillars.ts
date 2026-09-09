import pool from '@/lib/db'
import { getLivePillarComparison, EXTRA_UNION, PILLAR, type PillarScope } from './pillarTags'

/**
 * Content Pillars dashboard data access, per docs §5 Content Pillars:
 *  - Define Pillars (CRUD) : l2_gold.dim_content_pillar (read-write; brand_id = umbrella)
 *  - Comparison Output      : l2_gold.pillar_performance_daily (ER + posts per pillar)
 * Pillars are per-brand. Add = insert/reactivate.
 *
 * KARTU MENAMPILKAN SEMUA PILAR, TERMASUK YANG is_active = false
 *   Dulu kartu ini menyaring yang aktif saja, sementara dropdown penandaan
 *   memakai semuanya — jadi Fitbar tampak punya 1 pilar di kartu dan 4 di
 *   dropdown, tanpa ada layar yang menjelaskan selisihnya. Sekarang keduanya
 *   memakai daftar yang sama dan tidak ada label "(nonaktif)" di mana pun.
 *
 * KONSEKUENSINYA: HAPUS HARUS BENAR-BENAR MENGHAPUS
 *   Selama pilar nonaktif ikut tampil, soft-delete membuat tombol hapus tampak
 *   rusak — diklik, barisnya tetap di tempat. Karena itu deletePillar() sekarang
 *   MENGHAPUS barisnya, dan sekaligus melepas tandanya dari post brand ini.
 *   Melepas tanda itu bukan tambahan opsional: selama masih ada post yang
 *   memakai namanya, re-seed pipeline (ON CONFLICT DO NOTHING) akan
 *   menghidupkannya lagi nanti malam. Lihat catatan di deletePillar().
 */

export interface PillarRow {
  id: string; name: string; color: string; hashtags: string[]
  /** Post yang memakai pilar ini, TANPA penyaring topbar — dipakai layar hapus
   *  untuk menyebut berapa yang akan kehilangan tandanya. */
  posts: number
}
export interface PillarComparison { name: string; color: string; er: number; posts: number }
export interface PillarsPayload { pillars: PillarRow[]; comparison: PillarComparison[] }

const DEFAULT_COLORS = ['#6c4cd6', '#d23f6f', '#3d7eea', '#5fa783', '#e0a458', '#8b5cf6', '#1B8A80', '#d97a7a']
const colorFor = (name: string, given: string | null): string =>
  given || DEFAULT_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % DEFAULT_COLORS.length]

/** True when the brand belongs to the org (guards every write). */
async function brandInOrg(orgId: string, brandId: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM public.brands WHERE id = $1 AND organization_id = $2', [brandId, orgId])
  return rows.length > 0
}

export async function getPillarsData(orgId: string, brandId: string | null, scope: PillarScope = {}): Promise<PillarsPayload> {
  const [dim, perf, usage] = await Promise.all([
    pool.query<{ id: string; content_pillar: string; color: string | null; hashtags: string[]; is_active: boolean }>(
      `SELECT d.id::text id, d.content_pillar, d.color, d.hashtags, d.is_active
         FROM l2_gold.dim_content_pillar d
         JOIN public.brands b ON b.id = d.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1
          AND ($2::uuid IS NULL OR d.brand_id = $2)
        ORDER BY d.is_active DESC, d.display_order NULLS LAST, d.content_pillar`,
      [orgId, brandId],
    ),
    // Dihitung langsung dari silver + tag l0_extra, BUKAN dari
    // l2_gold.pillar_performance_daily — gold dibangun semalam sekali dan hanya
    // mengenal satu pilar per post, jadi tag baru tidak akan pernah muncul di sini.
    getLivePillarComparison(orgId, brandId, scope),
    // Jumlah pemakaian SENGAJA tidak ikut `scope`. Angka ini dipakai untuk
    // memperingatkan sebelum menghapus, dan penghapusan menyentuh seluruh post
    // brand — bukan hanya yang kebetulan lolos penyaring platform/tanggal yang
    // sedang aktif. Menghitungnya ter-scope akan menyebut angka yang terlalu
    // kecil, persis di layar yang paling tidak boleh salah.
    pool.query<{ name: string; n: string }>(
      `WITH acct AS (
         SELECT bsa.social_account_id AS id
           FROM public.brand_social_accounts bsa
           JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
          WHERE b.organization_id = $1::uuid AND ($2::uuid IS NULL OR b.id = $2::uuid)
       ), extra AS (${EXTRA_UNION})
       SELECT ${PILLAR} AS name, COUNT(*)::text n
         FROM l1_silver.unified_post p
         JOIN acct a ON a.id = p.brand_id
         LEFT JOIN extra e
                ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
        WHERE ${PILLAR} IS NOT NULL
        GROUP BY ${PILLAR}`,
      [orgId, brandId],
    ),
  ])

  const usedBy = new Map(usage.rows.map(r => [r.name, Number(r.n)]))

  // Kartu dan dropdown penandaan memakai daftar yang sama — yang nonaktif ikut,
  // tanpa penanda apa pun. Urutannya (aktif dulu) datang dari ORDER BY di atas.
  const allPillars = dim.rows.map(r => ({
    id: r.id, name: r.content_pillar, color: colorFor(r.content_pillar, r.color),
    hashtags: r.hashtags ?? [], isActive: r.is_active, posts: usedBy.get(r.content_pillar) ?? 0,
  }))
  const pillars: PillarRow[] = allPillars.map(
    ({ id, name, color, hashtags, posts }) => ({ id, name, color, hashtags, posts }))

  const perfByName = new Map(perf.map(r => [r.name, r]))

  // Pilar aktif selalu tampil walau nol post — supaya skema brand terbaca utuh.
  // Pilar nonaktif hanya tampil kalau masih menempel di post; menyembunyikannya
  // akan menghilangkan ratusan post dari perbandingan tanpa penjelasan.
  const inChart = allPillars.filter(p => p.isActive || (perfByName.get(p.name)?.posts ?? 0) > 0)
  const comparison: PillarComparison[] = inChart.map(p => {
    const m = perfByName.get(p.name)
    const er = m && m.den > 0 ? (m.eng / m.den) * 100 : 0
    return { name: p.name, color: p.color, er: +er.toFixed(1), posts: m?.posts ?? 0 }
  }).sort((a, b) => b.er - a.er)

  return { pillars, comparison }
}

/** Add a pillar (or reactivate/update an existing one for the brand). */
export async function upsertPillar(orgId: string, brandId: string, name: string, color: string, hashtags: string[]): Promise<boolean> {
  if (!(await brandInOrg(orgId, brandId))) return false
  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM l2_gold.dim_content_pillar WHERE brand_id = $1 AND content_pillar = $2',
    [brandId, name],
  )
  if (existing.rows.length) {
    await pool.query(
      `UPDATE l2_gold.dim_content_pillar SET color = $3, hashtags = $4::text[], is_active = true, updated_at = now()
        WHERE brand_id = $1 AND content_pillar = $2`,
      [brandId, name, color, hashtags],
    )
  } else {
    await pool.query(
      `INSERT INTO l2_gold.dim_content_pillar (brand_id, content_pillar, color, hashtags, is_active)
       VALUES ($1, $2, $3, $4::text[], true)`,
      [brandId, name, color, hashtags],
    )
  }
  return true
}

/** Tabel atribut per platform. Nama diambil dari peta tetap, tidak pernah dari input. */
const EXTRA_TABLES = [
  'instagram_post_extra_attribute',
  'facebook_post_extra_attribute',
  'tiktok_post_extra_attribute',
] as const

/**
 * Menghapus pilar SUNGGUHAN: barisnya hilang dan tandanya dilepas dari seluruh
 * post brand ini.
 *
 * KENAPA BUKAN SOFT-DELETE LAGI
 *   Selama kartu hanya menampilkan pilar aktif, is_active = false sudah cukup —
 *   barisnya lenyap dari layar. Sekarang kartu menampilkan yang nonaktif juga,
 *   jadi soft-delete berarti tombol hapus yang tidak melakukan apa pun yang
 *   terlihat. Antara menyembunyikan lagi atau menghapus betulan, yang kedua
 *   yang cocok dengan kata "hapus".
 *
 * KENAPA TANDANYA HARUS IKUT DILEPAS
 *   Bukan kerapian: selama masih ada post yang memakai namanya, re-seed pipeline
 *   akan membuat ulang pilar itu nanti malam dan penghapusannya batal sendiri
 *   tanpa ada yang tahu. Alasan yang sama yang dulu melahirkan soft-delete.
 *
 * KENAPA SILVER IKUT DIBERSIHKAN
 *   Pilar efektif dibaca COALESCE(l0_extra, l1_silver) — silver menyimpan
 *   salinan yang dibangun ulang tiap malam dari l0_extra. Kalau hanya l0_extra
 *   yang dikosongkan, salinan basi di silver mengambil alih dan pilarnya tampak
 *   kembali sampai rebuild berikutnya. Menulis silver di sini bukan menyimpang
 *   dari pipeline, hanya mendahului hasil yang sama.
 */
export async function deletePillar(
  orgId: string, brandId: string, id: string,
): Promise<{ deleted: boolean; cleared: number }> {
  // Nama diambil lewat join yang sekaligus memeriksa hak akses: pilar milik
  // brand di org lain tidak akan pernah terbaca, jadi tidak ada yang terhapus.
  const { rows } = await pool.query<{ content_pillar: string }>(
    `SELECT d.content_pillar
       FROM l2_gold.dim_content_pillar d
       JOIN public.brands b ON b.id = d.brand_id AND b.deleted_at IS NULL
      WHERE d.id = $1::bigint AND b.id = $2::uuid AND b.organization_id = $3`,
    [id, brandId, orgId],
  )
  const name = rows[0]?.content_pillar
  if (!name) return { deleted: false, cleared: 0 }

  const accounts = `
    SELECT bsa.social_account_id
      FROM public.brand_social_accounts bsa
     WHERE bsa.brand_id = $2::uuid`

  let cleared = 0
  for (const table of EXTRA_TABLES) {
    const r = await pool.query(
      `UPDATE l0_extra.${table}
          SET content_pillar = NULL
        WHERE content_pillar = $1 AND brand_id IN (${accounts})`,
      [name, brandId],
    )
    cleared += r.rowCount ?? 0
  }
  await pool.query(
    `UPDATE l1_silver.unified_post
        SET content_pillar = NULL
      WHERE content_pillar = $1 AND brand_id IN (${accounts})`,
    [name, brandId],
  )

  const del = await pool.query(
    `DELETE FROM l2_gold.dim_content_pillar d
       USING public.brands b
      WHERE d.id = $1::bigint AND d.brand_id = b.id AND b.id = $2::uuid
        AND b.organization_id = $3 AND b.deleted_at IS NULL`,
    [id, brandId, orgId],
  )
  return { deleted: (del.rowCount ?? 0) > 0, cleared }
}
