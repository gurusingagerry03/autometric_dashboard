import pool from '@/lib/db'

export async function refreshTiktokToken(socialAccountId: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key:    process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token refresh failed: ${JSON.stringify(data)}`)
  }

  const newAccessToken:  string = data.access_token
  const newRefreshToken: string = data.refresh_token  ?? refreshToken
  const expiresIn:       number = data.expires_in     ?? 86400
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await pool.query(
    `UPDATE social_accounts
     SET oauth_token = $1, refresh_token = $2, token_expires_at = $3
     WHERE id = $4`,
    [newAccessToken, newRefreshToken, tokenExpiresAt, socialAccountId]
  )

  console.log(`[refreshTiktokToken] socialAccountId=${socialAccountId} refreshed OK, expires=${tokenExpiresAt}`)
  return newAccessToken
}

/**
 * Refresh token TikTok API for Business.
 *
 * Dipisah dari refreshTiktokToken() karena app, host, dan bentuk permintaannya
 * berbeda — memakai yang salah menghasilkan token yang ditolak setiap panggilan
 * berikutnya, dan pesannya tidak menyebut sebabnya.
 *
 * TikTok merotasi refresh_token di beberapa alur, jadi yang dikembalikan selalu
 * disimpan; kalau tidak ada yang baru, yang lama ditulis ulang apa adanya supaya
 * tidak pernah ada baris dengan refresh_token kosong.
 */
export async function refreshTiktokBusinessToken(socialAccountId: string, refreshToken: string): Promise<string> {
  const { refreshBusinessToken } = await import('./business/api')
  const t = await refreshBusinessToken(refreshToken)

  await pool.query(
    `UPDATE social_accounts
     SET oauth_token = $1, refresh_token = $2, token_expires_at = $3
     WHERE id = $4`,
    [t.accessToken, t.refreshToken ?? refreshToken, t.expiresAt, socialAccountId]
  )

  console.log(`[refreshTiktokBusinessToken] socialAccountId=${socialAccountId} refreshed OK, expires=${t.expiresAt}`)
  return t.accessToken
}
