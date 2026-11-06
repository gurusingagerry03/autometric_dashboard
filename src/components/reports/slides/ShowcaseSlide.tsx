'use client'

import { useEffect, useMemo, useState } from 'react'
import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide } from '@/lib/reports/data/slideModel'
import {
  SHOWCASE_MAX_GROUPS, SHOWCASE_MAX_METRICS, SHOWCASE_PER_ROW, buildShowcase, cardMetricLabel,
  SHOWCASE_GEOM, effectiveShowcaseGroups, effectiveSortMetric, metricLabel, metricsForChannel, populatedMetricsFor,
  showcaseGeometry, showcaseGroupOptions, showcaseLabel, showcaseLongest, showcaseMetricFs, showcaseShownMetrics, type ShowcaseGroupBy,
} from '@/lib/reports/data/posts'
import { useReportImageResolver, useReportPosts } from '@/lib/reports/data/metricsContext'
import { PJ } from './parts'
import { useT } from '@/lib/i18n/LanguageContext'

/**
 * Format / Pillar Showcase (Post-UAT brief, "All Format/Pillar Showcase").
 *
 *   kiri   — rata-rata metrik pengurut per kelompok, sebagai bar
 *   tengah — satu baris per kelompok, post dari terendah (kiri) ke tertinggi
 *   kanan  — catatan per kelompok, diketik langsung di slide
 *
 * Kumpulan post, pengelompokan, dan pengurutannya dari buildShowcase — fungsi
 * yang sama dipakai exporter, jadi pratinjau dan PPTX memuat post yang sama.
 */
export default function ShowcaseSlide({
  slide, colors, editable, onChange,
}: {
  slide: ContentSlide
  colors: CoverColors
  editable: boolean
  onChange?: (next: ContentSlide) => void
}) {
  const t = useT()
  const [cfgOpen, setCfgOpen] = useState(false)
  const ctx = useReportPosts()
  const source = ctx?.[slide.channel]
  const by: ShowcaseGroupBy = slide.showcaseBy ?? 'format'
  const perRow = SHOWCASE_PER_ROW.includes(slide.postCount) ? slide.postCount : 4
  const populated = useMemo(() => populatedMetricsFor(source), [source])
  const sortMetric = effectiveSortMetric(slide.postSortMetric, populated)
  const shown = showcaseShownMetrics(slide.postMetrics, populated, sortMetric)
  const options = showcaseGroupOptions(source, by)
  const groupIds = effectiveShowcaseGroups(source, by, slide.showcaseGroups)
  const built = buildShowcase(source, by, groupIds, sortMetric, perRow, slide.postNumbers === 'compact')
  const maxAvg = Math.max(0, ...built.map(g => g.avg)) || 1
  // Ukuran foto & huruf kotak metrik — rumus yang sama dengan exporter.
  const geom = showcaseGeometry(perRow, built.length)
  const metricFs = showcaseMetricFs(geom, shown.length, showcaseLongest(built, shown))
  const G = SHOWCASE_GEOM

  // Gambar yang belum tersimpan permanen diminta ke resolver report, sama seperti VisualSlide.
  const resolveImages = useReportImageResolver()
  const [resolved, setResolved] = useState<Record<string, string | null>>({})
  const keySig = built.flatMap(g => g.posts.map(p => p.imageKey)).filter(Boolean).join('\n')
  useEffect(() => {
    if (!resolveImages || !keySig) return
    let alive = true
    resolveImages(keySig.split('\n')).then(m => { if (alive) setResolved(prev => ({ ...prev, ...m })) })
    return () => { alive = false }
  }, [resolveImages, keySig])
  const img = (p: { image: string; imageKey?: string }) => (p.imageKey && resolved[p.imageKey]) || p.image

  const set = (patch: Partial<ContentSlide>) => onChange?.({ ...slide, ...patch })
  const SHOWCASE_TITLES = ['Format Showcase', 'Pillar Showcase', '']
  const setNote = (gid: string, text: string) => set({ showcaseNotes: { ...(slide.showcaseNotes ?? {}), [gid]: text } })
  const toggleGroup = (gid: string) => {
    const cur = groupIds
    const next = cur.includes(gid) ? cur.filter(x => x !== gid) : [...cur, gid].slice(0, SHOWCASE_MAX_GROUPS)
    if (next.length) set({ showcaseGroups: next })
  }
  const toggleMetric = (id: string) => {
    const cur = shown
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].slice(0, SHOWCASE_MAX_METRICS)
    set({ postMetrics: next })
  }
  const accent = colors.primary

  const body = ctx === null ? (
    <Empty icon="progress_activity" spin text={t('Loading posts…')} />
  ) : !source?.length ? (
    <Empty icon="inventory_2" text={`No ${slide.channel} posts in this period`} />
  ) : (
    <div className="h-full flex" style={{ gap: `${G.gap}cqw` }}>
      {/* Kiri: rata-rata per kelompok */}
      <div className="flex flex-col rounded-[0.8cqw] bg-white border border-[#e8ebee]" style={{ width: `${G.leftW}cqw`, flexShrink: 0, padding: '1cqh 0.8cqw' }}>
        <div className="flex items-center" style={{ gap: '0.4cqw', height: '3cqh' }}>
          <span style={{ width: '0.9cqw', height: '0.9cqw', background: accent, borderRadius: 2 }} />
          <span className="truncate" style={{ fontSize: '0.8cqw', fontWeight: 700, color: '#475569', ...PJ }}>Avg. {metricLabel(sortMetric)}</span>
        </div>
        {built.map(g => (
          <div key={g.id} className="flex-1 min-h-0 flex items-center" style={{ gap: '0.5cqw' }}>
            <span className="truncate text-right" style={{ width: '5cqw', fontSize: '0.85cqw', color: '#334155', ...PJ }} title={g.label}>{g.label}</span>
            <div className="flex-1 flex items-center" style={{ gap: '0.3cqw' }}>
              <div style={{ width: `${Math.max(4, (g.avg / maxAvg) * 70)}%`, height: '2.6cqh', background: accent, borderRadius: 3 }} />
              <span style={{ fontSize: '0.8cqw', fontWeight: 800, color: '#0f172a', ...PJ }}>{g.avgText}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tengah: baris per kelompok, terendah → tertinggi */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between" style={{ height: `${G.headH}cqh`, flexShrink: 0, padding: '0 0.4cqw 0 2.6cqw', ...PJ }}>
          <span style={{ fontSize: '0.9cqw', fontWeight: 800, color: '#dc2626' }}>Lowest</span>
          <span style={{ fontSize: '0.75cqw', color: '#94a3b8' }}>*based on {metricLabel(sortMetric)}</span>
          <span style={{ fontSize: '0.9cqw', fontWeight: 800, color: '#16a34a' }}>Highest</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col" style={{ gap: `${G.rowGap}cqh` }}>
          {built.map(g => (
            <div key={g.id} className="flex-1 min-h-0 flex rounded-[0.8cqw] overflow-hidden border border-[#e8ebee] bg-white">
              <div className="flex items-center justify-center" style={{ width: `${G.stripW}cqw`, flexShrink: 0, background: accent }}>
                {(() => {
                  const lab = showcaseLabel(g.label, built.length)
                  return (
                    <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: `${lab.fs}cqw`, lineHeight: 1.1, fontWeight: 800, color: '#fff', letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'pre', overflow: 'hidden', maxHeight: '100%', ...PJ }}>
                      {lab.lines.join('\n')}
                    </span>
                  )
                })()}
              </div>
              <div className="flex-1 min-w-0 flex items-stretch justify-end" style={{ gap: `${G.slotGap}cqw`, padding: `${G.rowPad}cqh ${G.trackPad}cqw`, background: tintBg(accent) }}>
                {g.posts.map((p, i) => (
                  <div key={i} className="min-w-0 flex" style={{ width: `${geom.slotW}cqw`, flexShrink: 0, gap: `${G.boxGap}cqw` }}>
                    <a href={p.link} target="_blank" rel="noopener noreferrer" className="relative h-full overflow-hidden rounded-[0.4cqw] bg-[#e2e8f0]" style={{ width: `${geom.imgW}cqw`, flexShrink: 0, pointerEvents: p.link ? 'auto' : 'none' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img(p)} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
                    </a>
                    <div className="min-w-0 flex-1 flex flex-col justify-center rounded-[0.4cqw]" style={{ background: '#fff', border: '1px solid #eef0f2', padding: '0.3cqh 0.25cqw', fontSize: `${metricFs}cqw`, lineHeight: 1.2, whiteSpace: 'nowrap', ...PJ }}>
                      {shown.map(m => (
                        <span key={m} className="block overflow-hidden">
                          <span className="block" style={{ color: '#94a3b8' }}>{cardMetricLabel(m)}</span>
                          <span className="block" style={{ color: m === sortMetric ? '#16a34a' : '#334155', fontWeight: m === sortMetric ? 800 : 600 }}>{p.metrics[m] ?? '—'}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kanan: catatan per kelompok */}
      <div className="flex flex-col rounded-[0.8cqw] bg-white border border-[#e8ebee] overflow-hidden" style={{ width: `${G.rightW}cqw`, flexShrink: 0, padding: '1cqh 0.9cqw', gap: '0.6cqh' }}>
        {built.map(g => (
          <div key={g.id} className="flex-1 min-h-0 flex flex-col">
            <span style={{ fontSize: '0.85cqw', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', ...PJ }}>{g.label}</span>
            {editable ? (
              <textarea
                value={slide.showcaseNotes?.[g.id] ?? ''}
                onChange={e => setNote(g.id, e.target.value)}
                placeholder={t('Add a note…')}
                className="flex-1 min-h-0 w-full resize-none bg-transparent outline-none rounded-[0.3cqw] focus:bg-[#f8fafc]"
                style={{ fontSize: '0.78cqw', lineHeight: 1.3, color: '#475569', ...PJ }}
              />
            ) : (
              <p className="flex-1 min-h-0 overflow-hidden" style={{ fontSize: '0.78cqw', lineHeight: 1.3, color: '#475569', whiteSpace: 'pre-wrap', ...PJ }}>{slide.showcaseNotes?.[g.id] || '—'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="flex-1 min-h-0 relative">
        {editable && (
          <button
            onClick={() => setCfgOpen(true)}
            title={t('Content settings')}
            className="absolute z-10 flex items-center justify-center rounded-[0.5cqw] bg-white border border-[#e2e8f0] text-[#94a3b8] hover:text-[#2C3079] hover:border-[#cbd5e1] shadow-sm transition-colors"
            style={{ top: '-3cqh', right: 0, width: '2.6cqw', height: '2.6cqw' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.5cqw' }}>tune</span>
          </button>
        )}
        {body}
      </div>

      {cfgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCfgOpen(false)}>
          <div className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm" />
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[460px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.30)] p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 style={PJ} className="text-[16px] font-bold text-[#0f172a]">{t('Format/Pillar Showcase')}</h3>
                <p className="text-[12px] text-[#94a3b8] mt-0.5">{t('One row per group, posts from lowest to highest.')}</p>
              </div>
              <button onClick={() => setCfgOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <Label>{t('Group by')}</Label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([['format', t('Format')], ['pillar', t('Content pillar')]] as const).map(([id, label]) => (
                <Choice key={id} on={by === id} onClick={() => set({
                  showcaseBy: id, showcaseGroups: [],
                  // Judul bawaan ikut pengelompokan; judul yang sudah diketik pemakai dibiarkan.
                  ...(SHOWCASE_TITLES.includes(slide.title) ? { title: id === 'pillar' ? 'Pillar Showcase' : 'Format Showcase' } : {}),
                })}>{label}</Choice>
              ))}
            </div>

            <Label>{by === 'format' ? t('Formats') : t('Content pillars')} <span className="text-[#cbd5e1] normal-case font-medium">· max {SHOWCASE_MAX_GROUPS}</span></Label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {options.map(o => (
                <Choice key={o.id} on={groupIds.includes(o.id)} onClick={() => toggleGroup(o.id)}>{o.label} <span className="text-[#94a3b8] font-normal">({o.count})</span></Choice>
              ))}
            </div>

            <Label>{t('Rank by (metric)')}</Label>
            <select value={sortMetric} onChange={e => set({ postSortMetric: e.target.value })} style={PJ}
              className="w-full mb-4 h-10 text-[13px] font-semibold text-[#334155] bg-white border border-[#e5e7eb] rounded-lg px-3 cursor-pointer hover:border-[#cbd5e1] outline-none">
              {metricsForChannel(slide.channel).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            <Label>{t('Posts per row')}</Label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {SHOWCASE_PER_ROW.map(n => <Choice key={n} on={perRow === n} onClick={() => set({ postCount: n })}>{n}</Choice>)}
            </div>

            <Label>{t('Numbers')}</Label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([['full', '1,234,567'], ['compact', '1.23M']] as const).map(([id, label]) => (
                <Choice key={id} on={(slide.postNumbers ?? 'full') === id} onClick={() => set({ postNumbers: id })}>{label}</Choice>
              ))}
            </div>

            <Label>{t('Metrics')} <span className="text-[#cbd5e1] normal-case font-medium">· max {SHOWCASE_MAX_METRICS}</span></Label>
            <div className="grid grid-cols-3 gap-2">
              {metricsForChannel(slide.channel).map(m => (
                <Choice key={m.id} on={shown.includes(m.id)} onClick={() => toggleMetric(m.id)}>{m.label}</Choice>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const tintBg = (hex: string) => `${hex}0d`   // ±5% warna utama

function Label({ children }: { children: React.ReactNode }) {
  return <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-2">{children}</p>
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={PJ}
      className={`py-2 px-2 rounded-lg border text-[12px] font-semibold transition-all truncate ${on ? 'border-[#2C3079] bg-[#F1F2FB] text-[#2C3079]' : 'border-[#e5e7eb] hover:bg-[#f9fafb] text-[#334155]'}`}>
      {children}
    </button>
  )
}

function Empty({ icon, text, spin }: { icon: string; text: string; spin?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center" style={{ color: '#94a3b8' }}>
      <span className={`material-symbols-outlined${spin ? ' animate-spin' : ''}`} style={{ fontSize: '2.6cqw' }}>{icon}</span>
      <p className="mt-[0.5cqh]" style={{ fontSize: '1.1cqw', ...PJ }}>{text}</p>
    </div>
  )
}
