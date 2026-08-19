'use client'

import { MAX_ACCOUNTS_PER_PLATFORM_PER_BRAND } from '@/lib/quotas'
import { useOrgLimits } from '@/components/organizations/OrgLimitsContext'
import { useT } from '@/lib/i18n/LanguageContext'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * The limits that apply before the user starts connecting accounts.
 *
 * Connecting a social account is where someone forms an expectation of how much
 * the tool will track for them, and finding out about a cap only when a button
 * greys out reads as the product breaking. So the caps are stated up front, in
 * the same modal, with the same numbers the API enforces.
 *
 * The brand and competitor caps come from `useOrgLimits()` rather than a
 * constant: an admin sets them per organization (/admin/org-limits), so a
 * bundled constant would quietly lie to every org that was given a different
 * plan. Only the one-account-per-platform rule is fixed app-wide.
 */
export default function PlanLimits({ className = '' }: { className?: string }) {
  const t = useT()
  const { maxBrands, maxCompetitorsPerPlatform } = useOrgLimits()

  const limits = [
    { count: maxBrands,                       label: t('brands per organization') },
    { count: MAX_ACCOUNTS_PER_PLATFORM_PER_BRAND, label: t('account per platform, per brand') },
    { count: maxCompetitorsPerPlatform,       label: t('competitors per platform, per brand') },
  ]

  return (
    <div className={`rounded-xl border border-[#e5e7eb] bg-[#fafbfb] px-4 py-3 ${className}`}>
      <p style={PJB} className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
        <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">info</span>
        {t('Your plan limits')}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {limits.map(l => (
          <li key={l.label} className="flex items-start gap-2 text-[12px] leading-snug text-[#4b5563]">
            <span className="mt-[6px] w-1 h-1 rounded-full bg-[#c4c9d4] flex-shrink-0" />
            <span>
              <span className="font-semibold text-[#111827]">{l.count}</span> {l.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-[#9ca3af]">
        {t('Need more? Contact the KepiAi team to upgrade your plan.')}
      </p>
    </div>
  )
}
