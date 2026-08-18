/**
 * Number formatting shared by every dashboard payload builder and by the views
 * that render them.
 *
 * Two forms, one convention — COMMA groups thousands, PERIOD is the decimal
 * point — so a figure reads the same wherever it appears:
 *
 *   fmtNum  → "38.1M"     compact, for headline KPIs, axes and table cells
 *   fmtInt  → "38,142,905" exact, for the hover that reveals what was rounded away
 *
 * Every rounded figure on screen is expected to carry its exact counterpart on
 * hover (client revision, p. 4), which is why `compact()` produces both at once:
 * the pair can't drift if it's built in one place.
 */

export function fmtNum(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (a >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** Compact display plus the exact figure it stands for. Spread into a KPI. */
export function compact(n: number): { value: string; exact: string } {
  return { value: fmtNum(n), exact: fmtInt(n) }
}

/** Same, for a signed figure ("+53.6K" / "+53,642") such as net growth. */
export function compactSigned(n: number): { value: string; exact: string } {
  const sign = n >= 0 ? '+' : ''
  return { value: `${sign}${fmtNum(n)}`, exact: `${sign}${fmtInt(n)}` }
}
