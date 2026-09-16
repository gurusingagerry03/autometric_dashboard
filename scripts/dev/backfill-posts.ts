/**
 * Penarikan ulang post satu brand untuk rentang tanggal yang lebih panjang dari
 * jendela harian scheduler.
 *
 * KENAPA TERPISAH DARI SCHEDULER
 *   `runScheduler` menarik SEMUA akun yang connected di SEMUA brand dengan
 *   jendela 30 hari. Untuk mengisi bulan yang terlewat di satu brand, itu dua
 *   hal yang salah sekaligus: terlalu luas, dan terlalu pendek. Berkas ini
 *   memakai fungsi sync yang sama persis — termasuk jalur refresh token-nya —
 *   hanya dengan lingkup satu brand dan jendela yang disebut pemanggil.
 *
 * AMAN DIULANG
 *   Snapshot post di l0_raw di-upsert per id post (ON CONFLICT ... DO UPDATE),
 *   bukan ditambahkan per hari. Menjalankan ini dua kali memperbarui angka post
 *   yang sudah ada, tidak menggandakannya.
 *
 * SETELAH INI
 *   Yang terisi baru lapisan l0_raw. Silver/Gold dibangun Dagster — sensor akun
 *   baru tidak ikut menyala untuk akun yang sudah punya baris di
 *   `l2_gold.post_metric`, jadi angkanya muncul setelah `daily_pipeline_job`
 *   berikutnya (03:15 WIB).
 *
 * Pemakaian:
 *   npx dotenv -e .env.local -- npx tsx scripts/dev/backfill-posts.ts \
 *     --brand "Tiong Bahru Bakery" --since 2026-07-01 [--platform instagram,tiktok] [--dry-run]
 */
import { randomUUID } from 'crypto'
import pool from '../../src/lib/db'
import { ensureFreshToken, type SchedulerAccount } from '../../src/lib/monitoring/scheduler'
import { initialIgSync } from '../../src/lib/instagram/sync'
import { initialTtSync } from '../../src/lib/tiktok/sync'
import { initialFbSync } from '../../src/lib/facebook/sync'
import { logSyncEntries, type SyncEntry } from '../../src/lib/monitoring/logger'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes('--' + name)

const brandQuery = arg('brand')
const since = arg('since')
const only = arg('platform')?.split(',').map(s => s.trim()).filter(Boolean)
const dryRun = has('dry-run')

if (!brandQuery || !since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
  console.error('Usage: --brand "<name>" --since YYYY-MM-DD [--platform ig,tt,fb] [--dry-run]')
  process.exit(1)
}

// Jendela fetcher dihitung mundur dari hari ini, bukan dari tanggal. Satu hari
// ditambahkan supaya post yang tepat jatuh di `since` tidak terpotong oleh jam.
const days = Math.ceil((Date.now() - Date.parse(since + 'T00:00:00Z')) / 86_400_000) + 1

async function main() {
  const { rows: brands } = await pool.query<{ id: string; name: string; organization_id: string }>(
    `SELECT id, name, organization_id FROM public.brands
      WHERE name ILIKE $1 AND deleted_at IS NULL`, [`%${brandQuery}%`])
  if (brands.length !== 1) {
    console.error(brands.length ? `Ambiguous: ${brands.map(b => b.name).join(', ')}` : 'Brand not found')
    process.exit(1)
  }
  const brand = brands[0]

  const { rows: accounts } = await pool.query<SchedulerAccount>(`
    SELECT sa.id AS "socialAccountId", sa.platform_user_id AS "platformUserId",
           sa.oauth_token AS "oauthToken", sa.refresh_token AS "refreshToken",
           sa.token_expires_at AS "tokenExpiresAt", p.key AS platform,
           b.id AS "brandId", b.organization_id AS "orgId"
      FROM social_accounts sa
      JOIN brand_social_accounts bsa ON bsa.social_account_id = sa.id
      JOIN brands b ON b.id = bsa.brand_id AND b.deleted_at IS NULL
      JOIN platforms p ON p.id = sa.platform_id
     WHERE b.id = $1 AND sa.connected = true AND sa.oauth_token IS NOT NULL
     ORDER BY p.key`, [brand.id])

  const targets = only ? accounts.filter(a => only.includes(a.platform)) : accounts
  console.log(`brand: ${brand.name} (${brand.id})`)
  console.log(`since: ${since} → days=${days}`)
  console.log(`accounts: ${targets.map(a => a.platform).join(', ') || '(none)'}`)
  if (dryRun) { console.log('\n[dry-run] tidak ada yang ditarik.'); await pool.end(); return }

  const runId = randomUUID()
  const entries: SyncEntry[] = []

  for (const acct of targets) {
    const startedAt = new Date()
    console.log(`\n── ${acct.platform} ─────────────────────────────`)
    try {
      const token = await ensureFreshToken(acct)
      const result =
        acct.platform === 'instagram' && acct.platformUserId
          ? await initialIgSync(acct.socialAccountId, acct.platformUserId, token, acct.brandId, days)
        : acct.platform === 'tiktok'
          ? await initialTtSync(acct.socialAccountId, token, acct.brandId, days)
        : acct.platform === 'facebook' && acct.platformUserId
          ? await initialFbSync(acct.socialAccountId, acct.platformUserId, token, acct.brandId, days)
        : null
      if (!result) { console.log('  dilewati (platform tidak dikenali)'); continue }

      const finishedAt = new Date()
      for (const [category, { count, error }] of Object.entries(result)) {
        console.log(`  ${category.padEnd(14)} ${error ? 'FAILED — ' + error : count + ' rows'}`)
        entries.push({
          runId, jobName: 'backfill-posts', platform: acct.platform, category,
          socialAccountId: acct.socialAccountId, brandId: acct.brandId, orgId: acct.orgId,
          status: error ? 'failed' : 'success',
          recordsSynced: error ? null : count,
          errorMessage: error ?? null, startedAt, finishedAt,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  THREW — ${msg}`)
      entries.push({
        runId, jobName: 'backfill-posts', platform: acct.platform, category: 'unknown',
        socialAccountId: acct.socialAccountId, brandId: acct.brandId, orgId: acct.orgId,
        status: 'failed', recordsSynced: null, errorMessage: msg,
        startedAt, finishedAt: new Date(),
      })
    }
  }

  if (entries.length) await logSyncEntries(entries).catch(e => console.error('log failed:', e))
  console.log(`\nrun_id=${runId} · ${entries.filter(e => e.status === 'success').length} ok, ${entries.filter(e => e.status === 'failed').length} gagal`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
