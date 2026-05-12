import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { validateCredentials } from '@/lib/auth/validateCredentials'
import { handleGoogleSignIn, getDbUserIdByEmail } from '@/lib/auth/handleGoogleSignIn'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      id: 'google-one-tap',
      credentials: { idToken: { type: 'text' } },
      async authorize(credentials) {
        const idToken = credentials?.idToken as string
        if (!idToken) return null

        const res = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        )
        if (!res.ok) return null

        const payload = await res.json()
        if (payload.aud !== process.env.GOOGLE_CLIENT_ID) return null

        const email = payload.email as string
        const name = (payload.name || email) as string
        const googleId = payload.sub as string
        const avatarUrl = (payload.picture ?? null) as string | null

        await handleGoogleSignIn({ email, name, googleId, avatarUrl })

        const id = await getDbUserIdByEmail(email)
        if (!id) return null

        return { id, email, name }
      },
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string
        const password = credentials?.password as string
        if (!email || !password) return null
        return validateCredentials(email, password)
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true
      await handleGoogleSignIn({
        email: user.email!,
        name: user.name || user.email!,
        googleId: account.providerAccountId,
        avatarUrl: user.image ?? null,
      })
      return true
    },
    authorized() {
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id    = user.id
        token.name  = user.name
        token.email = user.email
      }
      if (account?.provider === 'google' && token.email) {
        const id = await getDbUserIdByEmail(token.email as string)
        if (id) token.id = id
      }
      return token
    },
    session({ session, token }) {
      session.user.id    = token.id    as string
      session.user.name  = token.name  as string
      session.user.email = token.email as string
      return session
    },
  },
})
