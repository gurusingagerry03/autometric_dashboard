import pool from '@/lib/db'
import type { Platform } from './types'

/**
 * Progres pipeline data sebuah brand: scrape awal → Silver → Gold.
 *
 * KENAPA STATUSNYA DIBACA DARI WAREHOUSE, BUKAN DARI DAGSTER
 * Transformasi Silver/Gold dijalankan Dagster di VM GCP terpisah: webserver-nya
 * (port 3000) tidak dibuka ke publik dan run storage-nya Postgres sendiri di VM
 * itu — bukan warehouse yang dipakai app ini. Jadi app tidak bisa (dan sebaiknya
 * tidak) menanyai Dagster soal status run.
 *
 * Yang bisa dibaca app justru sumber kebenaran yang sama yang dipakai Dagster
 * sendiri buat memutuskan kapan pipeline jalan. `new_account_sensor` polling tiap
 * 60 detik dengan tiga syarat: akun connected, ADA baris `initial_scrape_logs`
 * status success, dan BELUM ada baris di `l2_gold.post_metric` untuk akun itu.
 * Fungsi ini membaca persis sinyal-sinyal itu, ditambah satu checkpoint di tengah
 * (`l1_silver.unified_post`) supaya progresnya bisa dipecah jadi tiga langkah.
 *
 * Efek sampingnya bagus: "selesai" versi UI = kondisi yang bikin sensor berhenti
 * memicu run. Tidak ada state yang perlu disinkronkan manual dengan tim data, dan
 * tidak ada tabel status baru yang bisa basi kalau pipeline-nya diubah.
 *
 * Semua pengecekan pakai EXISTS di kolom yang sudah ter-index (post_metric punya
 * idx_post_metric_brand_date, unified_post punya idx_..._brand_date, tabel l0_raw
 * punya index social_account_id), jadi endpoint ini aman di-polling: satu panggilan
 * ≈ beberapa index lookup, bukan COUNT tabel besar.
 *
 * CATATAN GRAIN: `brand_id` di l1_silver/l2_gold itu `social_accounts.id`
 * (per-akun), BUKAN `brands.id` — lihat dokumentasi Silver/Gold. Makanya semua
 * EXISTS di sini dikunci ke id akun, bukan id brand.
 */

/** Tiga langkah yang ditampilkan ke user; nama internalnya tetap istilah pipeline. */
export type StepKey = 'ingest' | 'silver' | 'gold'

export type StepStatus = 'done' | 'running' | 'pending' | 'failed'

/**
 * Nasib satu akun:
 * - `done`       datanya sudah sampai Gold, siap dipakai dashboard
 * - `running`    masih diproses di salah satu langkah
 * - `failed`     scrape awal gagal — pipeline tidak akan pernah jalan buat akun ini
 * - `no_content` scrape sukses tapi akunnya memang belum punya konten sama sekali;
 *                sensor menuntut EXISTS baris raw, jadi ini bukan "loading", ini
 *                kondisi akhir yang harus diberitahukan (kalau tidak, spinner-nya
 *                muter selamanya)
 * - `stalled`    sudah lama terhubung tapi belum ada log scrape sama sekali —
 *                indikasi request initial-sync mati di tengah jalan (app restart /
 *                deploy), jadi user ditawari re-run alih-alih menunggu sia-sia
 */
export type AccountState = 'done' | 'running' | 'failed' | 'no_content' | 'stalled'

export interface AccountProgress {
  id:         string
  platform:   Platform
  username:   string
  state:      AccountState
  /** Langkah yang sedang dikerjakan; null kalau akunnya sudah selesai/berhenti. */
  step:       StepKey | null
  /** Total record yang ditarik scrape awal (post + komentar + profil + stories). */
  records:    number | null
  error:      string | null
}

export interface PipelineStep {
  key:    StepKey
  status: StepStatus
  /** Ringkasan singkat buat baris langkah, mis. jumlah record yang sudah masuk. */
  detail: number | null
}

export interface PipelineStatus {
  /**
   * - `idle`      tidak ada akun yang perlu diproses (brand kosong) → dashboard
   *               tampil normal dengan empty state biasanya
   * - `preparing` ada yang masih jalan
   * - `attention` tidak ada yang jalan lagi, tapi ada yang gagal/mandek/kosong
   * - `ready`     semua akun sudah punya data Gold
   */
  state:       'idle' | 'preparing' | 'attention' | 'ready'
  /**
   * Brand ini sudah punya data Gold dari akun mana pun. Pembeda antara "brand
   * baru, layar masih kosong" (panel penuh) dan "dashboard sudah ada isinya, cuma
   * ada akun baru yang nyusul" (strip tipis di atas, dashboard tetap kebaca).
   */
  hasData:     boolean
  steps:       PipelineStep[]
  accounts:    AccountProgress[]
  competitors: { total: number; ready: number; pending: number }
  /** Waktu mulai akun yang paling awal masih diproses (ISO), buat hitung durasi. */
  startedAt:   string | null
  elapsedSeconds: number
  /** Sudah lewat SLOW_MINUTES — UI menurunkan nada dari "sebentar lagi" jadi "lebih lama dari biasanya". */
  slow:        boolean
}

/**
 * Batas "belum ada log scrape sama sekali" dianggap mandek, bukan lagi jalan.
 * Scrape awal terpanjang yang tercatat ≈ 50 detik (initial_scrape_logs), tapi akun
 * dengan ratusan post + komentar bisa jauh lebih lama, jadi ambangnya dilebihkan
 * banyak — false negative (spinner kelamaan) jauh lebih murah daripada false
 * positive (tombol "coba lagi" muncul padahal scrape-nya masih jalan dan re-run
 * malah menggandakan kerja).
 */
const STALL_MINUTES = 30

/**
 * Setelah ini UI bilang "lebih lama dari biasanya". Sensor Dagster polling 60 detik
 * dan job-nya rebuild penuh (harmonization → silver → feature/NLP → gold), jadi
 * hitungan menit itu normal; belasan menit belum tentu bermasalah, makanya ini cuma
 * mengubah kalimat, bukan memunculkan error.
 */
const SLOW_MINUTES = 20

const ACCOUNTS_SQL = `
  WITH acct AS (
    SELECT sa.id,
           p.key       AS platform,
           sa.username,
           sa.connected,
           COALESCE(sa.data_source, 'api') AS data_source,
           bsa.created_at                  AS linked_at
    FROM brand_social_accounts bsa
    JOIN social_accounts sa ON sa.id = bsa.social_account_id
    JOIN platforms       p  ON p.id  = sa.platform_id
    WHERE bsa.brand_id = $1
  )
  SELECT a.id,
         a.platform,
         a.username,
         a.connected,
         a.data_source,
         a.linked_at,
         scrape.status         AS scrape_status,
         scrape.records        AS scrape_records,
         scrape.error_message  AS scrape_error,
         scrape.finished_at    AS scrape_finished_at,
         -- "Datanya beneran ada" — pagar yang sama yang dipakai new_account_sensor.
         -- Log success tanpa baris raw = akun tanpa konten, bukan akun yang lagi diproses.
         CASE a.platform
           WHEN 'instagram' THEN EXISTS (SELECT 1 FROM l0_raw.ig_media_snapshots r WHERE r.social_account_id = a.id)
           WHEN 'facebook'  THEN EXISTS (SELECT 1 FROM l0_raw.fb_post_snapshots  r WHERE r.social_account_id = a.id)
           WHEN 'tiktok'    THEN EXISTS (SELECT 1 FROM l0_raw.tt_video_snapshots r WHERE r.social_account_id = a.id)
           ELSE false
         END AS has_raw,
         EXISTS (SELECT 1 FROM l1_silver.unified_post up WHERE up.brand_id = a.id) AS has_silver,
         EXISTS (SELECT 1 FROM l2_gold.post_metric   pm WHERE pm.brand_id = a.id) AS has_gold
  FROM acct a
  -- Akun API dicatat di initial_scrape_logs, akun CSV di csv_upload_logs. Keduanya
  -- sama-sama berarti "raw sudah utuh", dan keduanya sama-sama memicu sensor
  -- (new_account_sensor / csv_upload_sensor), jadi diperlakukan sebagai satu langkah.
  LEFT JOIN LATERAL (
    SELECT status, records, error_message, finished_at
    FROM (
      SELECT l.status, l.records_synced AS records, l.error_message, l.finished_at
        FROM public.initial_scrape_logs l
       WHERE l.social_account_id = a.id
      UNION ALL
      SELECT c.status, c.rows_written AS records, c.error_message, c.created_at AS finished_at
        FROM public.csv_upload_logs c
       WHERE c.social_account_id = a.id AND c.status <> 'skipped'
    ) s
    ORDER BY finished_at DESC
    LIMIT 1
  ) scrape ON true
  ORDER BY a.linked_at
`

const COMPETITORS_SQL = `
  SELECT bc.verification_status,
         EXISTS (
           SELECT 1 FROM l2_gold.competitor_post_metric cm
            WHERE cm.brand_id = $1
              AND cm.competitor_social_account_id = bc.social_account_id
         ) AS has_gold
  FROM brand_competitors bc
  WHERE bc.brand_id = $1
`

interface AccountRow {
  id: string
  platform: Platform
  username: string
  connected: boolean
  data_source: 'api' | 'csv'
  linked_at: Date
  scrape_status: 'success' | 'failed' | null
  scrape_records: number | null
  scrape_error: string | null
  scrape_finished_at: Date | null
  has_raw: boolean
  has_silver: boolean
  has_gold: boolean
}

/** Urutan langkah, dipakai buat membandingkan "sejauh mana" tiap akun sudah maju. */
const STEP_ORDER: StepKey[] = ['ingest', 'silver', 'gold']

function progressOf(row: AccountRow, now: number): AccountProgress {
  const base = {
    id:       row.id,
    platform: row.platform,
    username: row.username,
    records:  row.scrape_records,
    error:    row.scrape_error,
  }

  // Gold duluan yang dicek: begitu ada, akun ini selesai apa pun isi lognya —
  // termasuk akun lama yang sudah punya data jauh sebelum logging ada.
  if (row.has_gold)                 return { ...base, state: 'done',       step: null }
  if (row.scrape_status === 'failed') return { ...base, state: 'failed',   step: 'ingest' }

  if (row.scrape_status === 'success') {
    if (!row.has_raw)               return { ...base, state: 'no_content', step: null }
    return { ...base, state: 'running', step: row.has_silver ? 'gold' : 'silver' }
  }

  // Belum ada log sama sekali. Masih wajar sebentar (scrape baru jalan), tapi kalau
  // sudah lewat ambang berarti request initial-sync-nya hilang — tawarkan re-run.
  const minutes = (now - row.linked_at.getTime()) / 60000
  return { ...base, state: minutes > STALL_MINUTES ? 'stalled' : 'running', step: 'ingest' }
}

/**
 * Sejauh mana satu akun sudah maju: 0 = belum lewat scrape, 3 = selesai.
 *
 * `no_content` dihitung 1: scrape-nya benar-benar selesai (langkah 1 lewat), yang
 * tidak akan pernah datang cuma isi buat langkah berikutnya — jadi ia berhenti di
 * ambang Silver, bukan "selesai".
 */
function rankOf(p: AccountProgress): number {
  if (p.state === 'done') return STEP_ORDER.length
  if (p.state === 'no_content') return 1
  return p.step ? STEP_ORDER.indexOf(p.step) : STEP_ORDER.length
}

export async function getBrandPipelineStatus(brandId: string): Promise<PipelineStatus> {
  const [accountsRes, competitorsRes] = await Promise.all([
    pool.query<AccountRow>(ACCOUNTS_SQL, [brandId]),
    pool.query<{ verification_status: 'pending' | 'verified'; has_gold: boolean }>(COMPETITORS_SQL, [brandId]),
  ])

  const now  = Date.now()
  const rows = accountsRes.rows

  /**
   * Yang dilacak cuma akun yang memang akan diproses pipeline: OAuth aktif
   * (syarat `connected = true` di sensor) atau akun CSV (tidak pernah connected
   * tapi datanya tetap masuk lewat csv_upload_sensor). Akun yang terputus dan
   * tidak punya data tidak akan pernah diproses — menampilkannya sebagai
   * "sedang disiapkan" cuma bikin spinner abadi.
   */
  const tracked  = rows.filter(r => r.connected || r.data_source === 'csv' || r.has_gold)
  const progress = tracked.map(r => ({ row: r, p: progressOf(r, now) }))
  const accounts = progress.map(({ p }) => p)

  const competitors = {
    total:   competitorsRes.rows.length,
    ready:   competitorsRes.rows.filter(c => c.has_gold).length,
    pending: competitorsRes.rows.filter(c => c.verification_status === 'pending').length,
  }

  const hasData = rows.some(r => r.has_gold)
  const running = accounts.filter(a => a.state === 'running')
  const stuck   = accounts.filter(a => a.state === 'failed' || a.state === 'stalled' || a.state === 'no_content')

  const state: PipelineStatus['state'] =
    accounts.length === 0                         ? 'idle'
    : accounts.every(a => a.state === 'done')     ? 'ready'
    : running.length > 0                          ? 'preparing'
    : stuck.length > 0                            ? 'attention'
    : 'ready'

  /**
   * Langkah bersama = langkah terdepan yang belum tuntas di SEMUA akun. Dua akun
   * yang beda kecepatan tetap tampil sebagai satu progres (pipeline-nya memang satu
   * run untuk semua), dan langkah yang sudah lewat tidak pernah "mundur" lagi.
   * Akun yang gagal/kosong dikeluarkan dari perhitungan supaya satu akun bermasalah
   * tidak menahan progres akun lain di 0%.
   */
  const advancing = accounts.filter(a => a.state === 'running' || a.state === 'done')

  /**
   * Kalau TIDAK ada satu pun akun yang masih maju (semuanya gagal/mandek/kosong),
   * progresnya diambil dari akun yang paling awal tersendat. Tanpa ini, memfilter
   * akun bermasalah akan menyisakan himpunan kosong dan ketiga langkah tampil
   * "selesai" — tiga centang hijau di atas pesan error.
   */
  const frontier =
    advancing.length   ? Math.min(...advancing.map(rankOf))
    : accounts.length  ? Math.min(...accounts.map(rankOf))
    : STEP_ORDER.length

  // Langkah ditandai gagal hanya kalau memang tidak ada lagi yang jalan di situ —
  // selama akun lain masih maju, langkahnya tetap "berjalan" dan detail per akun
  // yang menjelaskan siapa yang bermasalah.
  const blocked    = advancing.length === 0
  const failedStep = accounts.find(a => a.state === 'failed' || a.state === 'stalled')?.step ?? null

  const steps: PipelineStep[] = STEP_ORDER.map((key, i) => ({
    key,
    status:
      frontier > i    ? 'done'
      : frontier !== i ? 'pending'
      : blocked        ? (failedStep === key ? 'failed' : 'pending')
      : 'running',
    // Jumlah record cuma bermakna di langkah scrape; dua langkah lain murni
    // transformasi di dalam DB dan tidak punya angka yang berarti buat user.
    detail: key === 'ingest'
      ? accounts.reduce((sum, a) => sum + (a.records ?? 0), 0) || null
      : null,
  }))

  // Durasi dihitung dari akun tertua yang masih diproses: itu yang menentukan kapan
  // dashboard bisa dipakai, dan bikin "sudah berjalan N menit" tidak reset tiap kali
  // akun baru ditambahkan.
  const startedAtMs = progress
    .filter(({ p }) => p.state === 'running')
    .reduce<number | null>((min, { row }) => {
      const ms = row.linked_at.getTime()
      return min === null || ms < min ? ms : min
    }, null)

  const elapsedSeconds = startedAtMs ? Math.floor((now - startedAtMs) / 1000) : 0

  return {
    state,
    hasData,
    steps,
    accounts,
    competitors,
    startedAt: startedAtMs ? new Date(startedAtMs).toISOString() : null,
    elapsedSeconds,
    slow: elapsedSeconds > SLOW_MINUTES * 60,
  }
}
