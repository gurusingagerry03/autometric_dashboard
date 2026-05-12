import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import AuthPage from '@/components/auth/AuthPage'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect('/organizations')

  return (
    <SessionProvider>
      <AuthPage />
    </SessionProvider>
  )
}
