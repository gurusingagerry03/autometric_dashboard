-- Up Migration
-- Gambar post yang disalin ke Cloudinary HANYA ketika post itu tampil di report.
--
-- Sebelumnya setiap cover post (milik brand maupun kompetitor) disalin ke
-- Cloudinary saat sync, padahal hanya segelintir yang pernah masuk report. Sekarang
-- sync menyimpan URL CDN apa adanya, dan slide Visual Content yang menyalin cover
-- post yang benar-benar dipakainya — lewat URL CDN-nya kalau masih hidup, atau
-- scrape ulang dari permalink post kalau sudah kedaluwarsa / kosong.
--
-- Disimpan di tabel sendiri, bukan ditulis balik ke l0_raw: cover post brand di
-- report dibaca dari l1_silver.unified_post yang dibangun Dagster, jadi tulisan
-- ke l0_raw baru terlihat setelah pipeline jalan lagi. Report membaca tabel ini
-- lebih dulu (COALESCE) baru jatuh ke cover_image sumbernya.
--
-- Kunci (platform, post_id): satu post punya satu gambar, siapa pun yang
-- memakainya — post kompetitor brand A bisa jadi post milik brand B.
--
-- image_url NULL + failed_at = percobaan terakhir gagal (post dihapus/privat).
-- Resolver tidak mencobanya lagi sebelum jedanya lewat, supaya setiap kali report
-- dibuka tidak memicu run Apify baru untuk post yang memang sudah tidak ada.
CREATE TABLE report_post_images (
  platform          VARCHAR(20)  NOT NULL,
  post_id           TEXT         NOT NULL,
  social_account_id UUID,
  image_url         TEXT,
  source_url        TEXT,
  failed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, post_id)
);

-- Down Migration
-- DROP TABLE report_post_images;
