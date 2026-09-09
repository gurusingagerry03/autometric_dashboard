'use client'

import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide, DemographicView } from '@/lib/reports/data/slideModel'
import { useReportAudience } from '@/lib/reports/data/metricsContext'
import {
  AGE_BUCKETS, demographicChannels, demographicsFor,
  type ChannelDemographics, type DemographicPeriod,
} from '@/lib/reports/data/audienceTypes'
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
  if (before === null) return <span style={{ fontSize: size, color: '#cbd5e1', ...PJ }}>—</span>
  const d = +(now - before).toFixed(1)
  const flat = Math.abs(d) < 0.05
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: flat ? '#a3adba' : d > 0 ? '#15803d' : '#b91c1c', ...PJ }}>
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
 */
function AgeRow({ bucket, now, before, max, accent }: {
  bucket: string; now: number; before: number | null; max: number; accent: string
}) {
  const w = max > 0 ? (now / max) * 100 : 0
  const prevW = before !== null && max > 0 ? (before / max) * 100 : null
  return (
    <div className="flex items-center" style={{ gap: '0.5cqw' }}>
      <span style={{ width: '4.6cqw', flexShrink: 0, fontSize: '1cqw', fontWeight: 600, color: '#64748b', textAlign: 'right', ...PJ }}>
        {bucket}
      </span>
      <div style={{ flex: 1, minWidth: 0, height: '1.5cqh', background: '#f1f5f9', borderRadius: '0.3cqw', position: 'relative' }}>
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
      <span style={{ width: '3.2cqw', flexShrink: 0, fontSize: '1cqw', fontWeight: 700, color: '#0f172a', textAlign: 'right', ...PJ }}>
        {now.toFixed(1)}%
      </span>
      <span style={{ width: '2.8cqw', flexShrink: 0, textAlign: 'right' }}>
        <Delta now={now} before={before} />
      </span>
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
      <span style={{ fontSize: '1cqw', fontWeight: 800, color: '#ffffff', ...PJ }}>{share.toFixed(0)}%</span>
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
          <span style={{ fontSize: '0.95cqw', color: '#64748b', ...PJ }}>{t('Female')}</span>
          <Delta now={cur.female} before={prev ? prev.female : null} />
        </span>
        <span className="flex items-center" style={{ gap: '0.35cqw' }}>
          <span style={{ width: '0.7cqw', height: '0.7cqw', borderRadius: '50%', background: MALE }} />
          <span style={{ fontSize: '0.95cqw', color: '#64748b', ...PJ }}>{t('Male')}</span>
          <Delta now={cur.male} before={prev ? prev.male : null} />
        </span>
      </div>
    </>
  )
}

function PlatformPanel({ platform, data, view, accent }: {
  platform: DashPlatform; data: ChannelDemographics; view: DemographicView; accent: string
}) {
  const t = useT()
  const meta = PLATFORM_META[platform]
  const cur = data.current
  const prev = data.previous
  if (!cur) return null

  // One scale for both months so a bar and its marker are read on the same ruler.
  const max = Math.max(
    ...AGE_BUCKETS.map(b => Math.max(cur.age[b] ?? 0, prev?.age[b] ?? 0)),
    1,
  )
  const showAge = view !== 'gender'
  const showGender = view !== 'age'

  return (
    <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
      <Card style={{ padding: '1.2cqh 1cqw', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center" style={{ gap: '0.5cqw', flexShrink: 0 }}>
          <img src={meta.logo} alt={meta.label} style={{ width: '1.6cqw', height: '1.6cqw', objectFit: 'contain' }} />
          <span style={{ fontSize: '1.25cqw', fontWeight: 800, color: '#0f172a', ...PJ }}>{meta.label}</span>
          {!prev && (
            <span style={{ fontSize: '0.85cqw', fontWeight: 700, color: '#b8915a', background: '#fbf4e8', padding: '0.1cqh 0.4cqw', borderRadius: '0.3cqw', ...PJ }}>
              {t('no prior month')}
            </span>
          )}
        </div>

        {showAge && (
          <div style={{ marginTop: '1cqh', flex: 1, minHeight: 0 }}>
            <div style={{ fontSize: '0.95cqw', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6cqh', ...PJ }}>
              {t('Age Group')}
            </div>
            <div className="flex flex-col" style={{ gap: '0.55cqh' }}>
              {AGE_BUCKETS.map(b => (
                <AgeRow key={b} bucket={b} now={cur.age[b] ?? 0}
                  before={prev ? (prev.age[b] ?? 0) : null} max={max} accent={accent} />
              ))}
            </div>
          </div>
        )}

        {showGender && (
          <div style={{ marginTop: showAge ? '1.1cqh' : '1cqh', flexShrink: 0 }}>
            <div style={{ fontSize: '0.95cqw', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6cqh', ...PJ }}>
              {t('Gender')}
            </div>
            <GenderBlock cur={cur} prev={prev} />
          </div>
        )}
      </Card>
    </div>
  )
}

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

  return (
    <>
      <div className="flex flex-col min-h-0" style={{ flex: 1, gap: '0.8cqh' }}>
        <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
          <CardLabel icon="groups" accent={colors.primary}>
            {t('Follower demographics — {cur} vs {prev}', {
              cur: audience?.meta.monthLabel ?? '—',
              prev: audience?.meta.prevMonthLabel ?? '—',
            })}
          </CardLabel>
          <div className="flex" style={{ gap: '0.4cqw' }}>
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
              return d ? <PlatformPanel key={p} platform={p} data={d} view={view} accent={colors.primary} /> : null
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
