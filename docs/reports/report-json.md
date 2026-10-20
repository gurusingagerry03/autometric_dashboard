# Report Maker — Struktur JSON

Referensi bentuk JSON yang dipakai Report Maker untuk merender slide (preview di browser dan ekspor PPTX), menyimpan template, dan mencatat riwayat ekspor.

Status per **16 Oktober 2026**. Sumber kebenarannya tetap TypeScript types di `src/lib/reports/data/` — kalau dokumen ini dan kode berbeda, kode yang benar. File utama: `slideModel.ts`.

Lihat juga: `table-metrics.md` (kolom tabel → kolom warehouse) dan `empty-metrics.md` (metrik yang masih `—`).

## Gambaran besar

Ada dua jenis JSON yang terpisah:

1. **Konfigurasi** — *apa* yang ditampilkan: daftar slide, jenisnya, metrik/kolom yang dipilih. Tidak berisi angka. Inilah yang disimpan di template (`report_templates.config`).
2. **Payload data** — *angka*-nya, diambil live dari warehouse lewat endpoint `GET /api/organizations/[id]/reports/*` untuk satu brand + satu bulan. Tidak pernah disimpan.

Renderer menggabungkan keduanya: konfigurasi menyebut id metrik (`"reach"`), payload menyediakan nilainya per channel. Karena itu satu template bisa dipakai ulang untuk brand dan bulan apa pun.

```
ReportTemplateConfig ─┐
                      ├─► preview slide (React) / exportReport.ts (PPTX)
payload /reports/* ───┘
```

---

## 1. `ReportTemplateConfig` — yang disimpan

Disimpan sebagai JSONB di `report_templates.config` (`src/lib/reports/queries.ts`).

```ts
interface ReportTemplateConfig {
  cover: ReportTemplateCover
  slides: ContentSlide[]
}

interface ReportTemplateCover {
  templateId: string   // 'diagonal' | 'blocks' | 'minimal' | 'sidebar' | 'gradient' | 'editorial'
  mode: 'light' | 'dark'
  font: string         // mis. 'Calibri'
  title: string
  subtitle: string
}
```

Warna dan logo **tidak** disimpan di template; keduanya diambil dari brand yang dipilih saat template dipakai.

Baris di tabelnya (`ReportTemplateRecord`) menambahkan `id`, `name`, `sourceBrandName`, `slideCount`, `slideTypes`, `createdAt`.

## 2. `ContentSlide` — satu slide

Semua slide memakai **satu bentuk yang sama**. Field yang tidak relevan untuk jenis slide tertentu tetap ada dan diisi default (`null`, `''`, dsb.). Default lengkapnya ada di `makeSlide()`.

### Field umum

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | string | `s<seq>-<timestamp>` |
| `type` | `SlideType` | lihat tabel di bawah |
| `title` | string | judul slide |
| `body` | string | subjudul — hanya `section` |
| `insights` | string | catatan/key insight/ringkasan yang ditulis tangan |
| `channel` | string | `'instagram'` \| `'facebook'` \| `'tiktok'` (beberapa tabel juga menerima `'all'`) |
| `aiInsight` | `AiInsight \| null` | hasil AI analyst (Gemini) |

```ts
interface AiInsight {
  analysis: string
  recommendations: { type: 'SCALE' | 'REFINE' | 'EXPLORE' | 'STOP'; text: string }[]
}
```

### `SlideType` dan field yang dipakai

| `type` | Judul default | Field spesifik |
|---|---|---|
| `section` | Section Title | `title`, `body` |
| `dashboard` | Performance Dashboard | `chart`, `table`, `insights` |
| `comparison` | Period Comparison | `chartA` (kiri), `chartB` (kanan), `insights` |
| `overview` | Overview Slide | `visualMode` (`'chart'` \| `'table'` \| `null`) + `chart` atau `table` |
| `dashboard_overview` | Dashboard Overview | layout KPI — `metricCount`, `kpiMetrics` (key metrik dashboard), `chart` |
| `kpi` | KPI Overview | layout KPI — `metricCount`, `kpiMetrics` (**`kpiId`**), `kpiCompare`, `chart` |
| `ytd` | YTD Performance | layout KPI — `metricCount`, `kpiMetrics`, `ytdView` |
| `visual` | Visual Analysis | `postCount`, `postFilter`, `postFormat`, `postPillar`, `postSortMetric`, `postMetrics`, `postSource`, `postCompetitorId` |
| `activity` | Activity Performance | `postCount`, `postMetrics` saja |
| `sentiment` | Audience Sentiment | `sentimentSource`, `cloudSentiment` (+ `chart`) |
| `demographic` | Audience Demographics | `demographicView` |
| `monthly_tracker` | Monthly Tracker Performance | `trackerLayout`, `trackerFrom`, `chart`, `table` |

### Field per kelompok

**Chart & tabel**

| Field | Tipe |
|---|---|
| `chart`, `chartA`, `chartB` | `ChartConfig \| null` — bagian 3 |
| `table` | `TableConfig \| null` — bagian 4 |

**Layout KPI** (`kpi`, `dashboard_overview`, `ytd`)

| Field | Tipe | Keterangan |
|---|---|---|
| `metricCount` | number | jumlah kartu, 3–6 (default 4) |
| `kpiMetrics` | `(string \| null)[]` | isi tiap slot, selalu panjang 6. Artinya bergantung `type` — bagian 5 |
| `kpiCompare` | `'both' \| 'achievement' \| 'run'` | hanya `kpi`; angka pembanding di kartu |
| `ytdView` | `'matrix' \| 'cards'` | hanya `ytd`; opsional, kosong = `'matrix'` |

**Kartu post** (`visual`, `activity`)

| Field | Nilai |
|---|---|
| `postCount` | `4` \| `6` \| `8` |
| `postFilter` | `'top'` \| `'low'` \| `'mixed'` |
| `postFormat` | `'all'` \| `'reel'` \| `'video'` \| `'carousel'` \| `'image'` |
| `postPillar` | `'all'` \| id pilar |
| `postSortMetric` | id metrik post untuk peringkat (default `'engagement'`) |
| `postMetrics` | `string[]` id metrik post yang tampil. `activity` default `[]` = tampilkan semua |
| `postSource` | `'owned'` (default) \| `'competitor'` — opsional |
| `postCompetitorId` | social_account_id kompetitor, saat `postSource = 'competitor'` |

Id metrik post (`src/lib/reports/data/posts.ts`, `POST_METRICS`): `post_date`, `post_datetime`, `new_follow`, `reach`, `impressions_views`, `likes`, `comments`, `shares`, `saves`, `reposts`, `engagement`, `er_reach`, `er_views`, `er_followers`, `watch_time` (TikTok), `completion_rate` (TikTok). Khusus `activity`: `activity_name`, `activity_type`, `submission`, `participant`, `activity_period`.

**Audiens**

| Field | Nilai |
|---|---|
| `sentimentSource` | `'all'` \| `'comment'` \| `'tagged_post'` |
| `cloudSentiment` | `'all'` \| `'positive'` \| `'neutral'` \| `'negative'` |
| `demographicView` | `'both'` \| `'age'` \| `'gender'` |

**Monthly tracker**

| Field | Nilai |
|---|---|
| `trackerLayout` | `'chart_table'` (default) \| `'table'` |
| `trackerFrom` | `'YYYY-MM'` bulan mulai. Disalin ke `chart.fromMonth` dan `table.fromMonth` lewat `withTrackerFrom()` — ubah ketiganya bersamaan |

---

## 3. `ChartConfig`

`src/lib/reports/data/chartData.ts`. Field yang diisi bergantung `chartType`.

```ts
interface ChartConfig {
  chartType: 'line' | 'bar' | 'wordcloud'
  // line
  dimension?: 'daymonth' | 'last3months' | 'days' | 'monthly'
  metrics?: string[]          // maks 2
  fromMonth?: string          // 'monthly' saja — 'YYYY-MM'; kosong = Januari tahun report
  // bar
  barOrientation?: 'vertical' | 'horizontal'
  barCategory?: string
  barMetrics?: string[]
  barCompare?: 'period'       // 'content_pillars' saja — bulan lalu vs bulan ini
  competitorIds?: string[]    // 'competitors' saja — kosong = semua kompetitor
  // wordcloud
  sentiment?: string          // 'all' | 'positive' | 'neutral' | 'negative'
}
```

**Dimensi line:** `daymonth` (per hari dalam bulan report), `last3months`, `days` (rata-rata per hari dalam minggu, Sun–Sat), `monthly` (Jan → bulan report).

**Metrik line:** `followers`, `profile_views`, `profile_reach`, `net_followers_growth`, `engagements`, `likes`, `comments`, `shares`, `sentiments`, ditambah id custom metric organisasi.

**Kategori bar dan metriknya:**

| `barCategory` | `barMetrics` yang valid |
|---|---|
| `daily_performance` | `profile_views`, `engagement`, `followers`, `net_followers_growth` |
| `last3months_performance` | `followers`, `followers_growth_pct`, `er_reach`, `engagements`, `avg_engagements`, `total_reach` |
| `content_pillars` | `number_of_posts`, `avg_er_pct`, `avg_reach`, `engagement`, `avg_engagements` |
| `competitors` | `followers`, `followers_growth`, `followers_growth_pct`, `post_count`, `likes`, `comments`, `shares`, `views`, `saves`, `engagements`, `avg_engagements`, `avg_likes`, `avg_comments`, `avg_shares`, `avg_views`, `avg_saves`, `er_followers`, `views_per_follower` |

---

## 4. `TableConfig`

`src/lib/reports/data/tableTypes.ts`.

```ts
interface TableConfig {
  type: string                        // id di TABLE_TYPES
  columns: string[]                   // id kolom yang dipilih — urutan tampil tetap mengikuti TABLE_TYPES, bukan urutan array ini
  competitorIds?: string[]            // brand_vs_competitor saja
  highlights?: Record<string, string> // monthly_tracker saja — 'YYYY-MM' → teks Key Highlight
  fromMonth?: string                  // monthly_tracker saja
}
```

| `type` | Baris | Catatan |
|---|---|---|
| `content_level` | Previous / Current / Gap (%) | metrik per post; channel `'all'` memakai set kolom lain |
| `channel_level` | Previous / Current / Gap (%) | metrik profil |
| `cross_level` | Previous / Current / Gap (%) | campuran — id kolom berawalan `ct:` (content) atau `ch:` (channel) |
| `content_by_platform` | Instagram / Facebook / TikTok | nilai periode berjalan saja |
| `channel_by_platform` | Instagram / Facebook / TikTok | |
| `cross_by_platform` | Instagram / Facebook / TikTok | awalan `ct:` / `ch:` |
| `brand_vs_competitor` | Brand + kompetitor | metrik publik saja |
| `monthly_tracker` | satu baris per bulan | kolom `key_highlight` berisi teks dari `highlights` |
| `sentiments` | Positive / Neutral / Negative | kolom `number_of_posts`, `percentage` |

Daftar id kolom yang valid per tabel ada di `TABLE_TYPES` (field `columns`, dan `allColumns` untuk channel `'all'`). Asal datanya per kolom: `table-metrics.md`.

Beberapa kolom hanya berlaku untuk channel tertentu (`channels` di definisi kolom). Di channel lain kolom itu otomatis disembunyikan, bukan diisi nol.

**Alias id lama.** `profile_views` → `profile_visit` dan `avg_profile_views` → `avg_profile_visit`. Template lama masih menyimpan id lama; semuanya dinormalisasi lewat `normalizeColumnIds()` sebelum dirender. Kalau ada id yang diganti nama, tambahkan aliasnya di `COLUMN_ALIASES` supaya kolom di laporan lama tidak hilang diam-diam.

---

## 5. Isi `kpiMetrics` per jenis slide

Field yang sama, isinya berbeda:

| `type` | Isi tiap slot | Sumber katalog |
|---|---|---|
| `dashboard_overview` | key metrik dashboard: `reach`, `impressions`, `followers`, `growth`, `engagement`, `er`, `likes`, `comments`, `saves`, `shares`, `reposts`, `views`, `story_views`, `story_reach`, `visits`, `clicks`, `watch_time`, `total_interactions`, `new_followers`, atau id custom metric | `kpiMetrics.ts` (`KPI_DEFS`) |
| `kpi` | **`kpiId`** — id KPI brand dari tab KPI di halaman detail brand | `kpiTargets.ts`, endpoint `kpi-targets` |
| `ytd` | key metrik KPI (`likes`, `reach`, …) atau key dashboard berawalan `dash:` (mis. `dash:er`) | `ytdMetrics.ts` |

Slot kosong bernilai `null`. Hanya `metricCount` slot pertama yang dirender.

---

## 6. Payload data (tidak disimpan)

Semua endpoint: `GET /api/organizations/[id]/reports/<nama>?brand=<brandId>&year=<YYYY>&month=<1-12>`, kecuali `periods`, `kpi-targets`, dan `ytd-metrics` yang cukup `brand` (jendela waktunya diambil dari periode KPI/YTD aktif brand, bukan bulan report).

| Endpoint | Tipe respons | File tipe | Dipakai oleh |
|---|---|---|---|
| `periods` | daftar bulan yang punya data | `periodsQuery.ts` | pemilih periode |
| `chart-metrics` | `ReportChartMetrics` | `chartTypes.ts` | semua `chart` |
| `table-metrics` | `ReportTableMetrics` | `tableTypes.ts` | semua `table` |
| `kpi-metrics` | `ReportKpiMetrics` | `kpiMetrics.ts` | `dashboard_overview` |
| `kpi-targets` | `ReportKpiTargets` | `kpiTargets.ts` | `kpi` |
| `ytd-metrics` | `ReportYtdMetrics` | `ytdMetrics.ts` | `ytd` |
| `post-metrics` | `ReportPostMetrics` | `posts.ts` | `visual`, `activity` |
| `competitor-posts` | `CompetitorPostPool` | `posts.ts` | `visual` dengan `postSource = 'competitor'` |
| `audience-metrics` | `ReportAudienceMetrics` | `audienceTypes.ts` | `sentiment`, `demographic` |
| `monthly-tracker` | data bulanan | `monthlyTracker.ts` | `monthly_tracker` |

`POST ai-insight` menghasilkan `AiInsight` untuk satu slide.

Pola umumnya sama: objek per platform (`instagram` / `facebook` / `tiktok`, kadang `all`), lalu per id metrik. Nilai yang tidak ada datanya `null` dan dirender `—`.

---

## 7. `report_exports.config` — riwayat ekspor

Tiap ekspor PPTX dicatat di `report_exports`. Kolom `config` di sana **bukan** slide; isinya hanya yang dibutuhkan kartu riwayat untuk merender ulang thumbnail cover:

```ts
interface ReportExportConfig {
  subtitle: string
  brandId: string
  templateId: string
  mode: 'light' | 'dark'
  colors: CoverColors
  month: string
  year: number
}
```

Konsekuensinya, laporan yang sudah diekspor **tidak bisa dibuka lagi untuk diedit** dari riwayat; yang tersimpan hanya file PPTX-nya. Untuk menyimpan struktur slide agar bisa dipakai ulang, simpan sebagai template.

---

## Contoh `ReportTemplateConfig`

```json
{
  "cover": {
    "templateId": "diagonal",
    "mode": "light",
    "font": "Calibri",
    "title": "Monthly Social Media Report",
    "subtitle": "Performance summary"
  },
  "slides": [
    {
      "id": "s1-1760600000000",
      "type": "dashboard",
      "title": "Performance Dashboard",
      "body": "",
      "insights": "",
      "channel": "instagram",
      "chart": { "chartType": "line", "dimension": "daymonth", "metrics": ["followers", "engagements"] },
      "table": { "type": "content_level", "columns": ["reach", "likes", "comments", "shares", "eng_owned", "er_reach"] },
      "chartA": null,
      "chartB": null,
      "metricCount": 4,
      "kpiMetrics": [null, null, null, null, null, null],
      "kpiCompare": "both",
      "postCount": 4,
      "postFilter": "top",
      "postSource": "owned",
      "postFormat": "all",
      "postPillar": "all",
      "postSortMetric": "engagement",
      "postMetrics": ["reach", "engagement", "er"],
      "visualMode": null,
      "sentimentSource": "all",
      "cloudSentiment": "all",
      "demographicView": "both",
      "ytdView": "matrix",
      "trackerLayout": "chart_table",
      "aiInsight": null
    },
    {
      "id": "s2-1760600000001",
      "type": "dashboard_overview",
      "title": "Dashboard Overview",
      "channel": "instagram",
      "metricCount": 4,
      "kpiMetrics": ["reach", "engagement", "er", "followers", null, null],
      "chart": { "chartType": "bar", "barOrientation": "vertical", "barCategory": "daily_performance", "barMetrics": ["engagement"] },
      "...": "field lain sama dengan default makeSlide()"
    }
  ]
}
```

## Contoh lengkap dengan data

Contoh ini memakai data asli: satu brand demo, channel Instagram, report bulan **September 2026**. Payload diambil langsung dari fungsi query yang dipakai endpoint, dan hasil render dihitung dengan helper yang dipakai renderer (`buildTable`, `kpiMetricFor`, `buildPosts`). Nama brand dan URL gambar disamarkan; angkanya tidak diubah. Payload dipotong supaya muat — field yang dihilangkan ditandai `…`.

Alurnya untuk setiap blok: **config** (dari template) → **payload** (dari endpoint) → **hasil render** (yang tampil di slide/PPTX).

### A. Tabel `content_level`

**Config** (`slide.table`):

```json
{ "type": "content_level", "columns": ["reach", "likes", "comments", "shares", "eng_owned", "er_reach"] }
```

**Payload** — `GET …/reports/table-metrics?brand=…&year=2026&month=9`, diambil `content.instagram`:

```json
{
  "content": {
    "instagram": {
      "reach":     { "prev": 546,   "curr": 1074 },
      "likes":     { "prev": 23,    "curr": 61 },
      "comments":  { "prev": null,  "curr": null },
      "shares":    { "prev": 3,     "curr": null },
      "eng_owned": { "prev": 28,    "curr": 64 },
      "er_reach":  { "prev": 6.307, "curr": 8.636 },
      "…": "kolom lain yang tidak dipilih tetap ikut dikirim"
    },
    "facebook": { "…": "…" }, "tiktok": { "…": "…" }, "all": { "…": "…" }
  },
  "channel": { "…": "bentuk sama, untuk channel_level" },
  "contentByPlatform": { "instagram": { "reach": 1074, "likes": 61, "…": "…" } },
  "channelByPlatform": { "…": "…" },
  "sentiment": {},
  "competitors": {},
  "customMetrics": []
}
```

**Hasil render:**

| Period | Likes | Comments | Shares | Engagement Owned | ER Reach | Reach |
|---|---|---|---|---|---|---|
| Previous Month | 23 | — | 3 | 28 | 6.31% | 546 |
| Current Month | 61 | — | — | 64 | 8.64% | 1,074 |
| Gap (%) | 165.2% | — | — | 128.6% | 36.9% | 96.7% |

Perhatikan:
- **Urutan kolom** mengikuti definisi di `TABLE_TYPES`, bukan urutan di `columns` — `reach` dipilih pertama tapi tampil terakhir.
- **`null` → `—`**, dan Gap ikut `—` kalau salah satu sisinya `null` (Shares).
- **Gap** = `(curr − prev) / prev × 100`. Untuk metrik persen pun Gap tetap perubahan relatif: ER Reach 6.31% → 8.64% tampil `36.9%`, bukan `+2.33 pp`.

### B. Kartu `dashboard_overview`

**Config:**

```json
{ "type": "dashboard_overview", "channel": "instagram", "metricCount": 4, "kpiMetrics": ["reach", "engagement", "er", "followers", null, null] }
```

**Payload** — `GET …/reports/kpi-metrics`:

```json
{
  "instagram": {
    "reach":      { "curr": 1074,  "prev": 546 },
    "engagement": { "curr": 64,    "prev": 28 },
    "er":         { "curr": 5.959, "prev": 5.128 },
    "followers":  { "curr": 2032,  "prev": 2041 },
    "growth":     { "curr": -12,   "prev": -8 },
    "…": "…"
  },
  "facebook": { "…": "…" },
  "tiktok": {
    "reach": { "curr": 822, "prev": null },
    "…": "prev null = brand belum punya data bulan lalu → badge tren disembunyikan"
  }
}
```

**Hasil render** (`kpiMetricFor`):

```json
[
  { "key": "reach",      "label": "Reach",           "value": "1,074", "delta": 96.7,  "hasDelta": true },
  { "key": "engagement", "label": "Engagement",      "value": "64",    "delta": 128.6, "hasDelta": true },
  { "key": "er",         "label": "Engagement Rate", "value": "5.96%", "delta": 16.2,  "hasDelta": true },
  { "key": "followers",  "label": "Total Followers", "value": "2,032", "delta": -0.4,  "hasDelta": true }
]
```

ER di kartu ini (5.96%) **berbeda** dengan ER Reach di tabel A (8.64%), dan dua-duanya benar. Kartu memakai ER gabungan (Σengagement ÷ Σreach), sedangkan tabel per channel memakai rata-rata ER per post. Tabel "All Channels" menyediakan keduanya: `er_reach_pooled` dan `er_reach`.

### C. Line chart

**Config** (`slide.chart`):

```json
{ "chartType": "line", "dimension": "daymonth", "metrics": ["followers"] }
```

**Payload** — `GET …/reports/chart-metrics`. Tiap metrik membawa ketiga dimensi sekaligus, jadi ganti dimensi tidak perlu fetch ulang:

```json
{
  "meta": {
    "year": 2026, "month": 9, "daysInMonth": 30,
    "dayLabels": ["1", "2", "3", "…", "30"],
    "monthLabels": ["Jul", "Aug", "Sep"]
  },
  "channels": {
    "instagram": {
      "followers": {
        "daymonth":    [2039, 2043, 2029, 2036, 2038, "…", 2032],
        "last3months": [2049, 2041, 2032],
        "days":        [2033.25, 2034.25, 2035.6, 2035, 2031, 2030.25, 2034]
      },
      "profile_views": { "…": "…" }, "engagements": { "…": "…" }
    }
  },
  "bars": {
    "instagram": {
      "daily_performance": {
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "metrics": { "engagement": [13.5, 9, 0, 7, 6, 0, 0], "…": "…" }
      },
      "last3months_performance": {
        "labels": ["Jul", "Aug", "Sep"],
        "metrics": { "engagements": [69, 28, 64], "total_reach": [756, 546, 1074], "…": "…" }
      }
    }
  },
  "sentiment": { "instagram": { "positive": { "daymonth": ["…"] }, "neutral": { "…": "…" }, "negative": { "…": "…" } } },
  "words": {},
  "competitors": {},
  "customMetrics": []
}
```

**Hasil render:** satu garis 30 titik, sumbu X dari `meta.dayLabels` (1–30), nilai dari `channels.instagram.followers.daymonth`. Kalau `dimension` diganti ke `last3months`, sumbu X jadi `meta.monthLabels` dan nilainya dari array `last3months`.

`days` diurutkan **Sun → Sat** (`WEEKDAY_LABELS`), sedangkan `bars.*.daily_performance.labels` dimulai **Mon**. Jangan anggap urutan hari keduanya sama.

### D. Kartu post `visual`

**Config:**

```json
{ "type": "visual", "postCount": 4, "postFilter": "top", "postFormat": "all", "postPillar": "all", "postSortMetric": "engagement", "postMetrics": ["reach", "engagement", "er_reach"] }
```

**Payload** — `GET …/reports/post-metrics`. Satu array kandidat per channel, berisi semua post bulan itu:

```json
{
  "instagram": [
    {
      "id": 164410,
      "image": "https://res.cloudinary.com/<cloud>/image/upload/…/ig-media/<media_id>.jpg",
      "formatId": "reel",   "format": "Reel",
      "pillarId": "none",   "pillar": "No pillar",
      "isActivity": false,
      "values": {
        "reach": 196, "impressions_views": 307, "likes": 23, "comments": 0, "shares": 0,
        "saves": 0, "reposts": 0, "engagement": 23,
        "er_reach": 11.73, "er_views": 7.49, "er_followers": 1.13,
        "post_date": 1790609265, "post_datetime": 1790609265,
        "…": "…"
      },
      "text": { "post_date": "28 Sep 2026", "post_datetime": "28 Sep 2026, 15:27", "…": "…" }
    },
    "… 6 post lain"
  ],
  "facebook": ["…"],
  "tiktok": ["…"]
}
```

Tanggal disimpan dua kali dengan sengaja: `values.post_date` berupa epoch untuk mengurutkan, `text.post_date` sudah diformat untuk ditampilkan.

**Hasil render** (`buildPosts`): kandidat disaring per format dan pilar, diurutkan berdasarkan `postSortMetric`, lalu diambil 4 teratas. Tiap kartu jadi:

```json
{
  "id": 1,
  "image": "https://res.cloudinary.com/<cloud>/…",
  "format": "Reel",
  "pillar": "No pillar",
  "metrics": { "reach": "196", "engagement": "23", "er_reach": "11.73%", "…": "…" }
}
```

Kartu menyimpan semua metrik yang sudah diformat; yang tampil hanya id yang tercantum di `postMetrics`.

### E. Monthly tracker

**Config:**

```json
{
  "type": "monthly_tracker", "trackerLayout": "table", "trackerFrom": "2026-07",
  "table": {
    "type": "monthly_tracker", "fromMonth": "2026-07",
    "columns": ["followers", "followers_growth", "reach", "total_posts", "engagement", "key_highlight"],
    "highlights": { "2026-09": "7 post, reach naik hampir 2×" }
  }
}
```

**Payload** — `GET …/reports/monthly-tracker`. Selalu 12 bulan yang berakhir di bulan report; slide sendiri yang memotong mulai `fromMonth`. Bulan tanpa data berisi `values: {}`:

```json
{
  "instagram": [
    { "month": "2025-10", "values": {} },
    "…",
    { "month": "2026-07", "values": { "followers": null, "followers_growth": 0,  "reach": 756,  "total_posts": 2, "engagement": 69, "er": 9.13, "…": "…" } },
    { "month": "2026-08", "values": { "followers": 2041, "followers_growth": -8,  "reach": 546,  "total_posts": 3, "engagement": 28, "er": 5.13, "…": "…" } },
    { "month": "2026-09", "values": { "followers": 2032, "followers_growth": -12, "reach": 1074, "total_posts": 7, "engagement": 64, "er": 5.96, "…": "…" } }
  ],
  "facebook": ["…"], "tiktok": ["…"], "all": ["…"]
}
```

**Hasil render:** tiga baris (Jul, Aug, Sep 2026), perubahan MoM tampil di bawah tiap angka, dan kolom Key Highlight diisi dari `highlights["2026-09"]`.

Ada beda nama antara payload dan kolom: payload memakai `profile_views`, sedangkan id kolomnya `profile_visit` (label "Profile Views").

### F. Sentiment

**Payload** — `GET …/reports/audience-metrics`:

```json
{
  "meta": { "year": 2026, "month": 9, "monthLabel": "September 2026", "prevMonthLabel": "August 2026" },
  "sentiment": {
    "instagram": {
      "combined": {
        "current":  { "total": 1, "counts": { "positive": 1, "neutral": 0, "negative": 0 }, "share": { "positive": 100, "neutral": 0, "negative": 0 } },
        "previous": { "total": 0, "counts": { "positive": 0, "neutral": 0, "negative": 0 }, "share": { "positive": 0,   "neutral": 0, "negative": 0 } },
        "shareChange": { "positive": 100, "neutral": 0, "negative": 0 }
      },
      "bySource": {
        "tagged_post": { "current": { "…": "…" }, "previous": { "…": "…" }, "shareChange": { "…": "…" } }
      }
    }
  },
  "words": {},
  "demographics": {}
}
```

`sentimentSource: "all"` membaca `combined`; `"comment"` atau `"tagged_post"` membaca `bySource[...]`. Kalau sumber itu tidak punya data sama sekali, key-nya tidak ada (di contoh ini `bySource.comment` tidak muncul).

### Payload kosong

Dari brand yang sama, beberapa endpoint memang mengembalikan objek kosong:

| Endpoint | Respons | Sebabnya |
|---|---|---|
| `kpi-targets` | `{}` | brand belum punya KPI di tab KPI |
| `ytd-metrics` | `{}` | belum ada setelan YTD |
| `competitor-posts` | `{ "competitors": [], "posts": {} }` | belum ada kompetitor |

Dalam kondisi ini slide tetap dirender, isinya `—` atau kosong. Renderer tidak pernah mengisi dengan angka contoh.

---

## Hal yang perlu diingat saat mengubah struktur

- **Template lama tetap harus terbaca.** Field baru dibuat opsional (`ytdView?`, `trackerLayout?`, `postSource?`) dengan fallback di renderer, bukan diwajibkan.
- **Jangan ganti nama id tanpa alias.** Id kolom/metrik tersimpan di template; id yang tidak dikenali akan hilang diam-diam dari slide.
- **Awalan id punya arti.** `ct:` / `ch:` di tabel cross-level, `dash:` di YTD. Prefix ini dipakai untuk memilih sumber data, bukan kosmetik.
- **Renderer ada dua.** Preview React (`src/components/reports/slides/`) dan ekspor PPTX (`src/lib/reports/export/exportReport.ts`). Perubahan bentuk JSON harus ditangani di keduanya.
