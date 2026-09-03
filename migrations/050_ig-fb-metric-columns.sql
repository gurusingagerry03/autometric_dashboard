-- Up Migration
-- Dua metrik yang sudah tersedia di Graph API tapi belum punya tempat mendarat
-- di l0_raw. Tidak ada rename: kolom lain yang metriknya sudah dihapus Meta
-- (link_clicks, profile_reach, demographics_city/country) tetap dengan namanya
-- dan hanya berganti metrik pengisinya di kode. Lihat docs/metrik/README.md.

-- "Profile Visit" Instagram channel-level. Metriknya valid dengan izin yang ada
-- sekarang — diverifikasi 1 Sep 2026: Fitbar 935, Siomay Jagooo 31. Selama ini
-- kosong semata-mata karena tidak pernah diminta di INSIGHTS_DAY_METRICS.
ALTER TABLE l0_raw.ig_profile_snapshots
  ADD COLUMN IF NOT EXISTS profile_views INTEGER;

-- Pasangan page_daily_follows_unique yang sudah ada di sebelahnya. Metriknya
-- valid di seluruh versi v19–v26 (diverifikasi di Page yang izinnya lengkap);
-- untuk Page klien angkanya baru terisi setelah izin read_insights turun.
ALTER TABLE l0_raw.fb_profile_snapshots
  ADD COLUMN IF NOT EXISTS page_daily_unfollows_unique BIGINT;

-- Down Migration
-- ALTER TABLE l0_raw.ig_profile_snapshots DROP COLUMN profile_views;
-- ALTER TABLE l0_raw.fb_profile_snapshots DROP COLUMN page_daily_unfollows_unique;
