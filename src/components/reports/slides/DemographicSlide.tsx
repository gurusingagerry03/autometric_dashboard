'use client'

import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide, DemographicView } from '@/lib/reports/data/slideModel'
import { useReportAudience } from '@/lib/reports/data/metricsContext'
import {
  ageBucketsFor, demographicChannels, demographicHeading, demographicsFor, demographicHistory, shortMonth,
  type ChannelDemographics, type DemographicPeriod, type DemographicRange,
} from '@/lib/reports/data/audienceTypes'
import { tint } from '@/lib/reports/cover/colors'
import { PLATFORM_META, type DashPlatform } from '@/components/dashboard/data'
import { PJ, Card, CardLabel, AiInsightBlock } from './parts'
import { useT } from '@/lib/i18n/LanguageContext'

const FEMALE = '#d6447a'
const MALE = '#3d7eea'

/** Signed percentage-POINT delta. Shares are compared in points, never as a
 *  percent-of-a-percent — see SentimentBlock.shareChange for the same rule. */
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`

function Empty({ label }: { label: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ color: '#b6bcc4' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '2.8cqw' }}>data_usage</span>
      <span style={{ fontSize: '1.15cqw', fontWeight: 600, marginTop: '0.5cqh', ...PJ }}>{label}</span>
    </div>
  )
}

/** The pp delta, or a muted dash when there is no previous month to compare to. */
function Delta({ now, before, size = '0.95cqw' }: { now: number; before: number | null; size?: string }) {
  if (before === null) return <span style={{ fontSize: size, lineHeight: 1, color: '#cbd5e1', ...PJ }}>—</span>
  const d = +(now - before).toFixed(1)
  const flat = Math.abs(d) < 0.05
  return (
    <span style={{ fontSize: size, lineHeight: 1, fontWeight: 700, color: flat ? '#a3adba' : d > 0 ? '#15803d' : '#b91c1c', ...PJ }}>
      {flat ? '0.0' : pp(d)}
    </span>
  )
}

/**
 * One age bucket: the current share as a bar, last month's as a hairline behind
 * it, and the move in points.
 *
 * WHY A GHOST LINE AND NOT TWO BARS
 *   Seven buckets × three platforms × two months is 42 bars on one slide. Paired
 *   bars at that density stop being readable, and the question being asked is
 *   "did this shift?", not "what were both values?" — a marker for last month
 *   answers it in a quarter of the ink. The number for the previous month is
 *   still there, in the delta column.
 *
 * THE ROW OWNS NO HEIGHT OF ITS OWN
 *   `flex: 1 1 0` + `minHeight: 0` makes the seven rows SHARE whatever the panel
 *   has left, instead of each asking for the height its text happens to need.
 *   That is what stops the list from growing past the card and drawing over the
 *   gender block below it — the overlap reported on this slide. Every text node
 *   also pins `lineHeight: 1`, so an inherited leading can never re-inflate a
 *   row behind the layout's back.
 */
function AgeRow({ bucket, now, before, max, accent }: {
  bucket: string; now: number; before: number | null; max: number; accent: string
}) {
  const w = max > 0 ? (now / max) * 100 : 0
  const prevW = before !== null && max > 0 ? (before / max) * 100 : null
  return (
    <div className="flex items-center" style={{ gap: '0.5cqw', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
      <span style={{ width: '4.6cqw', flexShrink: 0, fontSize: '1cqw', lineHeight: 1, fontWeight: 600, color: '#64748b', textAlign: 'right', ...PJ }}>
        {bucket}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: '1.5cqh', maxHeight: '100%', background: '#f1f5f9', borderRadius: '0.3cqw', position: 'relative' }}>
        <div style={{ width: `${w}%`, height: '100%', background: accent, borderRadius: '0.3cqw' }} />
        {prevW !== null && (
          <div
            title="previous month"
            style={{
              position: 'absolute', top: '-0.25cqh', bottom: '-0.25cqh', left: `${prevW}%`,
              width: '0.16cqw', background: '#0f172a', opacity: 0.38,
            }}
          />
        )}
      </div>
      <span style={{ width: '3.2cqw', flexShrink: 0, fontSize: '1cqw', lineHeight: 1, fontWeight: 700, color: '#0f172a', textAlign: 'right', ...PJ }}>
        {now.toFixed(1)}%
      </span>
      {/* Tanpa bulan pembanding kolom ini hanya berisi "—" di setiap baris; badge
          "no prior month" di judul panel sudah menyebutnya sekali. */}
      {before !== null && (
        <span style={{ width: '2.8cqw', flexShrink: 0, textAlign: 'right' }}>
          <Delta now={now} before={before} />
        </span>
      )}
    </div>
  )
}

function GenderBlock({ cur, prev }: { cur: DemographicPeriod; prev: DemographicPeriod | null }) {
  const t = useT()
  const half = (share: number, color: string, label: string) => (
    <div
      className="flex items-center justify-center"
      style={{ width: `${share}%`, background: color, height: '100%', minWidth: 0 }}
      title={`${label} ${share.toFixed(1)}%`}
    >
      <span style={{ fontSize: '1cqw', lineHeight: 1, fontWeight: 800, color: '#ffffff', ...PJ }}>{share.toFixed(0)}%</span>
    </div>
  )
  return (
    <>
      <div style={{ display: 'flex', height: '2.4cqh', borderRadius: '0.4cqw', overflow: 'hidden' }}>
        {half(cur.female, FEMALE, t('Female'))}
        {half(cur.male, MALE, t('Male'))}
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: '0.5cqh' }}>
        <span className="flex items-center" style={{ gap: '0.35cqw' }}>
          <span style={{ width: '0.7cqw', height: '0.7cqw', borderRadius: '50%', background: FEMALE }} />
          <span style={{ fontSize: '0.95cqw', lineHeight: 1, color: '#64748b', ...PJ }}>{t('Female')}</span>
          <Delta now={cur.female} before={prev ? prev.female : null} />
        </span>
        <span className="flex items-center" style={{ gap: '0.35cqw' }}>
          <span style={{ width: '0.7cqw', height: '0.7cqw', borderRadius: '50%', background: MALE }} />
          <span style={{ fontSize: '0.95cqw', lineHeight: 1, color: '#64748b', ...PJ }}>{t('Male')}</span>
          <Delta now={cur.male} before={prev ? prev.male : null} />
        </span>
      </div>
    </>
  )
}

/** Warna tiga bulan riwayat, lama → baru: makin pudar makin lama. */
const last3Shades = (accent: string) => [tint(accent, 0.68), tint(accent, 0.38), accent]

/**
 * Satu kelompok umur, tiga bulan: tiga bar tipis bertumpuk (lama → baru, makin
 * pekat makin baru), angka bulan terbaru, dan pergeseran poinnya sejak bulan
 * TERLAMA yang berdata — itu "pergerakan" yang ditanyakan brief.
 */
function AgeRow3({ bucket, months, max, shades }: {
  bucket: string; months: { idx: number; v: number }[]; max: number; shades: string[]
}) {
  const last = months[months.length - 1]
  const first = months[0]
  return (
    <div className="flex items-center" style={{ gap: '0.5cqw', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
      <span style={{ width: '4.6cqw', flexShrink: 0, fontSize: '1cqw', lineHeight: 1, fontWeight: 600, color: '#64748b', textAlign: 'right', ...PJ }}>
        {bucket}
      </span>
      <div className="flex flex-col justify-center" style={{ flex: 1, minWidth: 0, height: '100%', gap: '0.12cqh' }}>
        {months.map(m => (
          <div key={m.idx} style={{ height: '0.5cqh', maxHeight: '30%', background: '#f1f5f9', borderRadius: '0.2cqw' }}>
            <div style={{ width: `${max > 0 ? (m.v / max) * 100 : 0}%`, height: '100%', background: shades[m.idx], borderRadius: '0.2cqw' }} />
          </div>
        ))}
      </div>
      <span style={{ width: '3.2cqw', flexShrink: 0, fontSize: '1cqw', lineHeight: 1, fontWeight: 700, color: '#0f172a', textAlign: 'right', ...PJ }}>
        {last ? `${last.v.toFixed(1)}%` : '—'}
      </span>
      {months.length > 1 && (
        <span style={{ width: '2.8cqw', flexShrink: 0, textAlign: 'right' }}>
          <Delta now={last.v} before={first.v} />
        </span>
      )}
    </div>
  )
}

/** Gender tiga bulan: satu bar Female/Male per bulan, diberi label bulannya. */
function GenderRows3({ months }: { months: { label: string; period: DemographicPeriod }[] }) {
  return (
    <div className="flex flex-col" style={{ gap: '0.35cqh' }}>
      {months.map(m => (
        <div key={m.label} className="flex items-center" style={{ gap: '0.5cqw' }}>
          <span style={{ width: '2.6cqw', flexShrink: 0, fontSize: '0.9cqw', lineHeight: 1, fontWeight: 700, color: '#64748b', ...PJ }}>{shortMonth(m.label)}</span>
          <div style={{ flex: 1, display: 'flex', height: '1.7cqh', borderRadius: '0.3cqw', overflow: 'hidden' }}>
            {([['female', FEMALE], ['male', MALE]] as const).map(([k, c]) => (
              <div key={k} className="flex items-center justify-center" style={{ width: `${m.period[k]}%`, background: c, minWidth: 0 }}>
                {m.period[k] >= 12 && <span style={{ fontSize: '0.85cqw', lineHeight: 1, fontWeight: 800, color: '#fff', ...PJ }}>{m.period[k].toFixed(0)}%</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PlatformPanel({ platform, data, view, accent, range = 'mom', history = [] }: {
  platform: DashPlatform; data: ChannelDemographics; view: DemographicView; accent: string
  range?: DemographicRange; history?: { label: string; idx: number; period: DemographicPeriod }[]
}) {
  const t = useT()
  const meta = PLATFORM_META[platform]
  const cur = data.current
  const prev = data.previous
  if (!cur) return null

  // One scale for both months so a bar and its marker are read on the same ruler.
  const buckets = ageBucketsFor(platform)
  const max = Math.max(
    ...buckets.map(([, k]) => Math.max(cur.age[k] ?? 0, prev?.age[k] ?? 0)),
    1,
  )
  const showAge = view !== 'gender'
  const showGender = view !== 'age'
  const last3 = range === 'last3'
  const shades = last3Shades(accent)
  const max3 = Math.max(...history.flatMap(h => buckets.map(([, k]) => h.period.age[k] ?? 0)), 1)

  return (
    <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
      <Card style={{ padding: '1.2cqh 1cqw', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center" style={{ gap: '0.5cqw', flexShrink: 0 }}>
          <img src={meta.logo} alt={meta.label} style={{ width: '1.6cqw', height: '1.6cqw', objectFit: 'contain' }} />
          <span style={{ fontSize: '1.25cqw', lineHeight: 1, fontWeight: 800, color: '#0f172a', ...PJ }}>{meta.label}</span>
          {(last3 ? history.length < 3 : !prev) && (
            <span style={{ fontSize: '0.85cqw', fontWeight: 700, color: '#b8915a', background: '#fbf4e8', padding: '0.1cqh 0.4cqw', borderRadius: '0.3cqw', ...PJ }}>
              {last3 ? t('{n} of 3 months', { n: history.length }) : t('no prior month')}
            </span>
          )}
        </div>

        {showAge && (
          <div className="flex flex-col" style={{ marginTop: '1cqh', flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: '0.95cqw', lineHeight: 1, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6cqh', flexShrink: 0, ...PJ }}>
              {t('Age Group')}
            </div>
            {/* The list takes the leftover height and hands it to the rows; it never
                asks for more. `overflow: hidden` is the last line of defence, so a
                row can never be painted on top of the gender block below. */}
            <div className="flex flex-col" style={{ flex: 1, minHeight: 0, gap: '0.55cqh', overflow: 'hidden' }}>
              {last3
                ? buckets.map(([label, k]) => (
                  <AgeRow3 key={label} bucket={label} max={max3} shades={shades}
                    months={history.map(h => ({ idx: h.idx, v: h.period.age[k] ?? 0 }))} />
                ))
                : buckets.map(([label, k]) => (
                  <AgeRow key={label} bucket={label} now={cur.age[k] ?? 0}
                    before={prev ? (prev.age[k] ?? 0) : null} max={max} accent={accent} />
                ))}
            </div>
          </div>
        )}

        {showGender && (
          <div style={{ marginTop: showAge ? '1.1cqh' : '1cqh', flexShrink: 0 }}>
            <div style={{ fontSize: '0.95cqw', lineHeight: 1, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6cqh', ...PJ }}>
              {t('Gender')}
            </div>
            {last3 ? <GenderRows3 months={history} /> : <GenderBlock cur={cur} prev={prev} />}
          </div>
        )}
      </Card>
    </div>
  )
}

const RANGES: DemographicRange[] = ['mom', 'last3']
const RANGE_LABEL: Record<DemographicRange, string> = { mom: 'vs last month', last3: 'Last 3 months' }
const VIEWS: DemographicView[] = ['both', 'age', 'gender']
const VIEW_LABEL: Record<DemographicView, string> = { both: 'Age + Gender', age: 'Age only', gender: 'Gender only' }

/**
 * Audience Demographics body — age and gender for every platform in the report,
 * this month against the previous one. Header & footer come from the slide shell.
 *
 * ONE PANEL PER PLATFORM, NEVER A BLENDED ONE
 *   The warehouse stores demographics as SHARES per platform, so a combined
 *   "all channels" figure would have to average three percentages — weighing a
 *   2,000-follower TikTok exactly like a 200,000-follower Instagram. The brief
 *   asks for the comparison "pada masing-masing platform" anyway, so the slide
 *   simply never blends: `all` means every platform that has data, side by side.
 */
export default function DemographicSlide({
  slide, colors, editable, onChange,
}: {
  slide: ContentSlide
  colors: CoverColors
  editable: boolean
  onChange?: (next: ContentSlide) => void
}) {
  const t = useT()
  const audience = useReportAudience()
  const view = (slide.demographicView ?? 'both') as DemographicView
  const channels = demographicChannels(audience, slide.channel)
  const loading = audience === null
  const heading = demographicHeading(audience, channels)
  const range: DemographicRange = slide.demographicRange ?? 'mom'
  const labels3 = audience?.meta.last3Labels ?? []
  const shades = last3Shades(colors.primary)
  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: '0.95cqw', fontWeight: 700, padding: '0.35cqh 0.7cqw', borderRadius: '0.5cqw',
    border: `1px solid ${active ? '#2C3079' : '#e2e8f0'}`,
    background: active ? '#2C3079' : '#ffffff',
    color: active ? '#ffffff' : '#94a3b8',
    cursor: editable ? 'pointer' : 'default', ...PJ,
  })

  return (
    <>
      <div className="flex flex-col min-h-0" style={{ flex: 1, gap: '0.8cqh' }}>
        <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
          <CardLabel icon="groups" accent={colors.primary}>
            {range === 'last3' && labels3.length === 3
              ? t('Follower demographics — {from} to {to}', { from: labels3[0], to: labels3[2] })
              : heading.hasPrevious || loading
              ? t('Follower demographics — {cur} vs {prev}', { cur: heading.cur, prev: heading.prev })
              : t('Follower demographics — {cur} (no {prev} data to compare)', { cur: heading.cur, prev: heading.prev })}
          </CardLabel>
          <div className="flex items-center" style={{ gap: '0.4cqw' }}>
            {range === 'last3' && labels3.length === 3 && (
              <span className="flex items-center" style={{ gap: '0.5cqw', marginRight: '0.4cqw' }}>
                {labels3.map((l, i) => (
                  <span key={l} className="flex items-center" style={{ gap: '0.25cqw' }}>
                    <span style={{ width: '1.1cqw', height: '0.55cqh', borderRadius: '0.2cqw', background: shades[i] }} />
                    <span style={{ fontSize: '0.9cqw', lineHeight: 1, fontWeight: 700, color: '#64748b', ...PJ }}>{shortMonth(l)}</span>
                  </span>
                ))}
              </span>
            )}
            {RANGES.map(r => (
              <button key={r}
                onClick={editable ? () => onChange?.({ ...slide, demographicRange: r }) : undefined}
                disabled={!editable}
                style={pill(range === r)}
              >{t(RANGE_LABEL[r])}</button>
            ))}
            <span style={{ width: '1px', height: '2.4cqh', background: '#e2e8f0', margin: '0 0.2cqw' }} />
            {VIEWS.map(v => (
              <button key={v}
                onClick={editable ? () => onChange?.({ ...slide, demographicView: v }) : undefined}
                disabled={!editable}
                style={{
                  fontSize: '0.95cqw', fontWeight: 700, padding: '0.35cqh 0.7cqw', borderRadius: '0.5cqw',
                  border: `1px solid ${view === v ? '#2C3079' : '#e2e8f0'}`,
                  background: view === v ? '#2C3079' : '#ffffff',
                  color: view === v ? '#ffffff' : '#94a3b8',
                  cursor: editable ? 'pointer' : 'default', ...PJ,
                }}
              >{t(VIEW_LABEL[v])}</button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0" style={{ flex: 1, gap: '1.2cqw' }}>
          {channels.length === 0 ? (
            <Card style={{ padding: '1.2cqh 1cqw' }}>
              <Empty label={loading ? t('Loading…') : t('No follower demographics for this period')} />
            </Card>
          ) : (
            channels.map(p => {
              const d = demographicsFor(audience, p)
              return d ? <PlatformPanel key={p} platform={p} data={d} view={view} accent={colors.primary} range={range} history={demographicHistory(audience, p)} /> : null
            })
          )}
        </div>
      </div>

      <div style={{ height: '19cqh', flexShrink: 0 }}>
        <AiInsightBlock slide={slide} editable={editable} onChange={onChange} label="Demographic shift & notes" />
      </div>
    </>
  )
}
