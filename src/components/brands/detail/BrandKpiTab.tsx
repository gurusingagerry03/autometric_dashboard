'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBrandDetail } from './BrandDetailContext'
import PlatformIcon from '../PlatformIcon'
import DateRangePicker, { fmtSelection, withResolved, type DateSelection } from '@/components/dashboard/DateRangePicker'
import CustomMetricModal from '@/components/reports/modals/CustomMetricModal'
import { listCustomMetrics } from '@/lib/reports/data/customMetricsApi'
import type { CustomMetricDef } from '@/lib/reports/data/customMetrics'
import {
  KPI_METRICS_BY_PLATFORM, KPI_METRIC_LABEL, KPI_OPERATIONS, KPI_PLATFORMS,
  type KpiInput, type KpiMetric, type KpiOperation, type KpiPlatform, type KpiRow,
} from '@/lib/kpi/types'
import type { Platform } from '@/lib/brands/types'
import { useT } from '@/lib/i18n/LanguageContext'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const
const PLATFORM_LABEL: Record<KpiPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' }

/** Baris form yang sedang disusun — semuanya string supaya input kosong bisa dibedakan dari 0. */
interface Draft {
  platform: KpiPlatform
  metric: KpiMetric | ''
  operation: KpiOperation
  value: string
  range: DateSelection
}

const newDraft = (platform: KpiPlatform, range: DateSelection): Draft => ({
  platform, metric: '', operation: KPI_OPERATIONS[0], value: '', range,
})

/** Draft yang sudah cukup lengkap untuk disimpan. null = belum. */
function draftToInput(d: Draft): KpiInput | null {
  if (!d.metric) return null
  const valueTarget = Number(d.value)
  if (!Number.isFinite(valueTarget) || valueTarget <= 0) return null
  const r = withResolved(d.range)
  return {
    platform: d.platform, metric: d.metric, operation: d.operation,
    valueTarget, startDate: r.start, endDate: r.end,
  }
}

const fieldCls = 'h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12.5px] text-[#374151] outline-none focus:border-[#1B8A80]'

// Nama bulan dalam Inggris adalah KUNCI terjemahan — sama seperti DateRangePicker,
// yang memetakan empat yang berbeda di Indonesia (May, Aug, Oct, Dec).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Rentang 12 bulan penuh yang DIMULAI dari (year, month0).
 *
 * Panjangnya dipatok, bukan dipilih: YTD di sini selalu satu tahun penuh, dan
 * yang ditentukan pemakai cuma bulan awalnya. Akhirnya dihitung sebagai hari
 * terakhir bulan ke-12 — bukan "tanggal yang sama tahun depan" — supaya Feb dan
 * bulan 30 hari tidak meleset sehari.
 */
function twelveMonthsFrom(year: number, month0: number): { start: string; end: string } {
  const endAbs = year * 12 + month0 + 11
  const ey = Math.floor(endAbs / 12)
  const em = endAbs % 12
  const lastDay = new Date(Date.UTC(ey, em + 1, 0)).getUTCDate()
  return { start: `${year}-${pad2(month0 + 1)}-01`, end: `${ey}-${pad2(em + 1)}-${pad2(lastDay)}` }
}

export default function BrandKpiTab() {
  const t = useT()
  const { brand } = useBrandDetail()

  /**
   * Periode YTD: pemakai memilih BULAN AWAL saja, panjangnya selalu 12 bulan.
   *
   * Bukan setting yang disimpan — ini nilai awal kolom Periode di form Add KPI,
   * supaya membuat beberapa KPI dengan rentang yang sama tidak berarti memilih
   * tanggal yang sama berulang kali. Tiap baris tetap bisa memakai rentangnya
   * sendiri lewat picker di form.
   */
  const now = new Date()
  const [ytdYear, setYtdYear] = useState(now.getFullYear())
  const [ytdMonth, setYtdMonth] = useState(0)   // Januari — tahun berjalan penuh
  const ytd: DateSelection = useMemo(
    () => ({ mode: 'fixed', ...twelveMonthsFrom(ytdYear, ytdMonth) }),
    [ytdYear, ytdMonth],
  )
  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return [y - 2, y - 1, y, y + 1, y + 2]
  }, [])

  // Pustaka custom metric milik organisasi — sama persis dengan yang dipakai
  // Report Maker (satu tabel `org_custom_metrics`, satu API), jadi metrik yang
  // dibuat di sini langsung tersedia di report, dan sebaliknya.
  const [customMetrics, setCustomMetrics] = useState<CustomMetricDef[]>([])
  const [cmOpen, setCmOpen] = useState(false)
  const loadCustomMetrics = useCallback(() => {
    listCustomMetrics(brand.organization_id).then(setCustomMetrics).catch(() => {})
  }, [brand.organization_id])
  useEffect(loadCustomMetrics, [loadCustomMetrics])

  const [rows, setRows] = useState<KpiRow[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [staged, setStaged] = useState<KpiInput[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /**
   * Platform yang ditawarkan = yang brand ini benar-benar punya akunnya. KPI di
   * platform tanpa akun tidak pernah punya baris di `brand_metric_daily`, jadi
   * capaiannya dijamin 0 selamanya — target seperti itu tidak layak ditawarkan.
   */
  const platforms = useMemo(() => {
    const owned = new Set(brand.accounts.map(a => a.platform as string))
    return KPI_PLATFORMS.filter(p => owned.has(p))
  }, [brand.accounts])

  useEffect(() => {
    let alive = true
    fetch(`/api/brands/${brand.id}/kpi`)
      .then(r => r.json())
      .then(j => { if (alive) setRows(Array.isArray(j.data) ? j.data : []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [brand.id])

  function openForm() {
    setErr(null)
    setStaged([])
    setDraft(newDraft(platforms[0] ?? 'instagram', ytd))
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setDraft(null)
    setStaged([])
    setErr(null)
  }

  /** "+ Add": simpan baris ini ke daftar tunggu, siapkan baris kosong berikutnya. */
  function stageDraft() {
    if (!draft) return
    const input = draftToInput(draft)
    if (!input) { setErr(t('Fill in metric and target value first.')); return }
    setStaged(s => [...s, input])
    // Platform dan periode dipertahankan: KPI berikutnya biasanya masih satu
    // rentang dan satu channel, cuma metriknya yang berbeda.
    setDraft({ ...newDraft(draft.platform, draft.range) })
    setErr(null)
  }

  async function save() {
    if (saving) return
    // Baris yang sudah diisi tapi belum ditekan "+ Add" ikut disimpan — kalau
    // tidak, isian itu hilang tanpa jejak begitu tombol Set KPI ditekan.
    const pending = draft ? draftToInput(draft) : null
    const items = pending ? [...staged, pending] : staged
    if (items.length === 0) { setErr(t('Fill in metric and target value first.')); return }

    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/brands/${brand.id}/kpi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? t('Failed to save KPI.'))
      setRows(r => [...(j.data as KpiRow[]), ...(r ?? [])])
      closeForm()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Failed to save KPI.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row: KpiRow) {
    const next = !row.isActive
    setRows(rs => rs?.map(r => (r.kpiId === row.kpiId ? { ...r, isActive: next } : r)) ?? rs)
    const res = await fetch(`/api/brands/${brand.id}/kpi/${row.kpiId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    })
    // Kembalikan kalau server menolak — centangnya tidak boleh berbohong.
    if (!res.ok) setRows(rs => rs?.map(r => (r.kpiId === row.kpiId ? { ...r, isActive: !next } : r)) ?? rs)
  }

  async function removeRow(row: KpiRow) {
    // Optimistis, dengan salinan untuk dikembalikan: menunggu server dulu
    // membuat baris terasa macet, tapi baris yang hilang padahal masih ada di DB
    // jauh lebih buruk daripada jeda.
    const before = rows
    setRows(rs => rs?.filter(r => r.kpiId !== row.kpiId) ?? rs)
    const res = await fetch(`/api/brands/${brand.id}/kpi/${row.kpiId}`, { method: 'DELETE' })
    if (!res.ok) { setRows(before); setErr(t('Failed to remove KPI.')) }
  }

  const metricOptions = draft ? KPI_METRICS_BY_PLATFORM[draft.platform] : []

  return (
    <div className="max-w-4xl pb-10">

      {/* ── YTD periode: bulan awal saja, panjang dipatok 12 bulan ──── */}
      <div className="flex items-center justify-between py-4 border-b border-[#e5e7eb]">
        <div>
          <h2 style={PJB} className="text-[15px] font-bold text-[#111827]">{t('YTD Periode')}</h2>
          <p className="text-[12px] text-[#6b7280] mt-0.5">
            {t('Pick the starting month — the window is always 12 months.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ytdMonth} onChange={e => setYtdMonth(Number(e.target.value))}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12.5px] text-[#374151] outline-none focus:border-[#1B8A80]">
            {MONTHS.map((m, i) => <option key={m} value={i}>{t(m)}</option>)}
          </select>
          <select value={ytdYear} onChange={e => setYtdYear(Number(e.target.value))}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[12.5px] text-[#374151] outline-none focus:border-[#1B8A80]">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Rentang hasilnya ditulis apa adanya — 12 bulan dari Sep 2026 berakhir
              di Agu 2027, dan itu tidak jelas sampai tanggalnya benar-benar terlihat. */}
          <span style={PJB} className="text-[12.5px] font-semibold text-[#374151] whitespace-nowrap">
            {fmtSelection(ytd.start, ytd.end, t)}
          </span>
        </div>
      </div>

      {/* ── set KPI ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-4 border-b border-[#e5e7eb]">
        <div>
          <h2 style={PJB} className="text-[15px] font-bold text-[#111827]">{t('Set KPI')}</h2>
          <p className="text-[12px] text-[#6b7280] mt-0.5">{t('Targets are measured daily against this brand’s metrics.')}</p>
        </div>
        {!adding && (
          <button onClick={openForm} disabled={platforms.length === 0} style={PJB}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[12.5px] font-semibold text-white bg-[#1B8A80] hover:bg-[#177A70] disabled:bg-[#d1d5db] disabled:cursor-not-allowed transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span>
            {t('Add KPI')}
          </button>
        )}
      </div>

      {/* ── pustaka custom metric ───────────────────────────────────── */}
      <div className="flex items-center justify-between py-4 border-b border-[#e5e7eb]">
        <div>
          <h2 style={PJB} className="text-[15px] font-bold text-[#111827]">{t('Custom Metrics')}</h2>
          <p className="text-[12px] text-[#6b7280] mt-0.5">
            {customMetrics.length === 0
              ? t('No custom metric yet — shared with Report Maker once created.')
              : t('{n} saved — the same library Report Maker uses.', { n: customMetrics.length })}
          </p>
        </div>
        <button onClick={() => setCmOpen(true)} style={PJB}
          className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[12.5px] font-semibold text-[#1B8A80] bg-white border border-[#cfe6e1] hover:bg-[#f0f7f5] transition-colors">
          <span className="material-symbols-outlined text-[16px]">calculate</span>
          {t('Manage')}
        </button>
      </div>

      <CustomMetricModal
        open={cmOpen}
        orgId={brand.organization_id}
        metrics={customMetrics}
        onClose={() => setCmOpen(false)}
        onChanged={loadCustomMetrics}
      />

      {platforms.length === 0 && (
        <p className="text-[12.5px] text-[#6b7280] py-4">
          {t('Connect a social account first — a KPI needs a channel to measure.')}
        </p>
      )}

      {/* ── form ────────────────────────────────────────────────────── */}
      {adding && draft && (
        <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4">
          <h3 style={PJB} className="text-[13px] font-bold text-[#111827] mb-3">{t('Add KPI')}</h3>

          {staged.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {staged.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white border border-[#e5e7eb] px-3 py-2">
                  <PlatformIcon platform={s.platform as Platform} size={16} />
                  <span style={PJB} className="text-[12.5px] font-semibold text-[#374151]">
                    {t(KPI_METRIC_LABEL[s.metric])} {s.operation} {s.valueTarget.toLocaleString('en-US')}
                  </span>
                  <span className="text-[11.5px] text-[#6b7280]">{fmtSelection(s.startDate, s.endDate, t)}</span>
                  <button onClick={() => setStaged(list => list.filter((_, j) => j !== i))} title={t('Remove')}
                    className="ml-auto w-6 h-6 flex items-center justify-center rounded text-[#9ca3af] hover:text-[#b91c1c] hover:bg-[#fef2f2]">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2.5 flex-wrap">
            <label className="flex-1 min-w-[130px]">
              <span className="block text-[11px] font-semibold text-[#6b7280] mb-1">{t('Platform')}</span>
              <select value={draft.platform} className={fieldCls}
                onChange={e => {
                  const platform = e.target.value as KpiPlatform
                  // Metrik yang tidak tersedia di platform baru harus dilepas,
                  // bukan dibiarkan terpilih diam-diam lalu ditolak server.
                  const keep = draft.metric && KPI_METRICS_BY_PLATFORM[platform].includes(draft.metric)
                  setDraft({ ...draft, platform, metric: keep ? draft.metric : '' })
                }}>
                {platforms.map(p => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </label>

            <label className="flex-1 min-w-[150px]">
              <span className="block text-[11px] font-semibold text-[#6b7280] mb-1">{t('Metrics')}</span>
              <select value={draft.metric} className={fieldCls}
                onChange={e => setDraft({ ...draft, metric: e.target.value as KpiMetric })}>
                <option value="">{t('Choose…')}</option>
                {metricOptions.map(m => <option key={m} value={m}>{t(KPI_METRIC_LABEL[m])}</option>)}
              </select>
            </label>

            <label className="w-[92px]">
              <span className="block text-[11px] font-semibold text-[#6b7280] mb-1">{t('Operation')}</span>
              <select value={draft.operation} className={fieldCls}
                onChange={e => setDraft({ ...draft, operation: e.target.value as KpiOperation })}>
                {KPI_OPERATIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>

            <label className="w-[120px]">
              <span className="block text-[11px] font-semibold text-[#6b7280] mb-1">{t('Value')}</span>
              <input type="number" min={1} inputMode="numeric" value={draft.value} placeholder="1000"
                className={fieldCls} onChange={e => setDraft({ ...draft, value: e.target.value })} />
            </label>

            <div>
              <span className="block text-[11px] font-semibold text-[#6b7280] mb-1">{t('Periode')}</span>
              <DateRangePicker value={draft.range} onChange={range => setDraft({ ...draft, range })} />
            </div>

            <button onClick={stageDraft} style={PJB}
              className="flex items-center gap-1 h-9 px-3 rounded-lg text-[12.5px] font-semibold text-[#1B8A80] bg-white border border-[#cfe6e1] hover:bg-[#f0f7f5] transition-colors">
              <span className="material-symbols-outlined text-[16px]">add</span>
              {t('Add')}
            </button>
          </div>

          {err && <p className="mt-3 text-[12px] text-[#b91c1c]">{err}</p>}

          <div className="flex items-center justify-end gap-2 mt-4">
            <button onClick={closeForm} style={PJB}
              className="h-9 px-3.5 rounded-lg text-[12.5px] font-semibold text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] transition-colors">
              {t('Cancel')}
            </button>
            <button onClick={save} disabled={saving} style={PJB}
              className="h-9 px-4 rounded-lg text-[12.5px] font-semibold text-white bg-[#1B8A80] hover:bg-[#177A70] disabled:bg-[#9ca3af] transition-colors">
              {saving ? t('Saving…') : t('Set KPI')}
            </button>
          </div>
        </div>
      )}

      {/* ── daftar ──────────────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="grid grid-cols-[140px_1fr_240px_70px_32px] gap-3 px-3 pb-2 border-b border-[#e5e7eb]">
          {['platform', 'KPI', 'period', 'active'].map(h => (
            <span key={h} style={PJB} className={`text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] ${h === 'active' ? 'text-right' : ''}`}>
              {t(h)}
            </span>
          ))}
          <span />
        </div>

        {rows === null ? (
          <p className="text-[12.5px] text-[#9ca3af] py-6 text-center">{t('Loading…')}</p>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-[#9ca3af] py-6 text-center">{t('No KPI set for this brand yet.')}</p>
        ) : rows.map(row => (
          <div key={row.kpiId} className="grid grid-cols-[140px_1fr_240px_70px_32px] gap-3 items-center px-3 py-3 border-b border-[#f3f4f6] hover:bg-[#fafafa] transition-colors group/row">
            <span className="flex items-center gap-2 min-w-0">
              <PlatformIcon platform={row.platform as Platform} size={18} />
              <span className="text-[12.5px] text-[#374151] truncate">{PLATFORM_LABEL[row.platform]}</span>
            </span>
            <span style={PJB} className="text-[12.5px] font-semibold text-[#111827]">
              {t(KPI_METRIC_LABEL[row.metric])} {row.operation} {row.valueTarget.toLocaleString('en-US')}
            </span>
            <span className="text-[12px] text-[#6b7280]">{fmtSelection(row.startDate, row.endDate, t)}</span>
            <span className="flex justify-end">
              <input type="checkbox" checked={row.isActive} onChange={() => toggleActive(row)}
                title={row.isActive ? t('Active') : t('Inactive')}
                className="w-4 h-4 accent-[#1B8A80] cursor-pointer" />
            </span>
            <button onClick={() => removeRow(row)} title={t('Remove')}
              className="w-7 h-7 flex items-center justify-center rounded-md text-[#c4c9d4] opacity-0 group-hover/row:opacity-100 hover:text-[#b91c1c] hover:bg-[#fef2f2] transition-all">
              <span className="material-symbols-outlined text-[17px]">delete</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
