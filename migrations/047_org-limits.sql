-- Up Migration
-- Batas per-organization yang bisa diatur admin dari /admin/org-limits:
--   max_brands                   — berapa brand yang boleh dipunyai organization ini
--   max_competitors_per_platform — berapa competitor per platform, per brand
--                                  (2 = tiap brand boleh 2 IG + 2 TikTok + 2 Facebook)
--
-- Satu baris hanya ada untuk org yang batasnya pernah diubah. Org tanpa baris
-- memakai default app-wide di @/lib/quotas — jadi org baru tidak perlu di-insert
-- ke sini, dan mengubah default cukup di satu tempat.
CREATE TABLE organization_limits (
  organization_id              UUID PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  max_brands                   INTEGER NOT NULL CHECK (max_brands                   BETWEEN 0 AND 1000),
  max_competitors_per_platform INTEGER NOT NULL CHECK (max_competitors_per_platform BETWEEN 0 AND 1000),
  updated_by                   UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration
-- DROP TABLE organization_limits;
