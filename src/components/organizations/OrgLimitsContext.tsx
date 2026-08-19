'use client'

import { createContext, useContext } from 'react'
import {
  DEFAULT_MAX_BRANDS_PER_ORG,
  DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
} from '@/lib/quotas'

export interface ClientOrgLimits {
  maxBrands:                 number
  maxCompetitorsPerPlatform: number
}

/**
 * Batas paket organization yang sedang dibuka, untuk komponen klien.
 *
 * Dipasang sekali di layout /organizations/[orgSlug] dari nilai yang sudah dibaca
 * server, jadi tidak ada komponen yang perlu fetch sendiri dan tidak ada layar
 * yang sempat menampilkan angka default sebelum angka aslinya datang.
 *
 * Kenapa context dan bukan prop: angkanya dipakai di dua cabang pohon yang
 * berjauhan (daftar brand dan detail brand) oleh komponen yang dalam — modal
 * competitor, picker platform, panel batas paket. Menyalurkannya sebagai prop
 * berarti enam komponen perantara ikut memegang data yang tidak mereka pakai.
 *
 * Default-nya sengaja app-wide, bukan nol: komponen yang dirender di luar
 * provider (Storybook, halaman lain) tetap menampilkan angka yang masuk akal,
 * bukan mengunci semua tombol.
 */
const Ctx = createContext<ClientOrgLimits>({
  maxBrands:                 DEFAULT_MAX_BRANDS_PER_ORG,
  maxCompetitorsPerPlatform: DEFAULT_MAX_COMPETITORS_PER_PLATFORM,
})

export function OrgLimitsProvider({
  limits, children,
}: {
  limits: ClientOrgLimits
  children: React.ReactNode
}) {
  return <Ctx.Provider value={limits}>{children}</Ctx.Provider>
}

export function useOrgLimits(): ClientOrgLimits {
  return useContext(Ctx)
}
