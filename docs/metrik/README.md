# Metrik Meta yang Belum Tertarik — Penyebab & Solusi

25 metrik Facebook & Instagram dari sheet *Metrics Tracking* (tab "Metrics Not Available"). Semua verdict diverifikasi langsung ke Graph API pada **1 September 2026** dengan token produksi Fitbar, pasmot, Siomay Jagooo, dan Fibonacci Space — bukan dari dokumentasi Meta.

> **Status per 3 Sep 2026.** Sembilan metrik yang tidak terhalang izin sudah
> dikerjakan dan ter-commit, **belum di-deploy**: empat metrik Instagram akan
> menghasilkan angka untuk semua brand, lima metrik Facebook kodenya sudah benar
> dan angkanya menyusul begitu `read_insights` turun. Migration `050_ig-fb-metric-columns.sql`
> menambahkan `ig_profile_snapshots.profile_views` dan
> `fb_profile_snapshots.page_daily_unfollows_unique`. Tidak ada kolom yang
> di-rename — kolom lama tetap, hanya metrik pengisinya yang berganti.

| Platform | Metrik | Penyebab | Solusi |
|---|---|---|---|
| Facebook | **Age** `page_fans_gender_age` | Dihapus Meta 15 Nov 2025. Diuji v19–v26 semua `#100 invalid metric`, termasuk di Page yang izinnya lengkap. 8 variasi nama + `breakdown=age` juga ditolak. | ❌ Coret dari scope. Tidak ada pengganti di API mana pun; satu-satunya sumber ekspor manual Meta Business Suite. |
| Facebook | **Gender** `page_fans_gender_age` | Sama dengan Age — satu metrik yang sama sudah dihapus. | ❌ Coret dari scope. |
| Facebook | **City** `page_fans_city` | Nama lama dihapus Meta. | ✅ **Selesai 3 Sep 2026** — kolom `demographics_city` kini diisi `page_follows_city` (period=lifetime). Angkanya baru keluar setelah `read_insights` turun **dan** Page-nya melewati ambang batas demografi Meta. |
| Facebook | **Country** `page_fans_country` | Nama lama dihapus Meta. | ✅ **Selesai 3 Sep 2026** — kolom `demographics_country` kini diisi `page_follows_country`. Syarat sama seperti City. |
| Facebook | **Profile Reach** `page_impressions_unique` | Dihapus Meta. Seluruh keluarga impressions mati (`page_impressions`, `page_reach`, `page_organic_reach`, dst). **Masih terdaftar di kode** jadi tiap sync ada request yang pasti gagal. | ✅ **Selesai 3 Sep 2026** — kolom `profile_reach` kini diisi `page_total_media_view_unique`, dan `page_impressions_unique` dibuang dari daftar. Metrik yang sama juga tersimpan di kolomnya sendiri; duplikasi ini disengaja supaya layer baca tidak perlu diubah. Definisi tidak identik dengan metrik lama — beri penanda di dashboard. |
| Facebook | **Link Clicks** `page_website_clicks` | Dihapus Meta. Masih terdaftar di kode, jadi gagal tiap hari. | ✅ **Selesai 3 Sep 2026** — kolom `link_clicks` kini diisi `page_total_actions`, dan `page_website_clicks` dibuang. Cakupannya lebih luas dari klik situs — pertimbangkan ganti label jadi "Page Actions". |
| Facebook | **Content Interactions** `page_post_engagements` | Metrik valid, request sudah benar. Page klien luar tidak memberi `read_insights`, Meta balas **200 + `data: []`** bukan error. | ⏳ Ajukan Akses Standar `read_insights`. Tanpa perubahan kode. |
| Facebook | **Content Views** `page_media_view` | Sama — `read_insights` belum ter-grant. | ⏳ Ajukan Akses Standar `read_insights`. |
| Facebook | **Profile Visit** `page_views_total` | Sama — `read_insights` belum ter-grant. | ⏳ Ajukan Akses Standar `read_insights`. |
| Facebook | **New Followers** `page_daily_follows_unique` | Sama — `read_insights` belum ter-grant. | ⏳ Ajukan Akses Standar `read_insights`. |
| Facebook | **Unfollows** `page_daily_unfollows_unique` | **Tidak pernah diminta** — tidak ada di `FB_PAGE_DAILY_METRICS`, dan kolomnya belum ada di `l0_raw.fb_profile_snapshots`. | ✅ **Selesai 3 Sep 2026** — metriknya masuk `FB_PAGE_DAILY_METRICS` dan kolom `page_daily_unfollows_unique` ditambahkan lewat migration 050. Terverifikasi mengembalikan nilai di Fibonacci; angka untuk Page klien menunggu `read_insights`. |
| Facebook | **Post** `GET /{page}/feed` | `/feed` balas `#10` untuk Page klien, loop paginasi langsung `break` → **nol post**. Pemicunya cuma 3 field: `reactions.summary`, `likes.summary`, `comments.summary` (butuh `pages_read_user_content`). Field lain lolos. | ✅ Pindah ke `/posts` dan lepas 3 field itu selama izin belum ada — judul, gambar, permalink, waktu tayang, `shares` tetap masuk. ⏳ Permanen: `pages_read_user_content`. |
| Facebook | **Comment Post** `GET /{post}/comments` | Berantai dari Post: tanpa post id, loop komentar tidak pernah jalan. Endpoint-nya sendiri juga butuh `pages_read_user_content`. | ⏳ Bereskan Post dulu, lalu ajukan `pages_read_user_content`. |
| IG Story | **Views** `total_views` | 10 metrik diminta dalam 1 request, dan Meta membatalkan **seluruh** request kalau 1 metrik tidak berlaku. `total_views` sendiri kadang jadi pemicu (`#200`) di Fibonacci. | ✅ **Sudah diperbaiki** — `fetchStoryMetrics`: batch dulu, kalau ditolak ambil per metrik dan simpan yang berhasil. |
| IG Story | **Replies** `replies` | Ikut kosong karena batch dibatalkan metrik lain (`facebook_views` subcode 2207086 di Fitbar: 145 dari 145 story). | ✅ Sudah diperbaiki — sama. |
| IG Story | **Reach** `reach` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| IG Story | **Shares** `shares` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| IG Story | **Follows** `follows` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| IG Story | **Total Interaction** `total_interactions` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| IG Story | **Repost** `reposts` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| IG Story | **Profile Visit** `profile_visits` | Sama — korban pembatalan batch. | ✅ Sudah diperbaiki — sama. |
| Instagram | **Profile Visit** `profile_views` | **Tidak pernah diminta** — tidak ada di `INSIGHTS_DAY_METRICS`. Bukan limitasi Meta: diuji langsung keluar angkanya (Fitbar 935, Siomay 31). Kolomnya juga belum ada di `l0_raw.ig_profile_snapshots`. | ✅ **Selesai 3 Sep 2026** — `profile_views` masuk `INSIGHTS_DAY_METRICS` dan kolomnya ditambahkan lewat migration 050. Diverifikasi lewat jalur kode asli 3 Sep: Fitbar **554**. `website_clicks` sengaja belum diambil (di luar scope yang disepakati). |
| Instagram | **New Follows** `follows_and_unfollows` | Dua sebab. (1) Ikut di batch harian **tanpa `breakdown=follow_type`** → Meta balas kerangka tanpa `value`/`results`. (2) `fetchIgFollowsUnfollows` meminta hari yang baru berakhir, dan data hari itu **belum tersedia** di Meta jam 02:00 WIB. | ✅ **Selesai 3 Sep 2026** — dicabut dari `INSIGHTS_DAY_METRICS` dan window `fetchIgFollowsUnfollows` digeser ke `wibMidnight(-1)`. Diverifikasi 3 Sep: Fitbar **FOLLOWER 136 · NON_FOLLOWER 51**. Konsekuensinya angka hari ini baru muncul besok — memang belum ada di sumbernya. |
| Instagram | **Unfollows** `follows_and_unfollows` | Sama dengan New Follows — dimensi `NON_FOLLOWER` dari metrik yang sama. | ✅ **Selesai 3 Sep 2026** — satu perbaikan menyelesaikan keduanya. |
| Instagram | **Net Follows** — turunan | Meta tidak menyediakan metrik ini; harus dihitung sendiri, dan kedua sumbernya sedang kosong. | ✅ **Sumber siap 3 Sep 2026** — `follows_and_unfollows` kini berisi angka asli, jadi tinggal dihitung `FOLLOWER − NON_FOLLOWER` di layer transformasi (repo Dagster). Contoh Fitbar 3 Sep: `136 − 51 = 85`. Jangan pakai selisih `followers_count` antar snapshot. |

## Cara membaca respons Meta

Tiga respons ini gampang tertukar, dan **ketiganya tercatat `success` di `scheduler_logs`** — inilah kenapa 25 metrik bisa diam-diam kosong berbulan-bulan. Kode hanya memeriksa `json.error`, jadi respons 200 dengan `data: []` lolos sebagai sukses.

| Respons | Artinya |
|---|---|
| `(#100) The value must be a valid insights metric` | Nama metriknya **tidak ada** |
| HTTP 200 + `{"data": []}` | Nama valid, tapi izin kurang / tidak ada data |
| HTTP 200 + `data` berisi angka | Berhasil |

Untuk membedakan "metrik tidak ada" dari "metrik ada tapi kosong": panggil dengan `period` sengaja salah (`period=week`). Metrik yang dikenali mengeluh soal period; yang tidak ada tetap `#100`.

## Izin token — kenapa hanya klien luar yang kena

Dari `/debug_token`. Empat izin di bawah **diminta** di `SCOPES` (`src/app/api/auth/facebook/route.ts:6`) tapi hanya turun untuk akun yang terdaftar di role app — itulah kenapa semuanya jalan mulus waktu dites internal.

| Izin | Fitbar · pasmot (Page klien) | Fibonacci Space (internal) |
|---|:---:|:---:|
| `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`, `public_profile` | ✓ | ✓ |
| **`read_insights`** | **✕** | ✓ |
| **`pages_read_user_content`** | **✕** | ✓ |
| **`instagram_manage_comments`** | **✕** | ✓ |
| `business_management` | ✕ | ✓ |

## Naik versi Graph API tidak menolong

Diuji di seluruh versi yang masih dilayani — v19.0 sampai v26.0 (v26 terbaru, v27 belum ada). Meta menerapkan deprecation **server-side lintas versi**, bukan version-gated:

```
metrik                        19   20   21   22   23   24   25   26
page_fans_gender_age          --   --   --   --   --   --   --   --
page_fans_city                --   --   --   --   --   --   --   --
page_fans_country             --   --   --   --   --   --   --   --
page_impressions_unique       --   --   --   --   --   --   --   --
page_website_clicks           --   --   --   --   --   --   --   --
page_follows_country         ADA  ADA  ADA  ADA  ADA  ADA  ADA  ADA
page_follows_city            ADA  ADA  ADA  ADA  ADA  ADA  ADA  ADA
```

Semua metrik pengganti sudah tersedia di **v21.0 yang dipakai sekarang**. Story insight juga diuji di v26: `facebook_views` tetap membatalkan batch dengan subcode 2207086 yang sama.

## Catatan penting

- **Data lama tidak bisa di-backfill.** `/stories` hanya mengembalikan story yang masih aktif (< 24 jam), jadi 145 baris Fitbar yang metriknya kosong tetap kosong selamanya.
- **Batas yang sah, bukan bug:** story dengan penonton terlalu sedikit balas `(#10) Not enough viewers for the media to show insights` untuk seluruh insight. Baris `NULL` kategori ini tidak akan pernah terisi.
- **Migration kolom yang dibutuhkan:** `profile_views` di `l0_raw.ig_profile_snapshots`, `page_daily_unfollows_unique` di `l0_raw.fb_profile_snapshots`.
- **Metrik valid yang belum diambil sama sekali:** `page_video_view_time` (782 di Fibonacci), `page_lifetime_engaged_followers_unique`, `page_daily_follows`, `page_video_complete_views_30s`, `page_actions_post_reactions_total`.
- Pesan error `#10` pada `/feed` menyebut `pages_read_engagement`, padahal token Fitbar **sudah punya** izin itu. Pesan Meta menyesatkan; yang benar-benar kurang `pages_read_user_content`.

---

*Diverifikasi 1 September 2026 · Graph API v19.0–v26.0*
**Sumber Meta:** [Page Insights API Updates (15 Agu 2025)](https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/) · [Page/insights — Graph API Reference](https://developers.facebook.com/docs/graph-api/reference/insights/)
