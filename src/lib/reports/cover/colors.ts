// Color helpers shared by cover preview (HTML) and PPTX export.
// All functions are pure and SSR-safe.

export interface CoverColors {
  primary: string
  secondary: string
  accent: string
}

export type CoverMode = 'light' | 'dark'

/** Normalize "#rgb" / "rgb" / "#rrggbb" to "#rrggbb" lowercase. */
export function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#000000'
  return '#' + h.toLowerCase()
}

function toRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Mix `hex` toward `target` by `amt` (0..1). */
export function mix(hex: string, target: string, amt: number): string {
  const a = toRgb(hex)
  const b = toRgb(target)
  return toHex({
    r: a.r + (b.r - a.r) * amt,
    g: a.g + (b.g - a.g) * amt,
    b: a.b + (b.b - a.b) * amt,
  })
}

export const shade = (hex: string, amt: number) => mix(hex, '#000000', amt)
export const tint = (hex: string, amt: number) => mix(hex, '#ffffff', amt)

/** Relative luminance 0..1 (perceptual). */
export function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Pick a readable text color (dark or light) for the given background. */
export function readableText(bgHex: string): string {
  return luminance(bgHex) > 0.55 ? '#111827' : '#ffffff'
}

/**
 * Perceived distance between two colors (0..~765), via the "redmean" approximation.
 * Cheap (no color-space conversion) and much closer to "do these read as different
 * colors?" than a plain RGB euclidean distance.
 */
export function colorDistance(a: string, b: string): number {
  const x = toRgb(a), y = toRgb(b)
  const rm = (x.r + y.r) / 2
  const dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

/**
 * Below this the two colors read as "the same color, slightly different shade" —
 * tuned for thin ~2px chart lines, where far more separation is needed than for
 * two big filled shapes sitting side by side.
 */
const MIN_SERIES_DISTANCE = 190

/**
 * A line paler than this washes out against the near-white chart card. Such a brand
 * color is REPLACED with a deck color, never darkened — a darkened brand color would
 * just read as a second shade of the first line, which is the thing we're avoiding.
 */
const MAX_SERIES_LUMINANCE = 0.72

// Deck of vivid, clearly different HUES (blue / amber / emerald / rose / violet /
// cyan / lime / fuchsia) — a series that can't keep a brand color is given a real
// second color from here, never a darker or lighter version of the first one.
const SERIES_DECK = ['#2563eb', '#f59e0b', '#059669', '#e11d48', '#7c3aed', '#0891b2', '#65a30d', '#c026d3']

/**
 * Pick `count` colors that are guaranteed to read as DIFFERENT COLORS, not as
 * shades of one color.
 *
 * Brand colors are preferred and kept in order, but a logo-extracted palette often
 * hands back two shades of the same hue (primary and accent are just the two biggest
 * buckets of the same logo), which would draw both lines in what looks like one color.
 * A brand color is dropped when it lands too close to one already taken, or when it is
 * too pale to read on the card; the slot is then filled from the deck by farthest-point
 * pick — the deck color with the LARGEST distance to everything chosen so far — so every
 * line is a plainly different hue AND visible.
 */
export function distinctSeriesColors(preferred: string[], count: number): string[] {
  const out: string[] = []

  for (const c of preferred) {
    if (out.length >= count) break
    const hex = normalizeHex(c)
    if (luminance(hex) > MAX_SERIES_LUMINANCE) continue   // invisible on the card — hand the slot to the deck
    if (out.every(o => colorDistance(o, hex) >= MIN_SERIES_DISTANCE)) out.push(hex)
  }

  while (out.length < count) {
    const free = SERIES_DECK.filter(c => !out.includes(c))
    if (!free.length) break   // more series than the deck can separate — unreachable in practice
    out.push(free.reduce((best, c) =>
      Math.min(...out.map(o => colorDistance(o, c))) > Math.min(...out.map(o => colorDistance(o, best))) ? c : best,
      free[0]))
  }
  return out
}

/** pptxgenjs wants hex without the leading '#'. */
export const noHash = (hex: string) => normalizeHex(hex).slice(1)

/**
 * Extract a primary / secondary / accent palette from a logo image (data URL).
 * Browser-only: quantizes pixels on a small canvas and ranks by frequency.
 * Returns null if the image can't be decoded.
 */
export function extractPalette(dataUrl: string): Promise<CoverColors | null> {
  return new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = 64
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(img, 0, 0, size, size)
      let data: Uint8ClampedArray
      try {
        data = ctx.getImageData(0, 0, size, size).data
      } catch {
        return resolve(null)
      }

      // Bucket colors into a coarse grid, weighting saturated colors higher so
      // the brand hue wins over near-white / near-black backgrounds.
      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a < 128) continue
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        const sat = max === 0 ? 0 : (max - min) / max
        // skip near-white and near-black for the dominant pass
        if (max > 240 && min > 230) continue
        if (max < 24) continue
        const key = `${r >> 4}-${g >> 4}-${b >> 4}`
        const cur = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
        const w = 1 + sat * 3
        cur.count += w
        cur.r += r * w
        cur.g += g * w
        cur.b += b * w
        buckets.set(key, cur)
      }

      const ranked = [...buckets.values()]
        .map(b => ({ count: b.count, hex: toHex({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count }) }))
        .sort((a, b) => b.count - a.count)

      if (ranked.length === 0) return resolve(null)

      const primary = ranked[0].hex
      // secondary: most distinct color from primary among the top buckets
      const distinct = (a: string, b: string) => {
        const x = toRgb(a), y = toRgb(b)
        return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b)
      }
      const secondary = ranked.slice(1).sort((a, b) => distinct(b.hex, primary) - distinct(a.hex, primary))[0]?.hex
        ?? shade(primary, 0.3)
      const accent = ranked[1]?.hex ?? tint(primary, 0.3)

      resolve({ primary, secondary, accent })
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
