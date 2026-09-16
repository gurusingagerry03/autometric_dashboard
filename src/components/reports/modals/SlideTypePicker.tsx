'use client'

import { useEffect, useState } from 'react'
import { SlideType } from '@/lib/reports/data/slideModel'
import { PLATFORM_META } from '@/components/dashboard/data'
import { useT } from '@/lib/i18n/LanguageContext'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

interface Item {
  id: SlideType | string
  name: string
  desc: string
  icon: string
  enabled: boolean
}

/** Pintu ke langkah ketiga, BUKAN sebuah SlideType. Memilihnya tidak membuat
 *  slide apa pun; yang akhirnya dikirim ke onSelect adalah 'dashboard_overview'
 *  atau 'kpi'. Id-nya sengaja tidak menyerupai SlideType mana pun supaya tidak
 *  pernah lolos ke slideModel kalau suatu saat alurnya berubah. */
const KPI_DASHBOARD = 'kpi_dashboard'

// Modeled on report_2's LAYOUT_TEMPLATES. Three are built; the rest are listed
// (matching the reference) but disabled until their layouts exist.
//
// Standard Dashboard tetap berdiri sendiri di sini — layoutnya (chart + insight +
// tabel) memang lain sendiri. Yang bercabang cuma entri di bawahnya: Dashboard
// Overview dan KPI Overview sama-sama memakai layout KPI, jadi keduanya masuk
// lewat satu pintu dan dipisah di langkah berikutnya.
const TEMPLATES: Item[] = [
  { id: 'section', name: 'Section Heading', desc: 'Centered section divider title', icon: 'title', enabled: true },
  { id: 'dashboard', name: 'Standard Dashboard', desc: 'Chart, Key Insights & Data Table', icon: 'dashboard', enabled: true },
  { id: KPI_DASHBOARD, name: 'KPI/Dashboard Overview', desc: 'Top metrics, KPI targets, or YTD', icon: 'leaderboard', enabled: true },
  { id: 'comparison', name: 'Comparison View', desc: 'Side-by-side Metric Analysis', icon: 'compare_arrows', enabled: true },
  { id: 'visual', name: 'Visual Analysis', desc: 'Media / Screenshot & Analysis', icon: 'image', enabled: true },
  { id: 'overview', name: 'Overview Slide', desc: 'Full Visualization & Notes', icon: 'view_quilt', enabled: true },
  { id: 'sentiment', name: 'Audience Sentiment', desc: 'Comments & tagged posts + word cloud', icon: 'sentiment_satisfied', enabled: true },
  { id: 'demographic', name: 'Audience Demographics', desc: 'Age & gender, month over month', icon: 'groups', enabled: true },
  { id: 'custom', name: 'Custom Template', desc: 'Configurable Grid (2×2, 3×3)', icon: 'grid_view', enabled: false },
]

/** Langkah ketiga: dua slide yang berbagi layout KPI tapi isinya berbeda —
 *  Dashboard Overview membandingkan metrik dengan periode sebelumnya, KPI
 *  Overview membandingkan capaian dengan target yang di-set di tab KPI brand.
 *
 *  Bentuknya sengaja Item yang sama dengan TEMPLATES supaya kartunya dirender
 *  markup yang sama persis — satu-satunya beda, memilih di sini menutup modal
 *  alih-alih membuka langkah berikutnya. */
const KPI_DASHBOARD_VARIANTS: Item[] = [
  { id: 'dashboard_overview', name: 'Dashboard Overview', desc: 'Dashboard metrics vs the previous period', icon: 'dashboard', enabled: true },
  { id: 'kpi', name: 'KPI Overview', desc: 'Brand KPI targets — achievement & run rate', icon: 'leaderboard', enabled: true },
  { id: 'ytd', name: 'YTD Performance', desc: 'Accumulated since the brand’s YTD start', icon: 'timeline', enabled: true },
]

// When "All Channels" is picked, only these layouts make sense.
//
// Sentiment and Demographics belong here as well, and for opposite reasons:
// sentiment counts ADD UP across platforms (they are comment counts), while
// demographics are per-platform shares that must never be blended — so the
// demographic slide answers 'all' by drawing one panel per platform instead.
const ALL_CHANNEL_TYPES = new Set<string>(['overview', 'comparison', 'sentiment', 'demographic'])

interface Channel {
  id: string
  name: string
  desc: string
  logo?: string
  icon?: string
}

const CHANNELS: Channel[] = [
  { id: 'instagram', name: 'Instagram', desc: 'Instagram performance', logo: PLATFORM_META.instagram.logo },
  { id: 'facebook', name: 'Facebook', desc: 'Facebook performance', logo: PLATFORM_META.facebook.logo },
  { id: 'tiktok', name: 'TikTok', desc: 'TikTok performance', logo: PLATFORM_META.tiktok.logo },
  { id: 'all', name: 'All Channels', desc: 'Overview & Comparison only', icon: 'hub' },
]

export default function SlideTypePicker({
  open, onClose, onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (type: SlideType, channel: string) => void
}) {
  const t = useT()
  const [channel, setChannel] = useState<string | null>(null)
  // Langkah ketiga (bentuk slide) hanya terbuka lewat entri gabungan.
  const [variantStep, setVariantStep] = useState(false)

  // Always start at the channel step when (re)opened.
  useEffect(() => { if (open) { setChannel(null); setVariantStep(false) } }, [open])

  if (!open) return null

  const templates = channel === 'all'
    ? TEMPLATES.filter(t => ALL_CHANNEL_TYPES.has(t.id as string))
    : TEMPLATES

  // Kartu yang ditampilkan langkah kedua/ketiga — markupnya satu, isinya yang bertukar.
  const items = variantStep ? KPI_DASHBOARD_VARIANTS : templates
  const pick = (tpl: Item) => {
    if (!tpl.enabled) return
    if (tpl.id === KPI_DASHBOARD) { setVariantStep(true); return }
    onSelect(tpl.id as SlideType, channel!)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-[760px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.30)] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f0f1f2]">
          {channel && (
            <button
              onClick={() => (variantStep ? setVariantStep(false) : setChannel(null))}
              title={variantStep ? t('Back to layouts') : t('Back to channels')}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          )}
          <div className="flex-1">
            <h2 style={PJ} className="text-[16px] font-bold text-[#0f172a]">
              {variantStep ? 'Choose a template' : channel ? 'Choose a slide layout' : 'Choose a channel'}
            </h2>
            <p className="text-[12px] text-[#94a3b8] mt-0.5">
              {variantStep
                ? 'Same layout, different content — pick which one this slide is.'
                : channel
                  ? channel === 'all'
                    ? 'All Channels supports Overview & Comparison layouts.'
                    : 'Pick a template — content fills with sample data you can edit.'
                  : 'Which channel is this slide about?'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#334155] hover:bg-[#f1f5f9] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Step 1 — channel */}
        {!channel && (
          <div className="p-6 grid grid-cols-2 gap-3">
            {CHANNELS.map(c => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className="group flex items-center gap-3.5 p-4 rounded-xl border border-[#e5e7eb] hover:border-[#2C3079] hover:bg-[#F1F2FB] hover:shadow-sm cursor-pointer text-left transition-all"
              >
                <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#f1f5f9] group-hover:bg-white transition-colors">
                  {c.logo ? (
                    <img src={c.logo} alt={c.name} className="w-6 h-6 object-contain" />
                  ) : (
                    <span className="material-symbols-outlined text-[22px] text-[#2C3079]">{c.icon}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p style={PJ} className="text-[13.5px] font-bold text-[#0f172a]">{c.name}</p>
                  <p className="text-[12px] text-[#94a3b8] mt-0.5 truncate">{c.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — layout, dan Step 3 — bentuk slide di balik entri gabungan */}
        {channel && (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map(tpl => (
              <button
                key={tpl.id}
                disabled={!tpl.enabled}
                onClick={() => pick(tpl)}
                className={`group flex items-center gap-3.5 p-4 rounded-xl border text-left transition-all ${
                  tpl.enabled
                    ? 'border-[#e5e7eb] hover:border-[#2C3079] hover:bg-[#F1F2FB] hover:shadow-sm cursor-pointer'
                    : 'border-[#eef0f2] bg-[#fafbfb] opacity-70 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    tpl.enabled ? 'bg-[#E6E7F3] text-[#2C3079] group-hover:bg-[#2C3079] group-hover:text-white' : 'bg-[#f1f3f5] text-[#cbd5e1]'
                  } transition-colors`}
                >
                  <span className="material-symbols-outlined text-[22px]">{tpl.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p style={PJ} className="text-[13.5px] font-bold text-[#0f172a]">{tpl.name}</p>
                    {!tpl.enabled && (
                      <span style={PJ} className="text-[9px] font-bold uppercase tracking-wide text-[#94a3b8] bg-[#eef0f2] px-1.5 py-0.5 rounded-full">{t('Soon')}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#94a3b8] mt-0.5 truncate">{tpl.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
