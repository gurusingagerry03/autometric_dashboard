import { listTiktokBusinessAccounts } from '@/lib/admin/tiktok-refresh'
import AdminTiktokRefreshPage from '@/components/admin/AdminTiktokRefreshPage'

// Status token berubah tiap scheduler jalan; selalu baca ulang dari DB.
export const dynamic = 'force-dynamic'

export default async function TiktokRefreshPage() {
  const rows = await listTiktokBusinessAccounts()
  return <AdminTiktokRefreshPage rows={rows} />
}
