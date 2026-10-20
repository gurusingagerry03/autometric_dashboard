// Nett Followers Growth — satu definisi untuk dashboard & report (deck "Bismillah
// Dashboard Final Revision", slide 12):
//
//   Nett Followers Growth = (Total Followers hari ini) − (Total Followers kemarin)
//   bulanan               = (Followers 30 Sep) − (Followers 31 Agu)
//
// KENAPA BUKAN net_growth_sum
//   `brand_metric_daily.net_growth_sum` berasal dari angka follows − unfollows
//   platform, dan angka itu sering tidak tally dengan total follower-nya: tabel
//   Channel menulis −56 sementara follower SoKlin IG September turun 43
//   (73.177 → 73.134). Selisih follower_count_eod-lah yang dicocokkan klien.
//
// CARA PAKAI
//   Pasang PREV_EOD_JOIN setelah `FROM l2_gold.brand_metric_daily bmd`, lalu pakai
//   EOD_GROWTH di tempat `bmd.net_growth_sum`. Pertumbuhan harian = EOD hari itu
//   dikurangi EOD terakhir yang diketahui SEBELUMNYA — dibaca dari seluruh tabel,
//   bukan hanya jendela query — sehingga jumlahnya sepanjang satu periode
//   menyusut (telescoping) menjadi EOD akhir periode − EOD akhir periode
//   sebelumnya, persis rumus bulanan di atas. Hari pertama sebuah akun (belum ada
//   EOD sebelumnya) bernilai NULL, jadi bulan onboarding jatuh ke EOD akhir −
//   EOD pertama.
//
// Partisinya (brand_id, account_id, platform) mengikuti primary key tabel, jadi
// lookup LATERAL ini cukup satu index scan per baris.
export const PREV_EOD_JOIN = `LEFT JOIN LATERAL (
         SELECT pe.follower_count_eod
           FROM l2_gold.brand_metric_daily pe
          WHERE pe.brand_id = bmd.brand_id AND pe.account_id = bmd.account_id
            AND pe.platform = bmd.platform AND pe.metric_date < bmd.metric_date
            AND pe.follower_count_eod IS NOT NULL
          ORDER BY pe.metric_date DESC
          LIMIT 1
       ) prev_eod ON true`

/** Pertumbuhan follower harian bmd (NULL bila EOD hari itu / sebelumnya tidak ada). */
export const EOD_GROWTH = `(bmd.follower_count_eod - prev_eod.follower_count_eod)`

/**
 * Follower kompetitor di akhir hari terakhir SEBELUM `$date` (placeholder SQL),
 * per (kompetitor, platform) — pembanding "Followers 31 Agu" untuk tabel/chart
 * Brand vs Competitor. Dipakai sebagai CTE `base`.
 */
export const competitorBaseCte = (brandParam: string, dateParam: string) => `base AS (
         SELECT DISTINCT ON (competitor_social_account_id, platform)
                competitor_social_account_id AS sid, platform, follower_count
           FROM l2_gold.competitor_profile_metric_daily
          WHERE brand_id = ${brandParam} AND metric_date < ${dateParam}
            AND follower_count IS NOT NULL
          ORDER BY competitor_social_account_id, platform, metric_date DESC
       )`
