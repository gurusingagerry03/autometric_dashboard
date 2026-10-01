// Domain model for content slides (shared by the slide components and the
// PPTX exporter). Kept in lib so nothing imports types up from components.
import { CoverMode } from '../cover/colors'
import { CoverTemplate } from '../cover/templates'
import { ChartConfig } from './chartData'
import { TableConfig } from './tableTypes'
import type { SourceFilter } from './audienceTypes'

export type { ChartConfig } from './chartData'
export type { TableConfig } from './tableTypes'

export type SlideType = 'section' | 'dashboard' | 'comparison' | 'kpi' | 'dashboard_overview' | 'ytd' | 'visual' | 'activity' | 'overview' | 'sentiment' | 'demographic' | 'monthly_tracker'

/**
 * Slide yang memakai layout kartu post (grid kartu + catatan di bawah).
 *
 * - 'visual'   → Visual Analysis: post terbaik/terburuk milik sendiri atau
 *   kompetitor, diperingkat oleh metrik pilihan, disaring format & pilar.
 * - 'activity' → Activity Performance: HANYA post yang ditandai activity di tab
 *   Content Pillars, urutannya tetap (terbaru dulu). Satu-satunya pengaturannya
 *   jumlah kartu + metrik mana yang tampil — tidak ada Order, Source, Rank by,
 *   Format, maupun Pillar, karena tidak satu pun berarti untuk daftar acara.
 *
 * Keduanya berbagi komponen preview dan fungsi ekspor yang sama; yang berbeda
 * cuma kumpulan post dan katalog metriknya (lihat data/posts.ts).
 */
export const usesPostLayout = (type: SlideType) => type === 'visual' || type === 'activity'

/**
 * Slide yang memakai layout KPI (baris kartu + deep dive + ringkasan).
 *
 * KEDUANYA BERBAGI LAYOUT, BUKAN ISI
 *   - 'dashboard_overview' → scorecard metrik dashboard, dibandingkan dengan
 *     periode sebelumnya; metrik tiap kartu dipilih sendiri (metricCount +
 *     kpiMetrics di bawah).
 *   - 'ytd'                → metrik yang diakumulasi sejak awal jendela YTD
 *     brand (diturunkan dari periode KPI aktifnya), dibandingkan dengan jendela
 *     sepanjang itu tepat sebelumnya. Slot dan pemilihnya seperti Dashboard
 *     Overview — lihat data/ytdMetrics.ts.
 *   - 'kpi'                → target KPI brand dari tab KPI di halaman detail,
 *     dibandingkan dengan targetnya sendiri (achievement rate / run rate).
 *     Memakai `metricCount` + `kpiMetrics` yang SAMA, hanya isi slotnya yang
 *     berbeda artinya: di sini tiap slot menyimpan `kpiId`, bukan key metrik
 *     dashboard — lihat data/kpiTargets.ts. Comparison-nya dipilih lewat
 *     `kpiCompare`.
 *
 * Dipakai preview, exporter, dan jalur AI untuk hal yang sama-sama benar bagi
 * keduanya (bingkai slide, chart, ringkasan). Yang membedakan isinya adalah
 * pemeriksaan `type === 'kpi'` di ketiga tempat itu, bukan helper ini.
 */
export const usesKpiLayout = (type: SlideType) => type === 'kpi' || type === 'dashboard_overview' || type === 'ytd'
export type VisualMode = 'chart' | 'table' | null

/**
 * Angka yang ditampilkan kartu KPI Overview di bawah nilai capaiannya.
 *
 * 'both' memperlihatkan keduanya bertumpuk — satu-satunya mode yang membuat
 * achievement bisa dinilai sendiri, karena 40% itu bagus atau buruk tergantung
 * berapa banyak periodenya sudah terpakai. Dua mode lainnya untuk slide yang
 * ingin sepadat scorecard dashboard: satu baris angka saja.
 */
export type KpiCompare = 'both' | 'achievement' | 'run'
export const KPI_COMPARES: readonly KpiCompare[] = ['both', 'achievement', 'run']
export const KPI_COMPARE_LABEL: Record<KpiCompare, string> = {
  both: 'Achievement & run rate',
  achievement: 'Achievement rate only',
  run: 'Run rate only',
}
/**
 * Bentuk baris YTD Performance.
 *   - 'matrix' → satu tabel: Last Year / This Year / Growth × metrik (deck revisi
 *     Report Maker, slide 10). Bawaan — juga untuk slide lama yang belum punya field ini.
 *   - 'cards'  → scorecard per metrik seperti Dashboard Overview.
 */
export type YtdView = 'matrix' | 'cards'
export type TrackerLayout = 'chart_table' | 'table'
/** Which half of the demographic slide is drawn — or both, side by side. */
export type DemographicView = 'both' | 'age' | 'gender'

// ── AI analyst insight (Gemini) ──────────────────────────────────────────────
export type RecommendationType = 'SCALE' | 'REFINE' | 'EXPLORE' | 'STOP'
export interface AiRecommendation { type: RecommendationType; text: string }
export interface AiInsight { analysis: string; recommendations: AiRecommendation[] }

export interface ContentSlide {
  id: string
  type: SlideType
  title: string
  body: string       // section subtitle
  insights: string   // dashboard key-insights / comparison notes / kpi summary
  channel: string    // 'instagram' | 'facebook' | 'tiktok'
  chart: ChartConfig | null   // dashboard main chart / kpi deep-dive / overview chart
  table: TableConfig | null   // dashboard data table / overview table
  chartA: ChartConfig | null  // comparison left
  chartB: ChartConfig | null  // comparison right
  metricCount: number             // kpi — number of scorecards (3..6)
  /** kpi — per scorecard slot: metric key ('dashboard_overview') atau kpiId ('kpi'). */
  kpiMetrics: (string | null)[]
  /** kpi — angka pembanding yang ditampilkan kartu KPI Overview. */
  kpiCompare: KpiCompare
  postCount: number          // visual — number of post cards (4/6/8)
  postFilter: string         // visual — 'top' | 'low' | 'mixed'
  postFormat: string         // visual — format filter: 'all' | 'reel' | 'video' | 'carousel' | 'image'
  postPillar: string         // visual — content-pillar filter: 'all' | '<pillar id>'
  postSortMetric: string     // visual — metric the top/low ranking is based on
  postMetrics: string[]      // visual — which post metrics to show
  /** visual — 'owned' (default) atau 'competitor'. Layout & pengaturannya sama;
   *  yang berbeda hanya kumpulan post dan metrik yang tersedia. */
  postSource?: 'owned' | 'competitor'
  /** visual — id akun kompetitor yang ditampilkan saat postSource = 'competitor'. */
  postCompetitorId?: string
  visualMode: VisualMode     // overview — chart | table | null
  /**
   * sentiment — mana suara audiens yang dihitung: 'all' (komentar + tagged post),
   * atau salah satunya sendirian. Bukan pilihan kosmetik: tagged post jauh lebih
   * sedikit daripada komentar, jadi menggabungkan keduanya membuat angkanya
   * hampir seluruhnya komentar. Yang mau melihat suara tagged post apa adanya
   * harus bisa memisahkannya.
   */
  sentimentSource: SourceFilter
  /** sentiment — penyaring word cloud: 'all' | 'positive' | 'neutral' | 'negative'. */
  cloudSentiment: string
  /** demographic — 'age' | 'gender' | 'both'. */
  demographicView: DemographicView
  /** ytd — matriks (bawaan) atau scorecard. Opsional: template lama tidak punya. */
  ytdView?: YtdView
  /**
   * monthly_tracker — 'chart_table' (chart + ringkasan + tabel, deck slide 12) atau
   * 'table' (tabel saja, slide 11). Chart & tabelnya sendiri memakai `chart` dan
   * `table` biasa, dipilih lewat modal yang sama dengan slide lain.
   */
  trackerLayout?: TrackerLayout
  /** monthly_tracker — bulan mulai (YYYY-MM), dipilih saat slide dibuat. Disalin ke
   *  `chart.fromMonth` dan `table.fromMonth` lewat withTrackerFrom(). */
  trackerFrom?: string
  aiInsight: AiInsight | null // AI analyst insight (analysis + typed recommendations)
}

/** Block keys that open a configuration modal. (`kpi-<index>` = a KPI scorecard) */
export type ConfigBlock = 'chart' | 'table' | 'chartA' | 'chartB' | `kpi-${number}`

/**
 * A saved report template = reusable structure only (cover style + slides), with
 * NO brand/period/data. Applied to any brand + period; branding (colors/logo) and
 * live data come from the newly selected brand. Persisted as the `config` JSONB.
 */
export interface ReportTemplateCover {
  templateId: string
  mode: CoverMode
  font: string
  title: string
  subtitle: string
}
export interface ReportTemplateConfig {
  cover: ReportTemplateCover
  slides: ContentSlide[]
}
export interface ReportTemplateRecord {
  id: string
  name: string
  sourceBrandName: string | null
  slideCount: number
  slideTypes: SlideType[]
  config: ReportTemplateConfig
  createdAt: number
}

export interface SlideChrome {
  brandName: string
  period: string
  preparedBy: string
  logoDataUrl: string | null
  pageNumber: number
  totalPages: number
  template: CoverTemplate  // selected cover template (used by Section Heading)
  mode: CoverMode
  font: string             // report font name (e.g. 'Calibri')
}

const SLIDE_DEFAULTS: Record<SlideType, Partial<ContentSlide>> = {
  section: { title: 'Section Title', body: 'A short description of what follows' },
  dashboard: { title: 'Performance Dashboard' },
  comparison: { title: 'Period Comparison' },
  kpi: { title: 'KPI Overview' },
  dashboard_overview: { title: 'Dashboard Overview' },
  ytd: { title: 'YTD Performance' },
  visual: { title: 'Visual Analysis' },
  activity: { title: 'Activity Performance' },
  overview: { title: 'Overview Slide' },
  sentiment: { title: 'Audience Sentiment' },
  demographic: { title: 'Audience Demographics' },
  monthly_tracker: { title: 'Monthly Tracker Performance' },
}

/** Pilihan yang ditanyakan pemilih slide sebelum slide Monthly Tracker dibuat. */
export interface MonthlyTrackerSetup { layout: TrackerLayout; from: string }

/**
 * Ganti bulan mulai slide Monthly Tracker. Chart & tabelnya menyimpan salinan
 * sendiri (`fromMonth`) karena keduanya dirender blok umum yang tidak mengenal
 * slide-nya — jadi ketiganya diperbarui bersama di satu tempat ini.
 */
export function withTrackerFrom(slide: ContentSlide, from: string): ContentSlide {
  return {
    ...slide,
    trackerFrom: from,
    chart: slide.chart?.chartType === 'line' && slide.chart.dimension === 'monthly' ? { ...slide.chart, fromMonth: from } : slide.chart,
    table: slide.table?.type === 'monthly_tracker' ? { ...slide.table, fromMonth: from } : slide.table,
  }
}

export function makeSlide(type: SlideType, seq: number, channel = 'instagram', tracker?: MonthlyTrackerSetup): ContentSlide {
  const d = SLIDE_DEFAULTS[type]
  const slide: ContentSlide = {
    id: `s${seq}-${Date.now()}`,
    type,
    title: d.title ?? '',
    body: d.body ?? '',
    insights: '',
    channel,
    // Monthly Tracker lahir sudah terisi sesuai deck revisi (slide 12): garis
    // Followers Growth vs Profile Reach per bulan, dan tabel bulanan. Keduanya tetap
    // bisa diganti lewat ChartSelectionModal / TableSelectionModal seperti slide lain.
    chart: type === 'monthly_tracker'
      ? { chartType: 'line', dimension: 'monthly', metrics: ['net_followers_growth', 'profile_reach'] }
      : null,
    table: type === 'monthly_tracker'
      ? { type: 'monthly_tracker', columns: ['followers', 'followers_growth', 'reach', 'profile_visit', 'total_posts', 'engagement', 'key_highlight'] }
      : null,
    chartA: null,
    chartB: null,
    metricCount: 4,
    kpiMetrics: [null, null, null, null, null, null],
    kpiCompare: 'both',
    postCount: 4,
    postFilter: 'top',
    postSource: 'owned',
    postFormat: 'all',
    postPillar: 'all',
    postSortMetric: 'engagement',
    // Activity Performance berangkat dengan kosong: effectiveActivityMetrics()
    // membaca itu sebagai "tampilkan ketujuhnya", sedangkan default Visual
    // ('reach' dsb.) justru akan menampilkan metrik yang tidak ada di katalognya.
    postMetrics: type === 'activity' ? [] : ['reach', 'engagement', 'er'],
    visualMode: null,
    sentimentSource: 'all',
    cloudSentiment: 'all',
    demographicView: 'both',
    ytdView: 'matrix',
    trackerLayout: tracker?.layout ?? 'chart_table',
    aiInsight: null,
  }
  return type === 'monthly_tracker' && tracker ? withTrackerFrom(slide, tracker.from) : slide
}
