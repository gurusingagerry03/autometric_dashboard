import type { Translator } from '@/lib/i18n/translate'

/**
 * Kuota app-wide. Ubah nilai di sini untuk mengubah batas di seluruh aplikasi —
 * dipakai oleh API route (enforcement) dan UI (disable tombol / tampilkan sisa kuota).
 */

// Jumlah maksimum brand per organization.
export const MAX_BRANDS_PER_ORG = 3

// Jumlah maksimum competitor per platform, per brand. Dihitung terpisah tiap
// platform — satu brand boleh punya 2 competitor Instagram + 2 TikTok + 2 Facebook.
export const MAX_COMPETITORS_PER_PLATFORM = 2

// Satu akun per platform per brand: menghubungkan Instagram kedua ke brand yang
// sama ditolak (lihat assertPlatformFreeForCsv + "Already connected" di UI).
export const MAX_ACCOUNTS_PER_PLATFORM_PER_BRAND = 1

export const BRAND_QUOTA_MESSAGE =
  `Brand limit reached — an organization can have at most ${MAX_BRANDS_PER_ORG} brands.`

/** `t` is optional: API responses stay English, the UI passes its translator. */
export function competitorQuotaMessage(
  platformLabel: string,
  t: Translator = (k: string) => k,
): string {
  return t('Competitor limit reached — a brand can track at most {max} {platform} competitors.',
    { max: MAX_COMPETITORS_PER_PLATFORM, platform: platformLabel })
}

/**
 * Batas paket yang berlaku, siap ditampilkan.
 *
 * Ditulis sebagai data (bukan kalimat panjang) supaya panel batas paket di alur
 * connect account menampilkan hal yang sama persis dengan yang ditegakkan API —
 * angkanya diambil dari konstanta di atas, jadi tidak bisa berbeda. Saat paket
 * berbayar masuk, daftar ini yang dipilih menurut paket organisasinya; sisa
 * aplikasi tidak perlu ikut berubah.
 */
export interface PlanLimit {
  /** Kunci i18n — teksnya dirender oleh pemanggil sesuai bahasa yang dipilih. */
  key: 'brands' | 'accounts' | 'competitors'
  count: number
}

export const PLAN_LIMITS: PlanLimit[] = [
  { key: 'brands',      count: MAX_BRANDS_PER_ORG },
  { key: 'accounts',    count: MAX_ACCOUNTS_PER_PLATFORM_PER_BRAND },
  { key: 'competitors', count: MAX_COMPETITORS_PER_PLATFORM },
]
