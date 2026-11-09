// Multi-slide PPTX export — fully EDITABLE (native PowerPoint elements) while
// mirroring the on-screen preview. Cover + content slides (Section Heading,
// Standard Dashboard, Comparison) are built with pptxgenjs shapes / text /
// native charts (addChart) / native tables (addTable) — no rasterized images,
// so everything stays editable in PowerPoint.
import { fmtPct } from '@/lib/reports/data/format'
import { CoverColors, noHash, tint } from '../cover/colors'
import { CoverConfig, SLIDE_IN, addCoverSlide, addContainImage, addCoverImage, svgToPng } from './exportCover'
import { ChartConfig, resolveBarData, resolveLineData, chartSummary, groupBarSeries, SENTIMENT_PALETTES, pptxValueFormat, type ValueLabels } from '../data/chartData'
import { TableColumn, TableConfig, TABLE_TYPES, SectionMetrics, SentimentTable, CompetitorSection, PlatformMetrics, ReportTableMetrics, buildTable, columnsForChannel, sentimentTableFor, customColumnsFrom } from '../data/tableTypes'
import { cloudWordsFrom, type ReportChartMetrics, type CloudWordData } from '../data/chartTypes'
import {
  ageBucketsFor, SENTIMENT_COLOR, SENTIMENT_KEYS, SENTIMENT_LABEL, SOURCE_LABEL,
  audienceWordsFor, biggestShift, demographicChannels, demographicHeading, demographicsFor, demographicHistory, shortMonth, sentimentFor,
  taggedFor, taggedChange, fmtTaggedDate, TAGGED_COUNTS,
  type ReportAudienceMetrics, type SentimentBlock, type SourceFilter,
} from '../data/audienceTypes'
import { computeWordCloud, WC_W, WC_H, WC_FONT } from '../data/wordcloudLayout'
import { KpiMetric, ReportKpiMetrics, deltaIsGood, resolveKpiMetric } from '../data/kpiMetrics'
import {
  KPI_TARGET_MAX, KpiTarget, ReportKpiTargets, fmtKpiValue, fmtKpiPeriod, fmtKpiRate,
  kpiCardTitle, kpiOnPace, kpiTargetById, kpiTargetLabel, kpiTargetsFor,
} from '../data/kpiTargets'
import {
  ReportYtdMetrics, fmtYtdGrowth, fmtYtdPct, fmtYtdPrior, fmtYtdPriorRange, fmtYtdRange, fmtYtdRow,
  ytdChannelFor, ytdDelta, ytdLabel, ytdRowFor,
} from '../data/ytdMetrics'
import { trackerMonthsFor, trackerTableSizes, type ReportMonthlyTracker } from '../data/monthlyTracker'
import { buildPosts, cardMetricLabel, populatedMetricsFor, effectiveSortMetric, effectiveShownMetrics, availableFilterIds, effectiveFilterId, competitorPoolFor, type ReportPostMetrics, type CompetitorPostPool, activityPool, effectiveActivityMetrics, SHOWCASE_GEOM, SHOWCASE_PER_ROW, buildShowcase, effectiveShowcaseGroups, metricLabel, showcaseGeometry, showcaseLabel, showcaseLongest, showcaseMetricFs, showcaseShownMetrics } from '../data/posts'
import type { ImageResolver } from '../images/client'
import { PLATFORM_META, type DashPlatform } from '@/components/dashboard/data'
import { sectionMetricsFor, platformMetricsFor } from '../data/metricsContext'
import type { ContentSlide, SlideChrome, AiInsight } from '../data/slideModel'
import { usesKpiLayout, kpiRatesFor, type KpiRate } from '../data/slideModel'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Slide = any

const S = SLIDE_IN
let PJ = 'Calibri'          // report font (set per export); MONO stays for table numbers
// Data tabel "Monthly Tracker" untuk export ini (di-set per export, sama seperti PJ).
// tableCard membacanya langsung supaya semua slide yang memasang tabel bulanan —
// Dashboard, Overview, Monthly Tracker — tidak perlu parameter tambahan satu per satu.
let MONTHLY: { data: ReportMonthlyTracker | null; year: number; month: number } | null = null
/** Data YTD report — untuk tabel 'YTD Metric' di slide mana pun (diisi di exportReportPptx). */
let YTD: ReportYtdMetrics | null = null
const MONO = 'Consolas'
/** Margin sel tabel data (inci: atas, kanan, bawah, kiri) — lebih sempit dari bawaan
 *  pptxgenjs (0.1" kiri-kanan) supaya angka panjang muat tanpa huruf jadi terlalu kecil. */
const CELL_MARGIN: [number, number, number, number] = [0.04, 0.06, 0.04, 0.06]

// cq → inches / points (slide is 13.333in × 7.5in = 960pt × 540pt)
const W = (cqw: number) => (cqw / 100) * S.w
const H = (cqh: number) => (cqh / 100) * S.h
const FS = (cqw: number) => Math.max(6, Math.round((cqw / 100) * 960 * 10) / 10)

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null // not an image (e.g. an HTML page) → caller falls back
    return await new Promise(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}


// Sumbu nilai seperti pratinjau ("150K", "1.2M"); dulu angka mentah "140000".
// Bagian ketiga General supaya sumbu persen/rasio kecil (2.5) tidak dibulatkan.
const AXIS_FMT = '[>=1000000]0.0,,"M";[>=1000]0,"K";General'

function card(slide: Slide, x: number, y: number, w: number, h: number) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.07, fill: { color: 'FFFFFF' }, line: { color: 'E8EBEE', width: 0.75 } })
}

function placeholder(slide: Slide, x: number, y: number, w: number, h: number, label: string) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.06, fill: { color: 'FFFFFF', transparency: 55 }, line: { color: 'CBD5E1', width: 1, dashType: 'dash' } })
  slide.addText(label, { x, y, w, h, align: 'center', valign: 'middle', fontSize: FS(1.5), bold: true, color: '94A3B8', charSpacing: 1, fontFace: PJ })
}

// Empty state inside a card — for real blocks with no data in the brand+period (never dummy).
function noDataText(slide: Slide, x: number, y: number, w: number, h: number, label = 'No data for this period') {
  slide.addText(label, { x, y, w, h, align: 'center', valign: 'middle', fontSize: FS(1.3), bold: true, color: 'B6BCC4', fontFace: PJ })
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

const whashStr = (str: string) => { let v = 0; for (let i = 0; i < str.length; i++) v = (v * 31 + str.charCodeAt(i)) >>> 0; return (v % 1000) / 1000 }
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Build the word cloud as an SVG (rasterized to PNG for export) — packed by the
// same d3-cloud layout as the on-screen preview, scaled from the fixed layout box
// into the target pixels, so preview and export match.
function wordCloudSvg(cloud: CloudWordData[], cw: number, ch: number): string {
  const placed = computeWordCloud(cloud)
  let body = ''
  for (const p of placed) {
    const pal = SENTIMENT_PALETTES[p.sentiment]
    const color = pal[Math.floor(whashStr(p.word + 'c') * pal.length)]
    const transform = `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})${p.rotate ? ` rotate(${p.rotate})` : ''}`
    body += `<text transform="${transform}" font-family="${WC_FONT}" font-weight="${p.weight}" font-size="${p.fontSize.toFixed(1)}" fill="${color}" text-anchor="middle">${xmlEsc(p.word)}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${WC_W} ${WC_H}">${body}</svg>`
}

// Native data labels for a chart's value-label mode (deck slide 15) — the same
// "1,234" / "1.2K" / "#.##%" the preview draws, as an Excel number format so the
// chart stays editable in PowerPoint.
function dataLabelOpts(pct: boolean | undefined, mode: ValueLabels | undefined, position: 'outEnd' | 't') {
  if (!mode || mode === 'none') return {}
  return {
    showValue: true, dataLabelPosition: position, dataLabelFormatCode: pptxValueFormat(pct, mode),
    dataLabelFontSize: FS(0.85), dataLabelFontFace: PJ, dataLabelFontBold: true, dataLabelColor: '475569',
  }
}

async function chartCard(
  pptx: any, slide: Slide, config: ChartConfig | null, colors: CoverColors,
  x: number, y: number, w: number, h: number, placeholderLabel = 'MAIN CHART AREA',
  chartMetrics?: ReportChartMetrics | null, channel = 'instagram',
) {
  if (!config) { placeholder(slide, x, y, w, h, placeholderLabel); return }
  card(slide, x, y, w, h)
  const pad = W(1.6)
  const labelOf = (id: string) => chartMetrics?.customMetrics?.find(c => c.id === id)?.label
  slide.addText(chartSummary(config, labelOf).toUpperCase(), { x: x + pad, y: y + H(1.6), w: w - 2 * pad, h: H(3), fontSize: FS(1.2), bold: true, color: '94A3B8', fontFace: PJ })

  const cy = y + H(5), ch = h - H(6.6)
  if (config.chartType === 'wordcloud') {
    // Real words scoped to brand+period, colored by post sentiment; empty → No data.
    const cloud = cloudWordsFrom(chartMetrics ?? null, channel, config.sentiment)
    if (!cloud.length) { noDataText(slide, x + pad, cy, w - 2 * pad, ch); return }
    const bw = w - 2 * pad
    const pxW = 900, pxH = Math.max(1, Math.round(pxW * (ch / bw)))
    const png = await svgToPng(wordCloudSvg(cloud, pxW, pxH), pxW, pxH)
    slide.addImage({ data: png, x: x + pad, y: cy, w: bw, h: ch })
    return
  }

  const box = { x: x + pad, y: cy, w: w - 2 * pad, h: ch }
  const legend = { showLegend: true, legendPos: 't', legendFontSize: FS(1.1), legendColor: '64748B', legendFontFace: PJ, showTitle: false }
  const catAxis = { catAxisLabelColor: '94A3B8', catAxisLabelFontSize: FS(1.0), catAxisLabelFontFace: PJ }

  // Bars — SMALL MULTIPLES: one mini bar chart per metric, each with its own real
  // value axis (true units; matches the preview).
  if (config.chartType === 'bar') {
    const { labels, series } = resolveBarData(config, chartMetrics ?? null, channel, colors)
    if (!series.length) { noDataText(slide, box.x, box.y, box.w, box.h); return }
    // One mini chart per group: a plain metric is its own group, while a period
    // comparison groups that metric's two months into one clustered chart.
    const groups = groupBarSeries(series)
    const gap = W(1.2), titleH = H(3.2)
    const subW = (box.w - gap * (groups.length - 1)) / groups.length
    groups.forEach((g, i) => {
      const sx = box.x + i * (subW + gap)
      const paired = g.series.length > 1
      slide.addText(g.title.toUpperCase(), { x: sx, y: box.y, w: subW, h: titleH, align: 'center', fontSize: FS(1.05), bold: true, color: '64748B', fontFace: PJ })
      slide.addChart('bar', g.series.map(s => ({ name: s.name, labels, values: s.data })), {
        x: sx, y: box.y + titleH, w: subW, h: box.h - titleH,
        showLegend: paired, legendPos: 'b', legendFontSize: FS(1.0), legendColor: '94A3B8', legendFontFace: PJ,
        showTitle: false, ...catAxis, chartColors: g.series.map(s => noHash(s.color)),
        valAxisMinVal: g.series[0].scale.min, valAxisMaxVal: g.series[0].scale.max,
        valGridLine: { style: 'solid', size: 1, color: 'F1F3F5' }, catGridLine: { style: 'none' },
        valAxisLabelColor: 'B6BCC4', valAxisLabelFontSize: FS(1.0), valAxisLabelFontFace: PJ, valAxisLabelFormatCode: AXIS_FMT,
        barDir: config.barOrientation === 'horizontal' ? 'bar' : 'col',
        barGrouping: 'clustered', barGapWidthPct: 20,
        ...dataLabelOpts(g.series[0].pct, config.valueLabels, 'outEnd'),
      })
    })
    return
  }

  // Line — real data (dual-axis for 2 metrics so each keeps a readable scale).
  const { labels, series } = resolveLineData(config, chartMetrics ?? null, channel, colors)
  if (!series.length) { noDataText(slide, box.x, box.y, box.w, box.h); return }
  const sentiment = !!config.metrics?.includes('sentiments')
  const lineStyle = { lineSize: 2.25, lineDataSymbol: 'none' as const, lineSmooth: false }
  // Label harian (30-an titik) dijarangkan sama seperti sampleLabels di pratinjau
  // (~7 label) dan tetap mendatar — label "05 Sep" yang panjang membuat PowerPoint
  // memiringkan atau menumpuk semuanya.
  const lineCat = labels.length > 8
    ? { ...catAxis, catAxisLabelFrequency: String(Math.ceil(labels.length / 7)), catAxisLabelRotate: 0 }
    : catAxis

  if (series.length === 2 && !sentiment) {
    const [a, b] = series
    slide.addChart(
      [
        { type: 'line', data: [{ name: a.name, labels, values: a.data }], options: { chartColors: [noHash(a.color)], ...lineStyle, ...dataLabelOpts(a.pct, config.valueLabels, 't') } },
        { type: 'line', data: [{ name: b.name, labels, values: b.data }], options: { chartColors: [noHash(b.color)], ...lineStyle, ...dataLabelOpts(b.pct, config.valueLabels, 't'), secondaryValAxis: true, secondaryCatAxis: true } },
      ],
      {
        ...box, ...legend,
        valAxes: [
          { valAxisMinVal: a.scale.min, valAxisMaxVal: a.scale.max, valAxisLabelColor: noHash(a.color), valAxisLabelFontSize: FS(1.0), valAxisLabelFontFace: PJ, valAxisLabelFormatCode: AXIS_FMT, valGridLine: { style: 'solid', size: 1, color: 'F1F3F5' } },
          { valAxisMinVal: b.scale.min, valAxisMaxVal: b.scale.max, valAxisLabelColor: noHash(b.color), valAxisLabelFontSize: FS(1.0), valAxisLabelFontFace: PJ, valAxisLabelFormatCode: AXIS_FMT, valGridLine: { style: 'none' } },
        ],
        catAxes: [
          { ...lineCat, catGridLine: { style: 'none' } },
          { catAxisHidden: true },
        ],
      },
    )
    return
  }

  // Single metric (or sentiments' 3 shared-scale series).
  const scale = series[0]?.scale ?? { min: 0, max: 100 }
  slide.addChart('line', series.map(s => ({ name: s.name, labels, values: s.data })), {
    ...box, ...legend, ...lineCat, ...lineStyle, chartColors: series.map(s => noHash(s.color)),
    valAxisMinVal: scale.min, valAxisMaxVal: scale.max,
    valGridLine: { style: 'solid', size: 1, color: 'F1F3F5' }, catGridLine: { style: 'none' },
    valAxisLabelColor: 'B6BCC4', valAxisLabelFontSize: FS(1.0), valAxisLabelFontFace: PJ, valAxisLabelFormatCode: AXIS_FMT,
    ...dataLabelOpts(series[0]?.pct, config.valueLabels, 't'),
  })
}

/** Split "**bold**" markers into pptx text runs. */
function boldRuns(text: string): { text: string; options: { bold: boolean } }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(s => s !== '').map(p =>
    p.startsWith('**') && p.endsWith('**') ? { text: p.slice(2, -2), options: { bold: true } } : { text: p, options: { bold: false } })
}

/** Largest font (pt, ≤ basePt) that fits `len` chars into a wIn×hIn inch box. Conservative → never clips. */
function fitFontPt(len: number, wIn: number, hIn: number, basePt: number): number {
  for (let pt = basePt; pt > basePt * 0.5; pt -= 0.5) {
    const cpl = Math.max(6, Math.floor(wIn / ((pt * 0.55) / 72)))  // ~0.55em average char width
    const lines = Math.ceil(len / cpl)
    if (lines * ((pt * 1.34) / 72) <= hIn) return pt                // 1.34 line-height
  }
  return Math.max(6, basePt * 0.5)
}

function insightsCard(slide: Slide, content: { text: string; ai: AiInsight | null }, x: number, y: number, w: number, h: number, label: string) {
  const ai = content.ai
  const hasAi = !!ai && !!ai.analysis
  if (!hasAi && !content.text) { placeholder(slide, x, y, w, h, label === 'KEY INSIGHTS' ? 'AI KEY INSIGHTS' : label); return }
  card(slide, x, y, w, h)
  const pad = W(1.6)
  slide.addText(label, { x: x + pad, y: y + H(1.6), w: w - 2 * pad, h: H(3), fontSize: FS(1.2), bold: true, color: '1E4F49', fontFace: PJ })

  const bodyW = w - 2 * pad
  const bodyH = h - H(6)
  const bodyOpts = { x: x + pad, y: y + H(5), w: bodyW, h: bodyH, align: 'left' as const, valign: 'top' as const, fit: 'shrink' as const, fontFace: PJ }
  if (hasAi) {
    // Deterministically size the paragraph to fit the box so it never clips in the PPTX.
    const pt = fitFontPt(ai!.analysis.length, bodyW, bodyH, FS(1.5))
    const runs = boldRuns(ai!.analysis).map(r => ({ text: r.text, options: { bold: r.options.bold, color: r.options.bold ? '0F172A' : '475569', fontSize: pt } }))
    slide.addText(runs, { ...bodyOpts, lineSpacingMultiple: 1.15 })
  } else {
    slide.addText(content.text, { ...bodyOpts, fontSize: FS(1.45), color: '475569', lineSpacingMultiple: 1.3 })
  }
}

// Resolve the real metric sub-map for a table on a channel.
//
// Meneruskan ke resolver yang sama dengan yang dipakai pratinjau, bukan menyalin
// aturannya. Salinan sebelumnya sudah membuktikan kenapa: `cross_by_platform`
// tidak pernah ditambahkan ke platformFor() di bawah, jadi tabel itu benar di
// layar tapi keluar sebagai "—" di PPTX tanpa ada yang menyadarinya. Satu
// sumber aturan berarti tabel baru cukup didaftarkan sekali.
function sectionFor(metrics: ReportTableMetrics | undefined, config: TableConfig | null, channel: string): SectionMetrics | null {
  if (!metrics || !config) return null
  return sectionMetricsFor(metrics, config.type, channel)
}

// The Brand-vs-Competitor section for a table on a channel (export side).
function competitorFor(metrics: ReportTableMetrics | undefined, config: TableConfig | null, channel: string): CompetitorSection | null {
  if (!metrics?.competitors || !config) return null
  return metrics.competitors[channel as DashPlatform] ?? null
}

// Per-platform values for the by-Platform tables (export side) — resolver yang sama
// dengan pratinjau, termasuk perakitan 'ct:'/'ch:' milik Cross-Level by Platform.
function platformFor(metrics: ReportTableMetrics | undefined, config: TableConfig | null): PlatformMetrics | null {
  if (!metrics || !config) return null
  return platformMetricsFor(metrics, config.type)
}
// Nilai periode sebelumnya — hanya kalau opsi growth tabel menyala.
function platformPrevFor(metrics: ReportTableMetrics | undefined, config: TableConfig | null): PlatformMetrics | null {
  if (!metrics || !config?.showGrowth) return null
  return platformMetricsFor(metrics, config.type, 'prev')
}

function tableCard(slide: Slide, config: TableConfig | null, colors: CoverColors, channel: string, x: number, y: number, w: number, h: number, sm: SectionMetrics | null = null, sent: SentimentTable | null = null, comp: CompetitorSection | null = null, customCols: TableColumn[] = [], platform: PlatformMetrics | null = null, platformPrev: PlatformMetrics | null = null) {
  if (!config) { placeholder(slide, x, y, w, h, 'CONFIGURE DATA TABLE'); return }
  card(slide, x, y, w, h)
  const pad = W(1.6)
  const def = TABLE_TYPES[config.type]
  slide.addText((def?.label ?? 'Data table').toUpperCase(), { x: x + pad, y: y + H(1.4), w: w - 2 * pad, h: H(3), fontSize: FS(1.2), bold: true, color: '94A3B8', fontFace: PJ })

  const months = config.type === 'monthly_tracker' && MONTHLY?.data
    ? trackerMonthsFor(MONTHLY.data, channel, MONTHLY.year, MONTHLY.month, config.fromMonth)
    : null
  const ytd = config.type === 'ytd_metrics' ? ytdChannelFor(YTD, channel) : null
  const { header, columns, rows } = buildTable(config, columnsForChannel(config.type, channel, ytd), sm, sent, comp, customCols, platform, months, platformPrev, ytd)
  if (config.type === 'monthly_tracker' && rows.length === 0) { noDataText(slide, x + pad, y + H(4.8), w - 2 * pad, h - H(6)); return }
  // Huruf tabel bulanan = ukuran preview (trackerTableSizes), selain itu ukuran tabel biasa.
  const big = config.type === 'monthly_tracker'
    // Margin atas+bawah sel PowerPoint (CELL_MARGIN) ikut memakan tinggi tiap baris,
    // padahal pratinjau tidak punya — tanpa dikurangi, tabel 10+ bulan memanjang
    // melewati kartunya dan baris terakhir menimpa footer.
    ? trackerTableSizes(rows.length, (h / S.h) * 100 - (rows.length + 1) * ((CELL_MARGIN[0] + CELL_MARGIN[2] + 0.02) / S.h) * 100, columns.filter(c => c.format !== 'text').length, columns.some(c => c.format === 'text'))
    : null
  const tw = w - 2 * pad
  const firstW = tw * (big ? 0.12 : 0.18)
  // Kolom teks (Key Highlight) 1.8× lebar kolom angka — sama dengan preview.
  const weight = (c: TableColumn) => (c.format === 'text' ? 1.8 : 1)
  const totalWeight = columns.reduce((a, c) => a + weight(c), 0) || 1
  const colW = [firstW, ...columns.map(c => ((tw - firstW) * weight(c)) / totalWeight)]
  const fsz = { head: FS(big?.head ?? 1.0), first: FS(big?.month ?? 1.05), value: FS(big?.value ?? 1.0), sub: FS(big?.sub ?? 0.75), note: FS(big?.note ?? 0.95) }
  // Auto-fit (Post-UAT brief "Overlap Shapes in Table Slide"): PowerPoint memecah
  // angka yang tidak muat di tengah ("15,242, / 236") dan kata header di tengah
  // ("Comment / s"). Huruf diperkecil sampai angka terpanjang muat satu baris dan
  // kata header terpanjang tidak terpotong. Header tetap boleh dua baris antar kata.
  const numCols = columns.map((c, i) => ({ c, w: colW[i + 1] })).filter(({ c }) => c.format !== 'text')
  if (numCols.length) {
    // Lebar yang tersedia = kolom − margin sel kiri+kanan (CELL_MARGIN) − sedikit
    // cadangan untuk penampil yang mengganti Consolas dengan font mono lain (WPS,
    // Google Slides). Dulu hanya 0.1" yang dikurangi padahal margin bawaan
    // pptxgenjs 0.1" per sisi, jadi "18,605,418" tetap patah jadi dua baris.
    const fitPt = (widthIn: number, chars: number, em: number) => ((widthIn - CELL_MARGIN[1] - CELL_MARGIN[3] - 0.04) * 72) / (Math.max(1, chars) * em)
    const valueFit = Math.min(...numCols.map(({ c, w: cw }) =>
      fitPt(cw, Math.max(...rows.map(r => {
        const cell = r.cells[c.id]
        // Growth di samping angka ikut memakan lebar baris yang sama.
        return (cell?.text ?? '').length + (cell?.sub?.inline ? cell.sub.text.length + 1 : 0)
      })), 0.62)))   // mono ≈ 0.6em
    const headFit = Math.min(...numCols.map(({ c, w: cw }) =>
      fitPt(cw, Math.max(...c.label.split(/[\s]+/).map(word => word.length)), 0.68)))     // caps bold ≈ 0.68em
    fsz.value = Math.max(6, Math.floor(Math.min(fsz.value, valueFit) * 10) / 10)
    fsz.head = Math.max(6, Math.floor(Math.min(fsz.head, headFit) * 10) / 10)
  }
  const headOpt = { bold: true, color: '94A3B8', fontSize: fsz.head, fill: { color: 'F8FAFB' }, valign: 'middle' as const }
  const headRow = [
    { text: header, options: { ...headOpt, align: 'left' as const } },
    ...columns.map(c => ({ text: c.label, options: { ...headOpt, align: c.format === 'text' ? 'left' as const : 'right' as const } })),
  ]
  const bodyRows = rows.map(r => [
    { text: r.label, options: { bold: true, color: '0F172A', align: 'left' as const, fontSize: fsz.first, valign: 'middle' as const, fill: r.isGap ? { color: 'FAFBFC' } : undefined } },
    ...columns.map(c => {
      const cell = r.cells[c.id]
      // Key Highlight — teks bebas, rata kiri, bukan font angka.
      if (cell.note) return { text: cell.text || '—', options: { align: 'left' as const, color: '475569', fontSize: fsz.note, valign: 'middle' as const } }
      const color = cell.gap ? (cell.flat ? '0F172A' : cell.positive ? '16A34A' : 'DC2626') : '475569'
      const value = cell.text
      // Perubahan MoM (tabel bulanan) = baris kedua kecil di sel yang sama.
      if (cell.sub) {
        const subColor = cell.sub.flat ? '94A3B8' : cell.sub.positive ? '16A34A' : 'DC2626'
        return {
          text: [
            { text: big?.inline || cell.sub.inline ? `${value} ` : value, options: { color: big ? '1E293B' : color, bold: !!big, fontSize: fsz.value, fontFace: MONO, breakLine: !(big?.inline || cell.sub.inline) } },
            { text: cell.sub.text, options: { color: subColor, bold: true, fontSize: fsz.sub } },
          ],
          options: { align: 'right' as const, valign: 'middle' as const },
        }
      }
      return { text: value, options: { align: 'right' as const, color: big ? '1E293B' : color, bold: !!cell.gap || !!big, fontSize: fsz.value, fontFace: MONO, valign: 'middle' as const, fill: r.isGap ? { color: 'FAFBFC' } : undefined } }
    }),
  ])

  slide.addTable([headRow, ...bodyRows], {
    x: x + pad, y: y + H(4.8), w: tw, h: h - H(6),
    colW, fontFace: PJ, autoPage: false, margin: CELL_MARGIN,
    border: { type: 'solid', color: 'F1F3F5', pt: 0.5 },
  })
}

async function channelBadge(slide: Slide, channel: string, headerRight: number, headerY: number) {
  // "All channels" — a compact right-aligned row of every platform logo.
  if (channel === 'all') {
    const size = H(5), gap = W(0.6)
    const ids: DashPlatform[] = ['instagram', 'facebook', 'tiktok']
    const y = headerY + (H(12) - size) / 2
    let x = headerRight - (size * ids.length + gap * (ids.length - 1))
    for (const p of ids) {
      const logo = await toDataUrl(PLATFORM_META[p].logo)
      if (logo) await addContainImage(slide, logo, x, y, size, size, 'center')
      x += size + gap
    }
    return
  }
  const meta = PLATFORM_META[channel as keyof typeof PLATFORM_META]
  if (!meta) return
  const logo = await toDataUrl(meta.logo)
  if (!logo) return
  // Logo only — no background, no label.
  const size = H(7)
  await addContainImage(slide, logo, headerRight - size, headerY + (H(12) - size) / 2, size, size, 'right')
}

function dashboardHeader(slide: Slide, title: string, colors: CoverColors) {
  const hx = W(4), hy = H(4), hw = W(92), hh = H(12)
  card(slide, hx, hy, hw, hh)
  slide.addShape('rect', { x: hx, y: hy, w: W(0.7), h: hh, fill: { color: noHash(colors.primary) } })
  slide.addText(title || 'Untitled slide', { x: hx + W(2), y: hy, w: hw - W(22), h: hh, valign: 'middle', fontSize: FS(2.8), bold: true, color: '0F172A', fontFace: PJ })
  return { hx, hy, hw, hh }
}

async function footer(slide: Slide, chrome: SlideChrome, colors: CoverColors, x: number, y: number, w: number) {
  const fy = y + H(0.8), fh = H(6)
  // Left — logo (no box) · period
  let lx = x
  if (chrome.logoDataUrl) {
    const lw = await addContainImage(slide, chrome.logoDataUrl, lx, fy, W(14), fh, 'left')
    lx += lw + W(1.4)
  } else {
    slide.addText(chrome.brandName.slice(0, 2).toUpperCase(), { x: lx, y: fy, w: W(6), h: fh, valign: 'middle', fontSize: FS(1.9), bold: true, color: noHash(colors.primary), fontFace: PJ })
    lx += W(6)
  }
  slide.addShape('ellipse', { x: lx, y: fy + fh / 2 - W(0.45), w: W(0.9), h: W(0.9), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  slide.addText(chrome.period, { x: lx + W(1.6), y: fy, w: W(30), h: fh, valign: 'middle', fontSize: FS(1.5), color: '475569', fontFace: PJ })

  // Center — prepared by
  if (chrome.preparedBy) {
    slide.addText(
      [
        { text: 'Powered by\n', options: { fontSize: FS(1.05), color: '94A3B8' } },
        { text: chrome.preparedBy, options: { fontSize: FS(1.3), bold: true, color: '475569' } },
      ],
      { x: x + w / 2 - W(20), y: fy, w: W(40), h: fh, align: 'center', valign: 'middle', fontFace: PJ, lineSpacingMultiple: 1.05 },
    )
  }

  // Right — page (no pill)
  slide.addText(
    [
      { text: String(chrome.pageNumber), options: { color: noHash(colors.primary), bold: true } },
      { text: '  /  ', options: { color: 'CBD5E1' } },
      { text: String(chrome.totalPages), options: { color: '94A3B8' } },
    ],
    { x: x + w - W(16), y: fy, w: W(16), h: fh, align: 'right', valign: 'middle', fontSize: FS(1.5), fontFace: PJ },
  )
}

/* ── Slide builders ──────────────────────────────────────────────────────── */

async function addSectionSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors) {
  const s = pptx.addSlide()
  const bgPng = await svgToPng(chrome.template.background(colors, chrome.mode), 1280 * 2, 720 * 2)
  s.addImage({ data: bgPng, x: 0, y: 0, w: S.w, h: S.h })
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: S.h, fill: { color: chrome.mode === 'dark' ? '000000' : 'FFFFFF', transparency: chrome.mode === 'dark' ? 82 : 78 }, line: { type: 'none' } })
  const text = noHash(chrome.template.textColor(colors, chrome.mode))
  s.addText('SECTION', { x: 0, y: H(35), w: S.w, h: H(5), align: 'center', fontSize: FS(1.5), bold: true, color: text, charSpacing: 6, fontFace: PJ })
  s.addShape('rect', { x: S.w / 2 - W(3.5), y: H(43.5), w: W(7), h: H(0.6), fill: { color: text }, line: { type: 'none' } })
  s.addText(slide.title || 'Section Title', { x: W(8), y: H(45), w: S.w - W(16), h: H(16), align: 'center', valign: 'middle', fontSize: FS(7), bold: true, color: text, fontFace: PJ })
  if (slide.body) s.addText(slide.body, { x: W(15), y: H(64), w: S.w - W(30), h: H(8), align: 'center', fontSize: FS(2.4), color: text, fontFace: PJ })
}

async function addDashboardSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, metrics?: ReportTableMetrics, chartMetrics?: ReportChartMetrics) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const ry = H(18), rh = H(37)
  const chartW = W(58.4), insW = W(31.6)
  await chartCard(pptx, s, slide.chart, colors, hx, ry, chartW, rh, 'MAIN CHART AREA', chartMetrics, slide.channel)
  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx + chartW + W(2), ry, insW, rh, 'KEY INSIGHTS')
  tableCard(s, slide.table, colors, slide.channel, hx, H(57), hw, H(30), sectionFor(metrics, slide.table, slide.channel), sentimentTableFor(metrics?.sentiment, slide.channel), competitorFor(metrics, slide.table, slide.channel), customColumnsFrom(metrics), platformFor(metrics, slide.table), platformPrevFor(metrics, slide.table))
  await footer(s, chrome, colors, hx, H(89), hw)
}

async function addComparisonSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, chartMetrics?: ReportChartMetrics) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const cy = H(18), chH = H(45), cw = W(45)
  await chartCard(pptx, s, slide.chartA, colors, hx, cy, cw, chH, 'PERIOD A / SEGMENT A', chartMetrics, slide.channel)
  await chartCard(pptx, s, slide.chartB, colors, hx + cw + W(2), cy, cw, chH, 'PERIOD B / SEGMENT B', chartMetrics, slide.channel)
  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx, H(65), hw, H(22), 'COMPARATIVE ANALYSIS & NOTES')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

function scorecard(slide: Slide, metric: KpiMetric | undefined, accent: string, count: number, x: number, y: number, w: number, h: number, meta?: string, caption?: string, emptyLabel = 'ADD METRIC', noDeltaLabel = 'no prior-period data') {
  if (!metric) { placeholder(slide, x, y, w, h, emptyLabel); return }
  card(slide, x, y, w, h)
  slide.addShape('rect', { x, y, w, h: H(0.5), fill: { color: noHash(accent) }, line: { type: 'none' } })
  const pad = W(1.2)
  const valueCqw = count <= 4 ? 2.5 : count === 5 ? 2.1 : 1.8
  slide.addText(metric.label.toUpperCase(), { x: x + pad, y: y + H(1.8), w: w - 2 * pad, h: H(2.4), fontSize: FS(0.95), bold: true, color: '94A3B8', fontFace: PJ })
  slide.addText(metric.value, { x: x + pad, y: y + H(5), w: w - 2 * pad, h: H(5), fontSize: FS(valueCqw), bold: true, color: '0F172A', fontFace: PJ })
  const good = deltaIsGood(metric)
  const arrow = metric.delta >= 0 ? '▲' : '▼'
  const trend = metric.hasDelta === false
    ? [{ text: noDeltaLabel, options: { color: '94A3B8' } }]
    : [
        { text: `${arrow} ${fmtPct(Math.abs(metric.delta))}  `, options: { color: good ? '16A34A' : 'DC2626', bold: true } },
        { text: caption ?? 'vs last period', options: { color: '94A3B8' } },
      ]
  // Baris meta (YTD: sejak kapan) menggeser badge deltanya turun, sama seperti
  // di preview yang menyisipkannya di antara nilai dan badge.
  if (meta) slide.addText(meta, { x: x + pad, y: y + H(10.4), w: w - 2 * pad, h: H(2.4), fontSize: FS(0.85), color: '94A3B8', fontFace: PJ })
  slide.addText(trend, { x: x + pad, y: y + (meta ? H(13.8) : H(11.8)), w: w - 2 * pad, h: H(3), fontSize: FS(0.95), fontFace: PJ })
}

/**
 * Kartu satu KPI brand. Cerminan TargetCard di preview: capaian, lalu target +
 * periodenya, lalu achievement & run rate — tanpa delta "vs periode lalu", yang
 * tidak punya arti untuk sebuah target (lihat kpiTargets.ts).
 */
function targetCard(slide: Slide, target: KpiTarget, accent: string, count: number, rates: KpiRate[], x: number, y: number, w: number, h: number, channel = '') {
  card(slide, x, y, w, h)
  slide.addShape('rect', { x, y, w, h: H(0.5), fill: { color: noHash(accent) }, line: { type: 'none' } })
  const pad = W(1.2)
  const bw = w - 2 * pad
  const valueCqw = count <= 3 ? 2.4 : count === 4 ? 2.1 : count === 5 ? 1.85 : 1.6
  const metaFs = FS(count >= 6 ? 0.64 : count === 5 ? 0.7 : count === 4 ? 0.75 : 0.8)
  const rateFs = FS(count >= 6 ? 0.72 : count === 5 ? 0.78 : count === 4 ? 0.82 : 0.88)

  slide.addText(kpiCardTitle(target, channel, kpiTargetLabel(target.metric)).toUpperCase(), { x: x + pad, y: y + H(1.6), w: bw, h: H(2.4), fontSize: FS(count >= 6 ? 0.8 : 0.95), bold: true, color: '94A3B8', fontFace: PJ })
  slide.addText(fmtKpiValue(target.metric, target.achieved), { x: x + pad, y: y + H(4.6), w: bw, h: H(5), fontSize: FS(valueCqw), bold: true, color: '0F172A', fontFace: PJ })
  slide.addText(
    `Target ${target.operation} ${fmtKpiValue(target.metric, target.target)}  ·  ${fmtKpiPeriod(target.startDate, target.endDate)}`,
    { x: x + pad, y: y + H(10), w: bw, h: H(2.2), fontSize: metaFs, color: '94A3B8', fontFace: PJ },
  )

  // Dua baris "label — nilai"; labelnya rata kiri, angkanya rata kanan di kotak
  // yang sama lebarnya, supaya keduanya sejajar seperti di preview.
  const rateColor = target.achievementRate == null ? '94A3B8' : kpiOnPace(target) ? '16A34A' : 'DC2626'
  const solo = !rates.includes('achievement')
  const all: [KpiRate, string, string, string, boolean][] = [
    ['achievement', 'Achievement', fmtKpiRate(target.achievementRate), rateColor, true],
    ['run', 'Run rate', fmtKpiRate(target.runRate), solo ? rateColor : '475569', solo],
    ['time', 'Time gone', fmtKpiRate(target.timeGone), '94A3B8', false],
  ]
  const rows = all.filter(([id]) => rates.includes(id)).map(([, ...rest]) => rest)
  // Tiga baris harus muat di kartu H(20): 12.6 + 3 × 2.35 = 19.65.
  rows.forEach(([label, value, color, bold], i) => {
    const ry = y + H(12.6) + i * H(2.35)
    slide.addText(label, { x: x + pad, y: ry, w: bw, h: H(2.4), fontSize: rateFs, color: '94A3B8', align: 'left', fontFace: PJ })
    slide.addText(value, { x: x + pad, y: ry, w: bw, h: H(2.4), fontSize: rateFs, bold, color, align: 'right', fontFace: PJ })
  })
}

async function addKpiSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, chartMetrics?: ReportChartMetrics, kpiMetrics?: ReportKpiMetrics, metrics?: ReportTableMetrics, kpiTargets?: ReportKpiTargets, ytdMetrics?: ReportYtdMetrics) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  // KPI Overview menggambar target KPI brand; Dashboard Overview menggambar
  // scorecard metrik dashboard. Barisnya beda tinggi, jadi chart di bawahnya
  // ikut bergeser — persis seperti ROW_H di preview.
  const isTargets = slide.type === 'kpi'
  const isYtd = slide.type === 'ytd'
  const ytdMatrix = isYtd && (slide.ytdView ?? 'matrix') === 'matrix'
  const ry = H(18), rh = ytdMatrix ? H(30) : isTargets || isYtd ? H(20) : H(17)

  if (ytdMatrix) {
    ytdMatrixTable(s, slide, ytdMetrics ?? null, colors, hx, ry, hw, rh)
  } else if (isYtd) {
    const section = ytdChannelFor(ytdMetrics ?? null, slide.channel)
    if (!section || section.rows.length === 0) {
      placeholder(s, hx, ry, hw, rh, 'NO YTD PERIOD FOR THIS CHANNEL')
    } else {
      const n = Math.max(1, slide.metricCount)
      const gap = n >= 6 ? W(1) : W(1.6)
      const cardW = (hw - gap * (n - 1)) / n
      const range = fmtYtdRange(section.window)
      const caption = `vs ${fmtYtdPriorRange(section.window)}`
      for (let i = 0; i < n; i++) {
        const row = ytdRowFor(ytdMetrics ?? null, slide.channel, slide.kpiMetrics[i] ?? null)
        const delta = row ? ytdDelta(row) : null
        scorecard(
          s,
          row ? {
            key: row.metric, label: ytdLabel(row.metric), icon: '',
            value: fmtYtdRow(row), delta: delta ?? 0,
            positiveIsGood: true, hasDelta: delta != null,
          } : undefined,
          colors.primary, n, hx + i * (cardW + gap), ry, cardW, rh,
          row ? `${range} · ${fmtYtdPct(row.runRate)}` : undefined,
          caption, 'ADD YTD METRIC', 'no prior-year data',
        )
      }
    }
  } else if (isTargets) {
    // Brand tanpa KPI aktif di channel ini: satu blok yang menyebutkan itu,
    // bukan deretan kartu kosong yang di deck jadi seperti slide yang lupa diisi.
    if (kpiTargetsFor(kpiTargets ?? null, slide.channel).length === 0) {
      placeholder(s, hx, ry, hw, rh, 'NO ACTIVE KPI FOR THIS CHANNEL')
    } else {
      const rates = kpiRatesFor(slide)
      const n = Math.min(Math.max(1, slide.metricCount), KPI_TARGET_MAX)
      const gap = n >= 6 ? W(1) : W(1.6)
      const cardW = (hw - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        const target = kpiTargetById(kpiTargets ?? null, slide.channel, slide.kpiMetrics[i] ?? null)
        const x = hx + i * (cardW + gap)
        if (target) targetCard(s, target, colors.primary, n, rates, x, ry, cardW, rh, slide.channel)
        else placeholder(s, x, ry, cardW, rh, 'ADD KPI')
      }
    }
  } else {
    const n = Math.max(1, slide.metricCount)
    const gap = n >= 6 ? W(1) : W(1.6)
    const cardW = (hw - gap * (n - 1)) / n
    for (let i = 0; i < n; i++) {
      const key = slide.kpiMetrics[i] ?? null
      const metric = resolveKpiMetric(kpiMetrics ?? null, metrics ?? null, slide.channel, key)   // "—" when no data; never dummy
      scorecard(s, metric, colors.primary, n, hx + i * (cardW + gap), ry, cardW, rh)
    }
  }

  // Jarak 2cqh = gap kolom di SlidePreview; H(87) adalah batas bawah blok isi,
  // tepat di atas footer. Keduanya dihitung dari rh supaya baris KPI yang lebih
  // tinggi memendekkan chart, bukan menabrak footer.
  const cy = ry + rh + H(2), ch = H(87) - (ry + rh + H(2))
  const chartW = W(60)
  await chartCard(pptx, s, slide.chart, colors, hx, cy, chartW, ch, 'DEEP DIVE ANALYSIS', chartMetrics, slide.channel)
  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx + chartW + W(2), cy, hw - chartW - W(2), ch, 'SUMMARY & ACTIONS')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/**
 * Matriks YTD (deck revisi, slide 10) sebagai tabel PowerPoint native — tetap
 * bisa diedit. Cerminan YtdMatrix di KpiSlide.tsx: kolom label + N metrik,
 * baris Last Year / This Year / Growth.
 */
function ytdMatrixTable(s: Slide, slide: ContentSlide, ytd: ReportYtdMetrics | null, colors: CoverColors, x: number, y: number, w: number, h: number) {
  const section = ytdChannelFor(ytd, slide.channel)
  if (!section) { placeholder(s, x, y, w, h, 'NO YTD PERIOD FOR THIS CHANNEL'); return }
  const n = Math.max(1, slide.metricCount)
  const rows = Array.from({ length: n }, (_, i) => ytdRowFor(ytd, slide.channel, slide.kpiMetrics[i] ?? null))
  const valFs = FS(n <= 3 ? 2 : n <= 4 ? 1.8 : n === 5 ? 1.55 : 1.35)
  const head = { bold: true, color: 'FFFFFF', fill: { color: noHash(colors.primary) }, fontSize: FS(1.0), align: 'center' as const, valign: 'middle' as const }
  const labelCell = (label: string, sub: string) => ({
    text: [
      { text: label, options: { bold: true, color: '0F172A', fontSize: FS(1.15), breakLine: true } },
      { text: sub, options: { color: '94A3B8', fontSize: FS(0.8) } },
    ],
    options: { fill: { color: 'F8FAFB' }, valign: 'middle' as const, align: 'left' as const },
  })
  const cell = (text: string, color: string) => ({ text, options: { bold: true, color, fontSize: valFs, align: 'center' as const, valign: 'middle' as const } })
  const growthColor = (r: NonNullable<(typeof rows)[number]>) => {
    const d = ytdDelta(r)
    return d == null ? '94A3B8' : d >= 0 ? '16A34A' : 'DC2626'
  }
  const table = [
    [{ text: '', options: head }, ...rows.map(r => ({ text: r ? ytdLabel(r.metric).toUpperCase() : 'ADD YTD METRIC', options: head }))],
    [labelCell('Last Year', fmtYtdPriorRange(section.window)), ...rows.map(r => (r ? cell(fmtYtdPrior(r), '475569') : cell('—', 'CBD5E1')))],
    [labelCell('This Year', fmtYtdRange(section.window)), ...rows.map(r => (r ? cell(fmtYtdRow(r), '0F172A') : cell('—', 'CBD5E1')))],
    [labelCell('Growth', 'vs last year'), ...rows.map(r => (r ? cell(fmtYtdGrowth(r), growthColor(r)) : cell('—', 'CBD5E1')))],
  ]
  const firstW = W(14)
  const headH = H(5.4)
  s.addTable(table, {
    x, y, w, colW: [firstW, ...rows.map(() => (w - firstW) / n)],
    rowH: [headH, ...[0, 1, 2].map(() => (h - headH) / 3)],
    fontFace: PJ, autoPage: false, fill: { color: 'FFFFFF' },
    border: { type: 'solid', color: 'EEF0F2', pt: 0.75 },
  })
}

function hslToHex(h: number, sat: number, lig: number): string {
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lig - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase()
  return to(r) + to(g) + to(b)
}

// Height of the #id + caption block (post type, plus the pillar for owned posts)
// that sits between the photo and the metric list, plus the padding under it.
// Kompetitor tidak punya pilar, jadi keterangannya lebih pendek — tingginya sama.
const POST_HEAD_H = H(4.8)
const METRIC_LINE = 1.25          // lineSpacingMultiple of the metric list
const POST_IMG_MAX = 0.55         // share of the card the photo gets by default
const POST_IMG_MIN = 0.34         // …and the least it may shrink to for long lists

/**
 * Photo height + metric font size for a card, so any metric count from 1 to the
 * full POST_METRICS list stays inside the card. The photo yields space first;
 * once it hits POST_IMG_MIN the type shrinks. Mirrors the preview, where the
 * photo is `flex-1` above a `shrink-0` stats block.
 */
function postCardFit(rows: number, baseFs: number, h: number, labelW: number, longestLabel: number, innerW = Infinity, longestRow = 0) {
  const lineIn = (pt: number) => (pt * METRIC_LINE) / 72
  const need = Math.max(1, rows) * lineIn(baseFs)
  const imgH = Math.min(h * POST_IMG_MAX, Math.max(h * POST_IMG_MIN, h - POST_HEAD_H - need))
  const avail = h - POST_HEAD_H - imgH
  // Fit the row count, and keep the longest label on one line — a wrapped label
  // would push the label column out of step with the value column.
  const byHeight = ((avail / Math.max(1, rows)) * 72) / METRIC_LINE
  const byWidth = (labelW * 72) / (Math.max(1, longestLabel) * 0.5)   // ~0.5em average char
  // …and every row's label + value side by side across the card's full inner width
  // (`longestRow` is in em): a value that does not fit used to wrap — "29 Sep" /
  // "2026" — and push every value under it one line down, out of step with its
  // label (Post-UAT brief "Overlap Table in Content Slide").
  const byValue = longestRow ? ((innerW - 0.08) * 72) / longestRow : Infinity
  const fs = Math.max(6, Math.floor(Math.min(baseFs, byHeight, byWidth, byValue) * 10) / 10)   // floor: rounding up could re-introduce a wrap
  return { imgH, fs }
}

async function postCard(slide: Slide, post: { id: number; tag?: string; image?: string; format?: string; pillar?: string; metrics: Record<string, string>; link?: string }, postMetrics: string[], n: number, x: number, y: number, w: number, h: number, highlight?: string) {
  card(slide, x, y, w, h)
  const pad = W(0.6)
  const baseFs = n === 4 ? FS(1.05) : n === 6 ? FS(0.9) : FS(0.78)
  const labelW = (w - 2 * pad) * 0.62   // values are right-aligned in the box beside it, so the slight overlap is safe
  const longest = postMetrics.reduce((mx, m) => Math.max(mx, cardMetricLabel(m).length), 0)
  // The value box spans the card's full inner width, right-aligned, so a long value
  // (Post Date & Time) has the whole row instead of the right 45%. The only real
  // limit is a label and its value colliding — sized per row below.
  const innerW = w - 2 * pad
  const longestRow = postMetrics.reduce((mx, m) =>
    Math.max(mx, cardMetricLabel(m).length * 0.5 + (post.metrics[m] ?? '—').length * 0.62 + 1), 0)   // em; +1 em gap
  const { imgH, fs } = postCardFit(postMetrics.length, baseFs, h, labelW, longest, innerW, longestRow)

  slide.addShape('rect', { x, y, w, h: imgH, fill: { color: hslToHex((post.id * 47) % 360, 0.42, 0.85) }, line: { type: 'none' } })
  // Embedded link content (Post-UAT brief "Embedded Link Content"): the photo, #id
  // and the ↗ mark open the post's permalink. The link rides on the picture itself;
  // only when there is no picture (load failed → gradient only) does a transparent
  // rect carry it instead.
  const link = post.link ? { url: post.link, tooltip: post.link } : undefined
  const imgData = post.image ? await toDataUrl(post.image) : null
  const imgLinked = imgData ? await addCoverImage(slide, imgData, x, y, w, imgH, link) : false
  if (link && !imgLinked) slide.addShape('rect', { x, y, w, h: imgH, fill: { color: 'FFFFFF', transparency: 100 }, line: { type: 'none' }, hyperlink: link })
  if (post.tag) slide.addText(post.tag, { x: x + W(0.4), y: y + H(0.6), w: W(5), h: H(2.2), fontSize: FS(0.8), bold: true, color: 'FFFFFF', fill: { color: post.tag === 'TOP' ? '16A34A' : 'E11D48' }, align: 'center', valign: 'middle', fontFace: PJ })
  const capFs = Math.max(6, Math.round(baseFs * 0.82 * 10) / 10)
  // The ↗ mark sits in its own box at the right edge. Sharing the #id box (as it
  // once did) stacked an empty text box over "#1", and that box swallowed the click.
  const arrowW = W(1.6)
  const idBox = { x: x + pad, y: y + imgH + H(0.4), w: w - 2 * pad - arrowW, h: H(2.0), fontSize: baseFs, bold: true, color: '334155', fontFace: PJ }
  const arrowBox = { x: x + w - pad - arrowW, y: idBox.y, w: arrowW, h: idBox.h, fontSize: baseFs, bold: true, align: 'right' as const, fontFace: PJ }
  if (link) {
    slide.addText([{ text: `#${post.id}`, options: { hyperlink: link, color: '334155' } }], idBox)
    slide.addText([{ text: '↗', options: { hyperlink: link, color: '2C3079' } }], arrowBox)
  } else {
    slide.addText(`#${post.id}`, idBox)
    slide.addText('↗', { ...arrowBox, color: 'CBD5E1' })
  }
  const caption = [post.format, post.pillar].filter(Boolean).join('  ·  ')
  if (caption) slide.addText(caption, { x: x + pad, y: y + imgH + H(2.5), w: w - 2 * pad, h: H(1.8), fontSize: capFs, color: '94A3B8', valign: 'top', fontFace: PJ })
  // Jangan menaruh shape (mis. area klik transparan) di atas #id / ↗: shape itu
  // menelan klik ke hyperlink teks di bawahnya — di WPS link-nya jadi mati.
  const colY = y + imgH + H(4.4), colH = h - imgH - POST_HEAD_H
  // Label & nilai = dua kotak teks dengan font berbeda (PJ vs mono). Spasi baris
  // RELATIF (lineSpacingMultiple) dihitung dari metrik font masing-masing, jadi
  // tinggi barisnya beda dan nilai makin melenceng dari labelnya ke bawah. Spasi
  // baris ABSOLUT (pt) membuat kedua kolom berbaris di tinggi yang sama persis.
  const lineSpacing = Math.round(fs * METRIC_LINE * 10) / 10
  // wrap: false + margin 0 — a line never breaks, so label n and value n always sit
  // on line n together, whatever the renderer's (PowerPoint/WPS) text metrics.
  // Satu run per baris supaya baris metrik "Rank by" bisa disorot (sama dengan
  // PostCard di pratinjau) tanpa memecah kolom jadi banyak kotak teks.
  const runs = (text: (m: string) => string, base: string) => postMetrics.map((m, i) => ({
    text: text(m),
    options: { color: m === highlight ? '16A34A' : base, bold: m === highlight, breakLine: i < postMetrics.length - 1 },
  }))
  slide.addText(runs(m => cardMetricLabel(m), '94A3B8'), { x: x + pad, y: colY, w: labelW, h: colH, fontSize: fs, align: 'left', valign: 'top', lineSpacing, margin: 0, wrap: false, fontFace: PJ })
  slide.addText(runs(m => post.metrics[m] ?? '—', '334155'), { x: x + pad, y: colY, w: innerW, h: colH, fontSize: fs, align: 'right', valign: 'top', lineSpacing, margin: 0, wrap: false, fontFace: MONO })
}

async function addVisualSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, postMetrics?: ReportPostMetrics | null, competitorPosts?: CompetitorPostPool | null, resolveImages?: ImageResolver | null) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  // Mode competitive review hanya menukar kumpulan post-nya; pemilihan kompetitornya
  // lewat helper yang sama dengan preview supaya keduanya tidak mungkin memilih akun
  // yang berbeda.
  // Activity Performance memakai fungsi ini apa adanya — kartunya identik. Yang
  // ditukar hanya kumpulan post, katalog metrik, dan hilangnya peringkat. Dijaga
  // sejajar dengan VisualSlide.tsx supaya pratinjau dan PPTX tidak bisa berbeda.
  const isAct = slide.type === 'activity'
  const comp = !isAct && slide.postSource === 'competitor'
    ? competitorPoolFor(competitorPosts, slide.channel, slide.postCompetitorId)
    : null

  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)
  // Handle kompetitor, rata kanan tepat di kiri logo channel — penanda satu-satunya
  // yang membedakan slide ini dari slide post milik sendiri. Lihat CompetitorHeaderTag
  // di VisualSlide.tsx: bentuknya dijaga sama supaya pratinjau dan PPTX seragam.
  if (comp?.label) {
    // Lebarnya dipatok W(13.5) supaya tepi kirinya berhenti di kanan kotak judul
    // (dashboardHeader menyisakan W(22) di kanan). Lebih lebar dari itu dan judul
    // yang panjang akan menabrak handle-nya. Handle yang tidak muat turun ke baris
    // kedua — masih cukup di dalam H(5) — sama seperti di pratinjau.
    const badgeW = H(7), gap = W(1), lw = W(13.5)
    s.addText(comp.label, {
      x: hx + hw - W(1.5) - badgeW - gap - lw, y: hy + (H(12) - H(5)) / 2, w: lw, h: H(5),
      align: 'right', valign: 'middle', fontSize: FS(1.4), bold: true, color: '475569',
      lineSpacingMultiple: 1.15, fontFace: PJ,
    })
  }

  const n = slide.postCount
  const owned = postMetrics?.[slide.channel]
  const source = isAct ? activityPool(owned) : comp ? (comp.pool ?? undefined) : owned
  // Metric defaults + brand-aware filters — must match VisualSlide exactly so export == preview.
  const populated = populatedMetricsFor(source)
  const sortMetric = effectiveSortMetric(slide.postSortMetric, populated)
  const shownMetrics = isAct
    ? effectiveActivityMetrics(slide.postMetrics)
    : effectiveShownMetrics(slide.postMetrics, populated)
  const format = effectiveFilterId(slide.postFormat, availableFilterIds(source, 'formatId'))
  // Pilar hanya milik post sendiri: pemilihnya disembunyikan di mode kompetitor
  // (lihat VisualSlide), jadi filternya dipaksa 'all' di sini juga — kalau tidak,
  // pilihan sisa dari mode Owned akan menyaring di ekspor tapi tidak di pratinjau.
  const pillar = comp ? 'all' : effectiveFilterId(slide.postPillar, availableFilterIds(source, 'pillarId'))
  const built = isAct
    ? buildPosts(n, 'top', { sortMetric: 'post_date', source, compact: slide.postNumbers === 'compact' })
    : buildPosts(n, slide.postFilter, { format, pillar, sortMetric, source, compact: slide.postNumbers === 'compact' })
  // Sama dengan VisualSlide: cover yang belum tersimpan permanen diminta dulu ke
  // resolver gambar report — termasuk slide yang tidak pernah dibuka di pratinjau.
  const keys = built.map(p => p.imageKey).filter((k): k is string => !!k)
  const resolved = resolveImages && keys.length ? await resolveImages(keys) : {}
  const posts = built.map(p => (p.imageKey && resolved[p.imageKey] ? { ...p, image: resolved[p.imageKey]! } : p))
  const gap = n === 4 ? W(1.2) : n === 6 ? W(0.9) : W(0.7)
  const cw = (hw - gap * (n - 1)) / n
  const gy = H(18), gh = H(49)
  // Pilar dibuang dari kartu kompetitor — semuanya "No pillar", dan keterangan itu
  // hanya jadi derau di samping jenis post. postCard merakit keterangannya dari
  // bagian yang tidak kosong, persis seperti PostCard di pratinjau.
  for (let i = 0; i < posts.length; i++) {
    const post = comp ? { ...posts[i], pillar: undefined } : posts[i]
    await postCard(s, post, shownMetrics, n, hx + i * (cw + gap), gy, cw, gh, isAct ? undefined : sortMetric)
  }

  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx, H(69), hw, H(18),
    isAct ? 'ACTIVITY NOTES & INSIGHTS' : 'VISUAL STRATEGY NOTES & INSIGHTS')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/**
 * Format / Pillar Showcase — cerminan ShowcaseSlide.tsx: rata-rata per kelompok
 * (kiri), satu baris per kelompok dengan post terendah → tertinggi (tengah), dan
 * catatan per kelompok (kanan). Datanya dari buildShowcase, sama dengan pratinjau.
 */
async function addShowcaseSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, postMetrics?: ReportPostMetrics | null, resolveImages?: ImageResolver | null) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const source = postMetrics?.[slide.channel]
  const by = slide.showcaseBy ?? 'format'
  const perRow = SHOWCASE_PER_ROW.includes(slide.postCount) ? slide.postCount : 4
  const populated = populatedMetricsFor(source)
  const sortMetric = effectiveSortMetric(slide.postSortMetric, populated)
  const shown = showcaseShownMetrics(slide.postMetrics, populated, sortMetric)
  const groups = buildShowcase(source, by, effectiveShowcaseGroups(source, by, slide.showcaseGroups), sortMetric, perRow, slide.postNumbers === 'compact')

  const top = H(18), bodyH = H(69)
  if (!groups.length) {
    noDataText(s, hx, top, hw, bodyH)
    await footer(s, chrome, colors, hx, H(89), hw)
    return
  }
  const accent = noHash(colors.primary)
  // Geometri bersama dengan ShowcaseSlide (posts.showcaseGeometry).
  const G = SHOWCASE_GEOM
  const geom = showcaseGeometry(perRow, groups.length)
  const gap = W(G.gap)
  const leftW = W(G.leftW), rightW = W(G.rightW)
  const mx = hx + leftW + gap, midW = W(geom.midW)
  const headH = H(G.headH), rowGap = H(G.rowGap)
  const rowsTop = top + headH
  const rowH = H(geom.rowH)
  // pt langsung dari cqw — tanpa batas bawah 6pt milik FS(), yang justru akan
  // membuat teks di slot sempit melebar keluar kotaknya.
  const metricPt = Math.round(showcaseMetricFs(geom, shown.length, showcaseLongest(groups, shown)) * 9.6 * 10) / 10
  const rowY = (i: number) => rowsTop + i * (rowH + rowGap)
  const maxAvg = Math.max(0, ...groups.map(g => g.avg)) || 1

  // Kiri — rata-rata per kelompok.
  card(s, hx, top, leftW, bodyH)
  s.addShape('rect', { x: hx + W(0.8), y: top + H(1.2), w: W(0.9), h: W(0.9), fill: { color: accent }, line: { type: 'none' } })
  s.addText(`Avg. ${metricLabel(sortMetric)}`, { x: hx + W(1.9), y: top + H(0.6), w: leftW - W(2.4), h: H(2.6), fontSize: FS(0.8), bold: true, color: '475569', fontFace: PJ, valign: 'middle', fit: 'shrink' })
  const barX = hx + W(6.1), barMax = (leftW - W(6.6)) * 0.7
  groups.forEach((g, i) => {
    const cy = rowY(i) + rowH / 2
    // `fit: 'shrink'` tidak dijalankan pptxgenjs → "Entertainment" patah jadi
    // "Entertain / ment". Kecilkan sampai kata terpanjang muat satu baris (5.4cqw
    // dikurangi inset kotak); spasi antar kata tetap boleh pindah baris.
    const longestWord = Math.max(1, ...g.label.split(/\s+/).map(w => w.length))
    const labFs = Math.max(0.5, Math.min(0.85, 5.0 / (longestWord * 0.52)))
    s.addText(g.label, { x: hx + W(0.4), y: cy - H(1.6), w: W(5.4), h: H(3.2), fontSize: FS(labFs), color: '334155', align: 'right', valign: 'middle', fontFace: PJ, margin: 0 })
    const bw = Math.max(barMax * 0.04, (g.avg / maxAvg) * barMax)
    s.addShape('rect', { x: barX, y: cy - H(1.3), w: bw, h: H(2.6), fill: { color: accent }, line: { type: 'none' } })
    s.addText(g.avgText, { x: barX + bw + W(0.2), y: cy - H(1.6), w: leftW - (barX - hx) - bw - W(0.3), h: H(3.2), fontSize: FS(0.8), bold: true, color: '0F172A', valign: 'middle', fontFace: PJ, margin: 0 })
  })

  // Tengah — kepala "Lowest … Highest".
  s.addText('Lowest', { x: mx + W(2.6), y: top, w: W(8), h: headH, fontSize: FS(0.9), bold: true, color: 'DC2626', valign: 'middle', fontFace: PJ, margin: 0 })
  s.addText(`*based on ${metricLabel(sortMetric)}`, { x: mx, y: top, w: midW, h: headH, fontSize: FS(0.75), color: '94A3B8', align: 'center', valign: 'middle', fontFace: PJ })
  s.addText('Highest', { x: mx + midW - W(8), y: top, w: W(8), h: headH, fontSize: FS(0.9), bold: true, color: '16A34A', align: 'right', valign: 'middle', fontFace: PJ, margin: 0 })

  // Gambar yang belum tersimpan permanen diminta dulu ke resolver, seperti slide Visual.
  const keys = groups.flatMap(g => g.posts.map(p => p.imageKey)).filter((k): k is string => !!k)
  const resolved = resolveImages && keys.length ? await resolveImages(keys) : {}

  const stripW = W(G.stripW), pad = H(G.rowPad), slotGap = W(G.slotGap)
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i], y = rowY(i)
    s.addShape('roundRect', { x: mx, y, w: midW, h: rowH, rectRadius: 0.05, fill: { color: noHash(tint(colors.primary, 0.95)) }, line: { color: 'E8EBEE', width: 0.75 } })
    s.addShape('rect', { x: mx, y, w: stripW, h: rowH, fill: { color: accent }, line: { type: 'none' } })
    // Teks diputar 270° di sekitar pusat kotaknya: kotak selebar tinggi baris,
    // diletakkan supaya pusatnya jatuh di tengah strip.
    // Pecah baris & ukuran dari showcaseLabel (sama dengan pratinjau) — `fit:
    // 'shrink'` pptxgenjs tidak benar-benar mengecilkan apa pun.
    const lab = showcaseLabel(g.label, groups.length)
    s.addText(lab.lines.join('\n'), {
      x: mx + stripW / 2 - rowH / 2, y: y + rowH / 2 - stripW / 2, w: rowH, h: stripW,
      rotate: 270, fontSize: FS(lab.fs), bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: PJ, margin: 0, lineSpacingMultiple: 1.0,
    })
    const trackX = mx + stripW + W(G.trackPad), trackW = W(geom.trackW)
    const slotW = W(geom.slotW)
    const imgH = H(geom.imgH)
    const imgW = W(geom.imgW)
    const k = g.posts.length
    for (let j = 0; j < k; j++) {
      const p = g.posts[j]
      // Rata kanan, sama dengan pratinjau: post tertinggi selalu di ujung kanan.
      const sx = trackX + trackW - (k - j) * slotW - (k - j - 1) * slotGap
      const sy = y + pad
      const url = (p.imageKey && resolved[p.imageKey]) || p.image
      const link = p.link ? { url: p.link, tooltip: p.link } : undefined
      const data = url ? await toDataUrl(url) : null
      const linked = data ? await addCoverImage(s, data, sx, sy, imgW, imgH, link) : false
      if (!data) s.addShape('rect', { x: sx, y: sy, w: imgW, h: imgH, fill: { color: 'E2E8F0' }, line: { type: 'none' } })
      if (link && !linked) s.addShape('rect', { x: sx, y: sy, w: imgW, h: imgH, fill: { color: 'FFFFFF', transparency: 100 }, line: { type: 'none' }, hyperlink: link })
      const bx = sx + imgW + W(G.boxGap), bw = W(geom.boxW)
      s.addShape('roundRect', { x: bx, y: sy, w: bw, h: imgH, rectRadius: 0.03, fill: { color: 'FFFFFF' }, line: { color: 'EEF0F2', width: 0.5 } })
      // Dua baris per metrik — label abu-abu, lalu angkanya (sama dengan pratinjau).
      s.addText(shown.flatMap((m, mi) => [
        { text: cardMetricLabel(m), options: { color: '94A3B8', breakLine: true } },
        { text: p.metrics[m] ?? '—', options: { color: m === sortMetric ? '16A34A' : '334155', bold: true, breakLine: mi < shown.length - 1 } },
      ]), { x: bx, y: sy, w: bw, h: imgH, fontSize: metricPt, valign: 'middle', fontFace: PJ, wrap: false, margin: [2, 2, 2, 2] })
    }
  }

  // Kanan — catatan per kelompok.
  const rx = hx + hw - rightW
  card(s, rx, top, rightW, bodyH)
  const sliceH = (bodyH - H(2)) / groups.length
  groups.forEach((g, i) => {
    const y = top + H(1) + i * sliceH
    const note = slide.showcaseNotes?.[g.id]?.trim()
    s.addText([
      { text: g.label.toUpperCase(), options: { bold: true, color: '0F172A', fontSize: FS(0.85), breakLine: true } },
      { text: note || '—', options: { color: '475569', fontSize: FS(0.78) } },
    ], { x: rx + W(0.9), y, w: rightW - W(1.8), h: sliceH, valign: 'top', fontFace: PJ, fit: 'shrink', margin: 0, lineSpacingMultiple: 1.15 })
  })

  await footer(s, chrome, colors, hx, H(89), hw)
}

async function addOverviewSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, metrics?: ReportTableMetrics, chartMetrics?: ReportChartMetrics) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const vy = H(18), vh = H(47)
  if (slide.visualMode === 'chart') await chartCard(pptx, s, slide.chart, colors, hx, vy, hw, vh, 'SELECT VISUALIZATION', chartMetrics, slide.channel)
  else if (slide.visualMode === 'table') tableCard(s, slide.table, colors, slide.channel, hx, vy, hw, vh, sectionFor(metrics, slide.table, slide.channel), sentimentTableFor(metrics?.sentiment, slide.channel), competitorFor(metrics, slide.table, slide.channel), customColumnsFrom(metrics), platformFor(metrics, slide.table), platformPrevFor(metrics, slide.table))
  else placeholder(s, hx, vy, hw, vh, 'SELECT A CHART OR TABLE')

  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx, H(67), hw, H(20), 'COMPARATIVE ANALYSIS & NOTES')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/* ── Audience Sentiment ───────────────────────────────────────────────────
 * Native shapes + text, plus the word cloud as a rasterised PNG — the same
 * exception the chart card already makes, because a d3-cloud packing has no
 * PowerPoint equivalent. Everything else stays editable.
 *
 * Deltas print with an explicit `pp` for the same reason they do on screen: a
 * share that moved from 12% to 15% is +3 POINTS, and a slide that calls it
 * "+25%" is the version that gets argued about in the meeting.
 */
const ppText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}pp`
const intText = (n: number) => n.toLocaleString('id-ID')

function sentimentTile(
  s: Slide, k: (typeof SENTIMENT_KEYS)[number], block: SentimentBlock,
  accent: string, x: number, y: number, w: number, h: number,
) {
  const color = noHash(SENTIMENT_COLOR[k])
  const count = block.current.counts[k]
  const sharePct = block.current.share[k]
  const move = block.shareChange[k]
  const flat = Math.abs(move) < 0.05
  // Direction and desirability are different questions: negative sentiment
  // rising is an up arrow in red.
  const good = k === 'negative' ? move < 0 : move > 0
  const moveColor = flat ? '94A3B8' : good ? '15803D' : 'B91C1C'

  s.addShape('roundRect', { x, y, w, h, rectRadius: 0.05, fill: { color: 'FBFCFD' }, line: { color: 'E8EBEE', width: 0.75 } })
  s.addShape('rect', { x, y, w, h: H(0.5), fill: { color }, line: { type: 'none' } })
  s.addText(SENTIMENT_LABEL[k].toUpperCase(), {
    x: x + W(0.6), y: y + H(1.2), w: w - W(1.2), h: H(3),
    fontSize: FS(1.15), bold: true, color: '64748B', charSpacing: 0.6, fontFace: PJ,
  })
  s.addText(intText(count), {
    x: x + W(0.6), y: y + H(4), w: w - W(1.2), h: H(7),
    fontSize: FS(3.1), bold: true, color: '0F172A', fontFace: PJ,
  })
  s.addText(`${sharePct.toFixed(1)}%`, {
    x: x + W(0.6), y: y + H(11), w: w - W(1.2), h: H(3.4),
    fontSize: FS(1.5), bold: true, color: noHash(accent), fontFace: PJ,
  })
  s.addText(`${flat ? '' : move > 0 ? '▲ ' : '▼ '}${ppText(move)} vs prev`, {
    x: x + W(0.6), y: y + h - H(4), w: w - W(1.2), h: H(3),
    fontSize: FS(1.1), bold: true, color: moveColor, fontFace: PJ,
  })
}

async function addSentimentSlide(
  pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors,
  audience?: ReportAudienceMetrics | null,
) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const source = (slide.sentimentSource ?? 'all') as SourceFilter
  const block = sentimentFor(audience, slide.channel, source)
  const words = audienceWordsFor(audience, slide.channel, slide.cloudSentiment)

  const bodyY = H(18), bodyH = H(47)
  const leftW = W(46), gap = W(1.6)
  const rightX = hx + leftW + gap, rightW = hw - leftW - gap

  // ── breakdown card
  const breakH = bodyH - H(13)
  card(s, hx, bodyY, leftW, breakH)
  const label = source === 'all' ? 'SENTIMENT BREAKDOWN' : `SENTIMENT · ${SOURCE_LABEL[source].toUpperCase()}`
  s.addText(label, { x: hx + W(1.2), y: bodyY + H(1.2), w: leftW - W(2.4), h: H(3), fontSize: FS(1.2), bold: true, color: '94A3B8', charSpacing: 0.6, fontFace: PJ })

  if (!block) {
    noDataText(s, hx, bodyY + H(5), leftW, breakH - H(6), 'No scored audience voice for this period')
  } else {
    const tileY = bodyY + H(5)
    const tileH = breakH - H(11)
    const tgap = W(0.8)
    const tileW = (leftW - W(2.4) - tgap * 2) / 3
    SENTIMENT_KEYS.forEach((k, i) => {
      sentimentTile(s, k, block, colors.primary, hx + W(1.2) + i * (tileW + tgap), tileY, tileW, tileH)
    })
    // The denominator behind every share above.
    s.addText(
      `${intText(block.current.total)} scored this month  ·  ${intText(block.previous.total)} previous`,
      { x: hx + W(1.2), y: bodyY + breakH - H(4.6), w: leftW - W(2.4), h: H(3.4), fontSize: FS(1.05), bold: true, color: '475569', fontFace: PJ },
    )
  }

  // ── biggest shift card
  const shiftY = bodyY + breakH + H(1.4)
  const shiftH = bodyH - breakH - H(1.4)
  card(s, hx, shiftY, leftW, shiftH)
  s.addText('BIGGEST SHIFT VS PREVIOUS MONTH', { x: hx + W(1.2), y: shiftY + H(1), w: leftW - W(2.4), h: H(3), fontSize: FS(1.2), bold: true, color: '94A3B8', charSpacing: 0.6, fontFace: PJ })
  const shift = biggestShift(block)
  if (!shift) {
    s.addText(block ? 'Sentiment held steady — no share moved by more than 0.1pp.' : '—', {
      x: hx + W(1.2), y: shiftY + H(4.4), w: leftW - W(2.4), h: H(4), fontSize: FS(1.2), color: '94A3B8', fontFace: PJ,
    })
  } else {
    s.addText([
      { text: `${SENTIMENT_LABEL[shift.sentiment]} ${ppText(shift.change)}`, options: { fontSize: FS(1.9), bold: true, color: noHash(SENTIMENT_COLOR[shift.sentiment]), fontFace: PJ } },
      { text: `   ${block!.previous.share[shift.sentiment].toFixed(1)}% → ${block!.current.share[shift.sentiment].toFixed(1)}%`, options: { fontSize: FS(1.15), color: '64748B', fontFace: PJ } },
    ], { x: hx + W(1.2), y: shiftY + H(4.2), w: leftW - W(2.4), h: H(4.5), fontFace: PJ })
  }

  // ── word cloud card
  card(s, rightX, bodyY, rightW, bodyH)
  const cloudLabel = slide.cloudSentiment && slide.cloudSentiment !== 'all'
    ? `CONVERSATION WORD CLOUD · ${slide.cloudSentiment.toUpperCase()}`
    : 'CONVERSATION WORD CLOUD'
  s.addText(cloudLabel, { x: rightX + W(1.2), y: bodyY + H(1.2), w: rightW - W(2.4), h: H(3), fontSize: FS(1.2), bold: true, color: '94A3B8', charSpacing: 0.6, fontFace: PJ })
  const cy = bodyY + H(5), ch = bodyH - H(6.2)
  const bw = rightW - W(2.4)
  if (!words.length) {
    noDataText(s, rightX + W(1.2), cy, bw, ch, 'No comment words for this period')
  } else {
    const pxW = 900, pxH = Math.max(1, Math.round(pxW * (ch / bw)))
    const png = await svgToPng(wordCloudSvg(words as CloudWordData[], pxW, pxH), pxW, pxH)
    s.addImage({ data: png, x: rightX + W(1.2), y: cy, w: bw, h: ch })
  }

  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx, H(67), hw, H(20), 'SENTIMENT ANALYSIS & NOTES')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/* ── Audience Demographics ────────────────────────────────────────────────
 * One panel per platform — never a blended figure. The warehouse stores shares,
 * so a combined number would average three percentages and weigh a small TikTok
 * exactly like a large Instagram. See DemographicSlide.tsx.
 */
/** Warna tiga bulan riwayat, lama → baru — sama dengan DemographicSlide. */
const last3Shades = (accent: string) => [tint(accent, 0.68), tint(accent, 0.38), accent]

function demographicPanel(
  s: Slide, platform: DashPlatform,
  cur: NonNullable<ReturnType<typeof demographicsFor>>['current'],
  prev: NonNullable<ReturnType<typeof demographicsFor>>['previous'],
  view: string, accent: string, x: number, y: number, w: number, h: number,
  history: ReturnType<typeof demographicHistory> | null = null,
) {
  if (!cur) return
  card(s, x, y, w, h)
  const meta = PLATFORM_META[platform]
  const badge = history ? (history.length < 3 ? `   ${history.length} OF 3 MONTHS` : null) : prev ? null : '   NO PRIOR MONTH'
  s.addText(
    !badge ? meta.label : [
      { text: meta.label, options: { bold: true, color: '0F172A', fontSize: FS(1.25) } },
      { text: badge, options: { bold: true, color: 'B8915A', fontSize: FS(0.85) } },
    ],
    { x: x + W(1), y: y + H(1), w: w - W(2), h: H(3.4), fontSize: FS(1.25), bold: true, color: '0F172A', fontFace: PJ },
  )

  const showAge = view !== 'gender'
  const showGender = view !== 'age'
  let cursor = y + H(5)
  const tight = { margin: 0, wrap: false, valign: 'middle' as const, fontFace: PJ }

  // ── Tiga bulan terakhir (cerminan AgeRow3 / GenderRows3 di DemographicSlide) ──
  if (history) {
    const shades = last3Shades(accent)
    if (showAge) {
      s.addText('AGE GROUP', { x: x + W(1), y: cursor, w: w - W(2), h: H(2.6), fontSize: FS(0.95), bold: true, color: '94A3B8', charSpacing: 0.5, fontFace: PJ })
      cursor += H(3)
      const buckets = ageBucketsFor(platform)
      const max = Math.max(...history.flatMap(hh => buckets.map(([, k]) => hh.period.age[k] ?? 0)), 1)
      // Mode gender ikut tampil → tiga baris gender butuh ruang lebih dari satu bar.
      const rowH = showGender ? H(2.45) : H(3.6)
      const labelW = W(4.4), valW = W(4.6), deltaW = history.length > 1 ? W(3.8) : 0
      const barW = Math.max(w - W(2) - labelW - valW - deltaW - W(1), W(4))
      const barH = H(0.5), barGap = H(0.12)
      for (const [label, b] of buckets) {
        s.addText(label, { ...tight, x: x + W(1), y: cursor, w: labelW, h: rowH, align: 'right', fontSize: FS(1), color: '64748B' })
        const bx = x + W(1) + labelW + W(0.5)
        const stackH = history.length * barH + (history.length - 1) * barGap
        let by = cursor + (rowH - stackH) / 2
        for (const hh of history) {
          const v = hh.period.age[b] ?? 0
          s.addShape('rect', { x: bx, y: by, w: barW, h: barH, fill: { color: 'F1F5F9' }, line: { type: 'none' } })
          if (v > 0) s.addShape('rect', { x: bx, y: by, w: Math.max(barW * (v / max), 0.02), h: barH, fill: { color: noHash(shades[hh.idx]) }, line: { type: 'none' } })
          by += barH + barGap
        }
        const last = history[history.length - 1].period.age[b] ?? 0
        const first = history[0].period.age[b] ?? 0
        s.addText(`${last.toFixed(1)}%`, { ...tight, x: bx + barW + W(0.5), y: cursor, w: valW, h: rowH, align: 'right', fontSize: FS(1), bold: true, color: '0F172A' })
        if (history.length > 1) {
          const d = +(last - first).toFixed(1)
          s.addText(Math.abs(d) < 0.05 ? '0.0' : ppText(d).replace('pp', ''), {
            ...tight, x: bx + barW + W(0.5) + valW, y: cursor, w: deltaW, h: rowH, align: 'right',
            fontSize: FS(0.95), bold: true, color: Math.abs(d) < 0.05 ? 'A3ADBA' : d > 0 ? '15803D' : 'B91C1C',
          })
        }
        cursor += rowH
      }
      cursor += H(1)
    }
    if (showGender) {
      s.addText('GENDER', { x: x + W(1), y: cursor, w: w - W(2), h: H(2.6), fontSize: FS(0.95), bold: true, color: '94A3B8', charSpacing: 0.5, fontFace: PJ })
      cursor += H(3)
      const lw = W(2.8), gx = x + W(1) + lw, gw = w - W(2) - lw, gh = H(1.8)
      for (const hh of history) {
        s.addText(shortMonth(hh.label), { ...tight, x: x + W(1), y: cursor, w: lw, h: gh, fontSize: FS(0.9), bold: true, color: '64748B' })
        const fw = gw * (hh.period.female / 100)
        s.addShape('rect', { x: gx, y: cursor, w: Math.max(fw, 0.001), h: gh, fill: { color: 'D6447A' }, line: { type: 'none' } })
        s.addShape('rect', { x: gx + fw, y: cursor, w: Math.max(gw - fw, 0.001), h: gh, fill: { color: '3D7EEA' }, line: { type: 'none' } })
        if (hh.period.female >= 12) s.addText(`${hh.period.female.toFixed(0)}%`, { ...tight, x: gx, y: cursor, w: fw, h: gh, align: 'center', fontSize: FS(0.85), bold: true, color: 'FFFFFF' })
        if (hh.period.male >= 12) s.addText(`${hh.period.male.toFixed(0)}%`, { ...tight, x: gx + fw, y: cursor, w: gw - fw, h: gh, align: 'center', fontSize: FS(0.85), bold: true, color: 'FFFFFF' })
        cursor += gh + H(0.4)
      }
    }
    return
  }

  if (showAge) {
    s.addText('AGE GROUP', { x: x + W(1), y: cursor, w: w - W(2), h: H(2.6), fontSize: FS(0.95), bold: true, color: '94A3B8', charSpacing: 0.5, fontFace: PJ })
    cursor += H(3)
    const buckets = ageBucketsFor(platform)
    const max = Math.max(...buckets.map(([, k]) => Math.max(cur.age[k] ?? 0, prev?.age[k] ?? 0)), 1)
    const rowH = H(2.6)
    // Wide enough for "100.0%" / "+12.3" at three panels per slide; with the old
    // 3.2/2.8 widths PowerPoint wrapped the % and the sign onto their own lines.
    // Every text box in these rows is margin 0 + no wrap for the same reason.
    // Tanpa bulan pembanding kolom delta hanya berisi "—"; ruangnya dikembalikan ke bar.
    const labelW = W(4.4), valW = W(4.6), deltaW = prev ? W(3.8) : 0
    const barW = Math.max(w - W(2) - labelW - valW - deltaW - W(1), W(4))
    for (const [label, b] of buckets) {
      const now = cur.age[b] ?? 0
      const before = prev ? (prev.age[b] ?? 0) : null
      s.addText(label, { ...tight, x: x + W(1), y: cursor, w: labelW, h: rowH, align: 'right', fontSize: FS(1), color: '64748B' })
      const bx = x + W(1) + labelW + W(0.5)
      s.addShape('roundRect', { x: bx, y: cursor + H(0.55), w: barW, h: H(1.5), rectRadius: 0.02, fill: { color: 'F1F5F9' }, line: { type: 'none' } })
      if (now > 0) s.addShape('roundRect', { x: bx, y: cursor + H(0.55), w: Math.max(barW * (now / max), 0.02), h: H(1.5), rectRadius: 0.02, fill: { color: noHash(accent) }, line: { type: 'none' } })
      // Last month as a hairline, so the shift is visible without doubling the bars.
      if (before !== null) {
        s.addShape('rect', { x: bx + barW * (before / max), y: cursor + H(0.3), w: W(0.16), h: H(2), fill: { color: '0F172A', transparency: 62 }, line: { type: 'none' } })
      }
      s.addText(`${now.toFixed(1)}%`, { ...tight, x: bx + barW + W(0.5), y: cursor, w: valW, h: rowH, align: 'right', fontSize: FS(1), bold: true, color: '0F172A' })
      const d = before === null ? null : +(now - before).toFixed(1)
      if (d !== null) {
        s.addText(Math.abs(d) < 0.05 ? '0.0' : ppText(d).replace('pp', ''), {
          ...tight, x: bx + barW + W(0.5) + valW, y: cursor, w: deltaW, h: rowH, align: 'right',
          fontSize: FS(0.95), bold: true, color: Math.abs(d) < 0.05 ? 'A3ADBA' : d > 0 ? '15803D' : 'B91C1C',
        })
      }
      cursor += rowH
    }
    cursor += H(1.2)
  }

  if (showGender) {
    s.addText('GENDER', { x: x + W(1), y: cursor, w: w - W(2), h: H(2.6), fontSize: FS(0.95), bold: true, color: '94A3B8', charSpacing: 0.5, fontFace: PJ })
    cursor += H(3)
    const gw = w - W(2)
    const fw = gw * (cur.female / 100)
    s.addShape('rect', { x: x + W(1), y: cursor, w: fw, h: H(2.4), fill: { color: 'D6447A' }, line: { type: 'none' } })
    s.addShape('rect', { x: x + W(1) + fw, y: cursor, w: gw - fw, h: H(2.4), fill: { color: '3D7EEA' }, line: { type: 'none' } })
    s.addText(`${cur.female.toFixed(0)}%`, { x: x + W(1), y: cursor, w: fw, h: H(2.4), align: 'center', valign: 'middle', fontSize: FS(1), bold: true, color: 'FFFFFF', fontFace: PJ })
    s.addText(`${cur.male.toFixed(0)}%`, { x: x + W(1) + fw, y: cursor, w: gw - fw, h: H(2.4), align: 'center', valign: 'middle', fontSize: FS(1), bold: true, color: 'FFFFFF', fontFace: PJ })
    cursor += H(3)
    const fd = prev ? +(cur.female - prev.female).toFixed(1) : null
    const md = prev ? +(cur.male - prev.male).toFixed(1) : null
    // Bare "Female 0.0" read as a 0% share; spell out that it is the change in points.
    const dTxt = (d: number | null) => (d === null ? '' : `  (${Math.abs(d) < 0.05 ? '0.0' : ppText(d).replace('pp', '')} pp)`)
    const legend = { margin: 0, wrap: false, valign: 'middle' as const, fontFace: PJ, fontSize: FS(0.95), color: '64748B', h: H(2.6), y: cursor, w: gw / 2 }
    s.addText(`● Female ${cur.female.toFixed(1)}%${dTxt(fd)}`, { ...legend, x: x + W(1) })
    s.addText(`● Male ${cur.male.toFixed(1)}%${dTxt(md)}`, { ...legend, x: x + W(1) + gw / 2, align: 'right' })
  }
}

async function addDemographicSlide(
  pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors,
  audience?: ReportAudienceMetrics | null,
) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const channels = demographicChannels(audience, slide.channel)
  // Header kartu berakhir di H(16). Label dulu ditaruh di H(14.6) — menimpa tepi
  // bawah header (Post-UAT brief "Audience Demographics Slide"). Sekarang label
  // punya jalurnya sendiri di antara header dan panel, tanpa margin bawaan.
  const labelY = H(16.6), bodyY = H(20), bodyH = H(45.5)

  const heading = demographicHeading(audience, channels)
  const labels3 = audience?.meta.last3Labels ?? []
  const last3 = slide.demographicRange === 'last3' && labels3.length === 3
  s.addText(
    (last3
      ? `FOLLOWER DEMOGRAPHICS — ${labels3[0]} TO ${labels3[2]}`
      : heading.hasPrevious
      ? `FOLLOWER DEMOGRAPHICS — ${heading.cur} VS ${heading.prev}`
      : `FOLLOWER DEMOGRAPHICS — ${heading.cur} (NO ${heading.prev} DATA TO COMPARE)`).toUpperCase(),
    { x: hx, y: labelY, w: hw * (last3 ? 0.7 : 1), h: H(2.8), margin: 0, valign: 'middle', fontSize: FS(1.2), bold: true, color: '94A3B8', charSpacing: 0.6, fontFace: PJ },
  )
  if (last3) {
    // Legenda warna bulan, rata kanan di jalur label.
    const shades = last3Shades(colors.primary)
    const itemW = W(5.2)
    labels3.forEach((l, i) => {
      const ix = hx + hw - itemW * (3 - i)
      s.addShape('rect', { x: ix, y: labelY + H(1.1), w: W(1.1), h: H(0.6), fill: { color: noHash(shades[i]) }, line: { type: 'none' } })
      s.addText(shortMonth(l), { x: ix + W(1.4), y: labelY, w: itemW - W(1.4), h: H(2.8), margin: 0, valign: 'middle', fontSize: FS(0.95), bold: true, color: '64748B', fontFace: PJ })
    })
  }

  if (channels.length === 0) {
    card(s, hx, bodyY, hw, bodyH)
    noDataText(s, hx, bodyY, hw, bodyH, 'No follower demographics for this period')
  } else {
    const gap = W(1.2)
    const pw = (hw - gap * (channels.length - 1)) / channels.length
    channels.forEach((p, i) => {
      const d = demographicsFor(audience, p)
      if (!d) return
      demographicPanel(s, p, d.current, d.previous, slide.demographicView ?? 'both', colors.primary, hx + i * (pw + gap), bodyY, pw, bodyH,
        last3 ? demographicHistory(audience, p) : null)
    })
  }

  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx, H(67), hw, H(20), 'DEMOGRAPHIC SHIFT & NOTES')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/* ── Tagged Posts (Post-UAT least priority) ───────────────────────────────
 * Cerminan TaggedSlide.tsx: dua kartu angka, Top N tagged post dengan gambar
 * (gambar & "Open post" menaut ke post-nya), dan catatan di kanan.
 */
async function addTaggedSlide(
  pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors,
  audience?: ReportAudienceMetrics | null, resolveImages?: ImageResolver | null,
) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  const data = taggedFor(audience, slide.channel)
  const n = (TAGGED_COUNTS as readonly number[]).includes(slide.postCount) ? slide.postCount : 3
  const posts = (data?.top ?? []).slice(0, n)
  const accent = noHash(colors.primary)

  const gap = W(1.4)
  const leftW = (hw - gap) * (2.1 / 3.1), rightW = hw - gap - leftW
  const top = H(18), bottom = H(87)

  // Kartu angka.
  const statH = H(11), statGap = W(1.2), statW = (leftW - statGap) / 2
  const stats: [string, number, number][] = [
    ['Total Tagged Posts', data?.current.posts ?? 0, data?.previous.posts ?? 0],
    ['Tagged Post User Count', data?.current.users ?? 0, data?.previous.users ?? 0],
  ]
  stats.forEach(([label, cur, prev], i) => {
    const x = hx + i * (statW + statGap)
    s.addShape('roundRect', { x, y: top, w: statW, h: statH, rectRadius: 0.08, fill: { color: accent }, line: { type: 'none' } })
    s.addText(label, { x, y: top + H(1.4), w: statW, h: H(3), align: 'center', valign: 'middle', margin: 0, fontSize: FS(1.15), color: noHash(tint(colors.primary, 0.85)), fontFace: PJ })
    const ch = taggedChange(cur, prev)
    s.addText([
      { text: cur.toLocaleString('en-US'), options: { fontSize: FS(2.3), bold: true } },
      ...(ch ? [{ text: ` (${ch})`, options: { fontSize: FS(1.5), bold: true } }] : []),
    ], { x, y: top + H(4.6), w: statW, h: H(5), align: 'center', valign: 'middle', margin: 0, color: 'FFFFFF', fontFace: PJ })
  })

  // Top N.
  const cy = top + statH + H(1.6), ch = bottom - cy
  card(s, hx, cy, leftW, ch)
  const pad = W(1.2)
  s.addShape('rect', { x: hx + pad, y: cy + H(1.4), w: leftW - 2 * pad, h: H(3), fill: { color: noHash(tint(colors.primary, 0.88)) }, line: { type: 'none' } })
  s.addText(`TOP ${posts.length || n} TAGGED POST ENGAGEMENTS`, {
    x: hx + pad, y: cy + H(1.4), w: leftW - 2 * pad, h: H(3), align: 'center', valign: 'middle', margin: 0,
    fontSize: FS(1), bold: true, color: '0F172A', charSpacing: 0.4, fontFace: PJ,
  })
  if (posts.length === 0) {
    noDataText(s, hx, cy + H(5), leftW, ch - H(5), 'No tagged posts in this period')
  } else {
    const keys = posts.map(p => p.imageKey).filter((k): k is string => !!k)
    const resolved = resolveImages && keys.length ? await resolveImages(keys) : {}
    const areaY = cy + H(6), areaH = ch - H(6) - H(1.4)
    const textH = H(10.5)
    const imgH = areaH - textH
    const cGap = W(1)
    const cw = (leftW - 2 * pad - cGap * (posts.length - 1)) / posts.length
    const line = { margin: 0, wrap: false, valign: 'middle' as const, fontFace: PJ }
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]
      const x = hx + pad + i * (cw + cGap)
      const link = p.link ? { url: p.link, tooltip: p.link } : undefined
      const url = (p.imageKey && resolved[p.imageKey]) || p.image
      const data = url ? await toDataUrl(url) : null
      if (!data) s.addShape('rect', { x, y: areaY, w: cw, h: imgH, fill: { color: noHash(tint(colors.primary, 0.9)) }, line: { type: 'none' } })
      const linked = data ? await addCoverImage(s, data, x, areaY, cw, imgH, link) : false
      if (link && !linked) s.addShape('rect', { x, y: areaY, w: cw, h: imgH, fill: { color: 'FFFFFF', transparency: 100 }, line: { type: 'none' }, hyperlink: link })
      const ty = areaY + imgH + H(0.8), lh = H(2.4)
      // fit: 'shrink' tidak dijalankan pptxgenjs — handle panjang dikecilkan sendiri.
      const handle = `@${p.username}`
      const userFs = Math.max(6, Math.min(FS(0.95), Math.floor((cw * 72) / (handle.length * 0.6) * 10) / 10))
      s.addText(handle, { ...line, x, y: ty, w: cw, h: lh, fontSize: userFs, bold: true, color: '334155' })
      s.addText(fmtTaggedDate(p.date), { ...line, x, y: ty + lh, w: cw, h: lh, fontSize: FS(0.85), color: '64748B' })
      s.addText([
        { text: 'Eng.: ', options: { color: '64748B' } },
        { text: p.engagement.toLocaleString('en-US'), options: { color: '0F172A', bold: true } },
      ], { ...line, x, y: ty + 2 * lh, w: cw, h: lh, fontSize: FS(0.85) })
      if (link) s.addText([{ text: 'Open post ↗', options: { hyperlink: link, color: '2563EB', bold: true } }], { ...line, x, y: ty + 3 * lh, w: cw, h: lh, fontSize: FS(0.85) })
    }
  }

  insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx + leftW + gap, top, rightW, bottom - top, 'TAGGED POST INSIGHTS')
  await footer(s, chrome, colors, hx, H(89), hw)
}

/* ── Monthly Tracker Performance (deck revisi, slide 11 & 12) ─────────────
 * Tabel native (bisa diedit) + — untuk layout Chart + Table — chart garis
 * native dua sumbu dan kotak ringkasan. Cerminan MonthlyTrackerSlide.tsx.
 */
async function addMonthlyTrackerSlide(pptx: any, slide: ContentSlide, chrome: SlideChrome, colors: CoverColors, metrics?: ReportTableMetrics, chartMetrics?: ReportChartMetrics) {
  const s = pptx.addSlide()
  s.background = { color: noHash(tint(colors.primary, 0.965)) }
  s.addShape('rect', { x: 0, y: 0, w: S.w, h: H(0.5), fill: { color: noHash(colors.primary) }, line: { type: 'none' } })
  const { hx, hy, hw } = dashboardHeader(s, slide.title, colors)
  await channelBadge(s, slide.channel, hx + hw - W(1.5), hy)

  // Blok yang sama dengan Standard Dashboard (chartCard / insightsCard / tableCard);
  // proporsinya mengikuti MonthlyTrackerSlide.tsx (chart 33cqh, lalu tabel).
  let ty = H(18)
  if ((slide.trackerLayout ?? 'chart_table') === 'chart_table') {
    const rh = H(33), chartW = W(58.4)
    await chartCard(pptx, s, slide.chart, colors, hx, ty, chartW, rh, 'MAIN CHART AREA', chartMetrics, slide.channel)
    insightsCard(s, { text: slide.insights, ai: slide.aiInsight }, hx + chartW + W(2), ty, hw - chartW - W(2), rh, 'SUMMARY')
    ty += rh + H(2)
  }
  tableCard(s, slide.table, colors, slide.channel, hx, ty, hw, H(87) - ty, sectionFor(metrics, slide.table, slide.channel), sentimentTableFor(metrics?.sentiment, slide.channel), competitorFor(metrics, slide.table, slide.channel), customColumnsFrom(metrics), platformFor(metrics, slide.table), platformPrevFor(metrics, slide.table))
  await footer(s, chrome, colors, hx, H(89), hw)
}

export interface ReportExportOptions {
  cover: CoverConfig
  slides: ContentSlide[]
  chromes: SlideChrome[]
  colors: CoverColors
  brandName: string
  font: string
  metrics?: ReportTableMetrics | null
  chartMetrics?: ReportChartMetrics | null
  kpiMetrics?: ReportKpiMetrics | null
  /** Target KPI brand + capaiannya, untuk slide KPI Overview. */
  kpiTargets?: ReportKpiTargets | null
  /** Metrik YTD untuk slide YTD Performance. */
  ytdMetrics?: ReportYtdMetrics | null
  postMetrics?: ReportPostMetrics | null
  /** Post kompetitor untuk slide Visual Content bermode competitive review. */
  competitorPosts?: CompetitorPostPool | null
  /** Sentimen + demografi audiens untuk slide Audience Sentiment / Demographics. */
  audienceMetrics?: ReportAudienceMetrics | null
  /** 12 bulan s.d. bulan report + bulan report itu, untuk slide Monthly Tracker. */
  monthlyTracker?: { data: ReportMonthlyTracker | null; year: number; month: number } | null
  /** Resolver gambar post report — lihat @/lib/reports/images. */
  resolveImages?: ImageResolver | null
}

export async function exportReportPptx({ cover, slides, chromes, colors, brandName, font, metrics, chartMetrics, kpiMetrics, kpiTargets, ytdMetrics, postMetrics, competitorPosts, audienceMetrics, monthlyTracker, resolveImages }: ReportExportOptions): Promise<{ blob: Blob; fileName: string }> {
  PJ = font
  MONTHLY = monthlyTracker ?? null
  YTD = ytdMetrics ?? null
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'AUTOMETRIC_16x9', width: S.w, height: S.h })
  pptx.layout = 'AUTOMETRIC_16x9'

  await addCoverSlide(pptx, cover)

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const chrome = chromes[i]
    if (slide.type === 'section') await addSectionSlide(pptx, slide, chrome, colors)
    else if (slide.type === 'comparison') await addComparisonSlide(pptx, slide, chrome, colors, chartMetrics ?? undefined)
    else if (usesKpiLayout(slide.type)) await addKpiSlide(pptx, slide, chrome, colors, chartMetrics ?? undefined, kpiMetrics ?? undefined, metrics ?? undefined, kpiTargets ?? undefined, ytdMetrics ?? undefined)
    else if (slide.type === 'visual' || slide.type === 'activity') await addVisualSlide(pptx, slide, chrome, colors, postMetrics, competitorPosts, resolveImages)
    else if (slide.type === 'showcase') await addShowcaseSlide(pptx, slide, chrome, colors, postMetrics, resolveImages)
    else if (slide.type === 'overview') await addOverviewSlide(pptx, slide, chrome, colors, metrics ?? undefined, chartMetrics ?? undefined)
    else if (slide.type === 'sentiment') await addSentimentSlide(pptx, slide, chrome, colors, audienceMetrics)
    else if (slide.type === 'demographic') await addDemographicSlide(pptx, slide, chrome, colors, audienceMetrics)
    else if (slide.type === 'tagged') await addTaggedSlide(pptx, slide, chrome, colors, audienceMetrics, resolveImages)
    else if (slide.type === 'monthly_tracker') await addMonthlyTrackerSlide(pptx, slide, chrome, colors, metrics ?? undefined, chartMetrics ?? undefined)
    else await addDashboardSlide(pptx, slide, chrome, colors, metrics ?? undefined, chartMetrics ?? undefined)
  }

  const safe = (brandName || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const fileName = `${safe}-report.pptx`
  const blob = await fixTextHyperlinksForWps((await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer)
  return { blob, fileName }
}

/**
 * Perbaikan XML hasil pptxgenjs supaya terbaca WPS (lihat dua langkah di bawah).
 * pptxgenjs menulis hyperlink teks dengan `invalidUrl="" action="" tgtFrame=""`.
 * PowerPoint mengabaikan atribut kosong itu, tapi WPS membaca `action=""` sebagai
 * "tanpa aksi" dan membuang link-nya — #id dan ikon ↗ di kartu post jadi tidak bisa
 * diklik. Hyperlink pada shape tidak terkena (pptxgenjs tidak menulis atribut itu
 * di sana), jadi yang dibersihkan cukup run teks di XML slide.
 */
async function fixTextHyperlinksForWps(buf: ArrayBuffer): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buf)
  const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
  for (const path of slides) {
    const xml = await zip.file(path)!.async('string')
    if (xml.includes(' action="" ')) zip.file(path, xml.replaceAll(' invalidUrl="" action="" tgtFrame=""', ''))
  }
  // pptxgenjs juga menulis URL hyperlink ke .rels slide TANPA escape XML. Link
  // TikTok membawa query `?utm_campaign=…&utm_source=…`; `&` mentah itu membuat
  // .rels tidak valid, dan WPS lalu membuang SEMUA gambar slide itu — cover post,
  // logo channel, logo brand (report Fitbar Oktober 2026, slide TikTok). Link
  // Instagram tanpa query tidak terkena, makanya hanya slide TikTok yang kosong.
  const rels = Object.keys(zip.files).filter(p => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(p))
  for (const path of rels) {
    const xml = await zip.file(path)!.async('string')
    const fixed = xml.replace(/Target="([^"]*)"/g, (_, t: string) =>
      `Target="${t.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')}"`)
    if (fixed !== xml) zip.file(path, fixed)
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' })
}
