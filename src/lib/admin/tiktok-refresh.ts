import pool from '@/lib/db'
import { refreshTiktokBusinessToken } from '@/lib/tiktok/refresh'

export interface TiktokBusinessAccountRow {
  socialAccountId: string
  username:        string
  connected:       boolean
  hasRefreshToken: boolean
  tokenExpiresAt:  string | null
  /** Satu akun bisa dipakai beberapa brand; semuanya ditampilkan. */
  brands:          { name: string; orgName: string }[]
}

export interface TiktokRefreshResult {
  socialAccountId: string
  ok:              boolean
  tokenExpiresAt?: string | null
  error?:          string
}

/**
 * Semua akun TikTok Business, termasuk yang sudah terputus — justru akun
 * terputus yang paling sering perlu di-refresh manual, dan refresh yang
 * berhasil menyambungkannya lagi (refreshTiktokBusinessToken set connected=true).
 */
export async function listTiktokBusinessAccounts(): Promise<TiktokBusinessAccountRow[]> {
  const { rows } = await pool.query(
    `SELECT sa.id, sa.username, sa.connected, sa.token_expires_at,
            sa.refresh_token IS NOT NULL AS has_refresh_token,
            COALESCE(
              json_agg(json_build_object('name', b.name, 'orgName', o.name) ORDER BY o.name, b.name)
                FILTER (WHERE b.id IS NOT NULL),
              '[]'
            ) AS brands
     FROM social_accounts sa
     JOIN platforms p ON p.id = sa.platform_id AND p.key = 'tiktok'
     LEFT JOIN brand_social_accounts bsa ON bsa.social_account_id = sa.id
     LEFT JOIN brands b        ON b.id = bsa.brand_id AND b.deleted_at IS NULL
     LEFT JOIN organizations o ON o.id = b.organization_id
     WHERE sa.auth_method = 'tiktok_business'
     GROUP BY sa.id
     ORDER BY sa.connected DESC, sa.username`,
  )
  return rows.map(r => ({
    socialAccountId: r.id,
    username:        r.username,
    connected:       r.connected,
    hasRefreshToken: r.has_refresh_token,
    tokenExpiresAt:  r.token_expires_at ? new Date(r.token_expires_at).toISOString() : null,
    brands:          r.brands,
  }))
}

/**
 * Jalankan refreshTiktokBusinessToken untuk tiap akun yang dipilih.
 *
 * refresh_token dibaca dari DB tepat sebelum dipakai, bukan dikirim dari
 * klien: TikTok merotasinya, jadi nilai yang sudah tampil di layar bisa sudah
 * basi kalau scheduler sempat me-refresh duluan.
 *
 * Berurutan, satu per satu — satu akun gagal tidak menghentikan akun lain.
 * Kegagalan TIDAK menandai akun terputus; itu tetap wewenang scheduler.
 */
export async function refreshTiktokBusinessAccounts(ids: string[]): Promise<TiktokRefreshResult[]> {
  const { rows } = await pool.query<{ id: string; refresh_token: string | null }>(
    `SELECT sa.id, sa.refresh_token
     FROM social_accounts sa
     WHERE sa.id = ANY($1::uuid[]) AND sa.auth_method = 'tiktok_business'`,
    [ids],
  )
  const tokenById = new Map(rows.map(r => [r.id, r.refresh_token]))

  const results: TiktokRefreshResult[] = []
  for (const id of ids) {
    if (!tokenById.has(id)) {
      results.push({ socialAccountId: id, ok: false, error: 'Bukan akun TikTok Business.' })
      continue
    }
    const refreshToken = tokenById.get(id)
    if (!refreshToken) {
      results.push({ socialAccountId: id, ok: false, error: 'Tidak ada refresh_token — harus connect ulang.' })
      continue
    }
    try {
      await refreshTiktokBusinessToken(id, refreshToken)
      const { rows: [row] } = await pool.query<{ token_expires_at: string | null }>(
        `SELECT token_expires_at FROM social_accounts WHERE id = $1`, [id],
      )
      results.push({
        socialAccountId: id,
        ok:              true,
        tokenExpiresAt:  row?.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
      })
    } catch (err) {
      console.error(`[admin/tiktok-refresh] ${id} gagal:`, err)
      results.push({ socialAccountId: id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}
