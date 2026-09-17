import { NextRequest, NextResponse } from 'next/server'
import { businessAuthUrl, businessConfigured } from '@/lib/tiktok/business/api'

/**
 * Mulai alur izin TikTok API for Business.
 *
 * Sengaja TIDAK memakai PKCE, berbeda dari /api/auth/tiktok: Business API tidak
 * menerima code_challenge, dan mengirimnya membuat TikTok menolak permintaan.
 * `state` tetap dipakai untuk membawa brandId pulang ke callback.
 */
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId')
  // Route ini dibuka DI DALAM POPUP, jadi kegagalannya harus berbentuk halaman
  // yang mem-postMessage ke opener — persis seperti callback-nya. NextResponse
  // .json() di sini hanya menampilkan JSON mentah di jendela popup, dan modal
  // di belakangnya menunggu pesan yang tidak pernah datang sampai popupnya
  // ditutup manual.
  if (!brandId) return popupError('brandId required')

  if (!businessConfigured()) {
    return popupError('TikTok Business API belum dikonfigurasi — isi TIKTOK_BUSINESS_APP_ID dan TIKTOK_BUSINESS_SECRET.')
  }

  const state = Buffer.from(JSON.stringify({ brandId })).toString('base64url')
  return NextResponse.redirect(businessAuthUrl(state, redirectUri()))
}

function popupError(message: string) {
  const target = JSON.stringify(process.env.NEXT_PUBLIC_APP_URL ?? '')
  const html = `<!DOCTYPE html><html><head><title>Connecting…</title></head><body>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#6b7280">Connection failed. You may close this window.</p>
<script>window.opener?.postMessage({type:'OAUTH_ERROR',error:${JSON.stringify(message)}},${target});window.close();</script>
</body></html>`
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
}

/**
 * Harus SAMA PERSIS dengan yang didaftarkan di portal TikTok, termasuk
 * ada-tidaknya garis miring. NEXT_PUBLIC_APP_URL di repo ini pernah berakhiran
 * '/', yang tanpa penanganan menghasilkan '//api/...' dan ditolak sebagai
 * redirect_uri yang tidak cocok — jadi dinormalkan di satu tempat dan dipakai
 * bersama oleh route ini dan callback-nya.
 */
export function redirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  return `${base}/api/auth/tiktok-business/callback`
}
