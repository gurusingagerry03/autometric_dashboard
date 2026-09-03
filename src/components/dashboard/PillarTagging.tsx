'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from './ui'
import { PILLAR_COLORS } from './data'
import { useT } from '@/lib/i18n/LanguageContext'
import type { TaggedPost, TagPillar, TagSource, TagFilter } from '@/lib/dashboard/pillarTags'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const
const PAGE_SIZE = 25

/**
 * Penandaan pilar per-post — permukaan kerja untuk tab Content Pillars.
 *
 * KENAPA ADA
 *   Pilar hanya bisa masuk lewat upload CSV, dan tidak ada cara menandai post
 *   satu per satu. Di warehouse per 3 Sep 2026: 641 dari 846 post tanpa pilar.
 *
 * TIDAK ADA PENANDAAN OTOMATIS — SUDAH DIPERIKSA
 *   dim_content_pillar.hashtags tersimpan tapi tidak dibaca prosedur mana pun.
 *   Jadi chip di bawah tidak membedakan aturan vs manual; yang dibedakan adalah
 *   asal yang benar-benar ada: impor CSV vs ditandai di sini.
 *
 * DAFTAR PILAR DATANG DARI ENDPOINT, BUKAN DARI KARTU DI ATAS
 *   Kartu "Tentukan Pilar" hanya menampilkan pilar aktif. Untuk menandai, daftar
 *   itu menyesatkan — MineralQUA punya 10 pilar dengan 2 aktif padahal 5 yang
 *   nonaktif masih menempel di 203 post, dan Fitbar punya 3 pilar dengan 0 aktif
 *   sehingga layar ini tampak kosong. Endpoint mengembalikan seluruh pilar brand;
 *   yang nonaktif tetap bisa dipilih tapi diberi penanda.
 *
 * PENYARING, PENCARIAN, DAN HALAMAN DIPROSES DI SERVER
 *   Menyaring di klien setelah pagination berarti orang mencari di dalam satu
 *   halaman saja lalu mengira hasilnya nihil. Semua ikut ke query.
 *
 * PENYIMPANAN OPTIMISTIS
 *   Tampilan berubah lebih dulu, request menyusul. Kalau gagal, keadaan
 *   dikembalikan persis semula dan pesannya muncul — bukan dibiarkan tampak
 *   tersimpan padahal tidak.
 */

const PLATFORM_ICON: Record<string, string> = {
  instagram: 'photo_camera',
  facebook:  'thumb_up',
  tiktok:    'music_note',
}

type Row = TaggedPost & { key: string }
const keyOf = (p: { platform: string; postId: string }) => `${p.platform}:${p.postId}`

type Payload = {
  posts: TaggedPost[]; pillars: TagPillar[]
  total: number; untagged: number; matched: number
}

export default function PillarTagging({ orgId, brandId, onCreatePillar }: {
  orgId: string
  brandId: string
  /** Membuat pilar baru lewat endpoint yang sama dengan kartu "Tentukan Pilar". */
  onCreatePillar?: (name: string, color: string) => Promise<boolean>
}) {
  const t = useT()
  const [data, setData]         = useState<Payload | null>(null)
  const [rows, setRows]         = useState<Row[] | null>(null)
  const [loadError, setLoadErr] = useState<string | null>(null)
  const [saveError, setSaveErr] = useState<string | null>(null)

  const [page, setPage]     = useState(0)
  const [filter, setFilter] = useState<TagFilter>('all')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery]   = useState('')
  const [nonce, setNonce]   = useState(0)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk]         = useState<Set<string>>(new Set())
  const [openRow, setOpenRow]   = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [broken, setBroken]     = useState<Set<string>>(new Set())
  const [busy, setBusy]         = useState(false)

  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [newName, setNewName]         = useState('')
  const [newColor, setNewColor]       = useState(PILLAR_COLORS[0])
  const [saving, setSaving]           = useState(false)

  // Pencarian caption: tunggu ketikan berhenti supaya tidak satu request per huruf.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setQuery(queryInput); setPage(0) }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [queryInput])

  useEffect(() => { setPage(0) }, [filter, brandId])

  useEffect(() => {
    let cancelled = false
    setRows(null); setLoadErr(null); setSelected(new Set())
    const sp = new URLSearchParams({
      brand: brandId, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), filter,
    })
    if (query) sp.set('q', query)
    fetch(`/api/organizations/${orgId}/dashboard/pillars/tags?${sp}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Payload) => {
        if (cancelled) return
        setData(d)
        setRows(d.posts.map(p => ({ ...p, key: keyOf(p) })))
      })
      .catch(e => { if (!cancelled) setLoadErr(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, page, filter, query, nonce])

  const pillars = data?.pillars ?? []
  const byName  = useMemo(() => new Map(pillars.map(p => [p.name, p])), [pillars])
  const total   = data?.total ?? 0
  const matched = data?.matched ?? 0
  const taggedPct = total ? Math.round(((total - (data?.untagged ?? 0)) / total) * 100) : 0
  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE))

  const toggleSelect = (k: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const allVisibleSelected = !!rows && rows.length > 0 && rows.every(r => selected.has(r.key))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set((rows ?? []).map(r => r.key)))

  /** Terapkan optimistis, kirim, kembalikan kalau gagal. */
  async function persist(next: Row[], changed: Row[]) {
    const before = rows
    setRows(next); setSaveErr(null); setBusy(true)
    try {
      const r = await fetch(`/api/organizations/${orgId}/dashboard/pillars/tags`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          updates: changed.map(c => ({ postId: c.postId, platform: c.platform, pillars: c.pillars })),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const done: { applied: number; requested: number } = await r.json()
      if (done.applied < done.requested) throw new Error(`${done.applied}/${done.requested}`)
      // Hitung ulang dari server: progres dan jumlah halaman ikut berubah kalau
      // penyaringnya "belum ditandai".
      setNonce(n => n + 1)
    } catch (e) {
      setRows(before)
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
    }
  }
  useEffect(() => { setBusy(false) }, [data])

  const applyBulk = (mode: 'add' | 'remove') => {
    if (bulk.size === 0 || selected.size === 0 || !rows || busy) return
    const changed: Row[] = []
    const next = rows.map(r => {
      if (!selected.has(r.key)) return r
      const set = new Set(r.pillars)
      for (const name of bulk) mode === 'add' ? set.add(name) : set.delete(name)
      const updated: Row = { ...r, pillars: [...set], source: 'manual' as TagSource }
      changed.push(updated)
      return updated
    })
    setSelected(new Set()); setBulk(new Set()); setBulkOpen(false)
    persist(next, changed)
  }

  const toggleRowTag = (key: string, name: string) => {
    if (!rows || busy) return
    let changed: Row | null = null
    const next = rows.map(r => {
      if (r.key !== key) return r
      const set = new Set(r.pillars)
      set.has(name) ? set.delete(name) : set.add(name)
      changed = { ...r, pillars: [...set], source: 'manual' as TagSource }
      return changed
    })
    if (changed) persist(next, [changed])
  }

  const openCreate = (where: string) => {
    setCreatingFor(where); setNewName('')
    setNewColor(PILLAR_COLORS[pillars.length % PILLAR_COLORS.length])
  }

  async function saveNewPillar() {
    const name = newName.trim()
    if (!name || saving || !onCreatePillar) return
    setSaving(true)
    try {
      if (await onCreatePillar(name, newColor)) {
        setCreatingFor(null); setNewName(''); setOpenRow(null)
        setNonce(n => n + 1)   // pilar baru harus muncul di daftar ini juga
      }
    } finally { setSaving(false) }
  }

  const createForm = (
    <div className="p-2.5">
      <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveNewPillar() } }}
        placeholder={t('New pillar name')} style={PJ}
        className="w-full text-[12.5px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-2 outline-none focus:border-[#6c4cd6]" />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {PILLAR_COLORS.map(c => (
          <button key={c} onClick={() => setNewColor(c)} title={c}
            className={`w-5 h-5 rounded-md ${newColor === c ? 'ring-2 ring-offset-1 ring-[#6c4cd6]' : ''}`}
            style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2.5">
        <button onClick={saveNewPillar} disabled={!newName.trim() || saving} style={PJ}
          className={`flex-1 text-[12px] font-bold rounded-lg px-3 py-1.5 ${
            !newName.trim() || saving ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
          }`}>{saving ? t('Saving…') : t('Create pillar')}</button>
        <button onClick={() => setCreatingFor(null)} style={PJ}
          className="text-[12px] font-semibold text-[#9ca3af] hover:text-[#6b7280] px-2">{t('Cancel')}</button>
      </div>
    </div>
  )

  /** Daftar pilar yang bisa dicari — dipakai di menu baris maupun di bilah massal. */
  function PillarPicker({ isOn, onPick, onCreateHere }: {
    isOn: (name: string) => boolean
    onPick: (name: string) => void
    onCreateHere?: () => void
  }) {
    const [find, setFind] = useState('')
    const shown = pillars.filter(p => p.name.toLowerCase().includes(find.trim().toLowerCase()))
    return (
      <>
        {pillars.length > 6 && (
          <div className="px-2 pb-1.5">
            <input value={find} onChange={e => setFind(e.target.value)} autoFocus
              placeholder={t('Search pillar')} style={PJ}
              className="w-full text-[12px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#6c4cd6]" />
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {shown.length === 0 && <p className="px-3 py-2 text-[12px] text-[#9ca3af]">{t('No pillar found')}</p>}
          {shown.map(p => (
            <button key={p.id} onClick={() => onPick(p.name)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f8f9fa]">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
              <span className={`flex-1 text-[12.5px] truncate ${p.isActive ? 'text-[#374151]' : 'text-[#9ca3af]'}`}>{p.name}</span>
              {!p.isActive && <span className="text-[10px] text-[#cbd1d8] flex-shrink-0">{t('inactive')}</span>}
              {isOn(p.name) && <span className="material-symbols-outlined text-[15px] text-[#6c4cd6]">check</span>}
            </button>
          ))}
        </div>
        {onCreateHere && (
          <>
            <div className="h-px bg-[#f1f3f5] my-1.5" />
            <button onClick={onCreateHere} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f8f9fa]">
              <span className="material-symbols-outlined text-[15px] text-[#6c4cd6]">add</span>
              <span className="text-[12.5px] font-semibold text-[#6c4cd6]">{t('New pillar')}</span>
            </button>
          </>
        )}
      </>
    )
  }

  if (data && pillars.length === 0) {
    return (
      <Card area={null}>
        <div className="flex flex-col items-center justify-center text-center px-6 py-12">
          <span className="material-symbols-outlined text-[36px] text-[#cbd1d8] mb-2.5">sell</span>
          <p style={PJ} className="text-[14px] font-bold text-[#9ca3af]">{t('Define a pillar first')}</p>
          <p className="text-[12.5px] text-[#9ca3af] mt-1 mb-3 max-w-[340px]">
            {t('Tagging needs at least one pillar to assign posts to. Create one here, or use the card above.')}
          </p>
          {creatingFor === 'empty'
            ? <div className="w-[260px] border border-[#e5e7eb] rounded-xl">{createForm}</div>
            : (
              <button onClick={() => openCreate('empty')} style={PJ}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white bg-[#6c4cd6] hover:bg-[#5a3fc0] rounded-lg px-4 py-2">
                <span className="material-symbols-outlined text-[16px]">add</span>{t('New pillar')}
              </button>
            )}
        </div>
      </Card>
    )
  }

  return (
    <Card area={null} className="flex flex-col">
      <div className="px-5 pt-4 pb-3 border-b border-[#f1f3f5]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">{t('Tag Posts to Pillars')}</h3>
            <p className="text-[12.5px] text-[#9ca3af] mt-1 leading-relaxed max-w-[560px]">
              {t('Assign posts to pillars by hand. One post can belong to several pillars, and tagging here overrides whatever was imported earlier.')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p style={PJ} className="text-[19px] font-bold text-[#111827] tabular-nums leading-none">{taggedPct}%</p>
            <p className="text-[11px] text-[#9ca3af] mt-1">{t('{done} of {total} tagged', { done: total - (data?.untagged ?? 0), total })}</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[#f1f3f5] overflow-hidden">
          <div className="h-full rounded-full bg-[#6c4cd6] transition-all" style={{ width: `${taggedPct}%` }} />
        </div>
      </div>

      <div className="px-5 py-3 flex flex-wrap items-center gap-2.5 border-b border-[#f1f3f5]">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#cbd1d8]">search</span>
          <input value={queryInput} onChange={e => setQueryInput(e.target.value)} placeholder={t('Search caption')} style={PJ}
            className="w-full text-[12.5px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#6c4cd6]" />
        </div>
        <div className="flex items-center gap-1">
          {([
            ['all',      t('All')],
            ['untagged', t('Untagged')],
            ['imported', t('Imported')],
            ['manual',   t('Tagged here')],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key as TagFilter)} style={PJ}
              className={`text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border ${
                filter === key
                  ? 'bg-[#f3f0fd] border-[#6c4cd6]/40 text-[#6c4cd6]'
                  : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
              }`}>
              {label}
              {key === 'untagged' && (data?.untagged ?? 0) > 0 && (
                <span className="ml-1.5 text-[10.5px] tabular-nums text-[#9ca3af]">{data?.untagged}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-2.5 flex items-center gap-4 text-[11px] text-[#9ca3af]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-6 h-0 border-t border-dashed border-[#9ca3af]" />{t('imported')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-6 h-0 border-t border-solid border-[#6b7280]" />{t('tagged here')}
        </span>
        {saveError && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#c2553f]">
            <span className="material-symbols-outlined text-[13px]">error</span>
            {t('Could not save — the change was undone.')}
          </span>
        )}
      </div>

      <div className="px-5 py-3 flex flex-col gap-1.5">
        {loadError && <p className="text-center text-[12.5px] text-[#c2553f] py-8">{t('Failed to load data: {error}', { error: loadError })}</p>}
        {!rows && !loadError && (
          <div className="flex flex-col items-center py-10">
            <span className="material-symbols-outlined text-[28px] text-[#cbd1d8] animate-spin mb-2">progress_activity</span>
            <p className="text-[12.5px] text-[#9ca3af]">{t('Loading data…')}</p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <label className="flex items-center gap-2.5 px-1 pb-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-[#d1d5db] accent-[#6c4cd6] cursor-pointer" />
            <span className="text-[11.5px] text-[#9ca3af]">
              {t('Showing {from}–{to} of {matched}', {
                from: page * PAGE_SIZE + 1, to: page * PAGE_SIZE + rows.length, matched,
              })}
            </span>
          </label>
        )}

        {rows && rows.length === 0 && (
          <p className="text-center text-[12.5px] text-[#9ca3af] py-8">{t('No posts match this filter')}</p>
        )}

        {(rows ?? []).map(post => {
          const isSelected = selected.has(post.key)
          const imageFailed = broken.has(post.key)
          return (
            <div key={post.key}
              className={`flex items-center gap-3.5 rounded-lg border px-3 py-3 ${
                isSelected ? 'border-[#6c4cd6]/40 bg-[#faf9fe]' : 'border-[#eef0f2] bg-white'
              }`}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(post.key)}
                className="w-3.5 h-3.5 rounded border-[#d1d5db] accent-[#6c4cd6] cursor-pointer flex-shrink-0" />

              {/* Gambar sekaligus tautan ke post aslinya — sasaran klik terbesar di
                  baris ini. URL CDN bisa kedaluwarsa; kalau gagal dimuat, kotaknya
                  TETAP tautan, hanya isinya jatuh ke ikon platform. */}
              <a href={post.link || undefined} target="_blank" rel="noopener noreferrer" title={t('Open post')}
                className="group relative w-24 h-24 rounded-lg bg-[#f1f3f5] overflow-hidden flex items-center justify-center flex-shrink-0">
                {post.coverImage && !imageFailed
                  ? <img src={post.coverImage} alt="" loading="lazy" className="w-full h-full object-cover"
                      onError={() => setBroken(prev => new Set(prev).add(post.key))} />
                  : <span className="material-symbols-outlined text-[26px] text-[#9ca3af]">{PLATFORM_ICON[post.platform] ?? 'article'}</span>}
                {post.link && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors">
                    <span className="material-symbols-outlined text-[20px] text-white opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
                  </span>
                )}
              </a>

              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-[#374151] line-clamp-3 leading-snug">
                  {post.caption || <span className="text-[#cbd1d8]">{t('No caption')}</span>}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="material-symbols-outlined text-[13px] text-[#cbd1d8]">{PLATFORM_ICON[post.platform] ?? 'article'}</span>
                  {post.postedAt && (
                    <span className="text-[11px] text-[#9ca3af] tabular-nums">
                      {new Date(post.postedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  <span className="text-[11px] text-[#cbd1d8]">·</span>
                  <span className="text-[11px] text-[#9ca3af] tabular-nums">{t('Reach')} {post.reach.toLocaleString('id-ID')}</span>
                  <span className="text-[11px] text-[#cbd1d8]">·</span>
                  <span className="text-[11px] text-[#9ca3af] tabular-nums">ER {post.er.toFixed(1)}%</span>
                  {post.link && (
                    <a href={post.link} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#6c4cd6] hover:underline">
                      {t('Open post')}<span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  )}

                  {post.pillars.map(name => {
                    const color = byName.get(name)?.color ?? '#9ca3af'
                    return (
                      <span key={name} title={post.source === 'imported' ? t('imported') : t('tagged here')}
                        className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-0.5 ${
                          post.source === 'imported' ? 'border border-dashed' : 'border border-solid'
                        }`}
                        style={{ borderColor: color, color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        {name}
                      </span>
                    )
                  })}
                </div>
              </div>

              <div className="relative flex-shrink-0">
                <button onClick={() => { setOpenRow(openRow === post.key ? null : post.key); setCreatingFor(null) }}
                  title={t('Add pillar')} disabled={busy}
                  className="material-symbols-outlined text-[18px] text-[#cbd1d8] hover:text-[#6c4cd6] disabled:opacity-40">add_circle</button>
                {openRow === post.key && (
                  <>
                    <button className="fixed inset-0 z-10 cursor-default" onClick={() => { setOpenRow(null); setCreatingFor(null) }} aria-label={t('Close')} />
                    <div className="absolute right-0 top-6 z-20 w-60 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1.5">
                      {creatingFor === post.key ? createForm : (
                        <PillarPicker
                          isOn={n => post.pillars.includes(n)}
                          onPick={n => toggleRowTag(post.key, n)}
                          onCreateHere={onCreatePillar ? () => openCreate(post.key) : undefined}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* ── pagination ───────────────────────────────────────────────── */}
        {rows && matched > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 pt-2.5 mt-1 border-t border-[#f1f3f5]">
            <span className="text-[11.5px] text-[#9ca3af] tabular-nums">
              {t('Page {page} of {pages}', { page: page + 1, pages: pageCount })}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={PJ}
                className={`inline-flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border ${
                  page === 0 ? 'border-[#f1f3f5] text-[#cbd1d8] cursor-not-allowed' : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
                }`}>
                <span className="material-symbols-outlined text-[15px]">chevron_left</span>{t('Previous')}
              </button>
              <button onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} style={PJ}
                className={`inline-flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border ${
                  page >= pageCount - 1 ? 'border-[#f1f3f5] text-[#cbd1d8] cursor-not-allowed' : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
                }`}>
                {t('Next')}<span className="material-symbols-outlined text-[15px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-0 mt-auto border-t border-[#eef0f2] bg-white/95 backdrop-blur px-5 py-3 rounded-b-xl">
          {creatingFor === 'bulk' && <div className="mb-2.5 w-[260px] border border-[#e5e7eb] rounded-xl">{createForm}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <span style={PJ} className="text-[12.5px] font-bold text-[#111827] tabular-nums">
              {t('{count} selected', { count: selected.size })}
            </span>

            <div className="relative flex-1 min-w-[180px]">
              <button onClick={() => { setBulkOpen(v => !v); setCreatingFor(null) }} style={PJ}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-1.5 border border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db] bg-white">
                <span className="material-symbols-outlined text-[15px]">sell</span>
                {bulk.size === 0 ? t('Choose pillars') : t('{count} pillars chosen', { count: bulk.size })}
                <span className="material-symbols-outlined text-[15px]">expand_more</span>
              </button>
              {bulkOpen && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" onClick={() => setBulkOpen(false)} aria-label={t('Close')} />
                  <div className="absolute left-0 bottom-9 z-20 w-60 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1.5">
                    <PillarPicker
                      isOn={n => bulk.has(n)}
                      onPick={n => setBulk(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })}
                      onCreateHere={onCreatePillar ? () => { setBulkOpen(false); openCreate('bulk') } : undefined}
                    />
                  </div>
                </>
              )}
              {bulk.size > 0 && (
                <div className="inline-flex flex-wrap items-center gap-1.5 ml-2">
                  {[...bulk].map(n => {
                    const color = byName.get(n)?.color ?? '#9ca3af'
                    return (
                      <span key={n} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 border"
                        style={{ borderColor: color, color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{n}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => applyBulk('add')} disabled={bulk.size === 0 || busy} style={PJ}
                className={`text-[12.5px] font-bold rounded-lg px-3.5 py-2 ${
                  bulk.size === 0 || busy ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
                }`}>{busy ? t('Saving…') : t('Add tag')}</button>
              <button onClick={() => applyBulk('remove')} disabled={bulk.size === 0 || busy} style={PJ}
                className={`text-[12.5px] font-semibold rounded-lg px-3.5 py-2 border ${
                  bulk.size === 0 || busy ? 'border-[#e5e7eb] text-[#cbd1d8] cursor-not-allowed' : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
                }`}>{t('Remove tag')}</button>
              <button onClick={() => { setSelected(new Set()); setBulk(new Set()); setCreatingFor(null); setBulkOpen(false) }} style={PJ}
                className="text-[12.5px] font-semibold text-[#9ca3af] hover:text-[#6b7280] px-1">{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
