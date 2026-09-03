# Revisi Report Maker — Slide 1–7

Menindaklanjuti *Report Maker Revision Guideline* (Google Slides, 9 halaman). Dokumen ini mencatat **apa yang sudah dikerjakan**, keputusan yang diambil di dalamnya, dan apa yang belum.

Status per **3 September 2026**. Seluruh temuan di bawah diverifikasi langsung ke kode dan warehouse, bukan dari asumsi.

## Ringkasan

| # | Item (slide) | Status | Catatan |
|---|---|---|---|
| 1 | Nama layer backend bocor ke UI (7b) | ✅ Selesai | |
| 2 | Tambahan metrics Visual Content (3) | ✅ Selesai | |
| 3 | "Powered by kepiai" (4b) | ✅ Selesai | |
| 4 | Cross metrics selection (5) | ✅ Selesai | bentuk tabel diputuskan sendiri — lihat di bawah |
| 5 | Competitors Visual Content (6) | ✅ Selesai | Facebook tidak didukung — lihat di bawah |
| 6 | Comparison mode (4a) | ⏸️ Tertahan | butuh screenshot slide 4 |
| 7 | Setup KPI: Achievement & Run Rate (2) | ⏸️ Tertahan | butuh definisi Run Rate |
| 8 | YTD custom metrics (7a) | ⏸️ Tertahan | perlu model periode pada custom metric |

---

## 1. Nama layer backend tidak lagi bocor

**Masalah.** Pemilih field di *New Custom Metric* menampilkan `Per-post · l1_silver` dan `Daily / profile · l2_gold` — nama tabel warehouse, terlihat jelas di screenshot slide 7.

**Perbaikan.** `src/lib/reports/data/customMetrics.ts` — label grup jadi `Per-post` dan `Daily / profile`.

Yang membedakan kedua grup itu bagi pemakai adalah **butiran datanya**, bukan tabel asalnya. Nama layer tidak menambah informasi apa pun bagi mereka, dan justru membuat pemilih terbaca seperti alat internal.

## 2. Tambahan metrics Visual Content

**Ditambahkan:** Post Date, Post Date & Time, Avg. Watch Time (TikTok), Completion Rate (TikTok).

**Tiga hal yang tidak sesederhana "tambah entri":**

**Tanggal bukan angka.** `PostCandidate.values` bertipe `Record<string, number>` dan dipakai untuk mengurutkan. Kalau tanggal hanya disimpan sebagai teks, *"Rank by Post Date"* akan diam-diam mengurutkan berdasarkan 0. Karena itu `PostCandidate` diberi field `text` untuk bentuk yang dibaca orang, sementara `values` tetap menyimpan **epoch** supaya pengurutan benar.

**Tanggal diformat di SQL, bukan di Node.** `post_date` bertipe `timestamp without time zone` dan isinya sudah jam dinding WIB. Membawanya ke `Date` JavaScript lalu diformat akan meleset mengikuti zona waktu proses Node — benar di laptop WIB, salah di server UTC. `to_char` di query merender apa adanya.

**Completion rate bertipe teks.** Di silver nilainya seperti `'79%'`, bukan numeric — sama seperti di dashboard Content. Dibersihkan dulu sebelum dipakai sebagai angka.

**TikTok-only disaring di pemilih.** Avg. Watch Time dan Completion Rate hanya terisi untuk TikTok. Menawarkannya di Instagram/Facebook hanya menghasilkan kartu berisi nol yang menyesatkan, jadi pemilihnya lewat `metricsForChannel(channel)`.

Terverifikasi dengan data MineralQUA Juli 2026:

```
post_date      post_datetime          watch_time  completion  engagement
03 Jul 2026    03 Jul 2026, 13:00     15.7s       34.04%      42,981
19 Jul 2026    19 Jul 2026, 12:45     22.0s       37.54%      27,629
```

## 3. "Powered by kepiai"

Footer tiap slide sebelumnya menulis **"Prepared by Sekata"**. Sekarang **"Powered by kepiai"**, di preview maupun di hasil ekspor PPTX.

Diubah di tiga tempat supaya preview dan ekspor tidak berbeda: `ReportBuilder.tsx` (nilai), `slides/parts.tsx` (label preview), `export/exportReport.ts` (label ekspor).

## 4. Cross metrics selection

**Yang diminta:** untuk section data kumulatif, bisa mencampur metrik Channel-level dan Content-level dalam satu pilihan — contohnya Followers (channel) bersama Engagement dan ER Reach (content).

**Yang dibuat:** tipe tabel baru **`cross_by_platform`** — "Cross-Level by Platform", satu baris per platform, kolom boleh diambil dari kedua level.

### Keputusan yang saya ambil sendiri

Brief tidak menyebut bentuk tabelnya. Saya pilih **satu baris per platform** mengikuti pola `content_by_platform` / `channel_by_platform` yang sudah ada, karena tujuan yang disebut adalah *"perbandingan performance"* — dan yang paling masuk akal dibandingkan adalah antar-channel. **Silakan dikoreksi kalau yang dimaksud bentuk lain.**

### Kenapa id-nya diberi awalan

Metrik kedua level hidup di butiran berbeda (Content per-post, Channel per-hari) dan **sebagian namanya bertabrakan** — `profile_visit` ada di dua-duanya dengan arti berbeda. Menggabungkannya begitu saja membuat satu kolom diam-diam mengambil angka dari level yang salah, tanpa error.

Karena itu id diberi awalan `ct:` dan `ch:`, dan awalan yang sama dipakai saat merakit nilainya di `metricsContext`. Labelnya ikut menyebut level (`Followers · Channel`) — persis cara permintaan aslinya ditulis, dan tanpa itu dua kolom bernama "Profile Visit" akan tampak duplikat di pemilih.

Tabel ini hanya tersedia di tampilan **All Channels**, sama seperti dua tabel per-platform lainnya.

## 5. Competitors Visual Content

**Yang dibuat:** slide Visual Content mendapat pilihan sumber **Owned / Competitor**. Layout dan seluruh pengaturannya sama persis (jumlah kartu, top/low, metrik yang ditampilkan) — yang ditukar hanya kumpulan post-nya, plus pemilih kompetitor.

### Datanya tidak diambil dari gold

`l2_gold.competitor_post_metric` hanya menyimpan angka — **tidak ada `cover_image`, `caption`, maupun tautan**. Untuk section visual justru itu yang dibutuhkan. Jadi sumbernya `l0_raw.*_competitor_media`, yang memang membawanya:

| Sumber | Isi |
|---|---|
| `l2_gold.competitor_post_metric` | 61 IG + 168 TikTok — hanya counts |
| `l0_raw.ig_competitor_media` | 173 post, **semuanya** punya cover + caption |
| `l0_raw.tiktok_competitor_media` | 168 post, **semuanya** punya cover + caption |

### Facebook tidak didukung

`l0_raw.fb_competitor_media` **tidak punya kolom `cover_image` sama sekali**. Section visual tanpa gambar tidak ada gunanya, jadi pilihan Competitor dinonaktifkan di channel Facebook dengan keterangan, bukan ditampilkan sebagai kotak kosong.

### Metrik terbatas data publik

Sesuai permintaan. Ketiga platform tidak mempublikasikan hal yang sama:

| Platform | Metrik tersedia |
|---|---|
| Instagram | Post Date, Post Date & Time, Likes, Comments, Impressions/Views, Engagement |
| TikTok | + Shares, Saves |

**ER sengaja tidak dihitung.** Menghitungnya butuh jumlah follower **pada saat post tayang**, dan itu tidak tersedia per-post untuk kompetitor. Memakai follower hari ini akan menghasilkan angka yang terlihat wajar tapi salah — lebih buruk daripada tidak ada.

Post kompetitor juga tidak punya format editorial maupun content pillar (keduanya milik brand sendiri), jadi kedua penyaring itu terisi label netral.

Terverifikasi: MineralQUA Juli 2026 → 4 kompetitor, 23 post, seluruhnya bergambar.

---

## Yang belum dikerjakan

**Comparison mode (slide 4a).** Sebagian sudah ada: tabel `content_level` dan `channel_level` sudah `rowType: 'comparison'` ("this period vs last"). Tapi teks briefnya merujuk sebuah screenshot yang tidak berhasil dirender dari Google Slides, jadi belum jelas apakah yang diminta comparison sebagai **opsi umum untuk semua section** atau sekadar menyeragamkan yang sudah ada. **Butuh screenshot slide 4.**

**Setup KPI (slide 2).** Belum ada konsep target sama sekali di `KpiMetric` — hanya `value`, `delta`, `hasDelta`. Perlu tabel baru penyimpan target (metrik × tanggal mulai × nilai) dan UI setup-nya.

Yang menahan bukan pekerjaannya, tapi definisinya: **Achievement Rate** jelas (`actual ÷ target`), tapi **Run Rate** punya dua tafsir yang sama-sama lazim dan hasilnya jauh berbeda —

- proyeksi akhir periode ÷ target ("kalau kecepatan ini diteruskan, kita sampai 112%"), atau
- capaian saat ini ÷ capaian yang seharusnya sampai hari ini ("kita sedang 94% dari jadwal")

**YTD custom metrics (slide 7a).** Custom metric sekarang merangkai field dengan operator **di dalam satu window periode laporan**. Konsep "hitung sejak tanggal X, jumlahkan lintas bulan" belum ada — perlu dimensi periode pada definisi custom metric, lepas dari periode laporan.

---

## Berkas yang berubah

```
src/lib/reports/data/customMetrics.ts          label grup field
src/lib/reports/data/posts.ts                  metrik baru, text[], metricsForChannel/Competitor
src/lib/reports/data/postsQuery.ts             tanggal, watch time, completion rate
src/lib/reports/data/tableTypes.ts             CROSS_ALL_COLUMNS + cross_by_platform
src/lib/reports/data/metricsContext.ts         merge cross-level, context kompetitor
src/lib/reports/data/slideModel.ts             postSource, postCompetitorId
src/lib/reports/data/competitorPostsQuery.ts   BARU — post kompetitor dari l0_raw
src/lib/reports/export/exportReport.ts         label footer
src/components/reports/builder/ReportBuilder.tsx  fetch + provider kompetitor
src/components/reports/slides/VisualSlide.tsx     toggle sumber + pemilih kompetitor
src/components/reports/slides/parts.tsx           label footer
src/app/api/organizations/[id]/reports/competitor-posts/route.ts   BARU
src/lib/i18n/id.ts                             terjemahan
```

*Diverifikasi 3 September 2026 · `npx tsc --noEmit` bersih · `npm run build` sukses · i18n 726/726*
