-- Up Migration
--
-- Menandai CARA sebuah akun disambungkan, bukan dari mana datanya datang.
--
-- KENAPA KOLOM BARU, BUKAN MENUMPANG data_source
--   `data_source` menjawab "pipeline mana yang mengisi akun ini" dan nilainya
--   'api' | 'csv'. Sepuluh tempat di kode membandingkannya dengan 'api' secara
--   langsung; menambah nilai ketiga di situ akan diam-diam mengeluarkan akun
--   TikTok Business dari sync, dari status pipeline, dan dari daftar brand —
--   tanpa satu pun error. Cara autentikasi adalah pertanyaan yang berbeda dan
--   pantas punya kolomnya sendiri.
--
-- NILAI
--   'oauth'           — Login Kit / Graph API seperti sebelumnya (default, jadi
--                       seluruh baris lama tidak berubah artinya)
--   'tiktok_business' — TikTok API for Business (business-api.tiktok.com)
--
-- Satu akun TikTok hanya bisa satu cara: brand memilihnya saat connect, dan
-- mengganti cara berarti memutus lalu menyambung ulang. Itu disengaja — token
-- kedua produk tidak saling bisa dipakai, jadi menyimpan keduanya sekaligus
-- hanya akan membuat sync menebak mana yang masih berlaku.
ALTER TABLE social_accounts
  ADD COLUMN auth_method VARCHAR(32) NOT NULL DEFAULT 'oauth';

COMMENT ON COLUMN social_accounts.auth_method IS
  'Cara akun disambungkan: oauth (Login Kit/Graph) atau tiktok_business (TikTok API for Business).';

-- Down Migration
-- ALTER TABLE social_accounts DROP COLUMN auth_method;
