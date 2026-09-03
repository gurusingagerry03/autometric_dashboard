'use client'

import { createContext, useContext } from 'react'
import type { DashPlatform } from '@/components/dashboard/data'
import type { ReportTableMetrics, SectionMetrics, CompetitorSection, PlatformMetrics } from './tableTypes'
import type { ReportChartMetrics } from './chartTypes'
import type { ReportKpiMetrics } from './kpiMetrics'
import type { ReportPostMetrics } from './posts'
import type { ReportCompetitorPosts } from './competitorPostsQuery'

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
  const section = tableType === 'content_level' ? 'content'
    : tableType === 'channel_level' ? 'channel'
    : null
  if (!section) return null
  return metrics[section][channel as keyof typeof metrics.content] ?? null
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
