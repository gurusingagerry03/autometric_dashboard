import pool from '@/lib/db'

/**
 * Penandaan pilar per-post.
 *
 * SUMBER BACA   l1_silver.unified_post (caption, cover, link, reach, ER)
 * SUMBER TULIS  l0_extra.<platform>_post_extra_attribute.tagging (jsonb)
 *
 * KENAPA l0_extra
 *   Tag pilar adalah masukan editorial, bukan hasil scrape — dan l0_extra memang
 *   lapisan untuk itu (jalur upload CSV sudah menulis ke sana). Kolom `tagging`
 *   jsonb sudah ada di ketiga tabel sejak awal tapi tidak pernah dipakai; ini yang
 *   mengisinya.
 *
 * GRAIN — DUA ARTI `brand_id` YANG BERBEDA
 *   l0_extra.brand_id dan l1_silver.unified_post.brand_id menyimpan
 *   `social_accounts.id` (per akun), sedangkan l2_gold.dim_content_pillar.brand_id
 *   menyimpan `brands.id` (brand payung). Menyaring dengan id yang salah
 *   mengembalikan nol baris TANPA error. Semua query di sini menjembatani lewat
 *   brand_social_accounts, dan id akun tidak pernah diterima dari klien —
 *   selalu diturunkan dari post-nya sendiri (lihat resolveAccount).
 *
 * SATU BARIS PER POST, BUKAN RIWAYAT
 *   Ketiga tabel punya UNIQUE (brand_id, post_id), jadi menandai ulang MENIMPA
 *   nilai lama. Tidak ada jejak perubahan sebelumnya.
 *
 * DAFTAR PILAR DI SINI SENGAJA MENGABAIKAN is_active
 *   Kartu "Tentukan Pilar" hanya menampilkan pilar aktif, dan itu benar untuk
 *   keperluannya. Tapi untuk menandai, daftar itu menyesatkan: per 3 Sep 2026
 *   MineralQUA punya 10 pilar dengan hanya 2 aktif, padahal 5 pilar nonaktif masih
 *   menempel di 203 post — chip-nya jadi abu-abu tanpa warna dan tidak bisa dipilih
 *   ulang. Fitbar bahkan punya 3 pilar dengan 0 aktif, sehingga layar penandaan
 *   tampak kosong padahal brand-nya punya pilar. Karena itu daftar di sini memuat
 *   SEMUA pilar brand; yang nonaktif ditandai supaya keadaannya tetap terbaca.
 *
 * PENYARINGAN & PAGINATION DI SISI SERVER
 *   Kalau pencarian dilakukan di klien setelah pagination, orang akan mencari di
 *   dalam satu halaman saja dan mengira hasilnya nihil. Karena itu `q` dan
 *   `filter` ikut ke SQL, dan `matched` mengembalikan jumlah untuk kombinasi
 *   penyaring saat itu — itulah yang dipakai menghitung halaman.
 *
 * `content_pillar` IKUT DITULIS — INI JEMBATAN SEMENTARA
 *   Yang dibaca pipeline sampai hari ini hanyalah kolom tunggal `content_pillar`.
 *   Tidak ada prosedur yang membaca `tagging`. Supaya penandaan tetap sampai ke
 *   chart sebelum prosedur itu diubah, pilar PERTAMA ikut ditulis ke
 *   `content_pillar`. Itu bayangan elemen pertama, bukan sumber kebenaran multi-tag.
 */

/** Nama tabel diambil dari peta tetap, tidak pernah dari input — dirangkai ke SQL. */
const EXTRA_TABLE: Record<string, string> = {
  instagram: 'instagram_post_extra_attribute',
  facebook:  'facebook_post_extra_attribute',
  tiktok:    'tiktok_post_extra_attribute',
}

export type TagSource = 'manual' | 'imported'
export type TagFilter = 'all' | 'untagged' | 'imported' | 'manual'

export interface TaggedPost {
  postId:     string
  platform:   string
  caption:    string
  postedAt:   string | null
  reach:      number
  er:         number
  coverImage: string | null
  link:       string | null
  pillars:    string[]
  source:     TagSource | null
}

export interface TagPillar { id: string; name: string; color: string; isActive: boolean }

export interface TaggablePostsPayload {
  posts:    TaggedPost[]
  pillars:  TagPillar[]
  /** Seluruh post brand ini, tanpa penyaring — penyebut untuk progres. */
  total:    number
  /** Seluruh post brand ini yang belum punya pilar, tanpa penyaring. */
  untagged: number
  /** Jumlah yang cocok dengan penyaring saat ini — penyebut untuk pagination. */
  matched:  number
}

const DEFAULT_COLORS = ['#6c4cd6', '#d23f6f', '#3d7eea', '#5fa783', '#e0a458', '#8b5cf6', '#1B8A80', '#d97a7a']
const colorFor = (name: string, given: string | null): string =>
  given || DEFAULT_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % DEFAULT_COLORS.length]

const EXTRA_UNION = `
  SELECT brand_id, post_id, 'instagram' AS platform, tagging, content_pillar FROM l0_extra.instagram_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'facebook',              tagging, content_pillar FROM l0_extra.facebook_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'tiktok',                tagging, content_pillar FROM l0_extra.tiktok_post_extra_attribute
`

/** Daftar pilar manual sebuah baris, atau NULL kalau belum pernah ditandai di sini. */
const MANUAL_ARR = `
  CASE WHEN jsonb_typeof(e.tagging -> 'pillars') = 'array'
            AND jsonb_array_length(e.tagging -> 'pillars') > 0
       THEN ARRAY(SELECT jsonb_array_elements_text(e.tagging -> 'pillars'))
       END`
const LEGACY = `NULLIF(COALESCE(e.content_pillar, p.content_pillar), '')`

export async function getTaggablePosts(
  orgId: string,
  brandId: string,
  opts: { limit?: number; offset?: number; q?: string; filter?: TagFilter } = {},
): Promise<TaggablePostsPayload> {
  const limit  = Math.min(Math.max(opts.limit ?? 25, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const q      = (opts.q ?? '').trim()
  const filter = opts.filter ?? 'all'

  const scope = `
    WITH acct AS (
      SELECT bsa.social_account_id AS id
        FROM public.brand_social_accounts bsa
        JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
       WHERE b.organization_id = $1::uuid AND b.id = $2::uuid
    ), extra AS (${EXTRA_UNION}),
    joined AS (
      SELECT p.post_id, p.platform, p.caption, p.post_date, p.reach, p.engagement_rate,
             p.cover_image, p.link,
             ${MANUAL_ARR} AS manual_pillars,
             ${LEGACY}     AS legacy_pillar
        FROM l1_silver.unified_post p
        JOIN acct a ON a.id = p.brand_id
        LEFT JOIN extra e
               ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
    )
  `

  // $3 = q ('' berarti tanpa pencarian), $4 = filter
  const where = `
    WHERE ($3 = '' OR caption ILIKE '%' || $3 || '%')
      AND ($4 = 'all'
        OR ($4 = 'untagged' AND manual_pillars IS NULL AND legacy_pillar IS NULL)
        OR ($4 = 'manual'   AND manual_pillars IS NOT NULL)
        OR ($4 = 'imported' AND manual_pillars IS NULL AND legacy_pillar IS NOT NULL))
  `

  const [list, counts, dim] = await Promise.all([
    pool.query<{
      post_id: string; platform: string; caption: string | null; post_date: Date | null
      reach: string | null; engagement_rate: string | null
      cover_image: string | null; link: string | null
      manual_pillars: string[] | null; legacy_pillar: string | null
    }>(
      `${scope} SELECT * FROM joined ${where}
        ORDER BY post_date DESC NULLS LAST, post_id DESC
        LIMIT $5 OFFSET $6`,
      [orgId, brandId, q, filter, limit, offset],
    ),
    pool.query<{ total: string; untagged: string; matched: string }>(
      `${scope}
       SELECT (SELECT COUNT(*) FROM joined)::text total,
              (SELECT COUNT(*) FROM joined WHERE manual_pillars IS NULL AND legacy_pillar IS NULL)::text untagged,
              (SELECT COUNT(*) FROM joined ${where})::text matched`,
      [orgId, brandId, q, filter],
    ),
    // SEMUA pilar brand, termasuk yang nonaktif — lihat catatan di kepala berkas.
    pool.query<{ id: string; content_pillar: string; color: string | null; is_active: boolean }>(
      `SELECT d.id::text id, d.content_pillar, d.color, d.is_active
         FROM l2_gold.dim_content_pillar d
         JOIN public.brands b ON b.id = d.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1::uuid AND d.brand_id = $2::uuid
        ORDER BY d.is_active DESC, d.display_order NULLS LAST, d.content_pillar`,
      [orgId, brandId],
    ),
  ])

  return {
    // Tag manual menang atas warisan content_pillar. Kalau keduanya kosong,
    // post itu memang belum pernah ditandai oleh siapa pun.
    posts: list.rows.map(r => {
      const manual = r.manual_pillars
      return {
        postId:     r.post_id,
        platform:   r.platform,
        caption:    r.caption ?? '',
        postedAt:   r.post_date ? new Date(r.post_date).toISOString() : null,
        reach:      Number(r.reach ?? 0),
        er:         Number(r.engagement_rate ?? 0),
        coverImage: r.cover_image,
        link:       r.link,
        pillars:    manual ?? (r.legacy_pillar ? [r.legacy_pillar] : []),
        source:     manual ? ('manual' as const) : (r.legacy_pillar ? ('imported' as const) : null),
      }
    }),
    pillars: dim.rows.map(r => ({
      id: r.id, name: r.content_pillar, color: colorFor(r.content_pillar, r.color), isActive: r.is_active,
    })),
    total:    Number(counts.rows[0]?.total ?? 0),
    untagged: Number(counts.rows[0]?.untagged ?? 0),
    matched:  Number(counts.rows[0]?.matched ?? 0),
  }
}

/**
 * Perbandingan performa pilar, DIHITUNG LANGSUNG dari silver + tag di l0_extra.
 *
 * KENAPA TIDAK DARI l2_gold.pillar_performance_daily
 *   Tabel gold itu dibangun Dagster tiap malam DAN hanya mengenal satu pilar per
 *   post (kolom content_pillar). Dua-duanya bikin layar ini salah: tag yang baru
 *   dibuat tidak muncul sampai besok pagi, dan pilar kedua sebuah post hilang
 *   sama sekali. Karena penandaan adalah permukaan kerja, perbandingannya harus
 *   ikut berubah begitu orang menandai.
 *
 * RUMUSNYA SENGAJA MENIRU sp_build_pillar_performance
 *   engagement_sum / er_denominator_sum, dengan penyebut mengikuti
 *   engagement_rate_base tiap post ('reach' → reach, 'view'/'views' → views).
 *   Kalau dirata-ratakan dari kolom engagement_rate per post, hasilnya beda —
 *   rasio tidak additive. Meniru rumus gold membuat angka di sini sebanding
 *   dengan angka di tempat lain, bukan versi kedua yang diam-diam menyimpang.
 *
 * POST BERPILAR GANDA DIHITUNG PENUH DI TIAP PILARNYA
 *   Satu post dengan dua pilar masuk penuh ke kedua-duanya. Itu yang benar untuk
 *   pertanyaan "berapa ER rata-rata konten pilar ini" — membagi engagement akan
 *   menurunkan ER pilar hanya karena post-nya kebetulan bertag ganda. Konsekuensi
 *   yang harus diingat: MENJUMLAHKAN post_count seluruh pilar bisa melebihi
 *   jumlah post sebenarnya. Jangan sajikan hasil penjumlahan itu sebagai total.
 */
export async function getLivePillarComparison(
  orgId: string, brandId: string | null,
): Promise<Array<{ name: string; posts: number; eng: number; den: number }>> {
  const { rows } = await pool.query<{ name: string; posts: string; eng: string; den: string }>(
    `WITH acct AS (
       SELECT bsa.social_account_id AS id
         FROM public.brand_social_accounts bsa
         JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1::uuid
          AND ($2::uuid IS NULL OR b.id = $2::uuid)
     ), extra AS (${EXTRA_UNION}),
     tagged AS (
       SELECT p.engagement, p.reach, p.views, p.engagement_rate_base,
              COALESCE(${MANUAL_ARR},
                       CASE WHEN ${LEGACY} IS NOT NULL THEN ARRAY[${LEGACY}] END) AS pillars
         FROM l1_silver.unified_post p
         JOIN acct a ON a.id = p.brand_id
         LEFT JOIN extra e
                ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
        WHERE p.post_date IS NOT NULL
     )
     SELECT pil AS name,
            COUNT(*)::text posts,
            COALESCE(SUM(t.engagement), 0)::text eng,
            COALESCE(SUM(
              CASE lower(trim(t.engagement_rate_base))
                   WHEN 'reach' THEN t.reach
                   WHEN 'view'  THEN t.views
                   WHEN 'views' THEN t.views
                   ELSE 0 END), 0)::text den
       FROM tagged t, LATERAL unnest(t.pillars) AS pil
      WHERE t.pillars IS NOT NULL
      GROUP BY pil`,
    [orgId, brandId],
  )
  return rows.map(r => ({ name: r.name, posts: Number(r.posts), eng: Number(r.eng), den: Number(r.den) }))
}

/**
 * Id akun tidak pernah datang dari klien. Diturunkan dari post-nya sendiri, dan
 * sekaligus jadi pemeriksaan hak akses: kalau post itu bukan milik brand di org
 * ini, hasilnya null dan penulisan dibatalkan.
 */
async function resolveAccount(
  orgId: string, brandId: string, platform: string, postId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ account_id: string }>(
    `SELECT p.brand_id AS account_id
       FROM l1_silver.unified_post p
       JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
       JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
      WHERE p.post_id = $1 AND p.platform = $2
        AND b.id = $3::uuid AND b.organization_id = $4::uuid
      LIMIT 1`,
    [postId, platform, brandId, orgId],
  )
  return rows[0]?.account_id ?? null
}

/** Menimpa seluruh daftar pilar sebuah post. Daftar kosong = lepas semua tag. */
export async function setPostTags(
  orgId: string, brandId: string, platform: string, postId: string, pillars: string[],
): Promise<boolean> {
  const table = EXTRA_TABLE[platform]
  if (!table) return false

  const accountId = await resolveAccount(orgId, brandId, platform, postId)
  if (!accountId) return false

  const clean = [...new Set(pillars.map(p => p.trim()).filter(Boolean))]
  const tagging = JSON.stringify({ pillars: clean, source: 'manual', updated_at: new Date().toISOString() })
  const primary = clean[0] ?? null   // jembatan sementara — lihat catatan di kepala berkas

  await pool.query(
    `INSERT INTO l0_extra.${table} (brand_id, post_id, tagging, content_pillar, created_at)
     VALUES ($1::uuid, $2, $3::jsonb, $4, now())
     ON CONFLICT (brand_id, post_id) DO UPDATE
       SET tagging = EXCLUDED.tagging, content_pillar = EXCLUDED.content_pillar`,
    [accountId, postId, tagging, primary],
  )
  return true
}
