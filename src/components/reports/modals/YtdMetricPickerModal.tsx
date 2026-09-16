'use client'

import { useReportYtd } from '@/lib/reports/data/metricsContext'
import {
  fmtYtdPct, fmtYtdPriorRange, fmtYtdRange, fmtYtdRow, ytdChannelFor, ytdDelta,
  ytdIcon, ytdLabel, ytdRowsBySource, type YtdRow,
} from '@/lib/reports/data/ytdMetrics'
import { useT } from '@/lib/i18n/LanguageContext'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * Pemilih metrik untuk satu kartu slide YTD Performance.
 *
 * Langkah "pilih sejak kapan" TIDAK ada di sini: periodenya satu per brand
 * (`public.ytd_setting`, unik selama aktif) dan diatur di tab KPI brand. Ia
 * ditulis di kepala modal supaya terlihat sebelum memilih.
 *
 * DUA KELOMPOK, KARENA SUMBERNYA MEMANG DUA
 *   "KPI" hanya berisi metrik yang punya KPI aktif — deretnya dibangun
 *   `sp_calculate_ytd_performance`, dan hanya 11 metrik itu yang diterimanya.
 *   "Dashboard" berisi sisa katalog scorecard, diakumulasi sepanjang jendela
 *   yang sama. Dipisah supaya jelas mana angka yang punya target dan mana yang
 *   sekadar akumulasi; metrik yang muncul di keduanya sudah dibuang dari
 *   kelompok Dashboard di server, jadi tidak ada nama yang tampil dua kali.
 */
export default function YtdMetricPickerModal({
  open, current, channel, onClose, onSelect,
}: {
  open: boolean
  current: string | null
  channel: string
  onClose: () => void
  onSelect: (key: string) => void
}) {
  const t = useT()
  const ytd = useReportYtd()
  if (!open) return null
  const section = ytdChannelFor(ytd, channel)
  const groups = section ? ytdRowsBySource(section.rows) : { kpi: [], dash: [] }

  const card = (row: YtdRow) => {
    const delta = ytdDelta(row)
    const active = current === row.metric
    return (
      <button
        key={row.metric}
        onClick={() => onSelect(row.metric)}
        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${active ? 'border-[#2C3079] bg-[#F1F2FB] ring-1 ring-[#2C3079]' : 'border-[#e5e7eb] hover:border-[#cbd5e1] hover:bg-[#f9fafb]'}`}
      >
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#2C3079] text-white' : 'bg-[#eef0f2] text-[#9ca3af]'}`}>
          <span className="material-symbols-outlined text-[19px]">{ytdIcon(row.metric)}</span>
        </span>
        <div className="min-w-0">
          <p style={PJ} className="text-[13px] font-bold text-[#0f172a] truncate">{t(ytdLabel(row.metric))}</p>
          <p className="text-[11.5px] text-[#94a3b8] truncate">
            {fmtYtdRow(row)}
            {delta == null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta}%`}
            {' · '}{fmtYtdPct(row.runRate)}
          </p>
        </div>
      </button>
    )
  }

  const group = (label: string, rows: YtdRow[]) =>
    rows.length === 0 ? null : (
      <div>
        <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8] mb-2">{t(label)}</p>
        <div className="grid grid-cols-2 gap-2.5">{rows.map(card)}</div>
      </div>
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[560px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.30)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f1f2]">
          <div className="min-w-0">
            <h2 style={PJ} className="text-[16px] font-bold text-[#0f172a]">{t('Select YTD metric')}</h2>
            <p className="text-[12px] text-[#94a3b8] mt-0.5 truncate">
              {section
                ? `${t('YTD {range}', { range: fmtYtdRange(section.window) })} · ${t('vs {range}', { range: fmtYtdPriorRange(section.window) })}`
                : t('No YTD period set for this brand')}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {ytd === null ? (
            <p className="text-[12.5px] text-[#94a3b8] py-6 text-center">{t('Loading…')}</p>
          ) : !section || section.rows.length === 0 ? (
            <div className="py-8 text-center">
              <span className="material-symbols-outlined text-[32px] text-[#cbd5e1]">timeline</span>
              <p style={PJ} className="text-[13px] font-bold text-[#64748b] mt-2">{t('No YTD window for this channel')}</p>
              <p className="text-[12px] text-[#94a3b8] mt-1">{t('Set the YTD period on the brand’s KPI tab.')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {group('KPI metrics', groups.kpi)}
              {group('Dashboard metrics', groups.dash)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
