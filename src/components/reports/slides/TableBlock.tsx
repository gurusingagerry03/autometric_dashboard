'use client'

import { CoverColors } from '@/lib/reports/cover/colors'
import { TABLE_TYPES, TableColumn, TableConfig, SectionMetrics, SentimentTable, CompetitorSection, PlatformMetrics, buildTable, columnsForChannel, sentimentTableFor, customColumnsFrom } from '@/lib/reports/data/tableTypes'
import { useReportMetrics, useReportMonthly, sectionMetricsFor, competitorSectionFor, platformMetricsFor } from '@/lib/reports/data/metricsContext'
import { trackerMonthsFor, trackerTableSizes, type TrackerMonth } from '@/lib/reports/data/monthlyTracker'
import { PJ, Card, CardLabel, Placeholder } from './parts'
import { useT } from '@/lib/i18n/LanguageContext'

// Kolom teks bebas (Key Highlight) mendapat ruang lebih dari kolom angka.
const NOTE_FLEX = 1.8

// Renders a configured table, matching report_2's SmartTableBlock layout: sticky
// first column (Period/Channel/…), metric columns, mono values, green/red Gap row.
function TableView({ config, accent, channel, metrics, sentiment, competitors, platform, customCols, months, editable, onChange, areaCqh }: {
  config: TableConfig; accent: string; channel: string; metrics: SectionMetrics | null; sentiment: SentimentTable | null
  competitors: CompetitorSection | null; platform: PlatformMetrics | null; customCols: TableColumn[]
  months: TrackerMonth[] | null; editable: boolean; onChange?: (next: TableConfig) => void
  /** Tinggi kartu tabel dalam % tinggi slide — dasar ukuran huruf tabel bulanan. */
  areaCqh?: number
}) {
  const t = useT()
  const { header, columns, rows } = buildTable(config, columnsForChannel(config.type, channel), metrics, sentiment, competitors, customCols, platform, months)
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'
  const flexOf = (c: TableColumn) => (c.format === 'text' ? NOTE_FLEX : 1)
  const setHighlight = (month: string, text: string) =>
    onChange?.({ ...config, highlights: { ...(config.highlights ?? {}), [month]: text } })
  // Tabel bulanan dibaca sebagai tabel utama slide, jadi hurufnya lebih besar dari
  // tabel pembanding biasa (yang cuma 3 baris di kartu yang lebih pendek).
  const big = config.type === 'monthly_tracker'
    ? trackerTableSizes(rows.length, areaCqh ?? 60, columns.filter(c => c.format !== 'text').length, columns.some(c => c.format === 'text'))
    : null
  const fs = {
    head: `${big?.head ?? 0.92}cqw`, first: `${big?.month ?? 1.05}cqw`, value: `${big?.value ?? 1.0}cqw`,
    sub: `${big?.sub ?? 0.75}cqw`, note: `${big?.note ?? 0.95}cqw`,
  }
  const firstW = big ? '11cqw' : '14cqw'
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col rounded-[0.8cqw] border" style={{ borderColor: '#eef0f2', ...PJ }}>
      {/* Header */}
      <div className="flex" style={{ background: '#f8fafb', borderBottom: `0.25cqh solid ${accent}` }}>
        <div style={{ flex: `0 0 ${firstW}`, fontSize: big ? fs.head : '1.0cqw', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0.55cqh 0.6cqw' }}>{header}</div>
        {columns.map(c => (
          <div key={c.id} className="truncate" style={{ flex: flexOf(c), minWidth: 0, textAlign: c.format === 'text' ? 'left' : 'right', fontSize: fs.head, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.01em', padding: '0.55cqh 0.45cqw' }} title={c.label}>{c.label}</div>
        ))}
      </div>
      {/* Tabel bulanan tanpa baris: masih memuat, atau bulan-bulannya memang kosong. */}
      {rows.length === 0 && (
        <div className="flex-1 flex items-center justify-center" style={{ fontSize: '1.1cqw', color: '#94a3b8' }}>
          {months === null ? t('Loading…') : t('No data for this period')}
        </div>
      )}
      {/* Rows */}
      {rows.map(r => (
        <div key={r.id} className="flex flex-1 min-h-0 items-center" style={{ borderBottom: '1px solid #f1f3f5', background: r.isGap ? '#fafbfc' : 'transparent' }}>
          <div className="truncate" style={{ flex: `0 0 ${firstW}`, fontSize: fs.first, fontWeight: 700, color: '#0f172a', padding: '0 0.6cqw' }}>{r.label}</div>
          {columns.map(c => {
            const cell = r.cells[c.id]
            if (cell.note) {
              return (
                <div key={c.id} style={{ flex: NOTE_FLEX, minWidth: 0, padding: '0 0.45cqw' }}>
                  {editable ? (
                    <input
                      value={cell.text}
                      onChange={e => setHighlight(r.id, e.target.value)}
                      placeholder={t('Add a highlight…')}
                      className="w-full bg-transparent outline-none rounded-[0.4cqw] focus:bg-[#f8fafc]"
                      style={{ fontSize: fs.note, lineHeight: 1.2, color: '#475569', padding: '0 0.3cqw', border: `1px dashed ${cell.text ? 'transparent' : '#e2e8f0'}`, ...PJ }}
                    />
                  ) : (
                    <div className="truncate" style={{ fontSize: fs.note, color: '#475569' }} title={cell.text}>{cell.text || '—'}</div>
                  )}
                </div>
              )
            }
            const color = cell.gap ? (cell.positive ? '#16a34a' : '#dc2626') : '#475569'
            return (
              <div key={c.id} className={`flex ${big?.inline ? 'flex-row items-baseline justify-end' : 'flex-col items-end'}`} style={{ flex: 1, minWidth: 0, padding: '0 0.45cqw', lineHeight: 1.15, gap: big?.inline ? '0.4cqw' : undefined, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span className="truncate max-w-full" style={{ fontSize: fs.value, fontWeight: cell.gap || big ? 700 : 500, color: big ? '#1e293b' : color, fontFamily: mono }}>
                  {cell.gap && cell.positive ? '+' : ''}{cell.text}
                </span>
                {cell.sub && (
                  <span className="truncate max-w-full" style={{ fontSize: fs.sub, fontWeight: 700, color: cell.sub.flat ? '#94a3b8' : cell.sub.positive ? '#16a34a' : '#dc2626' }}>
                    {cell.sub.text}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function TableBlock({ config, colors, channel, editable, onConfigure, onChange, areaCqh }: {
  config: TableConfig | null; colors: CoverColors; channel: string; editable: boolean
  onConfigure?: () => void
  /** Tinggi kartu ini dalam % tinggi slide (tabel bulanan menyesuaikan hurufnya). */
  areaCqh?: number
  /** Perubahan isi tabel itu sendiri (Key Highlight per bulan). */
  onChange?: (next: TableConfig) => void
}) {
  const metrics = useReportMetrics()
  const monthly = useReportMonthly()
  if (!config) return <Placeholder icon="table_chart" label="Configure data table" editable={editable} onClick={onConfigure} />
  const def = TABLE_TYPES[config.type]
  const sm = sectionMetricsFor(metrics, config.type, channel)
  const sentiment = sentimentTableFor(metrics?.sentiment, channel)
  const competitors = competitorSectionFor(metrics, channel)
  const platform = platformMetricsFor(metrics, config.type)
  const months = monthly?.data ? trackerMonthsFor(monthly.data, channel, monthly.year, monthly.month, config.fromMonth) : null
  return (
    <Card style={{ padding: '1.8cqh 1.8cqw', display: 'flex', flexDirection: 'column', gap: '1cqh' }}>
      <CardLabel icon={def?.icon ?? 'table_chart'} accent={colors.primary} onEdit={editable ? onConfigure : undefined}>{def?.label ?? 'Data table'}</CardLabel>
      <TableView config={config} accent={colors.primary} channel={channel} metrics={sm} sentiment={sentiment} competitors={competitors} platform={platform} customCols={customColumnsFrom(metrics)} months={months} editable={editable && !!onChange} onChange={onChange} areaCqh={areaCqh} />
    </Card>
  )
}
