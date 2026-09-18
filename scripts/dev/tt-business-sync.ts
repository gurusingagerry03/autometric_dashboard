/**
 * Penarikan penuh TikTok API for Business untuk brand tertentu.
 *
 * KENAPA TERPISAH DARI SCHEDULER
 *   `runScheduler` menarik semua akun dengan jendela pendek (NIGHTLY_DAYS) dan
 *   hanya menyisir komentar di 20 video terbaru. Untuk mengisi riwayat sebuah
 *   brand sekali jalan, keduanya salah: terlalu pendek dan terlalu sempit.
 *   Berkas ini memakai fungsi sync yang SAMA PERSIS — termasuk jalur refresh
 *   token-nya — hanya dengan lingkup satu brand dan batas yang disebut pemanggil.
 *
 * AMAN DIULANG
 *   Profil di-upsert per (akun, tanggal tarik), metrik harian profil ditulis ke
 *   baris bertanggal sama dengan tanggal metriknya, video per (video_id, tanggal
 *   tarik), komentar per comment_id. Menjalankan ini dua kali memperbarui baris
 *   yang sama, tidak menggandakannya.
 *
 * BIAYANYA ADA DI KOMENTAR
 *   TikTok tidak punya endpoint "semua komentar akun ini" — komentar diminta PER
 *   VIDEO, plus satu panggilan lagi untuk tiap komentar yang punya balasan. Brand
 *   dengan seribu video berarti seribu panggilan. Itu wajar untuk sekali tarik,
 *   tapi jangan dijadwalkan.
 *
 * SETELAH INI
 *   Yang terisi baru l0_raw. Silver/Gold dibangun Dagster, dan `new_account_sensor`
 *   TIDAK menyala untuk akun yang sudah punya baris di l2_gold.post_metric — jadi
 *   angkanya baru muncul di dashboard setelah `daily_pipeline_job` (03:15 WIB).
 *
 * Pemakaian:
 *   npx dotenv -e .env.local -- npx tsx scripts/dev/tt-business-sync.ts \
 *     --brand "Fitbar" --brand "Giv Body Wash" [--days 686] [--comment-videos 0] [--dry-run]
 */
import { randomUUID } from 'crypto'
import pool from '../../src/lib/db'
import { ensureFreshToken, type SchedulerAccount } from '../../src/lib/monitoring/scheduler'
import { initialTtBusinessSync, BACKFILL_DAYS, COMMENT_VIDEOS_ALL } from '../../src/lib/tiktok/business/sync'
import { logSyncEntries, type SyncEntry } from '../../src/lib/monitoring/logger'

function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => { if (a === '--' + name && process.argv[i + 1]) out.push(process.argv[i + 1]) })
  return out
}
const arg = (name: string) => args(name)[0]
const has = (name: string) => process.argv.includes('--' + name)

interface Row extends SchedulerAccount { brandName: string }

async function main() {
  const names = args('brand')
  if (!names.length) {
    console.error('Wajib: --brand "<nama>" (boleh diulang untuk beberapa brand)')
    process.exit(1)
  }
  const days = Number(arg('days') ?? BACKFILL_DAYS)
  const commentVideos = Number(arg('comment-videos') ?? COMMENT_VIDEOS_ALL)
  const dryRun = has('dry-run')

  // Dicocokkan dengan ILIKE supaya "giv" cukup untuk "Giv Body Wash", tapi
  // hasilnya selalu dicetak lebih dulu — biar salah ketik tidak diam-diam
  // menarik brand lain.
  const { rows } = await pool.query<Row>(
    `SELECT sa.id               AS "socialAccountId",
            sa.platform_user_id AS "platformUserId",
            sa.oauth_token      AS "oauthToken",
            sa.refresh_token    AS "refreshToken",
            sa.token_expires_at AS "tokenExpiresAt",
            p.key               AS platform,
            COALESCE(sa.auth_method,'oauth') AS "authMethod",
            b.id                AS "brandId",
            b.organization_id   AS "orgId",
            b.name              AS "brandName"
       FROM brands b
       JOIN brand_social_accounts bsa ON bsa.brand_id = b.id
       JOIN social_accounts sa        ON sa.id = bsa.social_account_id
       JOIN platforms p               ON p.id = sa.platform_id
      WHERE b.deleted_at IS NULL
        AND p.key = 'tiktok'
        AND COALESCE(sa.auth_method,'oauth') = 'tiktok_business'
        AND sa.connected = true
        AND sa.oauth_token IS NOT NULL
        AND b.name ILIKE ANY($1::text[])
      ORDER BY b.name`,
    [names.map(n => `%${n}%`)],
  )

  if (!rows.length) {
    console.error('Tidak ada akun TikTok Business tersambung untuk: ' + names.join(', '))
    process.exit(1)
  }

  // Satu akun bisa terpaut ke brand yang sama lebih dari sekali (duplikat di
  // brand_social_accounts). Menariknya dua kali hanya membuang kuota.
  const seen = new Set<string>()
  const targets = rows.filter(r => !seen.has(r.socialAccountId) && seen.add(r.socialAccountId))

  console.log(`Akan ditarik (${targets.length} akun), days=${days}, comment-videos=${commentVideos || 'semua'}:`)
  targets.forEach(t => console.log(`  ${t.brandName.padEnd(20)} business_id=${t.platformUserId}`))
  if (dryRun) { console.log('\n--dry-run: berhenti di sini.'); await pool.end(); return }

  for (const t of targets) {
    const startedAt = new Date()
    const runId = randomUUID()
    console.log(`\n=== ${t.brandName} ===`)
    try {
      if (!t.platformUserId) throw new Error('business_id tidak tersimpan — sambungkan ulang')
      const token = await ensureFreshToken(t)
      const result = await initialTtBusinessSync(
        t.socialAccountId, token, t.platformUserId, t.brandId, days, commentVideos,
      )
      const finishedAt = new Date()
      for (const [category, { count, error }] of Object.entries(result)) {
        console.log(`  ${category.padEnd(12)}${error ? 'GAGAL  ' + error : String(count) + ' baris'}`)
      }
      const entries: SyncEntry[] = Object.entries(result).map(([category, { count, error }]) => ({
        runId, jobName: 'tt-business-backfill', platform: 'tiktok', category,
        socialAccountId: t.socialAccountId, brandId: t.brandId, orgId: t.orgId,
        status: error ? 'failed' : 'success',
        recordsSynced: error ? null : count,
        errorMessage: error, startedAt, finishedAt,
      }))
      await logSyncEntries(entries).catch(e => console.error('  (log gagal)', e))
    } catch (e) {
      console.error(`  GAGAL: ${(e as Error).message}`)
    }
  }
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
