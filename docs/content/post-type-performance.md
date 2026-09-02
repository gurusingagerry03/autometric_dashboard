# Content Overview › Section: Post Type Performance

Bar horizontal **rata-rata reach per format Instagram** + satu "Key Finding". Window current. Spesifik **Instagram** (mengabaikan platform toggle).

Kode: `src/lib/dashboard/content.ts` → `postTypePerf()` + `igFormatLabel()`.

## Tabel sumber per elemen

| Elemen UI | Tabel | Kolom | Rumus |
|---|---|---|---|
| **Daftar format** | `l2_gold.post_metric` | `format`, `post_type`, `link`, `duration_s` | bucket per label (lihat bawah), urut `avg reach` desc |
| **Nilai bar** | `l2_gold.post_metric` | `reach` | `AVG(reach)` per label |
| **Key Finding** | — (turunan) | — | format teratas vs format kedua (rasio reach) |

## Dari mana label format berasal

Ada **dua kolom berbeda** yang bisa menentukan format, dan urutannya penting:

1. **`format`** — tag **editorial manual** dari `l0_extra.instagram_post_extra_attribute`, satu keluarga dengan `content_pillar`, `brand_offering`, `is_campaign`, `is_boosted`. Kolom ini **NULL** kecuali brand-nya memang mengisi tagging manual; sebagian brand memakainya untuk tag bebas seperti `Motion`/`Static`.
2. **`post_type`** — media type dari platform, jalurnya
   `Graph API media_type` → `l0_raw.ig_media_snapshots.media_type` → `l0_harmonization.instagram_post.post_type` → `l1_silver.unified_post.post_type` → `l2_gold.post_metric.post_type`.

`igFormatLabel()` mencoba `format` dulu, lalu jatuh ke `post_type`. Sebelumnya section ini hanya membaca `format` dengan filter `format IS NOT NULL`, sehingga **kosong untuk semua brand yang datanya dari API** — hanya brand dengan tagging manual yang pernah menampilkan bar.

## Mapping → label (Instagram)

| Nilai (DB) | Dari kolom | Label UI |
|---|---|---|
| `reels` | `format` / `post_type` | Reels |
| `carousel`, `carousel_album` | `format` / `post_type` | Carousel |
| `feed`, `image` | `format` / `post_type` | Image |
| `video` | `post_type` | Video — kecuali terdeteksi Reel, lihat bawah |
| `story` | `format` / `post_type` | Story |
| tag editorial lain (`Motion`, `Static`, …) | `format` | dipakai apa adanya (Title Case) |

### Deteksi Reel

Instagram mengembalikan `media_type = 'VIDEO'` untuk Reel; penanda sebenarnya ada di `media_product_type`, tapi kolom itu **tidak ada** di `l0_raw.ig_media_snapshots` sehingga sinyalnya hilang. Karena itu `post_type = 'VIDEO'` dianggap **Reels** bila `link` mengandung `/reel/` **atau** `duration_s > 0`.

`src/lib/instagram/sync.ts` dan `src/app/api/brands/[brandId]/instagram/media/snapshot/route.ts` kini menyimpan `effectiveType` (sudah `REELS`) alih-alih `media.media_type` mentah — sama seperti jalur Apify di `src/lib/apify/queries.ts`. Baris lama tetap `VIDEO` sampai di-sync ulang, jadi aturan fallback di atas tetap diperlukan.

## Key Finding (teks otomatis)

- Ambil format dengan **rata-rata reach tertinggi** (`top`) dan format kedua (`second`).
- Teks: *"`<top>` rata-rata mencatat reach `n`× lebih tinggi dari `<second>` — format dengan distribusi terkuat di Instagram."*
- Bila tak ada data: *"Belum ada data format Instagram pada periode ini."*

## Contoh SQL

```sql
SELECT p.format, p.post_type, p.link,
       COALESCE(p.duration_s,0)::float AS duration_s,
       COALESCE(p.reach,0)::float      AS reach
FROM l2_gold.post_metric p
JOIN public.brand_social_accounts bsa ON bsa.social_account_id = p.brand_id
JOIN public.brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
WHERE b.organization_id = $1
  AND p.platform = 'instagram'
  AND p.post_date::date BETWEEN $2 AND $3
  AND COALESCE(NULLIF(btrim(p.format), ''), p.post_type) IS NOT NULL
  AND ($4::uuid IS NULL OR bsa.brand_id = $4);
```

Agregasi per label sengaja dilakukan di JS, bukan `GROUP BY`, supaya aturan label (termasuk deteksi Reel) punya satu definisi saja di `igFormatLabel()`.

## Catatan

- Memakai **rata-rata** (bukan total) reach supaya format yang jarang diposting tidak otomatis kalah dari yang sering — bar mencerminkan **efektivitas** format, bukan volume.
- Karena rata-rata, sebuah bar bisa berdiri di atas **satu post saja**. Jumlah post per bar belum ditampilkan di UI.
- Warna bar memakai palet `PALETTE` urut sesuai ranking reach.
- Section ini selalu Instagram (subtitle UI: "Instagram · avg reach by format"); platform toggle tidak mengubahnya, tapi filter **brand** & **period** tetap berlaku.
