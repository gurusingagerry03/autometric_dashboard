-- Up Migration
-- "Export only" juga disimpan (supaya admin bisa melihat semua report yang
-- di-generate), tapi tidak boleh muncul di library Reports milik organization —
-- itu tetap khusus hasil "Export & save". Default true: semua baris lama berasal
-- dari "Export & save", dan kode lama yang belum tahu kolom ini tetap benar.
ALTER TABLE report_exports ADD COLUMN in_library BOOLEAN NOT NULL DEFAULT true;

-- Down Migration
-- ALTER TABLE report_exports DROP COLUMN in_library;
