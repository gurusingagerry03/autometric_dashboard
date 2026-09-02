'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useParams } from 'next/navigation'
import { PLATFORM_META, type DashPlatform } from './data'
import { useT } from '@/lib/i18n/LanguageContext'
import type { AccountProgress, PipelineStatus, StepKey, StepStatus } from '@/lib/brands/pipelineStatus'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * Indikator "data brand ini masih disiapkan".
 *
 * Sesudah akun dihubungkan, data brand belum langsung bisa dipakai: scrape awal
 * menulis ke l0_raw, lalu Dagster (sensor tiap 60 detik) menjalankan procedure
 * Silver dan Gold. Sebelum ini ada, seluruh tab cuma menampilkan "No data for this
 * filter yet." — tidak bisa dibedakan dari brand yang datanya memang kosong atau
 * pipeline yang rusak. Panel ini yang mengisi jeda itu.
 *
 * Istilah pipeline (L1/L2, Silver/Gold, Dagster) sengaja tidak pernah muncul ke
 * user — tiga langkahnya dinamai dari yang dirasakan user, sejalan dengan revisi
 * bahasa non-teknis di dashboard.
 */

/* ── Polling ──────────────────────────────────────────────────────────────── */

/** Jumlah area data yang tabelnya masih dibangun pipeline. */
function countBuilding(s: PipelineStatus): number {
  return Object.values(s.areas).filter(v => v === 'building').length
}

/** Selagi ada yang jalan, kabar baru layak ditunggu tiap 10 detik. */
const POLL_ACTIVE_MS = 10_000
/** Sudah tidak ada yang jalan (gagal/mandek): cukup dicek sesekali. */
const POLL_IDLE_MS = 30_000

/**
 * Status pipeline brand terpilih, di-polling selama belum siap.
 *
 * Polling berhenti total begitu `ready`/`idle` — tidak ada gunanya menanyai server
 * tiap 10 detik seumur hidup tab yang terbuka. Polling juga berhenti saat tab
 * disembunyikan (dan langsung menyusul sekali saat tab dilihat lagi), supaya tab
 * yang ditinggal seharian tidak menembak ribuan request percuma.
 *
 * `onReady` adalah isyarat "data di bawah mungkin sudah berubah, tarik ulang". Ia
 * dipanggil di DUA keadaan, dan yang kedua wajib ada:
 *
 *   1. status berubah dari "masih diproses" jadi "siap"
 *   2. jumlah area yang masih dibangun BERKURANG
 *
 * Tanpa (2) ada bug yang pasti terjadi: `post_metric` dibangun paling awal di layer
 * gold, jadi akun langsung dianggap `done` dan status melompat ke `ready` padahal
 * belasan mart lain belum jalan. Refetch tunggal di titik itu menarik tabel yang masih
 * kosong, polling lalu berhenti, dan angka nol bertahan di layar sampai user menekan
 * refresh sendiri.
 */
export function usePipelineStatus(brandId: string | undefined, onReady?: () => void) {
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  // Status terakhir juga disimpan di ref: penjadwal poll di bawah butuh nilai
  // terbaru tanpa menjadikannya dependency effect (yang akan me-restart timer
  // tiap kali datanya berubah).
  const latest  = useRef<PipelineStatus | null>(null)
  const wasBusy = useRef(false)
  /** Berapa area yang masih dibangun di poll sebelumnya; null = belum pernah poll. */
  const prevBuilding = useRef<number | null>(null)
  const readyCb = useRef(onReady)
  readyCb.current = onReady

  const load = useCallback(async () => {
    if (!brandId) return
    try {
      const res = await fetch(`/api/brands/${brandId}/pipeline-status`)
      if (!res.ok) return
      const next = (await res.json()) as PipelineStatus
      latest.current = next
      setStatus(next)

      const building = countBuilding(next)
      // Ada area yang baru saja selesai -> tabelnya sudah terisi, tapi tab masih
      // memegang hasil fetch lama yang isinya nol.
      const areaFinished = prevBuilding.current !== null && building < prevBuilding.current
      const becameReady  = wasBusy.current && next.state === 'ready'
      if (becameReady || areaFinished) readyCb.current?.()

      prevBuilding.current = building
      wasBusy.current = next.state === 'preparing' || next.state === 'attention'
    } catch {
      // Jaringan putus sesaat bukan alasan mengubah tampilan — status terakhir
      // dipertahankan dan poll berikutnya yang mengoreksi.
    }
  }, [brandId])

  useEffect(() => {
    latest.current = null
    setStatus(null)
    wasBusy.current = false
    prevBuilding.current = null
    if (!brandId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') await load()
      if (cancelled) return
      const current = latest.current
      // Status akun boleh sudah `ready` sementara sebagian mart gold masih dibangun —
      // polling harus tetap jalan sampai area terakhir selesai, kalau tidak card yang
      // menyusul tidak akan pernah di-refetch.
      const settled = current
        && (current.state === 'ready' || current.state === 'idle')
        && countBuilding(current) === 0
      if (settled) return
      timer = setTimeout(tick, current?.state === 'attention' ? POLL_IDLE_MS : POLL_ACTIVE_MS)
    }

    // Tab yang kembali terlihat langsung disegarkan: selama disembunyikan
    // pipeline-nya bisa saja sudah selesai.
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [brandId, load])

  return { status, refresh: load }
}

/* ── Bagian tampilan ──────────────────────────────────────────────────────── */

const STEP_LABEL: Record<StepKey, string> = {
  ingest: 'Collecting account data',
  silver: 'Organizing the data',
  gold:   'Calculating metrics',
}

const STEP_ICON: Record<StepStatus, { icon: string; color: string; spin?: boolean }> = {
  done:    { icon: 'check_circle',             color: '#3d8a5f' },
  running: { icon: 'progress_activity',        color: '#1B8A80', spin: true },
  pending: { icon: 'radio_button_unchecked',   color: '#d1d5db' },
  failed:  { icon: 'error',                    color: '#c2553f' },
}

function fmtCount(n: number): string {
  return n.toLocaleString('id-ID')
}

/* ── Strip: penjelas fase, di atas dashboard ─────────────────────────────── */
/*
 * Dipakai dua keadaan, dan kalimatnya berbeda karena taruhannya berbeda:
 *
 *   Brand BARU (belum ada data)   — card di bawah masih skeleton. Yang perlu diketahui
 *                                   user: ini normal, dan tiap card akan terisi sendiri.
 *   Brand LAMA (sudah ada data)   — angka di bawah nyata tapi mungkin belum lengkap
 *                                   karena ada akun baru yang menyusul.
 *
 * Semua detail — daftar langkah, tombol coba-lagi per akun, catatan kompetitor — ada di
 * balik "Details"; dulu isinya panel selayar penuh yang menggantikan seluruh dashboard.
 */

export function PipelineStrip({ status, brandId, onRetry }: {
  status: PipelineStatus
  brandId: string
  onRetry: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const busy = status.state === 'preparing'
  const current = status.steps.find(s => s.status === 'running' || s.status === 'failed')
  /** Belum ada data sama sekali: card di bawah masih skeleton, bukan angka. */
  const firstRun = !status.hasData

  return (
    <div className={`mb-4 rounded-lg border ${busy ? 'border-[#cfe8e4] bg-[#f2faf9]' : 'border-[#f0dcc4] bg-[#fdf8f0]'}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className={`material-symbols-outlined text-[17px] ${busy ? 'animate-spin' : ''}`}
          style={{ color: busy ? '#1B8A80' : '#b45309' }}
        >
          {busy ? 'progress_activity' : 'warning'}
        </span>
        <p className="text-[12.5px] text-[#374151] flex-1 leading-snug">
          {busy
            ? <>
                <span className="font-semibold">
                  {firstRun ? t('Preparing your data') : t('Still preparing newer data')}
                </span>
                {current && ` — ${t(STEP_LABEL[current.key]).toLowerCase()}.`}{' '}
                <span className="text-[#6b7280]">
                  {firstRun
                    ? `${t('Each card fills in as its metric is calculated.')} ${
                        status.slow
                          ? t('This is taking longer than usual — it keeps running in the background.')
                          : t('Running for {duration}', { duration: fmtDuration(status.elapsedSeconds, t) })
                      }`
                    : t('Numbers below may be incomplete.')}
                </span>
              </>
            : <>
                <span className="font-semibold">{t('Some accounts need attention')}</span>{' '}
                <span className="text-[#6b7280]">
                  {firstRun ? t('Cards below will stay empty until this is resolved.')
                            : t('Numbers below may be incomplete.')}
                </span>
              </>}
        </p>
        <button
          onClick={() => setOpen(o => !o)}
          style={PJ}
          className="text-[11.5px] font-bold text-[#1B8A80] hover:underline whitespace-nowrap"
        >
          {open ? t('Hide') : t('Details')}
        </button>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-white/60">
          <StepList steps={status.steps} className="mt-2" />
          {status.accounts.filter(a => a.state !== 'done' && a.state !== 'running').map(a => (
            <div key={a.id} className="mt-3">
              <ProblemRow account={a} brandId={brandId} onRetry={onRetry} />
            </div>
          ))}
          <CompetitorNote status={status} />
        </div>
      )}
    </div>
  )
}

/* ── Potongan yang dipakai bersama ────────────────────────────────────────── */

function StepList({ steps, className = '' }: { steps: PipelineStatus['steps']; className?: string }) {
  const t = useT()
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {steps.map(s => {
        const meta = STEP_ICON[s.status]
        return (
          <div key={s.key} className="flex items-center gap-2.5">
            <span
              className={`material-symbols-outlined text-[18px] ${meta.spin ? 'animate-spin' : ''}`}
              style={{ color: meta.color }}
            >
              {meta.icon}
            </span>
            <span className={`text-[12.5px] flex-1 ${s.status === 'pending' ? 'text-[#9ca3af]' : 'text-[#374151]'}`}>
              {t(STEP_LABEL[s.key])}
            </span>
            <span className="text-[11.5px] text-[#9ca3af]">
              {s.status === 'done' && s.detail
                ? t('{count} records', { count: fmtCount(s.detail) })
                : s.status === 'running' ? t('running…')
                : s.status === 'failed'  ? t('failed')
                : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Satu akun yang tidak akan selesai sendiri.
 *
 * `failed` dan `stalled` dapat tombol coba lagi karena keduanya berarti raw-nya
 * tidak pernah utuh — sensor Dagster tidak akan pernah memicu run untuk akun itu
 * sampai scrape-nya diulang. `no_content` tidak: akunnya memang belum punya
 * konten, mengulang scrape tidak mengubah apa pun.
 *
 * Akun CSV tidak pernah dapat tombol itu apa pun keadaannya: endpoint
 * initial-sync butuh token OAuth yang memang tidak dimiliki akun CSV, jadi
 * tombolnya dijamin gagal. Pemulihannya mengunggah file — makanya yang diberikan
 * tautan ke tab Data Sources.
 */
function ProblemRow({ account, brandId, onRetry }: {
  account: AccountProgress
  brandId: string
  onRetry: () => void
}) {
  const t = useT()
  const params = useParams()
  const orgSlug = (params?.orgSlug as string | undefined) ?? ''
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const meta = PLATFORM_META[account.platform as DashPlatform]
  const isCsv = account.dataSource === 'csv'
  const canRetry = !isCsv && (account.state === 'failed' || account.state === 'stalled')

  function retry() {
    setErr(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/${account.platform}/initial-sync`, { method: 'POST' })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setErr(j.error ?? t('Sync failed'))
          return
        }
        onRetry()
      } catch {
        setErr(t('Network error'))
      }
    })
  }

  const message =
    account.state === 'awaiting_upload' ? t('@{username} gets its data from uploads — nothing has been uploaded yet.', { username: account.username })
    : account.state === 'failed'     ? (isCsv
        ? t('The uploaded data for @{username} could not be processed.', { username: account.username })
        : t('We could not collect data from @{username}.', { username: account.username }))
    : account.state === 'stalled'  ? t('The first data pull for @{username} never started.', { username: account.username })
    : t('@{username} has no content to analyze yet.', { username: account.username })

  return (
    <div className="flex items-start gap-2.5">
      {meta && <img src={meta.logo} alt={meta.label} className="w-[15px] h-[15px] object-contain mt-0.5 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-[#374151] leading-snug">{message}</p>
        {isCsv && orgSlug && (
          <a href={`/organizations/${orgSlug}/brands/${brandId}/data-sources`}
             style={PJ}
             className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#1B8A80] hover:underline mt-1">
            <span className="material-symbols-outlined text-[13px]">upload</span>
            {t('Upload data')}
          </a>
        )}
        {account.error && (
          <p className="text-[11px] text-[#9ca3af] mt-0.5 break-words line-clamp-2">{account.error}</p>
        )}
        {err && <p className="text-[11px] text-[#c2553f] mt-0.5">{err}</p>}
      </div>
      {canRetry && (
        <button
          onClick={retry}
          disabled={isPending}
          style={PJ}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[#e2e8f0] bg-white text-[11.5px] font-semibold text-[#334155] hover:bg-[#f8fafc] transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <span className={`material-symbols-outlined text-[13px] text-[#1B8A80] ${isPending ? 'animate-spin' : ''}`}>
            {isPending ? 'progress_activity' : 'sync'}
          </span>
          {t('Try again')}
        </button>
      )}
    </div>
  )
}

/**
 * Kompetitor sengaja tidak ikut menahan panel: datanya diambil scraper terjadwal
 * (harian), jadi menunggunya bisa berjam-jam padahal data brand sendiri sudah
 * siap. Cukup ditampilkan sebagai catatan.
 */
function CompetitorNote({ status }: { status: PipelineStatus }) {
  const t = useT()
  const { total, ready, pending } = status.competitors
  if (total === 0 || (ready === total && pending === 0)) return null
  return (
    <p className="text-[11.5px] text-[#9ca3af] mt-4 pt-4 border-t border-[#f3f4f6] leading-relaxed">
      {t('Competitor data: {ready} of {total} ready. The rest arrives with the next daily update.', { ready, total })}
    </p>
  )
}

function fmtDuration(seconds: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (seconds < 90) return t('less than a minute')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return t('{minutes} minutes', { minutes })
  const hours = Math.floor(minutes / 60)
  return t('{hours} hours', { hours })
}
