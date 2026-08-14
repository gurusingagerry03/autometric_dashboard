// Chart configuration data + real-data resolvers, mirrored 1:1 from report_2's
// ChartSelectionModal / SmartChartBlock so the metric-selection flow matches exactly.
import { CoverColors } from '../cover/colors'
import {
  AxisScale, ReportChartMetrics, niceScale, chartSeriesFor, dimensionLabelsFor,
  barCategoryFor, barScale, sentimentSeriesFor, SentimentKey,
} from './chartTypes'

export type ChartCategory = 'line' | 'bar' | 'wordcloud'
export type LineDimension = 'daymonth' | 'last3months' | 'days'
export type BarOrientation = 'vertical' | 'horizontal'

export interface ChartConfig {
  chartType: ChartCategory
  // line
  dimension?: LineDimension
  metrics?: string[]
  // bar
  barOrientation?: BarOrientation
  barCategory?: string
  barMetrics?: string[]
  /** 'content_pillars' only — put previous vs current month side by side per pillar. */
  barCompare?: 'period'
  competitorIds?: string[]  // 'competitors' bar category only — chosen competitors (undefined = all)
  // wordcloud
  sentiment?: string
}

export const MAX_LINE_METRICS = 2

export const LINE_DIMENSIONS = [
  { id: 'daymonth', label: 'Day Month', icon: 'calendar_month', desc: 'Daily trends (1 Jun, 2 Jun, etc.)' },
  { id: 'last3months', label: 'Last 3 Months', icon: 'schedule', desc: 'Recent 3-month comparison' },
  { id: 'days', label: 'Daily', icon: 'show_chart', desc: 'Day of week analysis (Sun, Mon, etc.)' },
] as const

export const LINE_METRICS = [
  { id: 'followers', label: 'Followers', icon: 'group' },
  { id: 'profile_views', label: 'Profile Views', icon: 'visibility' },
  { id: 'profile_reach', label: 'Profile Reach', icon: 'trending_up' },
  { id: 'net_followers_growth', label: 'Net Followers Growth', icon: 'trending_up' },
  { id: 'engagements', label: 'Engagements', icon: 'favorite' },
  { id: 'likes', label: 'Likes', icon: 'favorite' },
  { id: 'comments', label: 'Comments', icon: 'chat_bubble' },
  { id: 'shares', label: 'Shares', icon: 'share' },
  { id: 'sentiments', label: 'Sentiments (Neg, Neu, Pos)', icon: 'bubble_chart' },
] as const

export const BAR_CATEGORIES = [
  {
    id: 'daily_performance', label: 'Daily Performance', desc: 'Daily metrics breakdown',
    metrics: [
      { id: 'profile_views', label: 'Profile Views' },
      { id: 'engagement', label: 'Engagement' },
      { id: 'followers', label: 'Followers' },
      { id: 'net_followers_growth', label: 'Net Followers Growth' },
    ],
  },
  {
    id: 'last3months_performance', label: 'Last 3 Months Performance', desc: 'Quarterly comparison',
    metrics: [
      { id: 'followers', label: 'Followers' },
      { id: 'followers_growth_pct', label: 'Followers Growth (%)' },
      { id: 'er_reach', label: 'ER Reach' },
      { id: 'engagements', label: 'Engagements' },
      { id: 'avg_engagements', label: 'Avg Engagements' },
      { id: 'total_reach', label: 'Total Reach' },
    ],
  },
  {
    id: 'content_pillars', label: 'Content Pillars Comparison', desc: 'Compare content categories',
    metrics: [
      { id: 'number_of_posts', label: 'Number of Posts' },
      { id: 'avg_er_pct', label: 'Avg ER%' },
      { id: 'avg_reach', label: 'Avg Reach' },
      { id: 'engagement', label: 'Engagement' },
      { id: 'avg_engagements', label: 'Avg Engagements' },
    ],
  },
  {
    // Only metrics computable for BOTH brand and competitors (public scraping has
    // no reach, so ER-Reach / Reach are excluded from this comparison category).
    id: 'competitors', label: 'Competitors Comparison', desc: 'Compare with competitors',
    metrics: [
      { id: 'engagements', label: 'Engagements' },
      { id: 'avg_engagements', label: 'Avg Engagements' },
      { id: 'followers_growth', label: 'Followers Growth' },
      { id: 'followers_growth_pct', label: 'Followers Growth (%)' },
    ],
  },
] as const

export const WORDCLOUD_SENTIMENTS = [
  { id: 'all', label: 'All', desc: 'All sentiments combined' },
  { id: 'positive', label: 'Positive', desc: 'Positive sentiment words' },
  { id: 'negative', label: 'Negative', desc: 'Negative sentiment words' },
  { id: 'neutral', label: 'Neutral', desc: 'Neutral sentiment words' },
] as const

// id → display label across every metric source
export const METRIC_LABELS: Record<string, string> = (() => {
  const m: Record<string, string> = { sentiments: 'Sentiments' }
  LINE_METRICS.forEach(x => (m[x.id] = x.label))
  BAR_CATEGORIES.forEach(c => c.metrics.forEach(x => (m[x.id] = x.label)))
  return m
})()

/* ── axis labels (real labels; used as placeholders only while ctx is null) ────── */

const monthShort = (offset: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleString('en', { month: 'short' })
}

export function dimensionLabels(dim?: LineDimension): string[] {
  switch (dim) {
    case 'days': return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    case 'last3months': return [monthShort(-2), monthShort(-1), monthShort(0)]
    case 'daymonth':
    default: {
      const mo = monthShort(0)
      return [1, 6, 11, 16, 21, 26].map(d => `${d} ${mo}`)
    }
  }
}

export function barCategoryLabels(cat?: string): string[] {
  switch (cat) {
    case 'daily_performance': return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    case 'last3months_performance': return [monthShort(-2), monthShort(-1), monthShort(0)]
    case 'content_pillars': return ['Educational', 'Promotional', 'Entertainment', 'UGC']
    case 'competitors': return ['Brand', 'Comp A', 'Comp B', 'Comp C']
    default: return ['A', 'B', 'C', 'D']
  }
}

export interface Series { name: string; color: string; data: number[] }

const SENTIMENT_COLORS: Record<string, string> = { Negative: '#ef4444', Neutral: '#94a3b8', Positive: '#22c55e' }

/* ── real line data (shared by preview + PPTX export) ────────────────────────── */

// A line series carrying its own value-axis scale, so two metrics of very
// different magnitude each get a readable axis (dual-axis: left = series[0],
// right = series[1]).
export interface LineSeries extends Series { scale: AxisScale }

/**
 * Resolve the line chart's series against REAL report data ONLY (no dummy). A
 * metric with no data for the brand+period is omitted; `sentiments` has no
 * pipeline so it returns nothing. Shared by the on-screen chart and the PPTX
 * exporter, so both show real data or an empty state — never fabricated series.
 */
export function resolveLineData(
  config: ChartConfig, ctx: ReportChartMetrics | null, channel: string, colors: CoverColors,
): { labels: string[]; series: LineSeries[] } {
  const dim = config.dimension ?? 'daymonth'
  const labels = ctx ? dimensionLabelsFor(dim, ctx.meta) : dimensionLabels(dim)

  // Sentiments → 3 real daily-count series (Negative / Neutral / Positive) from
  // l2_gold.comment_sentiment_daily, sharing one value axis (comparable counts).
  if (config.metrics?.includes('sentiments')) {
    const defs: { key: SentimentKey; name: string }[] = [
      { key: 'negative', name: 'Negative' },
      { key: 'neutral', name: 'Neutral' },
      { key: 'positive', name: 'Positive' },
    ]
    const raw = defs
      .map(d => ({ d, data: sentimentSeriesFor(ctx, channel, d.key, dim) }))
      .filter((x): x is { d: { key: SentimentKey; name: string }; data: number[] } => !!x.data && x.data.length > 0)
    if (!raw.length) return { labels, series: [] }
    const scale = niceScale(raw.flatMap(x => x.data))
    return { labels, series: raw.map(x => ({ name: x.d.name, color: SENTIMENT_COLORS[x.d.name], data: x.data, scale })) }
  }

  const palette = [colors.primary, colors.accent, colors.secondary]
  const customLabel = (id: string) => ctx?.customMetrics?.find(c => c.id === id)?.label
  const series: LineSeries[] = []
  ;(config.metrics ?? []).forEach((id, idx) => {
    const data = chartSeriesFor(ctx, channel, id, dim)
    if (data && data.length) {
      series.push({ name: METRIC_LABELS[id] ?? customLabel(id) ?? id, color: palette[idx % palette.length], data, scale: niceScale(data) })
    }
  })
  return { labels, series }
}

/* ── real bar data (shared by preview + PPTX export) ─────────────────────────── */

// A bar series carrying the value-axis scale it should be plotted against.
// `group` ties several series into ONE mini chart (period comparison: the previous
// and current month of the same metric). Absent = the series is its own mini chart.
export interface BarSeries extends Series { scale: AxisScale; group?: string }

/** Bar series grouped into mini charts — series sharing a `group` render together. */
export function groupBarSeries(series: BarSeries[]): { title: string; series: BarSeries[] }[] {
  const out: { title: string; series: BarSeries[] }[] = []
  for (const s of series) {
    const title = s.group ?? s.name
    const bucket = out.find(g => g.title === title)
    if (bucket) bucket.series.push(s)
    else out.push({ title, series: [s] })
  }
  return out
}

// The previous period reads as a muted bar next to the metric's own color, the
// convention for "same metric, earlier window".
const PREV_PERIOD_COLOR = '#c3cbd6'

/**
 * Resolve a bar chart against REAL report data only (no dummy) — a metric with no
 * data yields no series → empty state. Rendered as SMALL MULTIPLES: each metric becomes its own mini bar
 * chart over the category members (`labels` = days / months / pillars), each with
 * its OWN real value axis (from a zero baseline) — so metrics of very different
 * magnitude each read clearly in true units. `content_pillars` labels come from
 * the data (real per-brand pillar names).
 */
export function resolveBarData(
  config: ChartConfig, ctx: ReportChartMetrics | null, channel: string, colors: CoverColors,
): { labels: string[]; series: BarSeries[] } {
  const cat = config.barCategory
  const ids = config.barMetrics ?? []
  const customLabel = (id: string) => ctx?.customMetrics?.find(c => c.id === id)?.label
  const paletteBar = [colors.primary, colors.accent, colors.secondary, '#d96d6d']

  // Competitors category: entity-based (Brand + chosen competitors), assembled here
  // so the selection (config.competitorIds) can change without refetching. Each
  // metric becomes a bar series with one value per entity. Real data only.
  if (cat === 'competitors') {
    const sec = ctx?.competitors?.[channel as keyof NonNullable<typeof ctx.competitors>]
    if (!sec) return { labels: barCategoryLabels('competitors'), series: [] }
    const sel = config.competitorIds
    const chosen = sel ? sec.competitors.filter(c => sel.includes(c.id)) : sec.competitors
    const entities = [sec.brand, ...chosen]
    const labels = entities.map(e => e.label)
    const series: BarSeries[] = []
    ids.forEach((id, idx) => {
      const data = entities.map(e => e.metrics[id] ?? 0)
      if (data.some(v => Number.isFinite(v) && v !== 0)) {
        series.push({ name: METRIC_LABELS[id] ?? customLabel(id) ?? id, color: paletteBar[idx % paletteBar.length], data, scale: barScale(data) })
      }
    })
    return { labels, series }
  }

  const catData = barCategoryFor(ctx, channel, cat)
  const labels = catData?.labels.length ? catData.labels : barCategoryLabels(cat)
  const n = labels.length
  const palette = [colors.primary, colors.accent, colors.secondary, '#d96d6d']

  // Period comparison (content pillars): each metric becomes ONE mini chart holding
  // two bars per pillar — previous month, then the report month — on a shared axis,
  // so the deck reads both "pillar vs pillar" and "month over month" at once.
  if (config.barCompare === 'period' && catData?.metricsPrev) {
    const months = ctx ? ctx.meta.monthLabels : dimensionLabels('last3months')
    const prevLabel = months[months.length - 2] ?? 'Previous'
    const currLabel = months[months.length - 1] ?? 'Current'
    const series: BarSeries[] = []
    ids.forEach((id, idx) => {
      const curr = catData.metrics?.[id]
      const prev = catData.metricsPrev?.[id]
      // A metric that ran in only one of the two months still gets its pair — the
      // month without data reads as a zero bar rather than silently disappearing.
      if (curr?.length !== n && prev?.length !== n) return
      const zeros = new Array<number>(n).fill(0)
      const currData = curr?.length === n ? curr : zeros
      const prevData = prev?.length === n ? prev : zeros
      const title = METRIC_LABELS[id] ?? customLabel(id) ?? id
      const scale = barScale([...currData, ...prevData])
      series.push({ name: prevLabel, group: title, color: PREV_PERIOD_COLOR, data: prevData, scale })
      series.push({ name: currLabel, group: title, color: palette[idx % palette.length], data: currData, scale })
    })
    return { labels, series }
  }

  // Real data only — a metric/category with no data (e.g. competitors, or an empty
  // period) yields no series → the chart shows an empty state, never dummy bars.
  const series: BarSeries[] = []
  ids.forEach((id, idx) => {
    const real = catData?.metrics?.[id]
    if (real && real.length === n) {
      series.push({ name: METRIC_LABELS[id] ?? customLabel(id) ?? id, color: palette[idx % palette.length], data: real, scale: barScale(real) })
    }
  })
  return { labels, series }
}

export type Sentiment = 'positive' | 'neutral' | 'negative'

// Sentiment → shade options (vary within a sentiment for variety). Word colors
// are resolved from real data now (see l2_gold.post_wordcloud + comment_sentiment_post).
export const SENTIMENT_PALETTES: Record<Sentiment, string[]> = {
  positive: ['#15803d', '#16a34a', '#22c55e'],
  neutral: ['#475569', '#64748b', '#94a3b8'],
  negative: ['#b91c1c', '#dc2626', '#ef4444'],
}

// `labelOf` resolves ids not in the static catalog (org custom metrics) to their label.
export function chartSummary(c: ChartConfig, labelOf?: (id: string) => string | undefined): string {
  const lbl = (m: string) => METRIC_LABELS[m] ?? labelOf?.(m) ?? m
  if (c.chartType === 'line') return (c.metrics ?? []).map(lbl).join(' · ')
  if (c.chartType === 'bar') {
    const metrics = (c.barMetrics ?? []).map(lbl).join(' · ')
    return c.barCompare === 'period' ? `${metrics} · vs previous month` : metrics
  }
  return `Word cloud${c.sentiment && c.sentiment !== 'all' ? ` · ${c.sentiment}` : ''}`
}

export function chartIcon(c: ChartConfig): string {
  return c.chartType === 'bar' ? 'bar_chart' : c.chartType === 'wordcloud' ? 'bubble_chart' : 'show_chart'
}
