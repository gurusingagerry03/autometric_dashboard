import pool from '@/lib/db'

/**
 * Satu report hasil export, dilihat dari admin panel.
 *
 * Berbeda dari ReportRecord milik halaman Reports org: admin melihat lintas
 * organization, jadi yang dibutuhkan adalah siapa/di org mana/kapan — bukan
 * detail render cover.
 */
export interface AdminReportRow {
  id:            string
  name:          string
  title:         string
  brandName:     string | null
  period:        string | null
  slideCount:    number
  sizeKb:        number
  coverImageUrl: string | null
  exportedAt:    string
  org:           { id: string; name: string; slug: string }
  createdBy:     { name: string; email: string } | null
}

export async function listAllReportExports(): Promise<AdminReportRow[]> {
  const { rows } = await pool.query(
    `SELECT re.id, re.name, re.title, re.brand_name, re.period, re.slide_count,
            re.size_bytes, re.cover_image_url, re.exported_at,
            o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
            u.name AS user_name, u.email AS user_email
     FROM report_exports re
     JOIN organizations o ON o.id = re.organization_id
     LEFT JOIN users u    ON u.id = re.created_by
     ORDER BY re.exported_at DESC`,
  )
  return rows.map(r => ({
    id:            r.id,
    name:          r.name ?? r.title,
    title:         r.title,
    brandName:     r.brand_name,
    period:        r.period,
    slideCount:    r.slide_count,
    sizeKb:        Math.round(Number(r.size_bytes ?? 0) / 1024),
    coverImageUrl: r.cover_image_url,
    exportedAt:    new Date(r.exported_at).toISOString(),
    org:           { id: r.org_id, name: r.org_name, slug: r.org_slug },
    createdBy:     r.user_email ? { name: r.user_name, email: r.user_email } : null,
  }))
}

/** Object GCS + judul satu export, tanpa batasan org — hanya untuk route admin. */
export async function getReportExportForAdmin(
  id: string,
): Promise<{ gcsObjectName: string; title: string } | null> {
  const { rows } = await pool.query<{ gcs_object_name: string; title: string }>(
    `SELECT gcs_object_name, title FROM report_exports WHERE id = $1`,
    [id],
  )
  return rows[0] ? { gcsObjectName: rows[0].gcs_object_name, title: rows[0].title } : null
}
