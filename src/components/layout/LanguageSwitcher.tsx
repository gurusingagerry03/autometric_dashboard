'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'
import { LANGS, LANG_SHORT, LANG_LABEL } from '@/lib/i18n/translate'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * EN / ID toggle.
 *
 * A two-state segmented control rather than a dropdown: with exactly two options
 * both are worth showing, and the current one reads as selected instead of
 * having to be opened to be discovered.
 *
 * `compact` is the sidebar-footer size; the default suits a page header.
 */
export default function LanguageSwitcher({ compact = false, className = '' }: {
  compact?: boolean
  className?: string
}) {
  const { lang, setLang } = useLanguage()
  const h = compact ? 'h-6' : 'h-7'
  const px = compact ? 'px-1.5' : 'px-2.5'
  const fs = compact ? 'text-[10px]' : 'text-[11.5px]'

  return (
    <div
      role="group"
      aria-label={LANG_LABEL[lang]}
      className={`inline-flex items-center bg-[#f3f4f6] rounded-lg p-0.5 ${className}`}
    >
      {LANGS.map(l => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={LANG_LABEL[l]}
          style={PJB}
          className={`${h} ${px} ${fs} rounded-md font-bold tracking-wide transition-colors ${
            lang === l
              ? 'bg-white text-[#1B8A80] shadow-sm'
              : 'text-[#9ca3af] hover:text-[#6b7280]'
          }`}
        >
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  )
}
