'use client'

import { createContext, useContext } from 'react'
import type { DashPlatform } from '@/components/dashboard/data'
import type { ReportTableMetrics, SectionMetrics, CompetitorSection, PlatformMetrics } from './tableTypes'
import type { ReportChartMetrics } from './chartTypes'
import type { ReportKpiMetrics } from './kpiMetrics'
import type { ReportKpiTargets } from './kpiTargets'
import type { ReportYtdMetrics } from './ytdMetrics'
import type { ReportPostMetrics } from './posts'
import type { ReportCompetitorPosts } from './competitorPostsQuery'
import type { ReportAudienceMetrics } from './audienceTypes'

/**
 * Real table-metric values for the current report (brand + period), provided by
 * ReportBuilder and consumed by TableBlock so the preview shows live DB numbers
 * without prop-drilling through the slide tree. Null while loading / unavailable
 * (TableBlock then renders "—" — never dummy).
 */
export const ReportMetricsContext = createContext<ReportTableMetrics | null>(null)

export function useReportMetrics(): ReportTableMetrics | null {
  return useContext(ReportMetricsContext)
}

/**
 * Real line-chart time series for the current report (brand + period), provided
 * by ReportBuilder and consumed by ChartBlock. Null while loading / unavailable
 * (the chart then shows an empty state, per metric — never dummy).
 */
export const ReportChartContext = createContext<ReportChartMetrics | null>(null)

export function useReportChart(): ReportChartMetrics | null {
  return useContext(ReportChartContext)
}

/**
 * Real KPI scorecard values for the current report (brand + period), provided by
 * ReportBuilder and consumed by KpiSlide / MetricPickerModal. Null while loading
 * (the scorecards then render "—" — never dummy).
 */
export const ReportKpiContext = createContext<ReportKpiMetrics | null>(null)

export function useReportKpi(): ReportKpiMetrics | null {
  return useContext(ReportKpiContext)
}

/**
 * Target KPI brand + capaiannya, dipakai slide KPI Overview (bukan Dashboard
 * Overview, yang tetap memakai ReportKpiContext di atas). Terpisah karena
 * sumbernya memang lain — `kpi_setting` + `kpi_achievement`, bukan agregat
 * gold — dan periodenya milik KPI-nya sendiri, bukan bulan report.
 *
 * null selama memuat; slide-nya lalu menyebut begitu, tidak menggambar nol.
 */
export const ReportKpiTargetContext = createContext<ReportKpiTargets | null>(null)

export function useReportKpiTargets(): ReportKpiTargets | null {
  return useContext(ReportKpiTargetContext)
}

/**
 * Metrik YTD untuk slide YTD Performance: akumulasi sejak awal jendela YTD brand
 * plus jendela pembandingnya. Terpisah dari ReportKpiContext karena rentangnya
 * bukan bulan report — bulan report hanya menentukan di mana akumulasinya
 * berhenti. null selama memuat.
 */
export const ReportYtdContext = createContext<ReportYtdMetrics | null>(null)

export function useReportYtd(): ReportYtdMetrics | null {
  return useContext(ReportYtdContext)
}

/**
 * Live post pool (per channel) for the current report (brand + month), provided by
 * ReportBuilder and consumed by the Visual Analysis slide. Null while loading /
 * unavailable (the slide then shows an empty state — never dummy).
 */
export const ReportPostContext = createContext<ReportPostMetrics | null>(null)

export function useReportPosts(): ReportPostMetrics | null {
  return useContext(ReportPostContext)
}

/** Kumpulan post kompetitor untuk slide Visual Content mode competitive review. */
export const ReportCompetitorPostContext = createContext<ReportCompetitorPosts | null>(null)
export function useReportCompetitorPosts(): ReportCompetitorPosts | null {
  return useContext(ReportCompetitorPostContext)
}

/** Report-level meta (org + brand + period) for the AI insight generator. */
export interface ReportAIMeta { orgId: string; brandName: string; period: string }
export const ReportAIContext = createContext<ReportAIMeta | null>(null)
export function useReportAI(): ReportAIMeta | null {
  return useContext(ReportAIContext)
}

/** Resolve the metrics sub-map for a table (by type) on a given channel. */
export function sectionMetricsFor(
  metrics: ReportTableMetrics | null | undefined,
  tableType: string,
  channel: string,
): SectionMetrics | null {
  if (!metrics) return null
  if (tableType === 'cross_level') return crossSectionMetrics(metrics, channel)
  const section = tableType === 'content_level' ? 'content'
    : tableType === 'channel_level' ? 'channel'
    : null
  if (!section) return null
  return metrics[section][channel as keyof typeof metrics.content] ?? null
}

/**
 * Cross-Level: kedua level dirakit jadi satu peta dengan awalan id yang sama
 * dengan kolomnya di tableTypes ('ct:' / 'ch:'). Tanpa awalan, metrik yang
 * namanya sama di dua level — `profile_visit`, `eng_owned` — akan saling
 * menimpa dan tabelnya menampilkan angka dari level yang salah tanpa ada
 * tanda apa pun.
 *
 * Custom metric org disalin APA ADANYA tanpa awalan: pemilih kolomnya memakai
 * id telanjang, dan metricsQuery menuliskan nilai yang sama ke kedua level
 * (lihat injectCustomMetrics), jadi tidak ada level yang "benar" untuk dipilih.
 */
function crossSectionMetrics(
  metrics: ReportTableMetrics, channel: string,
): SectionMetrics | null {
  const key = channel as keyof typeof metrics.content
  const ct = metrics.content[key] ?? null
  const ch = metrics.channel[key] ?? null
  if (!ct && !ch) return null

  const merged: SectionMetrics = {}
  for (const [k, v] of Object.entries(ct ?? {})) merged['ct:' + k] = v
  for (const [k, v] of Object.entries(ch ?? {})) merged['ch:' + k] = v
  for (const c of metrics.customMetrics ?? []) {
    const v = ct?.[c.id] ?? ch?.[c.id]
    if (v) merged[c.id] = v
  }
  return merged
}

/** The Brand-vs-Competitor section for a channel (a specific platform), or null. */
export function competitorSectionFor(
  metrics: ReportTableMetrics | null | undefined,
  channel: string,
): CompetitorSection | null {
  if (!metrics?.competitors) return null
  return metrics.competitors[channel as DashPlatform] ?? null
}

/** The per-platform values for a comparison table (content/channel by platform), or null. */
export function platformMetricsFor(
  metrics: ReportTableMetrics | null | undefined,
  tableType: string,
): PlatformMetrics | null {
  if (!metrics) return null
  if (tableType === 'content_by_platform') return metrics.contentByPlatform ?? null
  if (tableType === 'channel_by_platform') return metrics.channelByPlatform ?? null
  // Cross-level: nilai kedua level dirakit jadi satu, dengan awalan id yang sama
  // dengan kolomnya di tableTypes ('ct:' / 'ch:'). Tanpa awalan, metrik yang
  // namanya sama di dua level akan saling menimpa tanpa ada yang menyadari.
  if (tableType === 'cross_by_platform') {
    const ct = metrics.contentByPlatform ?? {}
    const ch = metrics.channelByPlatform ?? {}
    const platforms = new Set([...Object.keys(ct), ...Object.keys(ch)]) as Set<DashPlatform>
    if (platforms.size === 0) return null
    const merged: PlatformMetrics = {}
    for (const p of platforms) {
      const row: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(ct[p] ?? {})) row['ct:' + k] = v
      for (const [k, v] of Object.entries(ch[p] ?? {})) row['ch:' + k] = v
      merged[p] = row
    }
    return merged
  }
  return null
}

/**
 * Audience sentiment + demographics for the current report (brand + month),
 * provided by ReportBuilder and consumed by the Audience Sentiment / Audience
 * Demographic slides. Null while loading — the slides then say so rather than
 * drawing zeros, which on a sentiment slide would read as "nobody said anything
 * positive" instead of "not loaded yet".
 */
export const ReportAudienceContext = createContext<ReportAudienceMetrics | null>(null)

export function useReportAudience(): ReportAudienceMetrics | null {
  return useContext(ReportAudienceContext)
}
