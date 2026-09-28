'use client'

import { useMemo, useState } from 'react'
import type { TiktokBusinessAccountRow, TiktokRefreshResult } from '@/lib/admin/tiktok-refresh'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

function fmtExpiry(iso: string | null): { label: string; tone: 'ok' | 'warn' | 'bad' | 'none' } {
  if (!iso) return { label: 'Tidak diketahui', tone: 'none' }
  const ms    = new Date(iso).getTime() - Date.now()
  const when  = new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
  if (ms < 0)                return { label: `Kedaluwarsa ${when}`, tone: 'bad' }
  if (ms < 2 * 3600_000)     return { label: `Berlaku s/d ${when}`, tone: 'warn' }
  return { label: `Berlaku s/d ${when}`, tone: 'ok' }
}

const TONE: Record<string, string> = {
  ok: 'text-[#166534]', warn: 'text-[#b45309]', bad: 'text-[#991b1b]', none: 'text-[#94a3b8]',
}

export default function AdminTiktokRefreshPage({ rows: initialRows }: { rows: TiktokBusinessAccountRow[] }) {
  const [rows,     setRows]     = useState(initialRows)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query,    setQuery]    = useState('')
  const [running,  setRunning]  = useState(false)
  const [results,  setResults]  = useState<Record<string, TiktokRefreshResult>>({})
  const [error,    setError]    = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.username.toLowerCase().includes(q) ||
      r.brands.some(b => b.name.toLowerCase().includes(q) || b.orgName.toLowerCase().includes(q)))
  }, [rows, query])

  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.has(r.socialAccountId))

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected(s => {
      const next = new Set(s)
      for (const r of filtered) {
        if (allVisibleSelected) next.delete(r.socialAccountId); else next.add(r.socialAccountId)
      }
      return next
    })
  }

  async function refresh() {
    setRunning(true); setError(null); setResults({})
    try {
      const res  = await fetch('/api/admin/tiktok-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialAccountIds: [...selected] }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body?.error ?? 'Gagal menjalankan refresh.'); return }

      const byId: Record<string, TiktokRefreshResult> = {}
      for (const r of body.results as TiktokRefreshResult[]) byId[r.socialAccountId] = r
      setResults(byId)
      // Refresh yang berhasil juga menyambungkan ulang akun (connected = true).
      setRows(rs => rs.map(r => byId[r.socialAccountId]?.ok
        ? { ...r, connected: true, tokenExpiresAt: byId[r.socialAccountId].tokenExpiresAt ?? r.tokenExpiresAt }
        : r))
      setSelected(new Set(Object.values(byId).filter(r => !r.ok).map(r => r.socialAccountId)))
    } catch {
      setError('Network error.')
    } finally {
      setRunning(false)
    }
  }

  const doneCount   = Object.values(results).filter(r => r.ok).length
  const failedCount = Object.values(results).length - doneCount

  return (
    <div style={{ maxWidth: 960 }}>
      <div className="mb-6">
        <h1 className="text-[28px] font-bold text-[#0f172a] tracking-[-0.03em]" style={PJB}>Refresh TikTok</h1>
        <p className="text-[13.5px] text-[#94a3b8] mt-1" style={PJB}>
          Pilih akun TikTok Business lalu jalankan refresh token secara manual.
        </p>
      </div>

      <div className="bg-[#fffbeb] border border-[#fde68a] rounded-2xl px-5 py-4 mb-4 flex items-start gap-2.5">
        <span className="material-symbols-outlined text-[18px] text-[#b45309] mt-0.5">warning</span>
        <p className="text-[12.5px] text-[#92400e] leading-relaxed" style={PJB}>
          TikTok merotasi refresh token setiap kali dipakai. Hindari menjalankan ini bersamaan dengan
          scheduler (termasuk instance lain yang memakai database yang sama), karena dua refresh yang
          berebut bisa membuat akun harus di-connect ulang.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94a3b8]">search</span>
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Cari username, brand, organization..." style={PJB}
            className="w-full h-11 pl-11 pr-4 rounded-2xl border border-[#e2e8f0] bg-white text-[13.5px] text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#1B8A80]"
          />
        </div>
        <button onClick={refresh} disabled={selected.size === 0 || running} style={PJB}
          className="h-11 px-5 rounded-2xl bg-[#0f172a] text-white text-[13px] font-semibold hover:bg-[#1e293b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
          <span className={`material-symbols-outlined text-[16px] ${running ? 'animate-spin' : ''}`}>
            {running ? 'progress_activity' : 'refresh'}
          </span>
          {running ? 'Me-refresh...' : `Refresh ${selected.size} akun`}
        </button>
      </div>

      {error && <p className="text-[12.5px] text-[#ef4444] mb-3" style={PJB}>{error}</p>}
      {Object.keys(results).length > 0 && (
        <p className="text-[12.5px] mb-3" style={PJB}>
          <span className="text-[#166534] font-semibold">{doneCount} berhasil</span>
          {failedCount > 0 && <span className="text-[#991b1b] font-semibold"> · {failedCount} gagal (tetap tercentang)</span>}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#e2e8f0] rounded-2xl px-5 py-12 text-center">
          <span className="material-symbols-outlined text-[32px] text-[#e2e8f0]">person_off</span>
          <p className="text-[13.5px] text-[#94a3b8] mt-2" style={PJB}>
            {rows.length === 0 ? 'Belum ada akun TikTok Business.' : 'Tidak ada yang cocok.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-2xl overflow-x-auto">
          <table className="w-full text-left" style={PJB}>
            <thead>
              <tr className="border-b border-[#f1f5f9] text-[10.5px] font-bold uppercase tracking-wider text-[#94a3b8]">
                <th className="pl-5 pr-2 py-3 w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                    className="w-4 h-4 accent-[#1B8A80] cursor-pointer" />
                </th>
                <th className="px-3 py-3">Akun</th>
                <th className="px-3 py-3">Brand / Organization</th>
                <th className="px-3 py-3">Token</th>
                <th className="px-5 py-3">Hasil</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const exp = fmtExpiry(r.tokenExpiresAt)
                const res = results[r.socialAccountId]
                return (
                  <tr key={r.socialAccountId}
                    onClick={() => toggle(r.socialAccountId)}
                    className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc] cursor-pointer">
                    <td className="pl-5 pr-2 py-3">
                      <input type="checkbox" checked={selected.has(r.socialAccountId)} readOnly
                        className="w-4 h-4 accent-[#1B8A80] pointer-events-none" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[13.5px] font-bold text-[#0f172a]">@{r.username}</p>
                        {r.connected ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534]">Connected</span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#991b1b]">Terputus</span>
                        )}
                      </div>
                      {!r.hasRefreshToken && (
                        <p className="text-[11.5px] text-[#991b1b] mt-0.5">Tidak ada refresh token</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.brands.length === 0
                        ? <span className="text-[12.5px] text-[#94a3b8]">Tidak terhubung ke brand</span>
                        : r.brands.map((b, i) => (
                          <p key={i} className="text-[12.5px] text-[#334155]">
                            {b.name} <span className="text-[#94a3b8]">· {b.orgName}</span>
                          </p>
                        ))}
                    </td>
                    <td className={`px-3 py-3 text-[12.5px] whitespace-nowrap ${TONE[exp.tone]}`}>{exp.label}</td>
                    <td className="px-5 py-3 text-[12px] max-w-[260px]">
                      {res?.ok && (
                        <span className="flex items-center gap-1 text-[#166534] font-semibold">
                          <span className="material-symbols-outlined text-[15px]">check_circle</span> Berhasil
                        </span>
                      )}
                      {res && !res.ok && (
                        <span className="text-[#991b1b] break-words line-clamp-3" title={res.error}>{res.error}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
