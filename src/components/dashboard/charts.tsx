'use client'

import { useId, useRef, useState } from 'react'
import { ChartTooltip, useChartTooltip, formatTipValue } from '@/components/ui/ChartTooltip'
import ExactValue from '@/components/ui/ExactValue'

/* ---------- helpers ---------- */

/**
 * The single colour every non-comparison chart draws in.
 *
 * A palette that changes hue per bar implies the bars are different KINDS of
 * thing; in a ranking ("reach by format", "followers by age band") they are one
 * measure sliced up, and the colour carries no information — it only competes
 * with the lengths the reader is meant to compare. Charts that genuinely
 * contrast series (brand vs brand, female vs male, gained vs lost, platform
 * share) keep their own colours and pass them in explicitly.
 */
export const SERIES = '#1B8A80'

function buildPath(data: number[], w: number, h: number, pad: number) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = (w - pad * 2) / (data.length - 1)
  return data.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (h - pad * 2) * (1 - (v - min) / span)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const defaultFmt = formatTipValue

/* ---------- Sparkline (KPI cards) ---------- */

export function Sparkline({ data, color, width = 96, height = 30, labels, fmt = defaultFmt }: {
  data: number[]; color: string; width?: number; height?: number
  labels?: string[]; fmt?: (n: number) => string
}) {
  const { tip, show, hide } = useChartTooltip()
  const d = buildPath(data, width, height, 3)

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = (width - 6) / Math.max(1, data.length - 1)
  const px = (i: number) => 3 + i * stepX
  const py = (v: number) => 3 + (height - 6) * (1 - (v - min) / span)

  return (
    <>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        {data.map((v, i) => (
          <circle
            key={i} cx={px(i)} cy={py(v)} r={Math.max(5, stepX / 2)} fill="transparent"
            onMouseEnter={e => show(e, labels?.[i], [{ value: fmt(v), color }])}
            onMouseMove={e => show(e, labels?.[i], [{ value: fmt(v), color }])}
            onMouseLeave={hide}
          />
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </>
  )
}

/* ---------- Line / Area chart ---------- */

export function LineChart({ data, color = '#1B8A80', height = 200, area = true, labels, fmt = defaultFmt }: {
  data: number[]; color?: string; height?: number; area?: boolean
  labels?: string[]; fmt?: (n: number) => string
}) {
  const id = useId()
  const W = 600
  const H = height
  const pad = 12
  const line = buildPath(data, W, H, pad)
  const areaPath = `${line} L${W - pad},${H - pad} L${pad},${H - pad} Z`
  const gridYs = [0.25, 0.5, 0.75]

  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const { tip, show, hide } = useChartTooltip()

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const stepX = (W - pad * 2) / Math.max(1, data.length - 1)
  const ptY = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / span)

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = wrapRef.current
    if (!el || !data.length) return
    const r = el.getBoundingClientRect()
    const xv = ((e.clientX - r.left) / r.width) * W
    const i = Math.min(data.length - 1, Math.max(0, Math.round((xv - pad) / stepX)))
    setHover(i)
    show(e, labels?.[i], [{ value: fmt(data[i]), color }])
  }

  function onLeave() { setHover(null); hide() }

  return (
    <div className="w-full">
      <div ref={wrapRef} className="relative" style={{ height: H }} onMouseMove={onMove} onMouseLeave={onLeave}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {gridYs.map(g => (
            <line key={g} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * g} y2={pad + (H - pad * 2) * g}
              stroke="#eef0f2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {area && <path d={areaPath} fill={`url(#g-${id})`} />}
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover !== null && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 bottom-0 border-l border-dashed border-[#d1d5db]"
              style={{ left: `${(( pad + hover * stepX) / W) * 100}%` }} />
            <span className="absolute w-[9px] h-[9px] rounded-full bg-white -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${((pad + hover * stepX) / W) * 100}%`, top: ptY(data[hover]), border: `2px solid ${color}` }} />
          </div>
        )}
      </div>
      {labels && (
        <div className="flex justify-between mt-2 px-1">
          {labels.map((l, i) => (
            <span key={i} className="text-[10px] text-[#9ca3af]">{l}</span>
          ))}
        </div>
      )}
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Multi-series line chart (shared scale) ---------- */

function niceCeil(n: number) {
  if (n <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(n)))
  const step = p / 5
  return Math.ceil(n / step) * step
}

export function MultiLineChart({ series, labels, height = 220, dots = false, yAxis = false, fmtY, fmtTip = defaultFmt }: {
  series: { name: string; color: string; data: number[] }[]
  labels?: string[]; height?: number; dots?: boolean
  /** Y-axis tick formatter — often compact ("1.2K") to keep the axis narrow. */
  yAxis?: boolean; fmtY?: (n: number) => string
  /** Hover value formatter. Separate from fmtY so the tooltip can stay exact. */
  fmtTip?: (n: number) => string
}) {
  const W = 600
  const H = height
  const pad = 14
  const all = series.flatMap(s => s.data)
  const min = yAxis ? 0 : Math.min(...all)
  const max = yAxis ? niceCeil(Math.max(...all)) : Math.max(...all)
  const span = max - min || 1
  const n = series[0]?.data.length ?? 0
  const stepX = (W - pad * 2) / Math.max(1, n - 1)
  const gridYs = yAxis ? [0, 0.25, 0.5, 0.75, 1] : [0.25, 0.5, 0.75]
  const ptX = (i: number) => pad + i * stepX
  const ptY = (v: number) => pad + (H - pad * 2) * (1 - (v - min) / span)
  const fy = fmtY ?? ((v: number) => String(v))

  const toPath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'}${ptX(i).toFixed(1)},${ptY(v).toFixed(1)}`).join(' ')

  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const { tip, show, hide } = useChartTooltip()

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = plotRef.current
    if (!el || !n) return
    const r = el.getBoundingClientRect()
    const xv = ((e.clientX - r.left) / r.width) * W
    const i = Math.min(n - 1, Math.max(0, Math.round((xv - pad) / stepX)))
    setHover(i)
    show(e, labels?.[i], series.map(s => ({ label: s.name, value: fmtTip(s.data[i] ?? 0), color: s.color })))
  }

  function onLeave() { setHover(null); hide() }

  return (
    <div className="w-full flex">
      {yAxis && (
        <div className="relative w-12 flex-shrink-0" style={{ height: H }}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <span key={f} className="absolute right-1.5 text-[10px] text-[#9ca3af] -translate-y-1/2 tabular-nums"
              style={{ top: pad + (H - pad * 2) * f }}>{fy(min + span * (1 - f))}</span>
          ))}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div ref={plotRef} className="relative" style={{ height: H }} onMouseMove={onMove} onMouseLeave={onLeave}>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
            {gridYs.map(g => (
              <line key={g} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * g} y2={pad + (H - pad * 2) * g}
                stroke="#eef0f2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {series.map(s => (
              <path key={s.name} d={toPath(s.data)} fill="none" stroke={s.color} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {dots && (
            <div className="absolute inset-0 pointer-events-none">
              {series.map(s => s.data.map((v, i) => (
                <span key={`${s.name}-${i}`} className="absolute w-[7px] h-[7px] rounded-full bg-white -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(ptX(i) / W) * 100}%`, top: ptY(v), border: `2px solid ${s.color}` }} />
              )))}
            </div>
          )}
          {hover !== null && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 bottom-0 border-l border-dashed border-[#d1d5db]"
                style={{ left: `${(ptX(hover) / W) * 100}%` }} />
              {series.map(s => (
                <span key={s.name} className="absolute w-[9px] h-[9px] rounded-full bg-white -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(ptX(hover) / W) * 100}%`, top: ptY(s.data[hover] ?? 0), border: `2px solid ${s.color}` }} />
              ))}
            </div>
          )}
        </div>
        {labels && (
          <div className="flex justify-between mt-2 px-1">
            {labels.map((l, i) => <span key={i} className="text-[10px] text-[#9ca3af]">{l}</span>)}
          </div>
        )}
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Scatter plot ---------- */

export function ScatterPlot({ points, xMax, yMax, xTicks, yTicks, xLabel, yLabel, color = '#8b7fc7', height = 240, xName = 'X', yName = 'Y' }: {
  points: { x: number; y: number }[]
  xMax: number; yMax: number; xTicks: number[]; yTicks: number[]
  xLabel?: string; yLabel?: string; color?: string; height?: number
  /** Short names used in the hover tooltip (the axis labels are too long there). */
  xName?: string; yName?: string
}) {
  const W = 600, H = height, padL = 44, padR = 14, padT = 12, padB = 38
  const plotW = W - padL - padR, plotH = H - padT - padB
  const px = (v: number) => padL + (v / xMax) * plotW
  const py = (v: number) => padT + plotH * (1 - v / yMax)
  const { tip, show, hide } = useChartTooltip()

  const lines = (p: { x: number; y: number }) => [
    { label: xName, value: defaultFmt(Math.round(p.x * 10) / 10) },
    { label: yName, value: `${Math.round(p.y)}%`, color },
  ]

  return (
    <>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        {yTicks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} stroke="#eef0f2" strokeWidth={1} />
            <text x={padL - 6} y={py(t) + 3} textAnchor="end" className="fill-[#9ca3af]" fontSize={10}>{t}{yMax <= 100 ? '%' : ''}</text>
          </g>
        ))}
        {xTicks.map(t => (
          <text key={t} x={px(t)} y={H - padB + 16} textAnchor="middle" className="fill-[#9ca3af]" fontSize={10}>{t}</text>
        ))}
        {points.map((p, i) => (
          <circle
            key={i} cx={px(p.x)} cy={py(p.y)} r={5.5} fill={color} fillOpacity={0.55} stroke={color} strokeWidth={1.5}
            className="cursor-pointer"
            onMouseEnter={e => show(e, undefined, lines(p))}
            onMouseMove={e => show(e, undefined, lines(p))}
            onMouseLeave={hide}
          />
        ))}
        {xLabel && <text x={padL + plotW / 2} y={H - 4} textAnchor="middle" className="fill-[#6b7280]" fontSize={10.5}>{xLabel}</text>}
      </svg>
      <ChartTooltip tip={tip} />
    </>
  )
}

/* ---------- Diverging bars (gained up / lost down) ---------- */

export function DivergingBars({ data, posColor = '#7cc499', negColor = '#e89aa3', height = 240, fmt = defaultFmt }: {
  data: { label: string; gained: number; lost: number }[]
  /** Hover value formatter; exact grouped numbers by default. */
  posColor?: string; negColor?: string; height?: number; fmt?: (n: number) => string
}) {
  const maxPos = Math.max(...data.map(d => d.gained), 1)
  const maxNeg = Math.max(...data.map(d => d.lost), 1)
  const total = maxPos + maxNeg
  const topFrac = maxPos / total
  const { tip, show, hide } = useChartTooltip()

  const lines = (d: { gained: number; lost: number }) => [
    { label: 'Gained', value: `+${fmt(d.gained)}`, color: posColor },
    { label: 'Lost',   value: `−${fmt(d.lost)}`,   color: negColor },
    { label: 'Net',    value: `${d.gained - d.lost >= 0 ? '+' : '−'}${fmt(Math.abs(d.gained - d.lost))}` },
  ]

  return (
    <div className="w-full">
      <div className="flex items-stretch gap-3" style={{ height }}>
        {data.map(d => (
          <div
            key={d.label} className="flex-1 flex flex-col cursor-pointer"
            onMouseEnter={e => show(e, d.label, lines(d))}
            onMouseMove={e => show(e, d.label, lines(d))}
            onMouseLeave={hide}
          >
            <div className="flex flex-col justify-end" style={{ height: `${topFrac * 100}%` }}>
              <div className="rounded-t-md mx-auto w-3/4 transition-opacity hover:opacity-80"
                style={{ height: `${(d.gained / maxPos) * 100}%`, background: posColor }} />
            </div>
            <div className="border-t border-[#e5e7eb]" />
            <div className="flex flex-col justify-start" style={{ height: `${(1 - topFrac) * 100}%` }}>
              <div className="rounded-b-md mx-auto w-3/4 transition-opacity hover:opacity-80"
                style={{ height: `${(d.lost / maxNeg) * 100}%`, background: negColor }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2">
        {data.map(d => <span key={d.label} className="flex-1 text-center text-[10px] text-[#9ca3af]">{d.label}</span>)}
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Combo: bars (left axis) + line (right axis) ---------- */

export function ComboBarLine({ labels, bars, line, barColor = '#e7a6bd', lineColor = '#6c4cd6', leftMax, rightMax, height = 260, fmtLeft = (n: number) => String(n), barName = 'Bars', lineName = 'Line', fmtTip = defaultFmt }: {
  labels: string[]; bars: number[]; line: number[]
  barColor?: string; lineColor?: string; leftMax: number; rightMax: number; height?: number
  /** Left-axis tick formatter — usually compact so the axis stays narrow. */
  fmtLeft?: (n: number) => string
  /** Series names for the hover tooltip, plus its value formatter (exact by default). */
  barName?: string; lineName?: string; fmtTip?: (n: number) => string
}) {
  const W = 600, H = height, padL = 46, padR = 42, padT = 12, padB = 30
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = labels.length
  const slot = plotW / n
  const barW = slot * 0.5
  const yL = (v: number) => padT + plotH * (1 - v / leftMax)
  const yR = (v: number) => padT + plotH * (1 - v / rightMax)
  const cx = (i: number) => padL + slot * i + slot / 2
  const linePath = line.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${yR(v).toFixed(1)}`).join(' ')
  const leftTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(leftMax * f))
  const rightTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(rightMax * f))
  const { tip, show, hide } = useChartTooltip()

  const lines = (i: number) => [
    { label: barName,  value: fmtTip(bars[i] ?? 0), color: barColor },
    { label: lineName, value: fmtTip(line[i] ?? 0), color: lineColor },
  ]

  return (
    <>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        {leftTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yL(t)} y2={yL(t)} stroke="#eef0f2" strokeWidth={1} />
            <text x={padL - 6} y={yL(t) + 3} textAnchor="end" className="fill-[#9ca3af]" fontSize={9.5}>{fmtLeft(t)}</text>
          </g>
        ))}
        {rightTicks.map((t, i) => (
          <text key={i} x={W - padR + 6} y={yR(t) + 3} textAnchor="start" className="fill-[#9ca3af]" fontSize={9.5}>{t}</text>
        ))}
        {bars.map((v, i) => (
          <rect key={i} x={cx(i) - barW / 2} y={yL(v)} width={barW} height={Math.max(0, plotH + padT - yL(v))}
            rx={4} fill={barColor} />
        ))}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {line.map((v, i) => <circle key={i} cx={cx(i)} cy={yR(v)} r={4} fill="#fff" stroke={lineColor} strokeWidth={2} />)}
        {labels.map((l, i) => (
          <text key={i} x={cx(i)} y={H - 10} textAnchor="middle" className="fill-[#9ca3af]" fontSize={10}>{l}</text>
        ))}
        {/* Invisible full-height hit areas — one per slot, so the whole column
            responds rather than only the drawn bar. Painted last to sit on top. */}
        {labels.map((l, i) => (
          <rect
            key={`hit-${i}`} x={padL + slot * i} y={padT} width={slot} height={plotH}
            fill="transparent" className="cursor-pointer"
            onMouseEnter={e => show(e, l, lines(i))}
            onMouseMove={e => show(e, l, lines(i))}
            onMouseLeave={hide}
          />
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </>
  )
}

/* ---------- Donut ---------- */

export function Donut({ segments, size = 140, thickness = 18, centerLabel, centerExact, centerSub, legend = true, fmt = defaultFmt, valueLabel = 'Value' }: {
  /** `value` is the segment's real magnitude — the ring derives each share from it. */
  segments: { label: string; value: number; color: string }[]
  size?: number; thickness?: number; centerLabel?: string; centerSub?: string; legend?: boolean
  /** Exact figure behind a compacted `centerLabel`, revealed on hover. */
  centerExact?: string
  fmt?: (n: number) => string
  /** Names the magnitude in the hover ("Reach", "Followers"…), above its share. */
  valueLabel?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  const { tip, show, hide } = useChartTooltip()

  const lines = (s: { label: string; value: number; color: string }) => [
    { label: valueLabel, value: fmt(s.value), color: s.color },
    { label: 'Share', value: `${Math.round((s.value / total) * 100)}%` },
  ]

  const ring = (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />
        {segments.map(s => {
          const frac = s.value / total
          const dash = `${frac * c} ${c}`
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness} strokeDasharray={dash}
              strokeDashoffset={-offset * c} strokeLinecap="butt"
              className="cursor-pointer transition-opacity hover:opacity-80"
              onMouseEnter={e => show(e, s.label, lines(s))}
              onMouseMove={e => show(e, s.label, lines(s))}
              onMouseLeave={hide} />
          )
          offset += frac
          return el
        })}
      </svg>
      {centerLabel && (
        // The ring itself owns the pointer, so the centre block stays inert —
        // except the total, which needs its own hover to reveal the exact figure.
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 pointer-events-none">
          <ExactValue display={centerLabel} exact={centerExact}
            className="pointer-events-auto text-[22px] font-bold text-[#111827] leading-none"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
          {centerSub && <span className="text-[10px] text-[#9ca3af] mt-1 leading-tight">{centerSub}</span>}
        </div>
      )}
    </div>
  )

  if (!legend) return <div className="flex justify-center">{ring}<ChartTooltip tip={tip} /></div>

  return (
    <div className="flex items-center gap-4">
      {ring}
      <ul className="flex-1 min-w-0 space-y-1.5">
        {segments.map(s => (
          <li key={s.label} className="flex items-center gap-2 text-[12px] cursor-pointer"
            onMouseEnter={e => show(e, s.label, lines(s))}
            onMouseMove={e => show(e, s.label, lines(s))}
            onMouseLeave={hide}>
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-[#374151] flex-1">{s.label}</span>
            <span className="font-semibold text-[#111827]">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Vertical bars ---------- */

export function BarChart({ bars, height = 180, color = SERIES }: {
  /** `exact` is the unrounded figure the hover adds behind a compacted `display`. */
  bars: { label: string; value: number; display: string; exact?: string }[]
  height?: number
  /** One colour for the whole set — see HBars. */
  color?: string
}) {
  const max = Math.max(...bars.map(b => b.value)) || 1
  const { tip, show, hide } = useChartTooltip()

  const lines = (b: { display: string; exact?: string }) =>
    [{ value: b.exact ?? b.display, color }]

  return (
    <div className="flex items-end gap-4 w-full" style={{ height }}>
      {bars.map(b => (
        <div
          key={b.label} className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer"
          onMouseEnter={e => show(e, b.label, lines(b))}
          onMouseMove={e => show(e, b.label, lines(b))}
          onMouseLeave={hide}
        >
          <span className="text-[11px] font-semibold text-[#374151] mb-1.5">{b.display}</span>
          <div className="w-full rounded-t-md transition-all hover:opacity-80" style={{
            height: `${Math.max(4, (b.value / max) * (height - 44))}px`,
            background: color,
          }} />
          <span className="text-[11px] text-[#9ca3af] mt-2">{b.label}</span>
        </div>
      ))}
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Thin horizontal bar (share of voice) ---------- */

export function ShareBar({ value, color, track = '#f3f4f6', label, display }: {
  value: number; color: string; track?: string; label?: string; display?: string
}) {
  const { tip, show, hide } = useChartTooltip()
  const lines = [{ value: display ?? `${value}%`, color }]
  return (
    <>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden cursor-pointer" style={{ background: track }}
        onMouseEnter={e => show(e, label, lines)}
        onMouseMove={e => show(e, label, lines)}
        onMouseLeave={hide}
      >
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <ChartTooltip tip={tip} />
    </>
  )
}

/* ---------- Labeled horizontal bars ---------- */

export function HBars({ items, color = SERIES, showShare = true }: {
  /**
   * `display` is what sits next to the bar; `exact` is the fuller figure the
   * hover adds — the headcount behind a share, or the unrounded number behind a
   * compacted one. Without it the hover would only repeat the visible label.
   */
  items: {
    label: string; value: number; display: string
    exact?: string; exactLabel?: string; icon?: string
    /** Per-bar colour — only for charts that genuinely contrast entities. */
    color?: string
  }[]
  /** One colour for the whole set: these bars rank one measure, they don't compare series. */
  color?: string
  /**
   * Whether the hover repeats the share sitting next to the bar.
   *
   * On most bars the pair is the point — the share is the ranking, the exact
   * figure is the magnitude behind it. Where the reader asked for the count and
   * nothing else (age distribution), pass `false`: the percentage is already
   * printed against the bar, so echoing it in the hover only buries the number
   * they hovered to find.
   */
  showShare?: boolean
}) {
  const max = Math.max(...items.map(i => i.value)) || 1
  const { tip, show, hide } = useChartTooltip()

  const lines = (it: { display: string; exact?: string; exactLabel?: string; color?: string }) => {
    const c = it.color ?? color
    if (!it.exact) return [{ value: it.display, color: c }]
    const exact = [{ label: it.exactLabel ?? 'Total', value: it.exact, color: c }]
    return showShare ? [...exact, { label: 'Share', value: it.display }] : exact
  }

  return (
    <div className="flex flex-col gap-3.5">
      {items.map(it => {
        const c = it.color ?? color
        return (
          <div
            key={it.label} className="cursor-pointer"
            onMouseEnter={e => show(e, it.label, lines(it))}
            onMouseMove={e => show(e, it.label, lines(it))}
            onMouseLeave={hide}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#374151]">
                {it.icon && <span className="material-symbols-outlined text-[16px]" style={{ color: c }}>{it.icon}</span>}
                {it.label}
              </span>
              <span className="text-[12px] font-bold text-[#111827]">{it.display}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#f3f4f6] overflow-hidden">
              <div className="h-full rounded-full transition-all hover:opacity-80" style={{ width: `${(it.value / max) * 100}%`, background: c }} />
            </div>
          </div>
        )
      })}
      <ChartTooltip tip={tip} />
    </div>
  )
}

/* ---------- Heatmap (day × time slot) ---------- */

export function Heatmap({ rows, cols, grid, base = '#1B8A80', cellHeight = 34 }: {
  rows: string[]; cols: string[]; grid: number[][]; base?: string; cellHeight?: number
}) {
  const { tip, show, hide } = useChartTooltip()

  return (
    <div className="w-full">
      <div className="flex">
        <div className="w-9 flex-shrink-0" />
        {cols.map(c => (
          <div key={c} className="flex-1 text-center text-[10px] text-[#9ca3af] pb-1.5">{c}</div>
        ))}
      </div>
      {rows.map((r, ri) => (
        <div key={r} className="flex items-center mb-1.5 last:mb-0">
          <div className="w-9 flex-shrink-0 text-[10.5px] font-semibold text-[#6b7280]">{r}</div>
          {grid[ri].map((v, ci) => {
            const lines = [{ value: `${Math.round(v * 100)}%`, color: base }]
            return (
              <div key={ci} className="flex-1 px-0.5">
                <div className="w-full rounded-[5px] cursor-pointer transition-transform hover:scale-[1.06]"
                  style={{ height: cellHeight, background: base, opacity: 0.12 + v * 0.88 }}
                  onMouseEnter={e => show(e, `${r} · ${cols[ci]}`, lines)}
                  onMouseMove={e => show(e, `${r} · ${cols[ci]}`, lines)}
                  onMouseLeave={hide} />
              </div>
            )
          })}
        </div>
      ))}
      <ChartTooltip tip={tip} />
    </div>
  )
}
