'use client'

import { useEffect, useState } from 'react'
import { CoverColors, tint } from '@/lib/reports/cover/colors'
import { ContentSlide } from '@/lib/reports/data/slideModel'
import { useReportAudience, useReportImageResolver } from '@/lib/reports/data/metricsContext'
import { TAGGED_COUNTS, fmtTaggedDate, taggedChange, taggedFor, type TaggedPost } from '@/lib/reports/data/audienceTypes'
import { groupInt } from '@/lib/reports/data/format'
import { PJ, Card, AiInsightBlock } from './parts'
import { useT } from '@/lib/i18n/LanguageContext'

/**
 * Tagged Posts — post orang lain yang menandai brand (UGC). Post-UAT least
 * priority: "dengan showcase content nya juga, jadi ga cuman numbers". Bentuknya
 * mengikuti contoh di brief: dua kartu angka (Total Tagged Posts, Tagged Post User
 * Count, masing-masing dengan perubahan vs bulan lalu), lalu Top N tagged post
 * menurut engagement — gambar, akun, tanggal, engagement, dan link ke post-nya —
 * dan catatan di kanan. Cerminan addTaggedSlide di exportReport.ts.
 */
export default function TaggedSlide({
  slide, colors, editable, onChange,
}: {
  slide: ContentSlide
  colors: CoverColors
  editable: boolean
  onChange?: (next: ContentSlide) => void
}) {
  const t = useT()
  const audience = useReportAudience()
  const data = taggedFor(audience, slide.channel)
  const n = (TAGGED_COUNTS as readonly number[]).includes(slide.postCount) ? slide.postCount : 3
  const posts = (data?.top ?? []).slice(0, n)

  // Cover yang belum tersimpan permanen diminta ke resolver gambar report, sama
  // dengan slide Visual Content.
  const resolveImages = useReportImageResolver()
  const [resolved, setResolved] = useState<Record<string, string | null>>({})
  const keySig = posts.map(p => p.imageKey).filter(Boolean).join('\n')
  useEffect(() => {
    if (!resolveImages || !keySig) return
    let alive = true
    resolveImages(keySig.split('\n')).then(m => { if (alive) setResolved(prev => ({ ...prev, ...m })) })
    return () => { alive = false }
  }, [resolveImages, keySig])
  const img = (p: TaggedPost) => (p.imageKey && resolved[p.imageKey]) || p.image

  const accent = colors.primary
  const stat = (label: string, cur: number, prev: number) => {
    const ch = taggedChange(cur, prev)
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ background: accent, borderRadius: '1cqw', padding: '1.4cqh 1cqw', minWidth: 0 }}>
        <span style={{ fontSize: '1.15cqw', lineHeight: 1.1, fontWeight: 600, color: tint(accent, 0.85), ...PJ }}>{label}</span>
        <span style={{ fontSize: '2.3cqw', lineHeight: 1.15, fontWeight: 800, color: '#ffffff', marginTop: '0.4cqh', ...PJ }}>
          {groupInt(cur)}{ch && <span style={{ fontSize: '1.5cqw', fontWeight: 700 }}> ({ch})</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0" style={{ flex: 1, gap: '1.4cqw' }}>
      <div className="flex flex-col min-w-0" style={{ flex: 2.1, gap: '1.2cqh' }}>
        {/* Kartu angka */}
        <div className="flex" style={{ gap: '1.2cqw', flexShrink: 0 }}>
          {stat(t('Total Tagged Posts'), data?.current.posts ?? 0, data?.previous.posts ?? 0)}
          {stat(t('Tagged Post User Count'), data?.current.users ?? 0, data?.previous.users ?? 0)}
        </div>

        {/* Top N */}
        <Card style={{ flex: 1, minHeight: 0, height: 'auto', padding: '1.2cqh 1.2cqw', display: 'flex', flexDirection: 'column' }}>
          <div className="flex items-center justify-between" style={{ background: tint(accent, 0.88), borderRadius: '0.4cqw', padding: '0.5cqh 0.8cqw', flexShrink: 0 }}>
            <span style={{ fontSize: '1cqw', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em', ...PJ }}>
              {t('TOP {n} TAGGED POST ENGAGEMENTS', { n: posts.length || n })}
            </span>
            {editable && (
              <span className="flex" style={{ gap: '0.3cqw' }}>
                {TAGGED_COUNTS.map(c => (
                  <button key={c} onClick={() => onChange?.({ ...slide, postCount: c })}
                    style={{
                      fontSize: '0.85cqw', fontWeight: 700, padding: '0.15cqh 0.55cqw', borderRadius: '0.35cqw',
                      background: n === c ? '#2C3079' : '#ffffff', color: n === c ? '#ffffff' : '#64748b',
                      border: `1px solid ${n === c ? '#2C3079' : '#e2e8f0'}`, ...PJ,
                    }}>{c}</button>
                ))}
              </span>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ color: '#b6bcc4' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.8cqw' }}>alternate_email</span>
              <span style={{ fontSize: '1.15cqw', fontWeight: 600, marginTop: '0.5cqh', ...PJ }}>
                {audience === null ? t('Loading…') : t('No tagged posts in this period')}
              </span>
            </div>
          ) : (
            <div className="flex min-h-0" style={{ flex: 1, gap: '1cqw', marginTop: '1.2cqh' }}>
              {posts.map(p => {
                const src = img(p)
                const loading = !!resolveImages && !!p.imageKey && !(p.imageKey in resolved)
                const Wrap = p.link ? 'a' : 'div'
                const linkProps = p.link ? { href: p.link, target: '_blank', rel: 'noopener noreferrer', title: p.link } : {}
                return (
                  <div key={p.postId} className="flex flex-col min-w-0" style={{ flex: '1 1 0' }}>
                    <Wrap {...linkProps} className="relative block flex-1 min-h-0 overflow-hidden" style={{ borderRadius: '0.6cqw', background: tint(accent, 0.9) }}>
                      {src && <img key={src} src={src} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />}
                      {!src && (
                        <span className="absolute inset-0 flex items-center justify-center material-symbols-outlined" style={{ fontSize: '2.6cqw', color: tint(accent, 0.5) }}>
                          {loading ? 'progress_activity' : 'image'}
                        </span>
                      )}
                    </Wrap>
                    <div style={{ paddingTop: '0.8cqh', flexShrink: 0, lineHeight: 1.3 }}>
                      <div className="truncate" style={{ fontSize: '0.95cqw', fontWeight: 700, color: '#334155', ...PJ }} title={`@${p.username}`}>@{p.username}</div>
                      <div style={{ fontSize: '0.85cqw', color: '#64748b', ...PJ }}>{fmtTaggedDate(p.date)}</div>
                      <div style={{ fontSize: '0.85cqw', color: '#64748b', ...PJ }}>Eng.: <b style={{ color: '#0f172a' }}>{groupInt(p.engagement)}</b></div>
                      {p.link
                        ? <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85cqw', fontWeight: 600, color: '#2563eb', ...PJ }}>{t('Open post')} ↗</a>
                        : <span style={{ fontSize: '0.85cqw', color: '#cbd5e1', ...PJ }}>—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
        <AiInsightBlock slide={slide} editable={editable} onChange={onChange} label="Tagged post insights" />
      </div>
    </div>
  )
}
