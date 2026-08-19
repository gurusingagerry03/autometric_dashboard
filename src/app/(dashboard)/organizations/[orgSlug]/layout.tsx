import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { getOrgBySlugForUser } from '@/lib/organizations/queries'
import { getOrgLimits } from '@/lib/organizations/limits'
import OrgTracker from '@/components/layout/OrgTracker'
import { OrgLimitsProvider } from '@/components/organizations/OrgLimitsContext'

interface Props {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params
  const session     = await auth()
  const userId      = session?.user?.id ?? ''

  const org = await getOrgBySlugForUser(orgSlug, userId)
  if (!org) return notFound()

  // Dibaca di sini, satu kali, lalu dibagikan lewat context: batasnya dipakai di
  // daftar brand DAN di detail brand, dan keduanya ada di bawah layout ini.
  const limits = await getOrgLimits(org.id)

  return (
    <OrgLimitsProvider limits={{
      maxBrands:                 limits.maxBrands,
      maxCompetitorsPerPlatform: limits.maxCompetitorsPerPlatform,
    }}>
      <OrgTracker orgSlug={orgSlug} role={org.role} />
      {children}
    </OrgLimitsProvider>
  )
}
