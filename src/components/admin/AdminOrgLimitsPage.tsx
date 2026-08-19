'use client'

import { useMemo, useState } from 'react'
import type { OrgLimitRow } from '@/lib/organizations/limits'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

interface Props {
  rows:     OrgLimitRow[]
  defaults: { maxBrands: number; maxCompetitorsPerPlatform: number }
  max:      number
}

type Draft = { brands: string; competitors: string }

function fmtUpdated(iso: string | null, by: string | null): string {
  if (!iso) return 'Belum pernah diubah'
  const when = new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  return by ? `Diubah ${when} oleh ${by}` : `Diubah ${when}`
}

/**
 * Satu angka batas beserta pemakaiannya.
 *
 * Pemakaian ditempel persis di sebelah kolom inputnya — bukan di kolom terpisah —
 * karena keputusan admin di sini selalu "cukup tidak angkanya untuk org ini", dan
 * itu tidak bisa dinilai tanpa melihat berapa yang sudah terpakai.
 */
function LimitField({
  label, hint, icon, usedLabel, usedValue, value, max, onChange, overNote,
}: {
  label: string; hint: string; icon: string
  usedLabel: string; usedValue: number
  value: string; max: number
  onChange: (v: string) => void
  overNote: string
}) {
  const parsed = Number(value)
  const over   = value !== '' && Number.isFinite(parsed) && usedValue > parsed

  return (
    <div className="flex-1 min-w-[220px]">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#94a3b8]" style={PJB}>
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {label}
      </p>
      <p className="text-[11.5px] text-[#94a3b8] mt-0.5 mb-1.5 leading-snug" style={PJB}>{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0} max={max} value={value}
          onChange={e => onChange(e.target.value)}
          style={PJB}
          className="w-20 h-9 px-3 rounded-xl border border-[#e2e8f0] bg-white text-[14px] font-bold text-[#0f172a] focus:outline-none focus:border-[#1B8A80]"
        />
        <span className={`text-[12px] ${over ? 'text-[#b45309] font-semibold' : 'text-[#94a3b8]'}`} style={PJB}>
          {usedLabel}
        </span>
      </div>
      {over && (
        <p className="text-[11.5px] text-[#b45309] mt-1.5 leading-snug" style={PJB}>{overNote}</p>
      )}
    </div>
  )
}

export default function AdminOrgLimitsPage({ rows: initialRows, defaults, max }: Props) {
  const [rows,   setRows]   = useState(initialRows)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy,   setBusy]   = useState<string | null>(null)
  const [saved,  setSaved]  = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [query,  setQuery]  = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))
  }, [rows, query])

  function draftOf(row: OrgLimitRow): Draft {
    return drafts[row.id] ?? {
      brands:      String(row.limits.maxBrands),
      competitors: String(row.limits.maxCompetitorsPerPlatform),
    }
  }

  function edit(row: OrgLimitRow, patch: Partial<Draft>) {
    setDrafts(d => ({ ...d, [row.id]: { ...draftOf(row), ...patch } }))
    setSaved(s => (s === row.id ? null : s))
  }

  function isDirty(row: OrgLimitRow): boolean {
    const d = draftOf(row)
    return d.brands      !== String(row.limits.maxBrands)
        || d.competitors !== String(row.limits.maxCompetitorsPerPlatform)
  }

  function flashSaved(orgId: string) {
    setSaved(orgId)
    setTimeout(() => setSaved(s => (s === orgId ? null : s)), 2500)
  }

  async function save(row: OrgLimitRow) {
    const d                         = draftOf(row)
    const maxBrands                 = Number(d.brands)
    const maxCompetitorsPerPlatform = Number(d.competitors)

    if (d.brands === '' || d.competitors === '' ||
        ![maxBrands, maxCompetitorsPerPlatform].every(n => Number.isInteger(n) && n >= 0 && n <= max)) {
      setErrors(e => ({ ...e, [row.id]: `Isi angka bulat 0-${max}.` }))
      return
    }

    setBusy(row.id); setErrors(e => ({ ...e, [row.id]: '' }))
    try {
      const res  = await fetch(`/api/admin/org-limits/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxBrands, maxCompetitorsPerPlatform }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrors(e => ({ ...e, [row.id]: body?.error ?? 'Gagal menyimpan.' }))
        return
      }
      setRows(rs => rs.map(r => r.id === row.id ? {
        ...r,
        limits:    { maxBrands, maxCompetitorsPerPlatform, isCustom: true },
        usage:     body?.usage ?? r.usage,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      } : r))
      setDrafts(prev => { const next = { ...prev }; delete next[row.id]; return next })
      flashSaved(row.id)
    } catch {
      setErrors(e => ({ ...e, [row.id]: 'Network error.' }))
    } finally {
      setBusy(null)
    }
  }

  async function reset(row: OrgLimitRow) {
    setBusy(row.id); setErrors(e => ({ ...e, [row.id]: '' }))
    try {
      const res = await fetch(`/api/admin/org-limits/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setErrors(e => ({ ...e, [row.id]: 'Gagal mengembalikan ke default.' }))
        return
      }
      setRows(rs => rs.map(r => r.id === row.id ? {
        ...r,
        limits:    { ...defaults, isCustom: false },
        updatedAt: null,
        updatedBy: null,
      } : r))
      setDrafts(prev => { const next = { ...prev }; delete next[row.id]; return next })
      flashSaved(row.id)
    } catch {
      setErrors(e => ({ ...e, [row.id]: 'Network error.' }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-[#0f172a] tracking-[-0.03em]" style={PJB}>Batas Organization</h1>
        <p className="text-[13.5px] text-[#94a3b8] mt-1" style={PJB}>
          Berapa brand yang boleh dipunyai tiap organization, dan berapa competitor yang boleh
          ditambahkan per platform.
        </p>
      </div>

      {/* Default app-wide */}
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl px-5 py-4 mb-4 flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[18px] text-[#94a3b8] mt-0.5">info</span>
        <p className="text-[12.5px] text-[#64748b] leading-relaxed" style={PJB}>
          Organization yang belum pernah diatur memakai default{' '}
          <span className="font-bold text-[#334155]">{defaults.maxBrands} brand</span> dan{' '}
          <span className="font-bold text-[#334155]">{defaults.maxCompetitorsPerPlatform} competitor per platform</span>.
          Competitor dihitung terpisah tiap platform: nilai {defaults.maxCompetitorsPerPlatform} berarti tiap
          brand boleh punya {defaults.maxCompetitorsPerPlatform} competitor Instagram,{' '}
          {defaults.maxCompetitorsPerPlatform} TikTok, dan {defaults.maxCompetitorsPerPlatform} Facebook.
        </p>
      </div>

      {/* Cari */}
      <div className="relative mb-4">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94a3b8]">search</span>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Cari organization..." style={PJB}
          className="w-full h-11 pl-11 pr-4 rounded-2xl border border-[#e2e8f0] bg-white text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1B8A80]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#e2e8f0] rounded-2xl px-5 py-12 text-center">
          <span className="material-symbols-outlined text-[32px] text-[#e2e8f0]">domain_disabled</span>
          <p className="text-[13.5px] text-[#94a3b8] mt-2" style={PJB}>
            {rows.length === 0 ? 'Belum ada organization.' : 'Tidak ada yang cocok.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const d       = draftOf(row)
            const dirty   = isDirty(row)
            const working = busy === row.id
            const err     = errors[row.id]

            return (
              <div key={row.id} className="bg-white border border-[#e2e8f0] rounded-2xl px-5 py-4">
                {/* Identitas org */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14.5px] font-bold text-[#0f172a] truncate" style={PJB}>{row.name}</p>
                      {row.limits.isCustom ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#f0f7f5] text-[#1B8A80]" style={PJB}>
                          Custom
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#94a3b8]" style={PJB}>
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#94a3b8] mt-0.5" style={PJB}>
                      /{row.slug} · {row.memberCount} member · {row.usage.competitorsTotal} competitor total
                      {row.limits.isCustom ? ` · ${fmtUpdated(row.updatedAt, row.updatedBy)}` : ''}
                    </p>
                  </div>
                  {saved === row.id && (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-[#166534] flex-shrink-0" style={PJB}>
                      <span className="material-symbols-outlined text-[15px]">check_circle</span> Tersimpan
                    </span>
                  )}
                </div>

                {/* Batas */}
                <div className="flex flex-wrap items-start gap-5">
                  <LimitField
                    label="Brand" icon="storefront" max={max}
                    hint="Jumlah brand yang boleh dibuat organization ini"
                    usedLabel={`${row.usage.brands} terpakai`}
                    usedValue={row.usage.brands}
                    value={d.brands}
                    onChange={v => edit(row, { brands: v })}
                    overNote="Di bawah jumlah brand sekarang. Yang sudah ada tetap jalan, tapi org ini tidak bisa menambah brand lagi."
                  />
                  <LimitField
                    label="Competitor per platform" icon="flag" max={max}
                    hint="Per brand, dihitung terpisah tiap platform (IG / TikTok / Facebook)"
                    usedLabel={
                      row.usage.competitorsPeak > 0
                        ? `terpadat ${row.usage.competitorsPeak} di satu platform`
                        : 'belum ada competitor'
                    }
                    usedValue={row.usage.competitorsPeak}
                    value={d.competitors}
                    onChange={v => edit(row, { competitors: v })}
                    overNote="Ada brand yang sudah melewati angka ini. Competitor lamanya tetap terlacak, tapi tidak bisa ditambah lagi di platform itu."
                  />

                  <div className="flex items-center gap-2 ml-auto pt-[46px]">
                    {row.limits.isCustom && !dirty && (
                      <button onClick={() => reset(row)} disabled={working} style={PJB}
                        className="h-9 px-3.5 rounded-xl border border-[#e2e8f0] text-[12.5px] font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors disabled:opacity-50">
                        Kembalikan default
                      </button>
                    )}
                    <button onClick={() => save(row)} disabled={!dirty || working} style={PJB}
                      className="h-9 px-4 rounded-xl bg-[#0f172a] text-white text-[12.5px] font-semibold hover:bg-[#1e293b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                      {working && <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>}
                      {working ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </div>

                {err && <p className="text-[12.5px] text-[#ef4444] mt-3" style={PJB}>{err}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
