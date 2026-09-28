'use client'

import { useMemo, useState } from 'react'
import type { AdminReportRow } from '@/lib/admin/reports'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

function fmtSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}

export default function AdminReportsPage({ rows }: { rows: AdminReportRow[] }) {
  const [query, setQuery] = useState('')
  const [orgId, setOrgId] = useState('')

  const orgs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) seen.set(r.org.id, r.org.name)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (orgId && r.org.id !== orgId) return false
      if (!q) return true
      return [r.name, r.title, r.brandName, r.period, r.org.name, r.createdBy?.name, r.createdBy?.email]
        .some(v => v?.toLowerCase().includes(q))
    })
  }, [rows, query, orgId])

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-[#0f172a] tracking-[-0.03em]" style={PJB}>Reports</h1>
        <p className="text-[13.5px] text-[#94a3b8] mt-1" style={PJB}>
          Semua report yang sudah di-generate, dari semua organization · {rows.length} total
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94a3b8]">search</span>
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Cari report, brand, periode, pembuat..." style={PJB}
            className="w-full h-11 pl-11 pr-4 rounded-2xl border border-[#e2e8f0] bg-white text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1B8A80]"
          />
        </div>
        <select
          value={orgId} onChange={e => setOrgId(e.target.value)} style={PJB}
          className="h-11 px-4 rounded-2xl border border-[#e2e8f0] bg-white text-[13.5px] text-[#334155] focus:outline-none focus:border-[#1B8A80]"
        >
          <option value="">Semua organization</option>
          {orgs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#e2e8f0] rounded-2xl px-5 py-12 text-center">
          <span className="material-symbols-outlined text-[32px] text-[#e2e8f0]">description</span>
          <p className="text-[13.5px] text-[#94a3b8] mt-2" style={PJB}>
            {rows.length === 0 ? 'Belum ada report yang di-generate.' : 'Tidak ada yang cocok.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-x-auto">
          <table className="w-full text-left" style={PJB}>
            <thead>
              <tr className="border-b border-[#f1f5f9] text-[10.5px] font-bold uppercase tracking-wider text-[#94a3b8]">
                <th className="px-5 py-3">Report</th>
                <th className="px-3 py-3">Organization</th>
                <th className="px-3 py-3">Periode</th>
                <th className="px-3 py-3">Dibuat oleh</th>
                <th className="px-3 py-3">Waktu export</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {r.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.coverImageUrl} alt="" className="w-16 h-9 rounded-md object-cover border border-[#e2e8f0] flex-shrink-0" />
                      ) : (
                        <div className="w-16 h-9 rounded-md bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-[#cbd5e1]">slideshow</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-bold text-[#0f172a] truncate max-w-[280px]" title={r.title}>{r.title}</p>
                        <p className="text-[11.5px] text-[#94a3b8] truncate max-w-[280px]">
                          {r.brandName ?? '—'} · {r.slideCount} slide · {fmtSize(r.sizeKb)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-semibold text-[#334155]">{r.org.name}</p>
                    <p className="text-[11.5px] text-[#94a3b8]">/{r.org.slug}</p>
                  </td>
                  <td className="px-3 py-3 text-[13px] text-[#334155] whitespace-nowrap">{r.period ?? '—'}</td>
                  <td className="px-3 py-3">
                    {r.createdBy ? (
                      <>
                        <p className="text-[13px] text-[#334155]">{r.createdBy.name}</p>
                        <p className="text-[11.5px] text-[#94a3b8]">{r.createdBy.email}</p>
                      </>
                    ) : <span className="text-[12.5px] text-[#94a3b8]">User dihapus</span>}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] text-[#64748b] whitespace-nowrap">{fmtDate(r.exportedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={`/api/admin/reports/${r.id}/download`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[#e2e8f0] text-[12px] font-semibold text-[#334155] hover:bg-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-[15px]">download</span>
                      PPTX
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
