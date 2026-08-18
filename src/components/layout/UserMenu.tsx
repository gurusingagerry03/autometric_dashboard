'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { logout } from '@/lib/auth/actions'
import { useT } from '@/lib/i18n/LanguageContext'
import LanguageSwitcher from './LanguageSwitcher'

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function UserMenu() {
  const { data: session } = useSession()
  const t = useT()
  const name = session?.user?.name || t('User')
  const email = session?.user?.email || ''
  const initials = getInitials(name)

  return (
    <div className="px-3 py-3 border-t border-[#f0f0ee] flex-shrink-0">
      {/* Language sits with the account controls: it is a preference about the
          person using the tool, not about the data on screen. */}
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <span className="text-[11px] font-medium text-[#9ca3af]">{t('Language')}</span>
        <LanguageSwitcher compact />
      </div>

      <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-[#f9fafb] transition-colors">
        <div className="w-8 h-8 rounded-full bg-[#1B8A80] flex items-center justify-center flex-shrink-0">
          <span className="text-[12px] font-bold text-white leading-none">{initials}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#111827] truncate leading-tight">{name}</p>
          <p className="text-[11px] text-[#9ca3af] truncate leading-tight mt-0.5">{email}</p>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Link href="/settings">
            <button
              title={t('Settings')}
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#e5e7eb] transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">settings</span>
            </button>
          </Link>
          <form action={logout}>
          <button
            type="submit"
            title={t('Log out')}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#e5e7eb] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">logout</span>
          </button>
          </form>
        </div>
      </div>
    </div>
  )
}
