// Number formatting for report data. Show real, full numbers (no abbreviation
// like "10k"). US convention: COMMA thousands separator, PERIOD decimal point
// (e.g. 10000 -> "10,000"; decimals like ER are shown with a period, "0.5%").
export const groupInt = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * Angka ringkas — OPSI, bukan default (Post-UAT brief "Overlap Shapes in Table
 * Slide"): 2,614.5 → "2.6K", 1,234,567 → "1.23M". Ribuan satu desimal, juta ke
 * atas dua desimal, persis contoh di brief; nol di belakang dibuang (1.20M →
 * "1.2M"). Di bawah seribu tetap bilangan bulat biasa.
 */
export function compactNum(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const unit = (v: number, d: number, suffix: string) => `${sign}${Number(v.toFixed(d))}${suffix}`
  if (a >= 1e9) return unit(a / 1e9, 2, 'B')
  if (a >= 1e6) return unit(a / 1e6, 2, 'M')
  // 999,950 dibulatkan ke 1000.0K — naikkan ke juta supaya tidak tertulis "1000K".
  if (a >= 1e3) return a / 1e3 >= 999.95 ? unit(a / 1e6, 2, 'M') : unit(a / 1e3, 1, 'K')
  return `${sign}${groupInt(a)}`
}

// Singkatan nama metrik (Post-UAT brief "Overlap Shapes in Table Slide" &
// "Overlap Table in Content Slide"): Engagement Owned → Eng. Owned, Followers
// Nett Growth → Foll. Nett Growth, Impressions/Views → Imprs./Views. Per kata,
// jadi metrik baru otomatis ikut tanpa harus didaftarkan satu per satu. Label
// satu kata dibiarkan ("Followers", "Engagement") — kolomnya tidak pernah
// bertabrakan karena satu kata, dan singkatan tunggal hanya mengurangi keterbacaan.
const WORD_ABBR: Record<string, string> = {
  Engagement: 'Eng.',
  Followers: 'Foll.',
  Follower: 'Foll.',
  Follows: 'Foll.',
  Follow: 'Foll.',
  Impressions: 'Imprs.',
  Impression: 'Imprs.',
  Calculation: 'Calc.',
  Completion: 'Compl.',
  Average: 'Avg.',
  Percentage: 'Pct.',
}
export function shortMetricLabel(label: string): string {
  if (!/[\s/]/.test(label.trim())) return label
  return label.replace(/[A-Za-z]+/g, w => WORD_ABBR[w] ?? w)
}

// Tanggal post "26 Sep '26" (brief "Overlap Table in Content Slide") — muat
// satu baris di kolom nilai kartu post, di mana "26 Sep 2026" terpotong.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function shortPostDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MON[Number(m[2]) - 1]} '${m[1].slice(2)}`
}
