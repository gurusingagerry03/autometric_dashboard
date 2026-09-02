'use client'

import { Children, isValidElement } from 'react'
import { Sparkline } from './charts'
import MetricInfo from '@/components/ui/MetricInfo'
import ExactValue from '@/components/ui/ExactValue'
import type { Kpi, OverviewKpi } from './data'
import { useT } from '@/lib/i18n/LanguageContext'
import type { DataArea } from '@/lib/dashboard/dataAreas'
import { CardSkeleton, useAreaState, type SkeletonKind } from './dataReadiness'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/* Card shell — the building block of the dense grid.
 *
 * `area` names the l2_gold table behind this card. While a newly connected brand is
 * still being processed and that table has nothing for it yet, the card draws a
 * skeleton instead of its content — see dataReadiness.tsx. Cards that show filters,
 * notes, or user-edited settings should leave `area` out; they are never "pending".
 *
 * The card's own <CardHead> is deliberately kept while the skeleton shows: the metric's
 * name is the one thing already known for certain, and swallowing it would turn an
 * informative wait into a grey box. Cards with a custom header (not CardHead) simply
 * render the skeleton alone. */
export function Card({ children, className = '', span, area, skeleton = 'chart' }: {
  children: React.ReactNode; className?: string; span?: string
  area?: DataArea | null
  /** Shape of the placeholder, so the layout does not jump when real data lands. */
  skeleton?: SkeletonKind
}) {
  const state = useAreaState(area)
  const shell = `bg-white border border-[#e5e7eb] rounded-xl ${span ?? ''} ${className}`

  // Only `building` swaps the body. `empty` means the procedure already ran and this
  // brand genuinely has nothing — the card's own empty state is the honest answer.
  if (state !== 'building') {
    return <div className={shell}>{children}</div>
  }

  const head = Children.toArray(children).find(c => isValidElement(c) && c.type === CardHead)

  return (
    <div className={shell}>
      {head}
      <CardSkeleton kind={skeleton} />
    </div>
  )
}

export function CardHead({ title, sub, action, metricKey }: {
  title: string; sub?: string; action?: React.ReactNode
  /** Glossary key — renders an (i) next to the title when it resolves. */
  metricKey?: string
}) {
  return (
    <div className="flex items-start justify-between px-4 pt-3.5 pb-2">
      <div>
        <h3 style={PJ} className="flex items-center gap-1 text-[12.5px] font-bold text-[#111827] tracking-[-0.01em]">
          {title}
          <MetricInfo metricKey={metricKey} size={13} />
        </h3>
        {sub && <p className="text-[11px] text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * A table's column headings, each carrying its own glossary (i).
 *
 * Tables are where a metric is most likely to be misread — the column name is
 * the only context a cell gets — so every measured column explains itself the
 * same way a chart card does. Pass a metric key of `null` for the columns that
 * need no explanation (rank, avatar, date) and no icon is rendered.
 */
export function TableHeadRow({ cols, className = '' }: {
  /** `label` is the English source string; it is translated at render. */
  cols: { label: string; metricKey?: string | null }[]
  className?: string
}) {
  const t = useT()
  return (
    <div className={`gap-2 px-4 py-2.5 border-y border-[#eef0f2] bg-[#fafbfb] ${className}`}>
      {cols.map((c, i) => (
        <span key={i} style={PJ} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">
          {t(c.label)}
          <MetricInfo metricKey={c.metricKey} size={12} />
        </span>
      ))}
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={PJ} className="text-[10.5px] font-bold uppercase tracking-widest text-[#9ca3af]">{children}</span>
  )
}

export function SectionHeader({ icon, children, first = false }: { icon: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`mb-2 ${first ? 'mt-1' : 'mt-7'} flex items-center gap-2`}>
      <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">{icon}</span>
      <SectionLabel>{children}</SectionLabel>
    </div>
  )
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6b7280]">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {text}
    </span>
  )
}

export function Delta({ delta, good, bare = false }: { delta: number; good: boolean; bare?: boolean }) {
  const up = delta >= 0
  const positive = up === good
  const color = delta === 0 ? '#9ca3af' : positive ? '#3d8a5f' : '#c2553f'
  const bg = delta === 0 ? '#f3f4f6' : positive ? '#eaf5ef' : '#fcefec'
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold ${bare ? 'text-[10px]' : 'px-1.5 py-0.5 rounded-md text-[10.5px]'}`}
      style={bare ? { color } : { color, background: bg }}>
      <span className="material-symbols-outlined text-[12px] leading-none">
        {delta === 0 ? 'remove' : up ? 'arrow_upward' : 'arrow_downward'}
      </span>
      {Math.abs(delta)}%
    </span>
  )
}

/* KPI card with a free-form delta string (mixed units: %, pts, notes).
 *
 * `area` matters here as much as on any chart: a KPI row showing zeros next to
 * skeleton charts reads as "the numbers really are zero", which is worse than
 * showing nothing. Pass the gold table the tab's KPI query actually reads. */
export function FlexKpiCard({ kpi, color, area }: {
  kpi: OverviewKpi; color: string; area?: DataArea | null
}) {
  const t = useT()
  const c = kpi.flat ? '#6b7280' : kpi.good ? '#3d8a5f' : '#c2553f'
  const bg = kpi.flat ? '#f3f4f6' : kpi.good ? '#eaf5ef' : '#fcefec'
  const dir = kpi.dir ?? (kpi.good ? 'up' : 'down')
  const icon = kpi.flat ? 'remove' : dir === 'up' ? 'arrow_upward' : 'arrow_downward'

  // Nothing behind this metric: no value, no trend, no sparkline — a flat line at
  // zero would read as a measurement, which is the thing to avoid.
  if (kpi.unavailable) {
    return (
      <Card area={area} skeleton="kpi" className="px-4 py-3.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[15px] text-[#cbd1d8]">{kpi.icon}</span>
          <span style={PJ} className="text-[10px] font-bold uppercase tracking-wider text-[#c4c9d4] truncate">{kpi.label}</span>
          <MetricInfo metricKey={kpi.key} scope="kpi" size={12} />
        </div>
        <span style={PJ} className="text-[24px] font-bold text-[#d1d5db] leading-none tracking-[-0.02em]">—</span>
        <span className="text-[10.5px] font-semibold text-[#9ca3af] bg-[#f3f4f6] px-1.5 py-0.5 rounded-md self-start">
          {t('Data not available')}
        </span>
      </Card>
    )
  }

  return (
    <Card area={area} skeleton="kpi" className="px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">{kpi.icon}</span>
        <span style={PJ} className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] truncate">{kpi.label}</span>
        <MetricInfo metricKey={kpi.key} scope="kpi" size={12} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <ExactValue display={kpi.value} exact={kpi.exact} style={PJ}
          className="text-[24px] font-bold text-[#111827] leading-none tracking-[-0.02em]" />
        <div className="mb-0.5"><Sparkline data={kpi.spark} color={color} /></div>
      </div>
      <span className="inline-flex items-center gap-0.5 self-start font-bold px-1.5 py-0.5 rounded-md text-[10.5px]"
        style={{ color: c, background: bg }}>
        <span className="material-symbols-outlined text-[12px] leading-none">{icon}</span>
        {kpi.delta}
      </span>
    </Card>
  )
}

const CALLOUT_TONES = {
  success: { bg: '#edf6ef', border: '#d7ebdb', label: '#3d8a5f', icon: 'check_circle' },
  warning: { bg: '#fbf4e8', border: '#f0e2c8', label: '#b8915a', icon: 'warning' },
  danger:  { bg: '#fcefec', border: '#f3d6d0', label: '#c2553f', icon: 'error' },
  info:    { bg: '#f3f1fb', border: '#e7e3f7', label: '#7a6fb5', icon: 'lightbulb' },
} as const

/* Tinted insight box (Key Finding / Top Windows / Sweet Spot …). */
export function Callout({ tone = 'info', emoji, title, children, className = '' }: {
  tone?: keyof typeof CALLOUT_TONES; emoji?: string; title: string
  children: React.ReactNode; className?: string
}) {
  const t = CALLOUT_TONES[tone]
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3.5 rounded-xl border ${className}`}
      style={{ background: t.bg, borderColor: t.border }}>
      {emoji
        ? <span className="text-[15px] leading-none mt-0.5">{emoji}</span>
        : <span className="material-symbols-outlined text-[18px] mt-0.5" style={{ color: t.label }}>{t.icon}</span>}
      <div>
        <p style={{ ...PJ, color: t.label }} className="text-[11px] font-bold uppercase tracking-wide mb-1">{title}</p>
        <p className="text-[13px] leading-relaxed text-[#4b5563]">{children}</p>
      </div>
    </div>
  )
}

export function KpiCard({ kpi, color }: { kpi: Kpi; color: string }) {
  return (
    <Card className="px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">{kpi.icon}</span>
          <span style={PJ} className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] truncate">{kpi.label}</span>
          <MetricInfo metricKey={kpi.key} scope="kpi" size={12} />
        </div>
        {kpi.ownAccountOnly && (
          <span className="text-[8.5px] font-bold uppercase tracking-wide text-[#b8915a] bg-[#fbf4e8] px-1 py-0.5 rounded">own</span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <ExactValue display={kpi.value} exact={kpi.exact} style={PJ}
          className="text-[24px] font-bold text-[#111827] leading-none tracking-[-0.02em]" />
        <div className="mb-0.5"><Sparkline data={kpi.spark} color={color} /></div>
      </div>
      <Delta delta={kpi.delta} good={kpi.positiveIsGood} />
    </Card>
  )
}


/**
 * A post's caption rendered as a link to the original post on its platform.
 *
 * Post lists all show a caption as the row's identity, and the caption is the
 * natural thing to click through to the real post. Falls back to plain text when
 * the source row carries no URL, so a missing permalink never looks broken.
 */
export function PostLink({ href, caption, className = '' }: {
  href?: string | null
  caption: string
  className?: string
}) {
  const t = useT()
  const base = `min-w-0 truncate ${className}`
  if (!href) return <span className={base} title={caption}>{caption}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${caption}\n\nBuka post di platform aslinya`}
      onClick={e => e.stopPropagation()}
      className={`${base} inline-flex items-center gap-1 hover:text-[#1B8A80] hover:underline underline-offset-2 transition-colors`}
    >
      <span className="truncate">{caption}</span>
      <span className="material-symbols-outlined shrink-0 text-[13px] opacity-0 group-hover/row:opacity-60">open_in_new</span>
    </a>
  )
}
