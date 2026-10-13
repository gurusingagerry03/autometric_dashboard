'use client'

import { useReportKpiTargets } from '@/lib/reports/data/metricsContext'
import {
  fmtKpiCount, fmtKpiPeriod, fmtKpiRate, kpiOnPace,
  kpiTargetIcon, kpiTargetLabel, kpiTargetsFor,
} from '@/lib/reports/data/kpiTargets'
import { useT } from '@/lib/i18n/LanguageContext'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * Pemilih KPI untuk satu kartu slide KPI Overview — sejajar dengan
 * MetricPickerModal milik Dashboard Overview, dan sengaja dibuat semirip
 * mungkin supaya dua slide yang berbagi layout juga berbagi cara pakai.
 *
 * Yang ditawarkan BUKAN katalog metrik, melainkan KPI aktif brand ini:
 * satu metrik bisa muncul dua kali dengan target dan periode berbeda, dan
 * itulah yang membedakannya — jadi tiap baris menyebut target + periodenya,
 * bukan hanya nama metriknya.
 */
export default function KpiTargetPickerModal({
  open, current, channel, onClose, onSelect,
}: {
  open: boolean
  current: string | null
  channel: string
  onClose: () => void
  onSelect: (kpiId: string) => void
}) {
  const t = useT()
  const targets = useReportKpiTargets()
  if (!open) return null
  const list = kpiTargetsFor(targets, channel)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.30)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f1f2]">
          <div>
            <h2 style={PJ} className="text-[16px] font-bold text-[#0f172a]">{t('Select KPI')}</h2>
            <p className="text-[12px] text-[#94a3b8] mt-0.5">
              {t('Active KPI targets for {channel} — set on the brand’s KPI tab.', { channel })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {targets === null ? (
            <p className="text-[12.5px] text-[#94a3b8] py-6 text-center">{t('Loading KPI targets…')}</p>
          ) : list.length === 0 ? (
            <div className="py-8 text-center">
              <span className="material-symbols-outlined text-[32px] text-[#cbd5e1]">flag</span>
              <p style={PJ} className="text-[13px] font-bold text-[#64748b] mt-2">{t('No active KPI for this channel')}</p>
              <p className="text-[12px] text-[#94a3b8] mt-1">{t('Set targets on the brand’s KPI tab.')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {list.map(k => {
                const active = current === k.kpiId
                const pace = kpiOnPace(k)
                return (
                  <button
                    key={k.kpiId}
                    onClick={() => onSelect(k.kpiId)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${active ? 'border-[#2C3079] bg-[#F1F2FB] ring-1 ring-[#2C3079]' : 'border-[#e5e7eb] hover:border-[#cbd5e1] hover:bg-[#f9fafb]'}`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#2C3079] text-white' : 'bg-[#eef0f2] text-[#9ca3af]'}`}>
                      <span className="material-symbols-outlined text-[19px]">{kpiTargetIcon(k.metric)}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p style={PJ} className="text-[13px] font-bold text-[#0f172a] truncate">
                        {t(kpiTargetLabel(k.metric))} {k.operation} {fmtKpiCount(k.target)}
                      </p>
                      <p className="text-[11.5px] text-[#94a3b8] truncate">
                        {fmtKpiPeriod(k.startDate, k.endDate)} · {fmtKpiCount(k.achieved)} {t('achieved')}
                      </p>
                    </div>
                    {/* Capaiannya ikut ditampilkan di pemilih: memilih KPI tanpa
                        melihat angkanya berarti menaruh kartu dan baru tahu
                        isinya setelah modalnya tertutup. */}
                    <span
                      style={{ ...PJ, color: k.achievementRate == null ? '#94a3b8' : pace ? '#16a34a' : '#dc2626' }}
                      className="text-[12.5px] font-extrabold whitespace-nowrap"
                    >
                      {fmtKpiRate(k.achievementRate)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
