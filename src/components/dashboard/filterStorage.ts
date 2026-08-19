import type { PlatformFilter, Period } from './data'
import type { DateSelection } from './DateRangePicker'

/**
 * Pilihan filter dashboard yang disimpan per organization di localStorage.
 *
 * Memilih brand/platform/rentang di tab mana pun terbawa ke tab sebelahnya (tiap
 * tab route terpisah yang kalau tidak begini akan balik ke brand pertama) dan
 * bertahan setelah refresh. Dikunci per slug org supaya antar-org tidak
 * bercampur.
 *
 * Dipisah dari DashboardChrome karena bukan cuma chrome yang menulisnya: wizard
 * brand baru menitipkan brand yang baru dibuat ke sini sebelum melempar user ke
 * dashboard. Mengimpor DashboardChrome dari sana cuma demi satu kunci
 * localStorage akan menyeret seluruh komponen shell ke bundle modal itu.
 */
export interface SavedFilters {
  brandId?: string
  platform?: PlatformFilter
  range?: DateSelection
  // Bentuk lama sebelum ada picker; masih dibaca supaya entri localStorage yang
  // sudah ada tidak me-reset tanggal user saat pertama kali buka setelah deploy.
  // Tidak pernah ditulis lagi.
  period?: Period
  customStart?: string
  customEnd?: string
}

export const FILTER_KEY = (slug: string) => `autometric:dashboard-filters:${slug}`

export function readFilters(slug: string): SavedFilters | null {
  if (typeof window === 'undefined' || !slug) return null
  try {
    const raw = window.localStorage.getItem(FILTER_KEY(slug))
    return raw ? (JSON.parse(raw) as SavedFilters) : null
  } catch { return null }
}

export function writeFilters(slug: string, f: SavedFilters) {
  if (typeof window === 'undefined' || !slug) return
  try { window.localStorage.setItem(FILTER_KEY(slug), JSON.stringify(f)) } catch { /* quota / private mode — ignore */ }
}

/**
 * Buka dashboard pada brand ini berikutnya, tanpa mengubah pilihan lain.
 *
 * Dipakai saat brand baru selesai dibuat: tanpa ini, dashboard akan membuka
 * brand yang terakhir dilihat user (dari entri localStorage yang sudah ada), dan
 * brand yang barusan dibuat — satu-satunya yang datanya sedang disiapkan —
 * justru tidak terlihat.
 */
export function rememberBrand(slug: string, brandId: string) {
  if (!slug || !brandId) return
  writeFilters(slug, { ...(readFilters(slug) ?? {}), brandId })
}
