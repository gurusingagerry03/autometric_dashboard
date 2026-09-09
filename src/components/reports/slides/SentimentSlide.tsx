'use client'

import { useEffect, useState } from 'react'
import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide } from '@/lib/reports/data/slideModel'
import { useReportAudience } from '@/lib/reports/data/metricsContext'
import {
  AUDIENCE_SOURCES, SENTIMENT_COLOR, SENTIMENT_KEYS, SENTIMENT_LABEL, SOURCE_LABEL,
  audienceWordsFor, biggestShift, sentimentFor, sourceBreakdown,
  type SentimentBlock, type SentimentKey, type SourceFilter,
} from '@/lib/reports/data/audienceTypes'
import { computeWordCloud, WC_W, WC_H, WC_FONT, type PlacedWord } from '@/lib/reports/data/wordcloudLayout'
import { SENTIMENT_PALETTES } from '@/lib/reports/data/chartData'
import { PJ, Card, CardLabel, AiInsightBlock } from './parts'
import { useT } from '@/lib/i18n/LanguageContext'

const int = (n: number) => n.toLocaleString('id-ID')

/** Signed percentage-POINT delta — the unit is printed so it is never read as a
 *  percent change of a percent (see SentimentBlock.shareChange). */
const pp = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}pp`

/** Stable 0..1 from a string — picks a shade inside a sentiment's palette. */
function whash(s: string): number {
  let x = 0
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0
  return (x % 1000) / 1000
}

function Empty({ label }: { label: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ color: '#b6bcc4' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '2.8cqw' }}>data_usage</span>
      <span style={{ fontSize: '1.15cqw', fontWeight: 600, marginTop: '0.5cqh', ...PJ }}>{label}</span>
    </div>
  )
}

/**
 * One sentiment tile: absolute number on top, share underneath, month-over-month
 * move at the bottom.
 *
 * BOTH NUMBERS, ALWAYS
 *   The brief asks for "absolute number + percentage" and the pairing is the
 *   point: 100% positive out of 8 tagged posts and 60% out of 747 comments are
 *   the same colour of green on a chart and completely different findings. The
 *   count is the bigger type because it is the one that bounds how much the
 *   share can be trusted.
 */
function SentimentTile({ k, block, accent }: { k: SentimentKey; block: SentimentBlock; accent: string }) {
  const t = useT()
  const count = block.current.counts[k]
  const shareNow = block.current.share[k]
  const move = block.shareChange[k]
  const color = SENTIMENT_COLOR[k]
  const rising = move > 0
  const flat = Math.abs(move) < 0.05
  // Green-is-good does not hold here: negative sentiment climbing is bad news
  // even though the number went up. The arrow shows direction; the colour shows
  // whether that direction is welcome.
  const good = k === 'negative' ? move < 0 : move > 0
  const moveColor = flat ? '#94a3b8' : good ? '#15803d' : '#b91c1c'

  return (
    <div
      className="flex flex-col justify-between"
      style={{
        flex: 1, minWidth: 0, background: '#fbfcfd', border: '1px solid #e8ebee',
        borderRadius: '1cqw', borderTop: `0.45cqh solid ${color}`, padding: '1.2cqh 1cqw',
      }}
    >
      <div className="flex items-center" style={{ gap: '0.5cqw' }}>
        <span style={{ width: '0.8cqw', height: '0.8cqw', borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '1.15cqw', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', ...PJ }}>
          {t(SENTIMENT_LABEL[k])}
        </span>
      </div>

      <div style={{ marginTop: '0.6cqh' }}>
        <div style={{ fontSize: '3.1cqw', fontWeight: 800, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', ...PJ }}>
          {int(count)}
        </div>
        <div style={{ fontSize: '1.5cqw', fontWeight: 700, color: accent, marginTop: '0.3cqh', ...PJ }}>
          {shareNow.toFixed(1)}%
        </div>
      </div>

      <div className="flex items-center" style={{ gap: '0.3cqw', marginTop: '0.6cqh' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.4cqw', color: moveColor }}>
          {flat ? 'remove' : rising ? 'arrow_upward' : 'arrow_downward'}
        </span>
        <span style={{ fontSize: '1.1cqw', fontWeight: 700, color: moveColor, ...PJ }}>{pp(move)}</span>
        <span style={{ fontSize: '0.95cqw', color: '#a3adba', ...PJ }}>{t('vs prev')}</span>
      </div>
    </div>
  )
}

/** Word cloud for the audience's own words, packed by the shared d3-cloud layout
 *  so the preview and the PPTX export place every word identically. */
function Cloud({ words }: { words: { word: string; sentiment: SentimentKey; frequency: number }[] }) {
  const [placed, setPlaced] = useState<PlacedWord[]>([])
  const sig = words.map(w => `${w.word}:${w.frequency}:${w.sentiment}`).join('|')
  useEffect(() => {
    setPlaced(computeWordCloud(words))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return (
    <svg viewBox={`0 0 ${WC_W} ${WC_H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full" style={{ display: 'block' }}>
      {placed.map(p => {
        const pal = SENTIMENT_PALETTES[p.sentiment]
        return (
          <text
            key={p.word}
            textAnchor="middle"
            transform={`translate(${p.x.toFixed(2)},${p.y.toFixed(2)})${p.rotate ? ` rotate(${p.rotate})` : ''}`}
            fontSize={p.fontSize} fontWeight={p.weight} fontFamily={WC_FONT}
            fill={pal[Math.floor(whash(p.word + 'c') * pal.length)]}
          >
            {p.word}
          </text>
        )
      })}
    </svg>
  )
}

const SOURCE_OPTIONS: SourceFilter[] = ['all', ...AUDIENCE_SOURCES]
const CLOUD_OPTIONS = ['all', ...SENTIMENT_KEYS]

function Chip({ active, label, onClick, editable }: { active: boolean; label: string; onClick?: () => void; editable: boolean }) {
  return (
    <button
      onClick={editable ? onClick : undefined}
      disabled={!editable}
      style={{
        fontSize: '0.95cqw', fontWeight: 700, padding: '0.35cqh 0.7cqw', borderRadius: '0.5cqw',
        border: `1px solid ${active ? '#2C3079' : '#e2e8f0'}`,
        background: active ? '#2C3079' : '#ffffff',
        color: active ? '#ffffff' : '#94a3b8',
        cursor: editable ? 'pointer' : 'default', ...PJ,
      }}
    >
      {label}
    </button>
  )
}

/**
 * Audience Sentiment body — how the audience sounded this month vs last, and the
 * words they used. Header & footer come from the slide shell.
 *
 * WHOSE VOICE
 *   Comments and tagged-post captions only. The brand's own captions are scored
 *   in the same warehouse table but are excluded upstream (see audienceTypes.ts):
 *   a brand writing cheerful copy must not be able to lift its own audience score.
 *
 * WHY A SOURCE SWITCH
 *   Tagged posts are typically one or two orders of magnitude rarer than
 *   comments, so "Both" is in practice the comment number. The switch is what
 *   makes the tagged-post voice visible at all.
 */
export default function SentimentSlide({
  slide, colors, editable, onChange,
}: {
  slide: ContentSlide
  colors: CoverColors
  editable: boolean
  onChange?: (next: ContentSlide) => void
}) {
  const t = useT()
  const audience = useReportAudience()
  const source = (slide.sentimentSource ?? 'all') as SourceFilter
  const block = sentimentFor(audience, slide.channel, source)
  const words = audienceWordsFor(audience, slide.channel, slide.cloudSentiment)
  const shift = biggestShift(block)
  const breakdown = sourceBreakdown(audience, slide.channel)
  const loading = audience === null

  return (
    <>
      <div className="flex min-h-0" style={{ gap: '1.6cqw', flex: 1 }}>
        {/* ── breakdown ─────────────────────────────────────────────── */}
        <div className="flex flex-col min-w-0" style={{ width: '48cqw', flexShrink: 0, gap: '1.2cqh' }}>
          <Card style={{ height: 'auto', flex: 1, padding: '1.4cqh 1.2cqw', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ gap: '0.6cqw' }}>
              <CardLabel icon="sentiment_satisfied" accent={colors.primary}>{t('Sentiment Breakdown')}</CardLabel>
              <div className="flex" style={{ gap: '0.4cqw', flexShrink: 0 }}>
                {SOURCE_OPTIONS.map(s => (
                  <Chip key={s} active={source === s} editable={editable}
                    label={s === 'all' ? t('Both') : t(SOURCE_LABEL[s])}
                    onClick={() => onChange?.({ ...slide, sentimentSource: s })} />
                ))}
              </div>
            </div>

            {!block ? (
              <div style={{ flex: 1, minHeight: 0, marginTop: '1cqh' }}>
                <Empty label={loading ? t('Loading…') : t('No scored audience voice for this period')} />
              </div>
            ) : (
              <>
                <div className="flex" style={{ gap: '0.8cqw', marginTop: '1cqh', flex: 1, minHeight: 0 }}>
                  {SENTIMENT_KEYS.map(k => (
                    <SentimentTile key={k} k={k} block={block} accent={colors.primary} />
                  ))}
                </div>

                {/* The denominator every share above is taken from — without it a
                    percentage on a sentiment slide is unfalsifiable. */}
                <div className="flex items-center flex-wrap" style={{ gap: '0.8cqw', marginTop: '1cqh' }}>
                  <span style={{ fontSize: '1.05cqw', fontWeight: 700, color: '#475569', ...PJ }}>
                    {t('{n} scored this month', { n: int(block.current.total) })}
                  </span>
                  <span style={{ fontSize: '1.05cqw', color: '#a3adba', ...PJ }}>
                    {t('{n} previous', { n: int(block.previous.total) })}
                  </span>
                  {source === 'all' && breakdown.length > 0 && (
                    <span style={{ fontSize: '0.95cqw', color: '#a3adba', ...PJ }}>
                      · {breakdown.map(b => `${t(SOURCE_LABEL[b.source])} ${int(b.total)}`).join(' · ')}
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* ── biggest move ────────────────────────────────────────── */}
          <Card style={{ height: 'auto', flexShrink: 0, padding: '1.2cqh 1.2cqw' }}>
            <CardLabel icon="trending_up" accent={colors.accent}>{t('Biggest Shift vs Previous Month')}</CardLabel>
            <div style={{ marginTop: '0.7cqh' }}>
              {!shift ? (
                <span style={{ fontSize: '1.2cqw', color: '#94a3b8', ...PJ }}>
                  {block ? t('Sentiment held steady — no share moved by more than 0.1pp.') : '—'}
                </span>
              ) : (
                <div className="flex items-baseline" style={{ gap: '0.6cqw' }}>
                  <span style={{
                    fontSize: '1.9cqw', fontWeight: 800, color: SENTIMENT_COLOR[shift.sentiment],
                    letterSpacing: '-0.01em', ...PJ,
                  }}>
                    {t(SENTIMENT_LABEL[shift.sentiment])} {pp(shift.change)}
                  </span>
                  <span style={{ fontSize: '1.1cqw', color: '#64748b', ...PJ }}>
                    {t('{from}% → {to}%', {
                      from: block!.previous.share[shift.sentiment].toFixed(1),
                      to: block!.current.share[shift.sentiment].toFixed(1),
                    })}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── word cloud ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <Card style={{ padding: '1.4cqh 1.2cqw', display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between" style={{ gap: '0.6cqw' }}>
              <CardLabel icon="cloud" accent={colors.primary}>{t('Conversation Word Cloud')}</CardLabel>
              <div className="flex" style={{ gap: '0.4cqw', flexShrink: 0 }}>
                {CLOUD_OPTIONS.map(s => (
                  <Chip key={s} active={(slide.cloudSentiment || 'all') === s} editable={editable}
                    label={s === 'all' ? t('All') : t(SENTIMENT_LABEL[s as SentimentKey])}
                    onClick={() => onChange?.({ ...slide, cloudSentiment: s })} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, marginTop: '0.6cqh' }}>
              {words.length === 0
                ? <Empty label={loading ? t('Loading…') : t('No comment words for this period')} />
                : <Cloud words={words} />}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ height: '20cqh', flexShrink: 0 }}>
        <AiInsightBlock slide={slide} editable={editable} onChange={onChange} label="Sentiment analysis & notes" />
      </div>
    </>
  )
}
