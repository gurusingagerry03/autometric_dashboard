/**
 * Shared shapes and presentation constants for the analytics dashboard.
 *
 * Everything a dashboard renders comes from the database — each tab fetches its
 * own payload from /api/organizations/[id]/dashboard/*, which reads l2_gold (and
 * l1_silver where post-level detail is needed). There is deliberately NO sample
 * data here: a screen with nothing behind it says so, because a number the user
 * cannot trace back to their own accounts is worse than an empty state.
 *
 * What lives here is only what both sides need to agree on: the payload types,
 * the platform/pillar presentation maps, and the number formatters.
 */

export type DashPlatform = 'instagram' | 'facebook' | 'tiktok'

export const PLATFORM_META: Record<DashPlatform, { label: string; short: string; color: string; logo: string }> = {
  instagram: { label: 'Instagram', short: 'IG', color: '#c13584', logo: '/instagram.png' },
  facebook:  { label: 'Facebook',  short: 'FB', color: '#1877f2', logo: '/facebook.png' },
  tiktok:    { label: 'TikTok',    short: 'TT', color: '#111827', logo: '/tiktok.png' },
}

// Accent palette used where several entities must be told apart (comparison
// charts, pillar colours). Single-measure charts use SERIES from charts.tsx.
export const PALETTE = ['#1B8A80', '#e0a458', '#5fa783', '#d97a7a', '#8b7fc7', '#5b94b8']

export interface DashBrand {
  id: string
  name: string
  handle: string
  initials: string
  color: string
  followers: number
  platforms: DashPlatform[]
  logo?: string | null   // brand logo URL (public.brands.profile_url); null → initials badge
}

export interface Kpi {
  key: string
  label: string
  icon: string
  value: string
  /** Unrounded figure behind `value`; see OverviewKpi.exact. */
  exact?: string
  delta: number          // percent change vs previous period; sign matters
  positiveIsGood: boolean
  spark: number[]        // mini trend
  ownAccountOnly?: boolean
}

export const PERIODS = ['7 days', '30 days', '90 days', 'Custom'] as const
export type Period = typeof PERIODS[number]

export const PLATFORM_FILTERS = ['All', 'instagram', 'facebook', 'tiktok'] as const
export type PlatformFilter = typeof PLATFORM_FILTERS[number]

// Number formatting lives in the shared module the payload builders also use, so
// a figure is rounded the same way on both sides of the wire. Re-exported here
// because every dashboard view already imports from this file.
export { fmtNum, fmtInt, compact, compactSigned } from '@/lib/dashboard/format'

/* ─────────────────────────  OVERVIEW  ───────────────────────── */

// Headline KPIs roll up every brand × platform. Deltas are free-form strings
// because they mix units (%, pts, and qualitative notes).
export interface OverviewKpi {
  key: string
  label: string
  icon: string
  value: string
  /**
   * The unrounded figure `value` stands for ("38,142,905" behind "38.1M"), shown
   * on hover. Absent when nothing was rounded away — a percentage, say — and the
   * card then renders no hover at all.
   */
  exact?: string
  delta: string
  good: boolean
  flat?: boolean              // neutral "=" state; overrides the up/down arrow
  dir?: 'up' | 'down'         // force arrow direction independent of `good` (e.g. "improved" drop)
  spark: number[]
  /**
   * The source holds no rows for this metric at all — as opposed to holding rows
   * that add up to zero. The card then says so instead of printing "0", because a
   * zero the reader believes is a measurement is worse than an honest blank.
   */
  unavailable?: boolean
}

// Multi-brand trend, one series per brand, switchable by metric.
export type TrendMetric = 'Engagement' | 'Reach' | 'Followers'
export const TREND_METRICS: TrendMetric[] = ['Engagement', 'Reach', 'Followers']

export interface TrendSeries { name: string; color: string; data: number[] }

// Cross-brand, cross-platform benchmarking matrix.
export interface BrandMatrixRow {
  brand: string
  platform: DashPlatform
  followers: number
  reach: number
  engagement: number
  er: number
  posts: number
  trend: 'up' | 'flat' | 'down'
}

// Engagement rate by content tag (extra_attribute schema).
export interface ContentAttribute { label: string; count: number; er: number; color: string }

// Axis labels for the best-posting-times heatmap.
export const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const HEATMAP_TIME_LABELS = ['08:00', '12:00', '15:00', '18:00', '20:00', '22:00']

/* ─────────────────────────  CONTENT OVERVIEW  ───────────────────────── */

// Top posts ranked by engagement rate, all platforms combined.
export interface TopPostRow {
  rank: number
  platform: DashPlatform
  caption: string
  format: string
  reach: number
  views: number
  likes: number
  comments: number
  shares: number | null
  er: number
  tag: 'Organic' | 'Boosted'
  /** Permalink to the post on its platform; null when the source has no URL. */
  link?: string | null
}

/* ─────────────────────────  AUDIENCE & COMMUNITY  ───────────────────────── */

// Comment relevance tiers — semantic scoring of comments vs. their caption.
export interface RelevanceTierRow {
  tier: string
  range: string
  count: number
  pct: number
  desc: string
  color: string
  samples: string[]
}

// Top community contributors ranked by frequency × relevance.
//
// The composite score that produces the ordering stays in SQL and never reaches
// the screen: it was removed on client request, so carrying it here would only
// invite it back into a column.
export interface ContributorRow {
  rank: number
  initials: string
  username: string
  platform: DashPlatform
  comments: number
  likes: number
  daily: number
  relevance: number
  tier: 'Super Fan' | 'Active' | 'Casual'
  color: string
}

// User-generated content — tagged posts.
export interface UgcPost {
  username: string
  format: string
  caption: string
  likes: number
  comments: number
  total: number
  date: string
  /** Permalink to the tagged post; null when the source has no URL. */
  link?: string | null
}

/* ─────────────────────────  CAMPAIGN & PILLARS  ───────────────────────── */

// Presentation for the pillar keys the seed ships with; unknown pillars from the
// database fall back to a hashed colour (see pillarMeta in CampaignDashboard).
export const PILLAR_META: Record<string, { label: string; color: string }> = {
  drama:         { label: 'drama',         color: '#d23f6f' },
  entertainment: { label: 'entertainment', color: '#8b5cf6' },
  sports:        { label: 'sports',        color: '#3d7eea' },
  brand:         { label: 'brand',         color: '#6c4cd6' },
}

// Palette offered in the pillar colour picker.
export const PILLAR_COLORS = ['#6c4cd6', '#d23f6f', '#3d7eea', '#5fa783', '#e0a458', '#8b5cf6', '#1B8A80', '#d97a7a']
