'use client'

import { SessionProvider } from 'next-auth/react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import type { Lang } from '@/lib/i18n/translate'

export default function Providers({ lang, children }: { lang?: Lang; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LanguageProvider initial={lang}>{children}</LanguageProvider>
    </SessionProvider>
  )
}
