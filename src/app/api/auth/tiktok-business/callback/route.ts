import { NextRequest, NextResponse } from 'next/server'
import { exchangeBusinessCode, fetchBusinessProfile } from '@/lib/tiktok/business/api'
import { redirectUri } from '../route'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

/**
 * Callback TikTok API for Business.
 *
 * Bentuk balasannya dijaga identik dengan /api/auth/tiktok/callback — popup yang
 * mem-postMessage OAUTH_CONNECTED ke opener — supaya useOAuthConnect tidak perlu
 * tahu metode mana yang dipakai. Satu-satunya tambahan adalah `authMethod`, yang
 * ikut disimpan ke social_accounts dan kemudian menentukan sync mana yang jalan.
 *
 * TikTok mengembalikan parameter kode dengan nama `auth_code`, bukan `code`
 * seperti Login Kit. Keduanya diterima di sini karena penamaannya pernah
 * berubah, dan salah tebak berarti alurnya gagal di langkah terakhir dengan
 * pesan "Authorization denied" yang menyesatkan.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const authCode = sp.get('auth_code') ?? sp.get('code')
  const oauthError = sp.get('error') ?? sp.get('error_description')

  if (oauthError || !authCode) return popupPage(oauthError ?? 'Authorization denied')

  try {
    // redirect_uri WAJIB sama persis dengan yang dipakai saat meminta izin —
    // dibangun ulang dari helper yang sama, bukan ditulis ulang di sini.
    const token = await exchangeBusinessCode(authCode, redirectUri())
    if (!token.businessId) {
      return popupPage('TikTok tidak mengembalikan business id — pastikan akunnya TikTok Business Account.')
    }

    // Profil dipakai hanya untuk nama & avatar yang tampil di daftar akun.
    // Kegagalannya tidak membatalkan koneksi: token sudah sah, dan sync malam
    // akan menarik ulang semuanya. Memaksa gagal di sini berarti orang harus
    // mengulang OAuth gara-gara satu panggilan profil yang bisa saja ditolak
    // karena produk profilnya belum di-approve.
    let username = ''
    let avatarUrl: string | null = null
    try {
      const p = await fetchBusinessProfile(token.accessToken, token.businessId, 1)
      username  = String(p.username ?? p.display_name ?? '')
      avatarUrl = (p.profile_image as string) ?? null
    } catch (e) {
      console.warn('[TikTok Business callback] profil gagal ditarik:', (e as Error).message)
    }

    return popupPage(null, {
      platform:       'tiktok',
      platformUserId: token.businessId,
      username:       username || token.businessId,
      avatarUrl,
      profileUrl:     username ? `https://www.tiktok.com/@${username}` : '',
      oauthToken:     token.accessToken,
      refreshToken:   token.refreshToken,
      tokenExpiresAt: token.expiresAt,
      authMethod:     'tiktok_business',
    })
  } catch (err) {
    console.error('[TikTok Business callback]', err)
    return popupPage((err as Error).message || 'Something went wrong')
  }
}

function popupPage(error: string | null, data?: object) {
  const target = JSON.stringify(APP_URL)
  const script = error
    ? `window.opener?.postMessage({type:'OAUTH_ERROR',error:${JSON.stringify(error)}},${target});window.close();`
    : `window.opener?.postMessage({type:'OAUTH_CONNECTED',...${JSON.stringify(data)}},${target});window.close();`

  const html = `<!DOCTYPE html><html><head><title>Connecting…</title></head><body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#6b7280">
  ${error ? 'Connection failed. You may close this window.' : 'Connected! Closing…'}
</p>
<script>${script}</script>
</body></html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}
