import type { Translator } from '@/lib/i18n/translate'

/**
 * Kuota app-wide.
 *
 * Dua di antaranya sekarang hanya DEFAULT: batas brand dan batas competitor per
 * platform bisa diubah admin per organization di /admin/org-limits, dan nilai
 * yang berlaku dibaca lewat `getOrgLimits()` (@/lib/organizations/limits) di
 * server, atau `useOrgLimits()` di klien. Angka di sini yang dipakai selama
 * organization itu belum pernah diatur.
 *
 * Jangan pakai konstanta ini untuk menegakkan kuota di API — ambil dari
 * getOrgLimits, kalau tidak batas yang diatur admin tidak akan berarti apa-apa.
 */

// Default jumlah maksimum brand per organization.
export const DEFAULT_MAX_BRANDS_PER_ORG = 3

// Default jumlah maksimum competitor per platform, per brand. Dihitung terpisah
// tiap platform — nilai 2 berarti satu brand boleh punya 2 competitor Instagram
// + 2 TikTok + 2 Facebook.
export const DEFAULT_MAX_COMPETITORS_PER_PLATFORM = 2

// Satu akun per platform per brand: menghubungkan Instagram kedua ke brand yang
// sama ditolak (lihat assertPlatformFreeForCsv + "Already connected" di UI).
// Tidak diatur per organization — ini aturan produk, bukan batas paket.
export const MAX_ACCOUNTS_PER_PLATFORM_PER_BRAND = 1

/** Batas atas input admin — cocokkan dengan CHECK di migrations/047_org-limits.sql. */
export const ORG_LIMIT_MAX = 1000

/**
 * Pesan kuota. `max` wajib diisi pemanggil dari batas organization yang berlaku,
 * karena tiap organization boleh berbeda — user tidak bisa menebaknya, jadi
 * angkanya harus ada di dalam kalimatnya.
 *
 * `t` opsional: respons API tetap bahasa Inggris, UI mengoper translator-nya.
 */
export function brandQuotaMessage(
  max: number,
  t: Translator = (k: string) => k,
): string {
  return t('Brand limit reached — this organization can have at most {max} brands.', { max })
}

export function competitorQuotaMessage(
  platformLabel: string,
  max: number,
  t: Translator = (k: string) => k,
): string {
  return t('Competitor limit reached — a brand can track at most {max} {platform} competitors.',
    { max, platform: platformLabel })
}
