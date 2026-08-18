'use client'

import { useCallback, useState } from 'react'
import { fmtNum, fmtInt } from '@/lib/dashboard/format'

/**
 * A rounded figure that reveals what it rounded away.
 *
 * "38.1M" is the right thing to read at a glance, but it hides up to 50,000 —
 * so anywhere the dashboard compacts a number (KPI headline, table cell, bar
 * label), hovering it shows the exact figure. Charts already do this through
 * ChartTooltip; this is the same promise for text that isn't part of a chart.
 *
 * Rendered `position: fixed` so a card's `overflow-hidden` can't clip it, and
 * `pointer-events-none` so it never swallows the hover it belongs to.
 */

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/** Half the widest realistic tooltip — keeps it inside the viewport. */
const EDGE = 80

interface Props {
  /** Compact text to display. Defaults to `fmtNum(value)`. */
  display?: string
  /**
   * The exact figure behind `display`. Pass a number and it is grouped for you;
   * pass a string when the caller already formatted it (a signed "+53,642", say).
   * When it turns out to equal `display`, no hover is attached — nothing was
   * rounded, so there is nothing to reveal.
   */
  exact?: string | number | null
  /** Raw value, used when `display`/`exact` are not given explicitly. */
  value?: number
  className?: string
  style?: React.CSSProperties
}

export default function ExactValue({ display, exact, value, className = '', style }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const shown = display ?? (value === undefined ? '' : fmtNum(value))
  const full =
    exact === undefined || exact === null
      ? value === undefined ? null : fmtInt(value)
      : typeof exact === 'number' ? fmtInt(exact) : exact

  const move = useCallback((e: React.MouseEvent) => {
    setPos({
      x: Math.min(Math.max(e.clientX, EDGE), window.innerWidth - EDGE),
      y: e.clientY,
    })
  }, [])

  // Nothing was rounded away — render plain text rather than a hover that
  // repeats what is already on screen.
  if (!full || full === shown) {
    return <span className={className} style={style}>{shown}</span>
  }

  return (
    <>
      <span
        className={className}
        style={style}
        onMouseEnter={move}
        onMouseMove={move}
        onMouseLeave={() => setPos(null)}
      >
        {shown}
      </span>
      {pos && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[80] rounded-lg border border-[#e5e7eb] bg-white shadow-lg shadow-black/10 px-2.5 py-1.5 text-[11.5px] font-bold text-[#111827] tabular-nums whitespace-nowrap"
          style={{ ...PJ, left: pos.x, top: pos.y - 12, transform: 'translate(-50%, -100%)' }}
        >
          {full}
        </span>
      )}
    </>
  )
}

/**
 * Table-cell shorthand: compact text with its exact figure on hover, both
 * derived from the same number.
 */
export function NumCell({ value, className = '' }: { value: number; className?: string }) {
  return <ExactValue value={value} className={className} />
}
