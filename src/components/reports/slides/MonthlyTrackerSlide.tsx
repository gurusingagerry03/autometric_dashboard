'use client'

import { useState } from 'react'
import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide, ConfigBlock, withTrackerFrom, type TrackerLayout } from '@/lib/reports/data/slideModel'
import { defaultTrackerFrom, trackerStartOptions } from '@/lib/reports/data/monthlyTracker'
import { useReportMonthly } from '@/lib/reports/data/metricsContext'
import { PJ, AiInsightBlock } from './parts'
import { ChartBlock } from './charts'
import { TableBlock } from './TableBlock'
import { useT } from '@/lib/i18n/LanguageContext'

// Tinggi kartu tabel (% tinggi slide) per layout — sama dengan exporter
// (tabel dari 18cqh atau 53cqh sampai 87cqh). Dasar ukuran huruf tabelnya.
const TABLE_AREA: Record<TrackerLayout, number> = { chart_table: 34, table: 69 }

const LAYOUTS: { id: TrackerLayout; label: string; desc: string }[] = [
  { id: 'chart_table', label: 'Chart + Table', desc: 'Trend line, AI summary and the monthly table' },
  { id: 'table', label: 'Table only', desc: 'Monthly table with a key highlight per month' },
]

/**
 * Monthly Tracker Performance — deck revisi Report Maker, slide 11 (tabel saja)
 * dan slide 12 (chart + ringkasan + tabel).
 *
 * Isinya blok yang SAMA dengan Standard Dashboard: ChartBlock dan TableBlock,
 * dikonfigurasi lewat ChartSelectionModal / TableSelectionModal seperti slide
 * lain. Yang khas di sini hanya bawaannya — line chart berdimensi "Monthly" dan
 * tabel "Monthly Tracker" — serta pilihan layout. Header & footer dari SlidePreview.
 */
export default function MonthlyTrackerSlide({
  slide, colors, editable, onChange, onConfigure,
}: {
  slide: ContentSlide
  colors: CoverColors
  editable: boolean
  onChange?: (next: ContentSlide) => void
  onConfigure?: (block: ConfigBlock) => void
}) {
  const t = useT()
  const [cfgOpen, setCfgOpen] = useState(false)
  const layout = slide.trackerLayout ?? 'chart_table'
  const period = useReportMonthly()
  const from = slide.trackerFrom ?? (period ? defaultTrackerFrom(period.year) : '')

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col relative" style={{ gap: '2cqh' }}>
        {editable && (
          <button
            onClick={() => setCfgOpen(true)}
            title={t('Layout')}
            className="absolute z-10 flex items-center justify-center rounded-[0.5cqw] bg-white border border-[#e2e8f0] text-[#94a3b8] hover:text-[#2C3079] hover:border-[#cbd5e1] shadow-sm transition-colors"
            style={{ top: '-3cqh', right: 0, width: '2.6cqw', height: '2.6cqw' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.5cqw' }}>tune</span>
          </button>
        )}

        {layout === 'chart_table' && (
          <div className="flex min-h-0" style={{ gap: '2cqw', height: '33cqh', flexShrink: 0 }}>
            <div style={{ flex: 1.85, minWidth: 0 }}>
              <ChartBlock config={slide.chart} colors={colors} channel={slide.channel} editable={editable} onConfigure={() => onConfigure?.('chart')} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AiInsightBlock slide={slide} editable={editable} onChange={onChange} label="Summary" />
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0 }}>
          <TableBlock config={slide.table} colors={colors} channel={slide.channel} editable={editable}
            onConfigure={() => onConfigure?.('table')} onChange={table => onChange?.({ ...slide, table })}
            areaCqh={layout === 'chart_table' ? TABLE_AREA.chart_table : TABLE_AREA.table} />
        </div>
      </div>

      {cfgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCfgOpen(false)}>
          <div className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm" />
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[420px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.30)] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={PJ} className="text-[16px] font-bold text-[#0f172a]">{t('Monthly Tracker Performance')}</h3>
                <p className="text-[12px] text-[#94a3b8] mt-0.5">{t('Click the chart or the table on the slide to change what they show.')}</p>
              </div>
              <button onClick={() => setCfgOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {LAYOUTS.map(l => (
                <button key={l.id} onClick={() => onChange?.({ ...slide, trackerLayout: l.id })} style={PJ}
                  className={`py-2.5 px-3 rounded-lg border text-left transition-all ${layout === l.id ? 'border-[#2C3079] bg-[#F1F2FB] text-[#2C3079]' : 'border-[#e5e7eb] hover:bg-[#f9fafb] text-[#334155]'}`}>
                  <span className="block text-[12.5px] font-bold">{t(l.label)}</span>
                  <span className="block text-[11px] text-[#94a3b8] mt-0.5">{t(l.desc)}</span>
                </button>
              ))}
            </div>
            {period && (<>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mt-5 mb-2">{t('Start from month')}</p>
              <select value={from} onChange={e => onChange?.(withTrackerFrom(slide, e.target.value))} style={PJ}
                className="w-full h-10 text-[13px] font-semibold text-[#334155] bg-white border border-[#e5e7eb] rounded-lg px-3 cursor-pointer hover:border-[#cbd5e1] outline-none">
                {trackerStartOptions(period.year, period.month).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </>)}
          </div>
        </div>
      )}
    </>
  )
}
