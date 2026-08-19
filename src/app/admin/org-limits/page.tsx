import { listOrgLimits } from '@/lib/organizations/limits'
import {
  DEFAULT_MAX_BRANDS_PER_ORG,
  DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
  ORG_LIMIT_MAX,
} from '@/lib/quotas'
import AdminOrgLimitsPage from '@/components/admin/AdminOrgLimitsPage'

// Selalu baca ulang dari DB: pemakaian (akun/competitor terpakai) berubah tiap
// kali org menghubungkan sesuatu, dan angka basi di layar ini menyesatkan admin
// yang sedang memutuskan apakah batasnya perlu dinaikkan.
export const dynamic = 'force-dynamic'

export default async function OrgLimitsPage() {
  const rows = await listOrgLimits()

  return (
    <AdminOrgLimitsPage
      rows={rows}
      defaults={{
        maxBrands:                 DEFAULT_MAX_BRANDS_PER_ORG,
        maxCompetitorsPerPlatform: DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
      }}
      max={ORG_LIMIT_MAX}
    />
  )
}
