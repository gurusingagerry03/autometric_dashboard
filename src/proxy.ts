import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login') && isLoggedIn) {
    return Response.redirect(new URL('/organizations', req.url))
  }

  if (pathname.startsWith('/organizations') && !isLoggedIn) {
    return Response.redirect(new URL('/login', req.url))
  }

  // no-store mencegah browser simpan halaman di bfcache
  return NextResponse.next({
    headers: { 'Cache-Control': 'no-store' },
  })
})

export const config = {
  matcher: ['/organizations/:path*', '/login'],
}
