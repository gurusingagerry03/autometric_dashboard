import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Providers from '@/components/layout/Providers'
import Sidebar from '@/components/layout/Sidebar'
import AuthGuard from '@/components/layout/AuthGuard'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <Providers>
      <AuthGuard />
      <div className="flex min-h-screen bg-[#f9fafb]">
        <Sidebar />
        <main className="flex-1 ml-[280px] min-w-0">
          {children}
        </main>
      </div>
    </Providers>
  )
}
