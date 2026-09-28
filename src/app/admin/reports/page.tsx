import { listAllReportExports } from '@/lib/admin/reports'
import AdminReportsPage from '@/components/admin/AdminReportsPage'

// Report baru bisa di-export kapan saja dari org mana pun; daftar basi di sini
// membuat admin mengira export-nya gagal.
export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const rows = await listAllReportExports()
  return <AdminReportsPage rows={rows} />
}
