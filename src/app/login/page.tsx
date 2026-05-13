import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AuthPage from '@/components/auth/AuthPage'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')
  return (
    <>
      {/* Runs outside React — survives bfcache. Redirects authenticated users restored from bfcache. */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function () {
          if (window.__authBfcacheGuard) return;
          window.__authBfcacheGuard = true;
          window.addEventListener('pageshow', function (e) {
            if (!e.persisted) return;
            fetch('/api/auth/session')
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d && d.user) window.location.replace('/dashboard'); })
              .catch(function () {});
          });
        })();
      `}} />
      <AuthPage />
    </>
  )
}
