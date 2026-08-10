'use client'

import { useCallback, useState } from 'react'

/**
 * The one hover tooltip every chart uses — dashboard charts and report-slide
 * charts alike — so the styling and behaviour stay identical across the app.
 *
 * It is `position: fixed` (like MetricInfo) so a card's `overflow-hidden` can't
 * clip it, and `pointer-events-none` so it never steals the hover it belongs to.
 */

export interface TipLine {
  label?: string
  value: string
  color?: string
}

export interface TipState {
  x: number
  y: number
  title?: string
  lines: TipLine[]
}

/** Half the tooltip's widest realistic width — keeps it inside the viewport. */
const TIP_EDGE = 90

export function useChartTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)

  const show = useCallback((e: { clientX: number; clientY: number }, title: string | undefined, lines: TipLine[]) => {
    const x = Math.min(Math.max(e.clientX, TIP_EDGE), window.innerWidth - TIP_EDGE)
    setTip({ x, y: e.clientY, title, lines })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  return { tip, show, hide }
}

export function ChartTooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] rounded-lg border border-[#e5e7eb] bg-white shadow-lg shadow-black/10 px-2.5 py-1.5"
      style={{
        left: tip.x,
        top: tip.y - 12,
        transform: 'translate(-50%, -100%)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {tip.title && (
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1 whitespace-nowrap">
          {tip.title}
        </p>
      )}
      {tip.lines.map((l, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[11.5px] leading-snug whitespace-nowrap">
          {l.color && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color }} />}
          {l.label && <span className="text-[#6b7280]">{l.label}</span>}
          <span className="font-bold text-[#111827] tabular-nums ml-auto pl-2">{l.value}</span>
        </p>
      ))}
    </div>
  )
}
