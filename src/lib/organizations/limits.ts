import pool from '@/lib/db'
import { countBrandsForOrg } from '@/lib/brands/queries'
import {
  DEFAULT_MAX_BRANDS_PER_ORG,
  DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
} from '@/lib/quotas'

/**
 * Batas paket per organization, beserta pemakaiannya.
 *
 * Dua angka yang bisa diatur admin:
 *   maxBrands                 — berapa brand yang boleh dipunyai organization ini
 *   maxCompetitorsPerPlatform — berapa competitor per platform, per brand. Nilai 2
 *                               berarti tiap brand boleh 2 competitor Instagram,
 *                               2 TikTok, dan 2 Facebook — dihitung terpisah tiap
 *                               platform, persis seperti kuota lama yang dulu
 *                               hardcoded.
 *
 * Org yang belum pernah diatur admin tidak punya baris di `organization_limits`
 * dan memakai default app-wide. Itu disengaja: org baru langsung punya batas yang
 * benar tanpa ada yang perlu menyentuh admin panel.
 */
export interface OrgLimits {
  maxBrands:                 number
  maxCompetitorsPerPlatform: number
  /** false = masih memakai default app-wide, belum pernah diatur admin. */
  isCustom:                  boolean
}

export interface OrgUsage {
  brands: number
  /**
   * Competitor terbanyak pada SATU pasangan (brand, platform) di org ini.
   *
   * Ini angka yang menentukan buat admin: batasnya per platform, jadi yang
   * relevan bukan totalnya melainkan seberapa dekat pemakai paling padat dengan
   * plafon. Total ikut dikirim sebagai konteks, bukan sebagai dasar keputusan.
   */
  competitorsPeak:  number
  competitorsTotal: number
}

/** Satu baris di layar admin: org + batas yang berlaku + pemakaian saat ini. */
export interface OrgLimitRow {
  id:          string
  name:        string
  slug:        string
  memberCount: number
  limits:      OrgLimits
  usage:       OrgUsage
  updatedAt:   string | null
  updatedBy:   string | null
}

export const DEFAULT_ORG_LIMITS: OrgLimits = {
  maxBrands:                 DEFAULT_MAX_BRANDS_PER_ORG,
  maxCompetitorsPerPlatform: DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
  isCustom:                  false,
}

// ─── Batas ────────────────────────────────────────────────────────────────────

export async function getOrgLimits(orgId: string): Promise<OrgLimits> {
  const { rows } = await pool.query<{ max_brands: number; max_competitors_per_platform: number }>(
    `SELECT max_brands, max_competitors_per_platform
       FROM organization_limits WHERE organization_id = $1`,
    [orgId],
  )
  if (!rows[0]) return DEFAULT_ORG_LIMITS
  return {
    maxBrands:                 rows[0].max_brands,
    maxCompetitorsPerPlatform: rows[0].max_competitors_per_platform,
    isCustom:                  true,
  }
}

export async function saveOrgLimits(
  orgId: string,
  maxBrands: number,
  maxCompetitorsPerPlatform: number,
  updatedBy: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO organization_limits
       (organization_id, max_brands, max_competitors_per_platform, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id) DO UPDATE
       SET max_brands                   = EXCLUDED.max_brands,
           max_competitors_per_platform = EXCLUDED.max_competitors_per_platform,
           updated_by                   = EXCLUDED.updated_by,
           updated_at                   = NOW()`,
    [orgId, maxBrands, maxCompetitorsPerPlatform, updatedBy],
  )
}

/** Kembalikan org ke default app-wide dengan menghapus barisnya. */
export async function resetOrgLimits(orgId: string): Promise<void> {
  await pool.query(`DELETE FROM organization_limits WHERE organization_id = $1`, [orgId])
}

// ─── Pemakaian ────────────────────────────────────────────────────────────────

/**
 * Jumlah competitor per (brand, platform) — dasar dari peak dan total.
 *
 * Ditulis sebagai CTE, bukan subquery berkorelasi di dalam SELECT: Postgres tidak
 * mengizinkan derived table di FROM menyentuh kolom query luar tanpa LATERAL, dan
 * peak-nya perlu agregat di atas agregat.
 */
const COMPETITOR_GROUPS_CTE = `
  SELECT b.organization_id AS org_id, bc.brand_id, p.id AS platform_id, count(*)::int AS c
    FROM brand_competitors bc
    JOIN brands b           ON b.id  = bc.brand_id AND b.deleted_at IS NULL
    JOIN social_accounts sa ON sa.id = bc.social_account_id
    JOIN platforms p        ON p.id  = sa.platform_id
   GROUP BY b.organization_id, bc.brand_id, p.id`

export async function getOrgUsage(orgId: string): Promise<OrgUsage> {
  const [brands, comp] = await Promise.all([
    countBrandsForOrg(orgId),
    pool.query<{ peak: number; total: number }>(
      `WITH groups AS (${COMPETITOR_GROUPS_CTE})
       SELECT COALESCE(MAX(c), 0)::int AS peak, COALESCE(SUM(c), 0)::int AS total
         FROM groups WHERE org_id = $1`,
      [orgId],
    ),
  ])
  return {
    brands,
    competitorsPeak:  comp.rows[0]?.peak  ?? 0,
    competitorsTotal: comp.rows[0]?.total ?? 0,
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * Semua org yang hidup, dengan batas yang berlaku dan pemakaiannya.
 *
 * Satu query, bukan N+1 lewat getOrgLimits/getOrgUsage per baris: layar admin
 * menampilkan seluruh org sekaligus, dan tiap org butuh empat agregat.
 */
export async function listOrgLimits(): Promise<OrgLimitRow[]> {
  const { rows } = await pool.query<{
    id: string; name: string; slug: string
    brand_count: number; member_count: number
    competitors_peak: number; competitors_total: number
    max_brands: number | null; max_competitors_per_platform: number | null
    updated_at: string | null; updated_by_name: string | null
  }>(
    `WITH groups AS (${COMPETITOR_GROUPS_CTE}),
     comp AS (
       SELECT org_id, MAX(c)::int AS peak, SUM(c)::int AS total
         FROM groups GROUP BY org_id
     )
     SELECT
       o.id,
       o.name,
       o.slug,
       (SELECT count(*)::int FROM brands b
         WHERE b.organization_id = o.id AND b.deleted_at IS NULL) AS brand_count,
       (SELECT count(*)::int FROM organization_members om
         WHERE om.organization_id = o.id AND om.status = 'ACTIVE') AS member_count,
       COALESCE(comp.peak,  0) AS competitors_peak,
       COALESCE(comp.total, 0) AS competitors_total,
       ol.max_brands,
       ol.max_competitors_per_platform,
       ol.updated_at,
       u.name AS updated_by_name
     FROM organizations o
     LEFT JOIN comp                ON comp.org_id = o.id
     LEFT JOIN organization_limits ol ON ol.organization_id = o.id
     LEFT JOIN users u                ON u.id = ol.updated_by
     WHERE o.deleted_at IS NULL
     ORDER BY o.name ASC`,
  )

  return rows.map(r => ({
    id:          r.id,
    name:        r.name,
    slug:        r.slug,
    memberCount: r.member_count,
    limits: {
      maxBrands:                 r.max_brands                   ?? DEFAULT_MAX_BRANDS_PER_ORG,
      maxCompetitorsPerPlatform: r.max_competitors_per_platform ?? DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
      isCustom:                  r.max_brands !== null,
    },
    usage: {
      brands:           r.brand_count,
      competitorsPeak:  r.competitors_peak,
      competitorsTotal: r.competitors_total,
    },
    updatedAt: r.updated_at,
    updatedBy: r.updated_by_name,
  }))
}
