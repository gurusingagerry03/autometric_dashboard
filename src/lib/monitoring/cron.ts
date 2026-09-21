import cron from 'node-cron'
import { getSchedulerConfig, shouldRunNow } from './scheduler-config'
import { runScheduler } from './scheduler'
import {
  getCompetitorSchedulerConfig,
  shouldRunNow as shouldRunCompetitorNow,
  shouldSyncPosts,
} from '@/lib/competitors/scheduler-config'
import { runCompetitorScheduler } from '@/lib/competitors/scheduler'

// Global flag to prevent duplicate cron instances in Next.js dev hot-reload
const g = global as typeof globalThis & { __autometricCronStarted?: boolean }

/**
 * Mematikan seluruh cron di instance ini.
 *
 * KENAPA PERLU
 *   Jadwalnya dibaca dari tabel `scheduler_config` di DATABASE_URL, jadi dua
 *   container yang menunjuk DB yang sama akan menjalankan scheduler yang sama
 *   pada menit yang sama. Itu yang terjadi antara production dan staging di
 *   server: `.env.local` keduanya menunjuk Timescale yang sama.
 *
 *   Akibatnya bukan sekadar sync dobel. TikTok MEROTASI refresh token, jadi
 *   proses yang menyusul memakai refresh token yang sudah dipakai proses
 *   pertama, ditolak dengan `invalid_grant`, lalu `isTokenError` di
 *   scheduler.ts menandai akunnya terputus. Terjadi 19–20 September 2026 pada
 *   ketiga akun TikTok API for Business, dan pemulihannya hanya bisa lewat
 *   OAuth ulang — refresh token lama tidak bisa dihidupkan kembali.
 *
 * Default-nya TETAP MENYALA: instance tanpa DISABLE_CRON berperilaku persis
 * seperti sebelumnya, jadi production tidak perlu ikut diubah.
 */
const cronDisabled = () => /^(1|true|yes|on)$/i.test((process.env.DISABLE_CRON ?? '').trim())

export function startCron() {
  if (cronDisabled()) {
    console.log('[Cron] tidak dijalankan di instance ini (DISABLE_CRON aktif)')
    return
  }
  if (g.__autometricCronStarted) return
  g.__autometricCronStarted = true

  // Run every minute — shouldRunNow() gates actual execution to configured times
  cron.schedule('* * * * *', async () => {
    // Owned-account sync
    try {
      const config = await getSchedulerConfig()
      if (shouldRunNow(config)) {
        console.log('[Cron] Scheduler triggered at', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), 'WIB')
        await runScheduler('daily-sync')
      }
    } catch (err) {
      console.error('[Cron] Error running scheduler:', err)
    }

    // Competitor sync (profile daily; posts on configured day-of-month)
    try {
      const cConfig = await getCompetitorSchedulerConfig()
      if (shouldRunCompetitorNow(cConfig)) {
        const syncPosts = shouldSyncPosts(cConfig)
        console.log('[Cron] Competitor scheduler triggered at', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), 'WIB · syncPosts=', syncPosts)
        await runCompetitorScheduler('competitor-daily', { syncPosts })
      }
    } catch (err) {
      console.error('[Cron] Error running competitor scheduler:', err)
    }
  })

  console.log('[Cron] Kepiai scheduler started')
}
