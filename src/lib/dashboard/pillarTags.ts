import pool from '@/lib/db'

/**
 * Atribut editorial per-post: pilar, boosted, campaign, activity, dan tag bebas.
 *
 * SUMBER BACA   l1_silver.unified_post (caption, cover, link, reach, ER)
 * SUMBER TULIS  l0_extra.<platform>_post_extra_attribute
 *
 * BENTUK DATA (disepakati 4 Sep 2026)
 *   content_pillar  — SATU pilar per post, kolom teks biasa
 *   tagging         — jsonb ARRAY POLOS berisi tag bebas: ["giveaway","promo"]
 *   is_boosted      — organic = false, paid = true
 *   is_campaign     — true/false, dan is_aon SELALU kebalikannya
 *   is_activity     — true/false
 *
 *   Bentuk ini menggantikan rancangan multi-pilar sebelumnya. Konsekuensi yang
 *   perlu diingat: tidak ada lagi tempat menyimpan ASAL sebuah pilar, jadi pilar
 *   hasil impor CSV dan pilar yang ditetapkan lewat layar ini tidak bisa
 *   dibedakan. Kalau pembedaan itu dibutuhkan lagi, ia butuh kolom sendiri —
 *   jangan diselipkan kembali ke `tagging`, yang sekarang murni daftar tag.
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
 *   Ketiga tabel punya UNIQUE (brand_id, post_id), jadi menyunting ulang MENIMPA
 *   nilai lama. Tidak ada jejak perubahan sebelumnya.
 *
 * DAFTAR PILAR MENGABAIKAN is_active
 *   Kartu "Tentukan Pilar" hanya menampilkan pilar aktif, dan itu benar untuk
 *   keperluannya. Untuk menetapkan pilar, daftar itu menyesatkan: per 3 Sep 2026
 *   MineralQUA punya 10 pilar dengan 2 aktif padahal 5 yang nonaktif masih
 *   menempel di 203 post, dan Fitbar punya 3 pilar dengan 0 aktif sehingga layar
 *   ini tampak kosong padahal brand-nya punya pilar.
 *
 * PENYARING, PENCARIAN, DAN HALAMAN DIPROSES DI SERVER
 *   Termasuk penyaring platform dan rentang tanggal dari topbar. Menyaring di
 *   klien setelah pagination berarti orang mencari di dalam satu halaman saja
 *   lalu mengira hasilnya nihil.
 */

/** Nama tabel diambil dari peta tetap, tidak pernah dari input — dirangkai ke SQL. */
const EXTRA_TABLE: Record<string, string> = {
  instagram: 'instagram_post_extra_attribute',
  facebook:  'facebook_post_extra_attribute',
  tiktok:    'tiktok_post_extra_attribute',
}

/** Penyaring dari topbar dashboard. Diteruskan ke SQL, bukan disaring di klien. */
export interface PillarScope {
  /** 'all' atau nama platform. */
  platform?: string
  /** YYYY-MM-DD, batas bawah post_date (inklusif). */
  start?: string | null
  /** YYYY-MM-DD, batas atas post_date (inklusif). */
  end?: string | null
}

export type TagFilter = 'all' | 'untagged' | 'tagged'

export interface TaggedPost {
  postId:     string
  platform:   string
  caption:    string
  postedAt:   string | null
  reach:      number
  er:         number
  coverImage: string | null
  link:       string | null
  /** Satu pilar, atau null kalau belum ditentukan. */
  pillar:     string | null
  /** null = belum pernah diisi — sengaja dibedakan dari "sudah diisi, jawabannya tidak". */
  boosted:    boolean | null
  campaign:   boolean | null
  activity:   boolean | null
  /** Tag bebas dari kolom `tagging`. */
  tags:       string[]
}

/** Perubahan untuk satu post. Field yang tidak disertakan tidak diubah. */
export interface PostAttributePatch {
  pillar?:   string | null
  tags?:     string[]
  boosted?:  boolean | null
  campaign?: boolean | null
  activity?: boolean | null
}

export interface TagPillar { id: string; name: string; color: string; isActive: boolean }

export interface TaggablePostsPayload {
  posts:    TaggedPost[]
  pillars:  TagPillar[]
  /** Seluruh post dalam scope, tanpa penyaring status — penyebut untuk progres. */
  total:    number
  /** Yang belum punya pilar, tanpa penyaring status. */
  untagged: number
  /** Jumlah yang cocok dengan penyaring saat ini — penyebut untuk pagination. */
  matched:  number
}

const DEFAULT_COLORS = ['#6c4cd6', '#d23f6f', '#3d7eea', '#5fa783', '#e0a458', '#8b5cf6', '#1B8A80', '#d97a7a']
const colorFor = (name: string, given: string | null): string =>
  given || DEFAULT_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % DEFAULT_COLORS.length]

const EXTRA_UNION = `
  SELECT brand_id, post_id, 'instagram' AS platform, tagging, content_pillar,
         is_boosted, is_campaign, is_activity FROM l0_extra.instagram_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'facebook',              tagging, content_pillar,
         is_boosted, is_campaign, is_activity FROM l0_extra.facebook_post_extra_attribute
  UNION ALL
  SELECT brand_id, post_id, 'tiktok',                tagging, content_pillar,
         is_boosted, is_campaign, is_activity FROM l0_extra.tiktok_post_extra_attribute
`

/** Pilar efektif: yang ditulis di l0_extra menang atas warisan di silver. */
const PILLAR = `NULLIF(COALESCE(e.content_pillar, p.content_pillar), '')`
/** `tagging` sekarang array polos. Bentuk lama (objek) diabaikan, bukan dibaca
 *  paksa — sisa data lama tampil sebagai tanpa tag, bukan error. */
const TAGS = `
  CASE WHEN jsonb_typeof(e.tagging) = 'array'
       THEN ARRAY(SELECT jsonb_array_elements_text(e.tagging))
       ELSE ARRAY[]::text[] END`

export async function getTaggablePosts(
  orgId: string,
  brandId: string,
  opts: { limit?: number; offset?: number; q?: string; filter?: TagFilter } & PillarScope = {},
): Promise<TaggablePostsPayload> {
  const limit  = Math.min(Math.max(opts.limit ?? 25, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const q      = (opts.q ?? '').trim()
  const filter = opts.filter ?? 'all'
  // 'all' → string kosong, dipakai sebagai "tanpa penyaring" di SQL supaya jumlah
  // parameter tetap sama untuk semua kombinasi.
  const platform = !opts.platform || opts.platform === 'all' ? '' : opts.platform
  const start = opts.start || null
  const end   = opts.end   || null

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
             ${PILLAR} AS pillar,
             ${TAGS}   AS tags,
             e.is_boosted, e.is_campaign, e.is_activity
        FROM l1_silver.unified_post p
        JOIN acct a ON a.id = p.brand_id
        LEFT JOIN extra e
               ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
       WHERE ($5 = '' OR p.platform = $5)
         AND ($6::date IS NULL OR p.post_date >= $6::date)
         AND ($7::date IS NULL OR p.post_date < ($7::date + INTERVAL '1 day'))
    )
  `

  // $3 = q ('' berarti tanpa pencarian), $4 = filter.
  // $5–$7 (platform + rentang tanggal) sudah dipakai di dalam `joined`.
  const where = `
    WHERE ($3 = '' OR caption ILIKE '%' || $3 || '%')
      AND ($4 = 'all'
        OR ($4 = 'untagged' AND pillar IS NULL)
        OR ($4 = 'tagged'   AND pillar IS NOT NULL))
  `

  const [list, counts, dim] = await Promise.all([
    pool.query<{
      post_id: string; platform: string; caption: string | null; post_date: Date | null
      reach: string | null; engagement_rate: string | null
      cover_image: string | null; link: string | null
      pillar: string | null; tags: string[] | null
      is_boosted: boolean | null; is_campaign: boolean | null; is_activity: boolean | null
    }>(
      `${scope} SELECT * FROM joined ${where}
        ORDER BY post_date DESC NULLS LAST, post_id DESC
        LIMIT $8 OFFSET $9`,
      [orgId, brandId, q, filter, platform, start, end, limit, offset],
    ),
    pool.query<{ total: string; untagged: string; matched: string }>(
      `${scope}
       SELECT (SELECT COUNT(*) FROM joined)::text total,
              (SELECT COUNT(*) FROM joined WHERE pillar IS NULL)::text untagged,
              (SELECT COUNT(*) FROM joined ${where})::text matched`,
      [orgId, brandId, q, filter, platform, start, end],
    ),
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
    posts: list.rows.map(r => ({
      postId:     r.post_id,
      platform:   r.platform,
      caption:    r.caption ?? '',
      postedAt:   r.post_date ? new Date(r.post_date).toISOString() : null,
      reach:      Number(r.reach ?? 0),
      er:         Number(r.engagement_rate ?? 0),
      coverImage: r.cover_image,
      link:       r.link,
      pillar:     r.pillar,
      boosted:    r.is_boosted,
      campaign:   r.is_campaign,
      activity:   r.is_activity,
      tags:       r.tags ?? [],
    })),
    pillars: dim.rows.map(r => ({
      id: r.id, name: r.content_pillar, color: colorFor(r.content_pillar, r.color), isActive: r.is_active,
    })),
    total:    Number(counts.rows[0]?.total ?? 0),
    untagged: Number(counts.rows[0]?.untagged ?? 0),
    matched:  Number(counts.rows[0]?.matched ?? 0),
  }
}

/**
 * Perbandingan performa pilar, DIHITUNG LANGSUNG dari silver + l0_extra.
 *
 * KENAPA TIDAK DARI l2_gold.pillar_performance_daily
 *   Tabel gold itu dibangun Dagster tiap malam, jadi pilar yang baru ditetapkan
 *   tidak muncul sampai besok pagi. Karena penandaan adalah permukaan kerja,
 *   perbandingannya harus ikut berubah begitu orang menetapkan pilar.
 *
 * RUMUSNYA SENGAJA MENIRU sp_build_pillar_performance
 *   engagement_sum / er_denominator_sum, dengan penyebut mengikuti
 *   engagement_rate_base tiap post ('reach' → reach, 'view'/'views' → views).
 *   Merata-ratakan kolom engagement_rate per post memberi angka berbeda — rasio
 *   tidak additive. Meniru rumus gold membuat angka di sini sebanding, bukan
 *   versi kedua yang diam-diam menyimpang.
 */
export async function getLivePillarComparison(
  orgId: string, brandId: string | null, scope: PillarScope = {},
): Promise<Array<{ name: string; posts: number; eng: number; den: number }>> {
  const platform = !scope.platform || scope.platform === 'all' ? '' : scope.platform
  const start = scope.start || null
  const end   = scope.end   || null

  const { rows } = await pool.query<{ name: string; posts: string; eng: string; den: string }>(
    `WITH acct AS (
       SELECT bsa.social_account_id AS id
         FROM public.brand_social_accounts bsa
         JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
        WHERE b.organization_id = $1::uuid
          AND ($2::uuid IS NULL OR b.id = $2::uuid)
     ), extra AS (${EXTRA_UNION})
     SELECT ${PILLAR} AS name,
            COUNT(*)::text posts,
            COALESCE(SUM(p.engagement), 0)::text eng,
            COALESCE(SUM(
              CASE lower(trim(p.engagement_rate_base))
                   WHEN 'reach' THEN p.reach
                   WHEN 'view'  THEN p.views
                   WHEN 'views' THEN p.views
                   ELSE 0 END), 0)::text den
       FROM l1_silver.unified_post p
       JOIN acct a ON a.id = p.brand_id
       LEFT JOIN extra e
              ON e.brand_id = p.brand_id AND e.post_id = p.post_id AND e.platform = p.platform
      WHERE p.post_date IS NOT NULL
        AND ${PILLAR} IS NOT NULL
        AND ($3 = '' OR p.platform = $3)
        AND ($4::date IS NULL OR p.post_date >= $4::date)
        AND ($5::date IS NULL OR p.post_date < ($5::date + INTERVAL '1 day'))
      GROUP BY ${PILLAR}`,
    [orgId, brandId, platform, start, end],
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

/**
 * Menyimpan atribut editorial sebuah post. Field yang tidak ada di `patch` tidak
 * diubah — supaya menetapkan pilar tidak diam-diam menghapus penanda Boosted yang
 * sudah diisi sebelumnya.
 *
 * is_aon SELALU kebalikan is_campaign: campaign true → aon false, campaign false
 * → aon true. Karena itu aon tidak pernah dipilih terpisah — diturunkan di sini
 * supaya mustahil dua-duanya bernilai benar.
 */
export async function savePostAttributes(
  orgId: string, brandId: string, platform: string, postId: string, patch: PostAttributePatch,
): Promise<boolean> {
  const table = EXTRA_TABLE[platform]
  if (!table) return false

  const accountId = await resolveAccount(orgId, brandId, platform, postId)
  if (!accountId) return false

  // Baris yang ada dibaca dulu supaya perubahan sebagian tidak menimpa sisanya.
  const { rows: cur } = await pool.query<{
    tagging: unknown; content_pillar: string | null
    is_boosted: boolean | null; is_campaign: boolean | null; is_activity: boolean | null
  }>(
    `SELECT tagging, content_pillar, is_boosted, is_campaign, is_activity
       FROM l0_extra.${table} WHERE brand_id = $1::uuid AND post_id = $2`,
    [accountId, postId],
  )
  const now = cur[0]
  const curTags = Array.isArray(now?.tagging)
    ? (now!.tagging as unknown[]).filter(x => typeof x === 'string') as string[]
    : []

  const pillar   = patch.pillar   !== undefined ? (patch.pillar?.trim() || null) : (now?.content_pillar ?? null)
  const tags     = patch.tags     !== undefined ? [...new Set(patch.tags.map(x => x.trim()).filter(Boolean))] : curTags
  const boosted  = patch.boosted  !== undefined ? patch.boosted  : (now?.is_boosted  ?? null)
  const campaign = patch.campaign !== undefined ? patch.campaign : (now?.is_campaign ?? null)
  const activity = patch.activity !== undefined ? patch.activity : (now?.is_activity ?? null)
  const aon = campaign === null ? null : !campaign

  await pool.query(
    `INSERT INTO l0_extra.${table}
       (brand_id, post_id, content_pillar, tagging, is_boosted, is_campaign, is_aon, is_activity, created_at)
     VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7, $8, now())
     ON CONFLICT (brand_id, post_id) DO UPDATE
       SET content_pillar = EXCLUDED.content_pillar, tagging = EXCLUDED.tagging,
           is_boosted = EXCLUDED.is_boosted, is_campaign = EXCLUDED.is_campaign,
           is_aon = EXCLUDED.is_aon, is_activity = EXCLUDED.is_activity`,
    [accountId, postId, pillar, JSON.stringify(tags), boosted, campaign, aon, activity],
  )
  return true
}
