import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import { langFromCookie } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Kepiai',
  description: 'Track every brand. Outperform every competitor.',
  icons: { icon: '/favicon-kepiai.png', apple: '/favicon-kepiai.png' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved here rather than in the client provider so the first paint is
  // already in the reader's language — no English flash before hydration.
  const lang = await langFromCookie()
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="antialiased"><Providers lang={lang}>{children}</Providers></body>
    </html>
  )
}
