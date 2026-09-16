'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card } from './ui'
import { PILLAR_COLORS } from './data'
import { useT } from '@/lib/i18n/LanguageContext'
import type { ActivityDetail, TaggedPost, TagPillar, TagFilter, PostAttributePatch } from '@/lib/dashboard/pillarTags'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const
const PAGE_SIZE = 25

/**
 * Sengaja didefinisikan di sini, bukan diimpor dari pillarTags.ts. Modul itu
 * membuka koneksi `pg`; mengimpor NILAI apa pun darinya (bukan `import type`,
 * yang hilang saat kompilasi) menyeret pg ke bundle browser dan build gagal di
 * `Can't resolve 'dns'`.
 */
const EMPTY_ACTIVITY: ActivityDetail = {
  name: null, submission: null, participant: null, startDate: null, endDate: null,
}

/**
 * Atribut editorial per-post — permukaan kerja di tab Content Pillars.
 *
 * KENAPA ADA
 *   Atribut ini hanya bisa masuk lewat upload CSV, dan tidak ada cara menyunting
 *   post satu per satu. Per 3 Sep 2026: 641 dari 846 post tanpa pilar.
 *
 * SATU PILAR PER POST
 *   Sesuai kesepakatan 4 Sep 2026, pilar disimpan di kolom tunggal content_pillar
 *   dan `tagging` dipakai untuk tag bebas. Karena itu memilih pilar bersifat
 *   ganti, bukan tambah — dan tidak ada lagi pembeda "hasil impor" vs "ditandai
 *   di sini": bentuk data yang baru tidak punya tempat menyimpan asalnya.
 *
 * KENAPA MODAL, BUKAN DROPDOWN
 *   Menyunting lima atribut sekaligus tidak muat di menu kecil, dan orang perlu
 *   MELIHAT postingannya untuk memutuskan pilar — caption terpotong di baris
 *   daftar tidak cukup. Modal memberi ruang untuk preview gambar besar plus
 *   seluruh kontrol dalam satu tampilan, tanpa kehilangan posisi gulir daftar.
 *
 * TIGA KEADAAN, DUA TOMBOL
 *   Boosted/Campaign/Activity tetap membedakan "belum diisi" dari "tidak" — post
 *   yang belum pernah ditinjau tidak boleh tampak sudah dinyatakan bukan-campaign.
 *   Tapi "belum diisi" adalah keadaan AWAL, bukan pilihan ketiga: tidak ada tombol
 *   yang menyala, dan cara kembali ke sana adalah menekan pilihan yang aktif.
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
  /** Tag yang pernah dipakai brand ini, urut abjad. */
  knownTags: string[]
}
type Update = { postId: string; platform: string } & PostAttributePatch

export default function PillarTagging({ orgId, brandId, platform, start, end, onCreatePillar }: {
  orgId: string
  brandId: string
  /** Penyaring topbar. Diteruskan ke server — daftar, jumlah halaman, dan progres
   *  semuanya menyempit mengikuti pilihan platform & rentang tanggal. */
  platform: string
  start: string | null
  end: string | null
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

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editKey, setEditKey]   = useState<string | null>(null)
  const [broken, setBroken]     = useState<Set<string>>(new Set())
  const [busy, setBusy]         = useState(false)

  // Pembuatan pilar pertama, langsung dari layar kosong.
  const [firstName, setFirstName]   = useState('')
  const [firstBusy, setFirstBusy]   = useState(false)
  const [firstError, setFirstError] = useState(false)

  // Aksi massal
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkPillar, setBulkPillar] = useState<string>('')
  const [bulkAttr, setBulkAttr] = useState<{ boosted?: boolean | null; campaign?: boolean | null; activity?: boolean | null }>({})

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setQuery(queryInput); setPage(0) }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [queryInput])

  useEffect(() => { setPage(0) }, [filter, brandId, platform, start, end])

  useEffect(() => {
    let cancelled = false
    setRows(null); setLoadErr(null); setSelected(new Set())
    const sp = new URLSearchParams({
      brand: brandId, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), filter, platform,
    })
    if (query) sp.set('q', query)
    if (start && end) { sp.set('start', start); sp.set('end', end) }
    fetch(`/api/organizations/${orgId}/dashboard/pillars/tags?${sp}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Payload) => {
        if (cancelled) return
        setData(d)
        setRows(d.posts.map(p => ({ ...p, key: keyOf(p) })))
      })
      .catch(e => { if (!cancelled) setLoadErr(String(e.message ?? e)) })
    return () => { cancelled = true }
  }, [orgId, brandId, platform, start, end, page, filter, query])

  const pillars = data?.pillars ?? []
  /**
   * Kosakata tag untuk pemilih di modal: daftar milik brand dari server, ditambah
   * tag yang baru dipasang di halaman ini. Tambahan lokal itu yang membuat tag
   * baru langsung ikut ditawarkan — memuat ulang daftar akan menutup modalnya.
   */
  const knownTags = useMemo(() => {
    const all = new Set(data?.knownTags ?? [])
    for (const r of rows ?? []) for (const tg of r.tags) all.add(tg)
    return [...all].sort((a, b) => a.localeCompare(b))
  }, [data, rows])
  const byName  = useMemo(() => new Map(pillars.map(p => [p.name, p])), [pillars])
  const total   = data?.total ?? 0
  const matched = data?.matched ?? 0
  const taggedPct = total ? Math.round(((total - (data?.untagged ?? 0)) / total) * 100) : 0
  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE))
  const editing = rows?.find(r => r.key === editKey) ?? null

  const toggleSelect = (k: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const allVisibleSelected = !!rows && rows.length > 0 && rows.every(r => selected.has(r.key))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set((rows ?? []).map(r => r.key)))

  async function persist(next: Row[], updates: Update[]) {
    const before = rows
    setRows(next); setSaveErr(null); setBusy(true)
    try {
      const r = await fetch(`/api/organizations/${orgId}/dashboard/pillars/tags`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, updates }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const done: { applied: number; requested: number } = await r.json()
      if (done.applied < done.requested) throw new Error(`${done.applied}/${done.requested}`)

      // Progres dihitung ulang SECARA LOKAL, bukan dengan memuat ulang daftar.
      // Memuat ulang mengosongkan `rows` sesaat, dan modal yang sedang terbuka
      // ikut ter-unmount lalu dipasang lagi — terlihat seperti modal menyegarkan
      // diri sendiri setiap kali satu nilai diubah, dan isian yang belum selesai
      // diketik ikut hilang. Hanya baris di halaman ini yang berubah, jadi
      // selisihnya cukup dihitung dari sini.
      const deltaUntagged = next.filter(r => !r.pillar).length - (before ?? []).filter(r => !r.pillar).length
      if (deltaUntagged !== 0) setData(d => (d ? { ...d, untagged: d.untagged + deltaUntagged } : d))
    } catch (e) {
      setRows(before)
      setSaveErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  /** Sunting satu post dari modal. */
  const patchRow = (key: string, patch: PostAttributePatch) => {
    if (!rows || busy) return
    let upd: Update | null = null
    const next = rows.map(r => {
      if (r.key !== key) return r
      upd = { postId: r.postId, platform: r.platform, ...patch }
      return { ...r, ...patch }
    })
    if (upd) persist(next, [upd])
  }

  /** Terapkan pilar dan/atau atribut ke seluruh post terpilih sekaligus. */
  const applyBulk = () => {
    if (!rows || busy || selected.size === 0) return
    const patch: PostAttributePatch = { ...bulkAttr }
    if (bulkPillar) patch.pillar = bulkPillar === '__clear__' ? null : bulkPillar
    if (Object.keys(patch).length === 0) return
    const updates: Update[] = []
    const next = rows.map(r => {
      if (!selected.has(r.key)) return r
      updates.push({ postId: r.postId, platform: r.platform, ...patch })
      return { ...r, ...patch }
    })
    setSelected(new Set()); setBulkPillar(''); setBulkAttr({}); setBulkOpen(false)
    persist(next, updates)
  }

  /**
   * Pilar pertama dibuat dari layar kosong, bukan hanya dari kartu di atas.
   *
   * KENAPA TIDAK PERLU MUAT ULANG
   *   `rows` sudah terisi sejak permintaan pertama — post-nya memang ada, yang
   *   menyembunyikannya cuma cabang kosong di bawah. Jadi begitu daftar pilar
   *   terisi, seluruh post langsung tampil. Memuat ulang di sini hanya akan
   *   mengosongkan daftar sesaat lalu menampilkan isi yang sama persis.
   */
  const createFirstPillar = async () => {
    const name = firstName.trim()
    if (!name || firstBusy || !onCreatePillar) return
    setFirstBusy(true); setFirstError(false)
    try {
      const color = PILLAR_COLORS[0]
      if (await onCreatePillar(name, color)) {
        setData(d => (d ? { ...d, pillars: [...d.pillars, { id: `local-${name}`, name, color, isActive: true }] } : d))
        setFirstName('')
      } else {
        setFirstError(true)
      }
    } catch {
      setFirstError(true)
    } finally {
      setFirstBusy(false)
    }
  }

  /**
   * Dua nilai + keadaan "belum diisi".
   *
   * KENAPA TOMBOL "—" DIHAPUS
   *   Label "—" tidak mengatakan apa-apa: orang harus menebak apakah artinya
   *   "tidak", "tidak tahu", atau "kosongkan". Sekarang belum-diisi adalah
   *   keadaan awal — tidak ada tombol yang menyala — dan menekan pilihan yang
   *   sedang aktif mengembalikannya ke sana.
   *
   * KECUALI DI AKSI MASSAL
   *   Di panel massal belum-diisi tidak bisa jadi keadaan awal: awalnya di sana
   *   berarti "jangan diubah", dan mengosongkan puluhan post sekaligus adalah
   *   perintah tersendiri yang harus bisa disebut. Panel itu mengirim
   *   `clearLabel`, dan tombol ketiganya diberi NAMA — bukan "—". Di sana klik
   *   ulang tidak mengosongkan, supaya tiap keadaan hanya punya satu jalan.
   */
  function TriPick({ value, onPick, labels, clearLabel }: {
    value: boolean | null | undefined
    onPick: (v: boolean | null) => void
    labels: [string, string]
    clearLabel?: string
  }) {
    const opt = (v: boolean | null, label: string, hint?: string) => (
      <button key={label} title={hint}
        onClick={() => onPick(!clearLabel && value === v ? null : v)} style={PJ}
        className={`flex-1 text-[12px] font-semibold rounded-md px-2.5 py-1.5 border ${
          value === v ? 'bg-[#f3f0fd] border-[#6c4cd6]/50 text-[#6c4cd6]' : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db]'
        }`}>{label}</button>
    )
    const hint = clearLabel ? undefined : t('Click the active choice again to leave it unset')
    return (
      <div className="flex items-center gap-1.5">
        {opt(false, labels[0], hint)}
        {opt(true, labels[1], hint)}
        {clearLabel ? opt(null, clearLabel) : null}
      </div>
    )
  }

  if (data && pillars.length === 0) {
    return (
      <Card area={null}>
        <div className="flex flex-col items-center justify-center text-center px-6 py-12">
          <span className="material-symbols-outlined text-[36px] text-[#cbd1d8] mb-2.5">sell</span>
          <p style={PJ} className="text-[14px] font-bold text-[#9ca3af]">{t('Define a pillar first')}</p>
          <p className="text-[12.5px] text-[#9ca3af] mt-1 max-w-[340px]">
            {t('Tagging needs at least one pillar to assign posts to. Create one here, or use the card above.')}
          </p>
          {onCreatePillar && (
            <>
              <div className="flex items-center gap-1.5 mt-4 w-full max-w-[340px]">
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createFirstPillar() } }}
                  placeholder={t('New pillar name')} style={PJ} autoComplete="off"
                  className="flex-1 text-[12.5px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-2 outline-none focus:border-[#6c4cd6]" />
                <button onClick={createFirstPillar} disabled={!firstName.trim() || firstBusy} style={PJ}
                  className={`text-[12px] font-bold rounded-lg px-3.5 py-2 flex-shrink-0 ${
                    !firstName.trim() || firstBusy
                      ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed'
                      : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
                  }`}>{firstBusy ? t('Saving…') : t('Create pillar')}</button>
              </div>
              {firstError && (
                <p className="mt-2 text-[11.5px] font-semibold text-[#c2553f]">{t('Could not create the pillar.')}</p>
              )}
            </>
          )}
        </div>
      </Card>
    )
  }

  return (
    <>
    <Card area={null} className="flex flex-col">
      <div className="px-5 pt-4 pb-3 border-b border-[#f1f3f5]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">{t('Tag Posts to Pillars')}</h3>
            <p className="text-[12.5px] text-[#9ca3af] mt-1 leading-relaxed max-w-[560px]">
              {t('Set the pillar and editorial attributes for each post. Click a post to open it.')}
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
          {([['all', t('All')], ['untagged', t('Untagged')], ['tagged', t('Tagged')]] as const).map(([key, label]) => (
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
        {saveError && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#c2553f]">
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
              {t('Showing {from}–{to} of {matched}', { from: page * PAGE_SIZE + 1, to: page * PAGE_SIZE + rows.length, matched })}
            </span>
          </label>
        )}

        {rows && rows.length === 0 && (
          <p className="text-center text-[12.5px] text-[#9ca3af] py-8">{t('No posts match this filter')}</p>
        )}

        {(rows ?? []).map(post => {
          const isSelected = selected.has(post.key)
          const imageFailed = broken.has(post.key)
          const color = post.pillar ? (byName.get(post.pillar)?.color ?? '#9ca3af') : null
          return (
            <div key={post.key}
              className={`flex items-center gap-3.5 rounded-lg border px-3 py-3 ${
                isSelected ? 'border-[#6c4cd6]/40 bg-[#faf9fe]' : 'border-[#eef0f2] bg-white'
              }`}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(post.key)}
                className="w-3.5 h-3.5 rounded border-[#d1d5db] accent-[#6c4cd6] cursor-pointer flex-shrink-0" />

              {/* Gambar membuka modal, bukan tautan keluar — menyunting jauh lebih
                  sering dilakukan daripada membuka post aslinya. Tautan ke post
                  tetap ada di dalam modal. */}
              <button onClick={() => setEditKey(post.key)} title={t('Edit post')}
                className="group relative w-24 h-24 rounded-lg bg-[#f1f3f5] overflow-hidden flex items-center justify-center flex-shrink-0">
                {post.coverImage && !imageFailed
                  ? <img src={post.coverImage} alt="" loading="lazy" className="w-full h-full object-cover"
                      onError={() => setBroken(prev => new Set(prev).add(post.key))} />
                  : <span className="material-symbols-outlined text-[26px] text-[#9ca3af]">{PLATFORM_ICON[post.platform] ?? 'article'}</span>}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors">
                  <span className="material-symbols-outlined text-[20px] text-white opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
                </span>
              </button>

              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditKey(post.key)}>
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

                  {post.pillar && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full pl-1.5 pr-2 py-0.5 border"
                      style={{ borderColor: color!, color: color! }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color! }} />{post.pillar}
                    </span>
                  )}
                  {post.boosted !== null && (
                    <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 border ${
                      post.boosted ? 'border-[#e0a458] text-[#a06a1f]' : 'border-[#e5e7eb] text-[#9ca3af]'
                    }`}>{post.boosted ? t('Paid') : t('Organic')}</span>
                  )}
                  {post.campaign === true && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 border border-[#3d7eea] text-[#2f62b8]">{t('Campaign')}</span>
                  )}
                  {post.activity === true && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 border border-[#5fa783] text-[#3f7a5e]">{t('Activity')}</span>
                  )}
                  {post.tags.map(tg => (
                    <span key={tg} className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#f3f4f6] text-[#6b7280]">{tg}</span>
                  ))}
                </div>
              </div>

              <button onClick={() => setEditKey(post.key)} title={t('Edit post')} disabled={busy}
                className="material-symbols-outlined text-[18px] text-[#cbd1d8] hover:text-[#6c4cd6] disabled:opacity-40 flex-shrink-0">edit</button>
            </div>
          )
        })}

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

      {/* ── bilah pilihan: pemicu saja, penyuntingannya di modal ────────── */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 mt-auto border-t border-[#eef0f2] bg-white/95 backdrop-blur px-5 py-3 rounded-b-xl">
          <div className="flex items-center gap-3">
            <span style={PJ} className="text-[12.5px] font-bold text-[#111827] tabular-nums">
              {t('{count} selected', { count: selected.size })}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setBulkOpen(true)} disabled={busy} style={PJ}
                className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-lg px-3.5 py-2 ${
                  busy ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
                }`}>
                <span className="material-symbols-outlined text-[16px]">edit</span>
                {busy ? t('Saving…') : t('Edit selected')}
              </button>
              <button onClick={() => { setSelected(new Set()); setBulkPillar(''); setBulkAttr({}) }} style={PJ}
                className="text-[12.5px] font-semibold text-[#9ca3af] hover:text-[#6b7280] px-1">{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Card>

    {editing && (
      <EditModal post={editing} pillars={pillars} busy={busy} t={t}
        onClose={() => setEditKey(null)}
        onPatch={patch => patchRow(editing.key, patch)}
        onCreatePillar={onCreatePillar}
        onAddPillar={pl => setData(d => (d ? { ...d, pillars: [...d.pillars, pl] } : d))}
        knownTags={knownTags}
        TriPick={TriPick} />
    )}

    {bulkOpen && (
      <BulkModal
        posts={(rows ?? []).filter(r => selected.has(r.key))}
        pillars={pillars} busy={busy} t={t}
        pillar={bulkPillar} setPillar={setBulkPillar}
        attr={bulkAttr} setAttr={setBulkAttr}
        onClose={() => setBulkOpen(false)}
        onApply={applyBulk}
        TriPick={TriPick} />
    )}
    </>
  )
}

/* ── Modal sunting banyak post sekaligus ──────────────────────────────────
 * Berbeda dari modal satu post yang menyimpan tiap perubahan seketika, di sini
 * perubahan baru dikirim saat tombol Terapkan ditekan. Aksi ini menimpa puluhan
 * baris sekaligus; memberi kesempatan meninjau dulu jauh lebih murah daripada
 * membatalkan setelahnya — dan tidak ada tombol urungkan.
 *
 * Deretan gambar di atas bukan hiasan: satu-satunya cara memastikan yang
 * tercentang benar-benar yang dimaksud adalah melihatnya.
 */
function BulkModal({ posts, pillars, busy, t, pillar, setPillar, attr, setAttr, onClose, onApply, TriPick }: {
  posts: (TaggedPost & { key: string })[]
  pillars: TagPillar[]
  busy: boolean
  t: (k: string, v?: Record<string, string | number>) => string
  pillar: string
  setPillar: (v: string) => void
  attr: { boosted?: boolean | null; campaign?: boolean | null; activity?: boolean | null }
  setAttr: React.Dispatch<React.SetStateAction<{ boosted?: boolean | null; campaign?: boolean | null; activity?: boolean | null }>>
  onClose: () => void
  onApply: () => void
  TriPick: (p: { value: boolean | null | undefined; onPick: (v: boolean | null) => void; labels: [string, string]; clearLabel?: string }) => React.JSX.Element
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const SHOWN = 12
  const nothingChosen = !pillar && Object.keys(attr).length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/45 cursor-default" onClick={onClose} aria-label={t('Close')} />
      <div className="relative z-10 w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f3f5] sticky top-0 bg-white rounded-t-2xl">
          <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">
            {t('Edit {count} posts', { count: posts.length })}
          </h3>
          <button onClick={onClose} className="material-symbols-outlined text-[20px] text-[#9ca3af] hover:text-[#374151]">close</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-2">{t('Selected posts')}</p>
            <div className="flex flex-wrap gap-1.5">
              {posts.slice(0, SHOWN).map(p => (
                <div key={p.key} title={p.caption.slice(0, 120)}
                  className="w-14 h-14 rounded-lg bg-[#f1f3f5] overflow-hidden flex items-center justify-center">
                  {p.coverImage
                    ? <img src={p.coverImage} alt="" className="w-full h-full object-cover" />
                    : <span className="material-symbols-outlined text-[18px] text-[#cbd1d8]">{PLATFORM_ICON[p.platform] ?? 'article'}</span>}
                </div>
              ))}
              {posts.length > SHOWN && (
                <div className="w-14 h-14 rounded-lg bg-[#f8f9fa] border border-[#eef0f2] flex items-center justify-center">
                  <span style={PJ} className="text-[12px] font-bold text-[#9ca3af] tabular-nums">+{posts.length - SHOWN}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Pillar')}</p>
            <select value={pillar} onChange={e => setPillar(e.target.value)} style={PJ}
              className="w-full h-10 text-[13px] font-semibold text-[#334155] bg-white border border-[#e5e7eb] rounded-lg px-3 cursor-pointer outline-none focus:border-[#6c4cd6]">
              <option value="">{t('No change')}</option>
              {pillars.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              <option value="__clear__">{t('Clear pillar')}</option>
            </select>
          </div>

          <div>
            <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Boosted')}</p>
            <TriPick value={attr.boosted} labels={[t('Organic'), t('Paid')]} clearLabel={t('Clear')} onPick={v => setAttr(a => ({ ...a, boosted: v }))} />
          </div>

          <div>
            <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">
              {t('Campaign')}<span className="normal-case font-medium text-[#cbd5e1]"> · {t('AON is the opposite')}</span>
            </p>
            <TriPick value={attr.campaign} labels={[t('No'), t('Yes')]} clearLabel={t('Clear')} onPick={v => setAttr(a => ({ ...a, campaign: v }))} />
          </div>

          <div>
            <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Activity')}</p>
            <TriPick value={attr.activity} labels={[t('No'), t('Yes')]} clearLabel={t('Clear')} onPick={v => setAttr(a => ({ ...a, activity: v }))} />
          </div>

          <p className="text-[11.5px] text-[#9ca3af] leading-relaxed">
            {t('Only what you set here is changed. Anything you do not touch keeps its current value on every selected post; “Clear” empties the field instead.')}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[#f1f3f5] flex items-center justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} style={PJ}
            className="text-[12.5px] font-semibold text-[#9ca3af] hover:text-[#6b7280] px-3 py-2">{t('Cancel')}</button>
          <button onClick={onApply} disabled={busy || nothingChosen} style={PJ}
            className={`text-[12.5px] font-bold rounded-lg px-4 py-2 ${
              busy || nothingChosen ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
            }`}>{busy ? t('Saving…') : t('Apply to {count} posts', { count: posts.length })}</button>
        </div>
      </div>
    </div>
  )
}

/* ── Modal sunting satu post ──────────────────────────────────────────────
 * Preview gambar sengaja besar dan di sisi kiri: keputusan pilar hampir selalu
 * diambil dari melihat kontennya, bukan dari membaca caption yang terpotong.
 */
/**
 * Pembungkus untuk modal yang dibuka DARI DALAM modal Edit post.
 *
 * KENAPA PORTAL
 *   Anak dari kartu Edit post adalah tempat yang buruk untuk `position: fixed`.
 *   Kartu itu `relative z-10` di dalam pembungkus `fixed z-50`, jadi ia membuka
 *   stacking context sendiri — `z-[60]` di dalamnya tidak pernah berarti "di atas
 *   modal induk", hanya "di atas saudara-saudaranya". Kartu itu juga
 *   `overflow-y-auto`, sehingga tata letak anaknya terikat pada kotak yang
 *   menggulir, bukan pada viewport. Hasilnya modal anak muncul sebagai bilah
 *   tipis di tengah layar.
 *
 *   Dipasang ke document.body, modal ini tidak punya leluhur selain <body>:
 *   `fixed inset-0` pasti seukuran viewport dan z-indexnya diadu di tingkat
 *   teratas. Tidak ada satu pun class di kartu induk yang bisa mempersempitnya
 *   lagi di kemudian hari.
 *
 * LEBARNYA WAJIB NILAI ARBITRER, JANGAN `max-w-md`/`max-w-lg`/`max-w-xl`
 *   globals.css mendefinisikan --spacing-md/lg/xl di blok @theme, dan di
 *   Tailwind v4 namespace --spacing-* ikut menyetir max-w-*. Akibatnya
 *   `max-w-lg` BUKAN 32rem melainkan var(--spacing-lg) = 24px, dan modalnya
 *   menyusut jadi bilah setipis 24px tanpa error apa pun — class-nya ada di
 *   CSS, nilainya yang dibajak. `max-w-2xl` ke atas kebetulan selamat karena
 *   --spacing-2xl tidak didefinisikan, tapi itu keselamatan yang menumpang
 *   nasib. Nilai arbitrer kebal terhadap token tema.
 */
function NestedModal({ title, t, onClose, children, footer, width = 'max-w-[32rem]' }: {
  title: string
  t: (k: string, v?: Record<string, string | number>) => string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/45 cursor-default" onClick={onClose} aria-label={t('Close')} />
      <div className={`relative z-10 w-full ${width} max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f3f5] shrink-0">
          <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">{title}</h3>
          <button onClick={onClose} className="material-symbols-outlined text-[20px] text-[#9ca3af] hover:text-[#374151]">close</button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        <div className="px-5 py-3 border-t border-[#f1f3f5] flex items-center justify-end gap-2 shrink-0">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Free tags — dipindahkan ke modal sendiri supaya kosakata brand muat ditampilkan.
 *
 * Di kolom sempit Edit post, tag yang sudah ada hanya bisa muncul sebagai daftar
 * saran setelah orang mulai mengetik — yang berarti tag itu baru ketahuan ada
 * kalau ejaannya sudah ditebak dengan benar. Persis begitulah kosakata tag
 * beranak-pinak: "giveaway", "give away", "Giveaway". Di sini seluruh kosakata
 * tampil sebagai chip yang tinggal diklik, jadi memakai ulang lebih mudah
 * daripada mengarang baru.
 *
 * Tag disimpan seketika seperti sebelumnya (bukan tombol Save) — satu klik satu
 * tag, tidak ada isian setengah jadi yang perlu ditahan seperti di modal Activity.
 */
function TagsModal({ t, tags, knownTags, onClose, onPatch }: {
  t: (k: string, v?: Record<string, string | number>) => string
  tags: string[]
  knownTags: string[]
  onClose: () => void
  onPatch: (patch: PostAttributePatch) => void
}) {
  const [input, setInput] = useState('')

  const add = (raw?: string) => {
    const v = (raw ?? input).trim()
    if (!v || tags.includes(v)) return
    onPatch({ tags: [...tags, v] })
    setInput('')
  }
  const remove = (tg: string) => onPatch({ tags: tags.filter(x => x !== tg) })

  const q = input.trim().toLowerCase()
  const available = knownTags.filter(k => !tags.includes(k) && (!q || k.toLowerCase().includes(q)))
  const isNew = !!q
    && !knownTags.some(k => k.toLowerCase() === q)
    && !tags.some(k => k.toLowerCase() === q)

  return (
    <NestedModal
      title={t('Free tags')} t={t} onClose={onClose} width="max-w-[34rem]" 
      footer={
        <button onClick={onClose} style={PJ}
          className="text-[12.5px] font-bold text-white bg-[#1f2937] hover:bg-[#374151] rounded-lg px-4 py-2">{t('Done')}</button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">
            {t('On this post')} <span className="font-medium text-[#cbd5e1]">· {tags.length}</span>
          </p>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tg => (
                <span key={tg} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#6b7280] bg-[#f3f4f6] rounded-full pl-3 pr-1.5 py-1.5">
                  {tg}
                  <button onClick={() => remove(tg)} aria-label={t('Remove')}
                    className="material-symbols-outlined text-[15px] text-[#9ca3af] hover:text-[#c2553f]">close</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-[#9ca3af]">{t('No tags yet')}</p>
          )}
        </div>

        <div>
          <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Add tag')}</p>
          <div className="flex items-center gap-1.5">
            <input value={input} autoFocus
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder={knownTags.length ? t('Pick a tag or type a new one') : t('Add tag — press Enter')} style={PJ}
              className="flex-1 h-9 text-[13px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 outline-none focus:border-[#6c4cd6]" />
            <button onClick={() => add()} disabled={!input.trim()} style={PJ}
              className={`text-[12.5px] font-semibold rounded-lg px-3.5 h-9 border ${
                input.trim() ? 'border-[#e5e7eb] text-[#374151] hover:border-[#d1d5db]' : 'border-[#f1f5f9] text-[#cbd5e1] cursor-not-allowed'
              }`}>{t('Add')}</button>
          </div>
          {isNew && (
            <button onClick={() => add()} style={PJ}
              className="mt-2 text-[12.5px] font-semibold text-[#6c4cd6] hover:underline">
              {t('Create “{tag}”', { tag: input.trim() })}
            </button>
          )}
        </div>

        <div>
          <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">
            {t('Used by this brand')} <span className="font-medium text-[#cbd5e1]">· {available.length}</span>
          </p>
          {available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {available.map(tg => (
                <button key={tg} onClick={() => add(tg)} style={PJ}
                  className="text-[12px] font-semibold text-[#6b7280] bg-white border border-[#e5e7eb] rounded-full px-3 py-1.5 hover:border-[#6c4cd6] hover:text-[#6c4cd6]">
                  + {tg}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-[#9ca3af]">
              {knownTags.length ? t('Every known tag is already on this post.') : t('This brand has no tags yet.')}
            </p>
          )}
        </div>
      </div>
    </NestedModal>
  )
}

/**
 * Detail activity — lima field yang hanya berarti kalau activity-nya YA.
 *
 * KENAPA BURAM, BUKAN DISEMBUNYIKAN
 *   Menyembunyikan field saat jawabannya No membuat orang tidak tahu bahwa
 *   memilih Yes akan meminta lima isian lagi, dan tinggi modal melompat setiap
 *   kali tombolnya ditekan. Buram + nonaktif menunjukkan bentuk formulirnya tanpa
 *   mengizinkan pengisian — sekaligus tetap memperlihatkan angka yang sudah
 *   tersimpan sebelumnya.
 *
 * KENAPA SIMPAN EKSPLISIT, BUKAN SIMPAN SAMBIL MENGETIK
 *   Modal induknya menyimpan setiap perubahan seketika, dan itu cocok untuk
 *   pilihan sekali-klik. Di sini isiannya teks dan angka: menyimpan per ketukan
 *   berarti satu request per huruf, dan periode yang setengah diketik sempat
 *   tersimpan sebagai rentang terbalik.
 *
 * DETAIL TIDAK DIHAPUS SAAT MEMILIH No — lihat ActivityDetail di pillarTags.ts.
 */
function ActivityModal({ t, TriPick, activity, detail, onClose, onSave }: {
  t: (k: string, v?: Record<string, string | number>) => string
  TriPick: (p: { value: boolean | null | undefined; onPick: (v: boolean | null) => void; labels: [string, string]; clearLabel?: string }) => React.JSX.Element
  activity: boolean | null
  detail: ActivityDetail
  onClose: () => void
  onSave: (activity: boolean | null, detail: ActivityDetail) => void
}) {
  const [isAct, setIsAct] = useState<boolean | null>(activity)
  // Angka disimpan sebagai teks selama disunting: menghapus isi kotak angka harus
  // menghasilkan kotak kosong, bukan melompat balik ke 0.
  const [name, setName] = useState(detail.name ?? '')
  const [submission, setSubmission] = useState(detail.submission === null ? '' : String(detail.submission))
  const [participant, setParticipant] = useState(detail.participant === null ? '' : String(detail.participant))
  const [startDate, setStartDate] = useState(detail.startDate ?? '')
  const [endDate, setEndDate] = useState(detail.endDate ?? '')

  const on = isAct === true
  const badEnd = !!startDate && !!endDate && endDate < startDate

  const num = (v: string) => {
    const n = Number(v)
    return v.trim() && Number.isInteger(n) && n >= 0 ? n : null
  }

  const save = () => {
    if (badEnd) return
    onSave(isAct, {
      name: name.trim() || null,
      submission: num(submission),
      participant: num(participant),
      startDate: startDate || null,
      endDate: endDate || null,
    })
  }

  const field = 'w-full h-9 text-[13px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 outline-none focus:border-[#6c4cd6] disabled:bg-[#f9fafb]'
  const label = 'block text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1'

  return (
    <NestedModal
      title={t('Activity')} t={t} onClose={onClose} width="max-w-[30rem]" 
      footer={
        <>
          <button onClick={onClose} style={PJ}
            className="text-[12.5px] font-semibold text-[#6b7280] border border-[#e5e7eb] hover:border-[#d1d5db] rounded-lg px-3.5 py-2">{t('Cancel')}</button>
          <button onClick={save} disabled={badEnd} style={PJ}
            className={`text-[12.5px] font-bold rounded-lg px-4 py-2 ${
              badEnd ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'text-white bg-[#1f2937] hover:bg-[#374151]'
            }`}>{t('Save')}</button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
          <div>
            <p style={PJ} className={label}>{t('Activity Type')}</p>
            <TriPick value={isAct} labels={[t('No'), t('Yes')]} onPick={setIsAct} />
          </div>

          <div
            aria-hidden={!on}
            className={`flex flex-col gap-3.5 transition-all ${on ? '' : 'blur-[2px] opacity-55 pointer-events-none select-none'}`}
          >
            <div>
              <label style={PJ} className={label}>{t('Activity Name')}</label>
              <input value={name} onChange={e => setName(e.target.value)} disabled={!on}
                placeholder={t('e.g. Photo contest')} style={PJ} className={field} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={PJ} className={label}>{t('Submission')}</label>
                <input type="number" min={0} step={1} inputMode="numeric" disabled={!on}
                  value={submission} onChange={e => setSubmission(e.target.value)}
                  placeholder="0" style={PJ} className={field} />
              </div>
              <div>
                <label style={PJ} className={label}>{t('Participant')}</label>
                <input type="number" min={0} step={1} inputMode="numeric" disabled={!on}
                  value={participant} onChange={e => setParticipant(e.target.value)}
                  placeholder="0" style={PJ} className={field} />
              </div>
            </div>

            <div>
              <p style={PJ} className={label}>{t('Activity Period')}</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={startDate} disabled={!on}
                  onChange={e => setStartDate(e.target.value)} style={PJ} className={field} />
                <input type="date" value={endDate} disabled={!on}
                  // `min` menahan pemilihan lewat kalender; ketikan manual tetap bisa
                  // lolos, jadi badEnd di bawah yang jadi penjaga sebenarnya.
                  min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)} style={PJ} className={field} />
              </div>
              {badEnd && (
                <p className="mt-1 text-[11px] font-semibold text-[#c2553f]">{t('End date is before the start date.')}</p>
              )}
            </div>
          </div>
      </div>
    </NestedModal>
  )
}

function EditModal({ post, pillars, busy, t, onClose, onPatch, onCreatePillar, onAddPillar, knownTags, TriPick }: {
  post: TaggedPost & { key: string }
  pillars: TagPillar[]
  busy: boolean
  t: (k: string, v?: Record<string, string | number>) => string
  onClose: () => void
  onPatch: (patch: PostAttributePatch) => void
  onCreatePillar?: (name: string, color: string) => Promise<boolean>
  onAddPillar: (p: TagPillar) => void
  /** Tag yang pernah dipakai brand ini — kosakata untuk pemilih tag. */
  knownTags: string[]
  TriPick: (p: { value: boolean | null | undefined; onPick: (v: boolean | null) => void; labels: [string, string]; clearLabel?: string }) => React.JSX.Element
}) {
  const [newPillar, setNewPillar] = useState('')
  const [creating, setCreating] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

  // Escape menutup modal ini — KECUALI saat salah satu modal anak sedang terbuka.
  // Ketiganya memasang listener di window, jadi tanpa penjaga ini satu ketukan
  // Escape menutup semuanya sekaligus dan post ikut hilang dari layar.
  const childOpen = activityOpen || tagsOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !childOpen) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, childOpen])

  // Baris ringkas di bawah tombol: hanya yang sudah terisi. Nama sudah tampil di
  // tombolnya, jadi tidak diulang di sini.
  const activity = post.activityDetail ?? EMPTY_ACTIVITY
  const activitySummary = [
    activity.submission  !== null ? t('{n} submission',  { n: activity.submission.toLocaleString('id-ID') })  : null,
    activity.participant !== null ? t('{n} participant', { n: activity.participant.toLocaleString('id-ID') }) : null,
    activity.startDate || activity.endDate
      ? `${activity.startDate ?? '…'} → ${activity.endDate ?? '…'}`
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/45 cursor-default" onClick={onClose} aria-label={t('Close')} />
      <div className="relative z-10 w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f3f5] sticky top-0 bg-white rounded-t-2xl">
          <h3 style={PJ} className="text-[15px] font-bold text-[#111827]">{t('Edit post')}</h3>
          <button onClick={onClose} className="material-symbols-outlined text-[20px] text-[#9ca3af] hover:text-[#374151]">close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5 p-5">
          {/* preview */}
          <div>
            <div className="w-full aspect-square rounded-xl bg-[#f1f3f5] overflow-hidden flex items-center justify-center">
              {post.coverImage && !imgFailed
                ? <img src={post.coverImage} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
                : <span className="material-symbols-outlined text-[40px] text-[#cbd1d8]">{PLATFORM_ICON[post.platform] ?? 'article'}</span>}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-[#9ca3af]">
              <span className="material-symbols-outlined text-[14px] text-[#cbd1d8]">{PLATFORM_ICON[post.platform] ?? 'article'}</span>
              {post.postedAt && <span className="tabular-nums">{new Date(post.postedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
              <span className="text-[#cbd1d8]">·</span>
              <span className="tabular-nums">{t('Reach')} {post.reach.toLocaleString('id-ID')}</span>
              <span className="text-[#cbd1d8]">·</span>
              <span className="tabular-nums">ER {post.er.toFixed(1)}%</span>
            </div>
            {post.link && (
              <a href={post.link} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#6c4cd6] hover:underline">
                {t('Open post')}<span className="material-symbols-outlined text-[13px]">open_in_new</span>
              </a>
            )}
            <p className="mt-2.5 text-[12px] text-[#6b7280] leading-relaxed line-clamp-6">{post.caption || t('No caption')}</p>
          </div>

          {/* kontrol */}
          <div className="flex flex-col gap-4">
            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Pillar')}</p>
              <select value={post.pillar ?? ''} disabled={busy}
                onChange={e => onPatch({ pillar: e.target.value || null })} style={PJ}
                className="w-full h-10 text-[13px] font-semibold text-[#334155] bg-white border border-[#e5e7eb] rounded-lg px-3 cursor-pointer outline-none focus:border-[#6c4cd6] disabled:opacity-50">
                <option value="">{t('No pillar')}</option>
                {pillars.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
              {onCreatePillar && (
                <div className="flex items-center gap-1.5 mt-2">
                  <input value={newPillar} onChange={e => setNewPillar(e.target.value)}
                    placeholder={t('New pillar name')} style={PJ}
                    className="flex-1 text-[12.5px] text-[#374151] bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#6c4cd6]" />
                  <button disabled={!newPillar.trim() || creating} style={PJ}
                    onClick={async () => {
                      const name = newPillar.trim()
                      if (!name) return
                      setCreating(true)
                      try {
                        // Pilar baru langsung dipasang ke post ini — itu alasan
                        // orang membuatnya dari sini.
                        const color = PILLAR_COLORS[pillars.length % PILLAR_COLORS.length]
                        if (await onCreatePillar(name, color)) {
                          // Disisipkan lokal, bukan lewat muat ulang daftar —
                          // alasannya sama: muat ulang menutup modal ini.
                          onAddPillar({ id: `local-${name}`, name, color, isActive: true })
                          onPatch({ pillar: name }); setNewPillar('')
                        }
                      } finally { setCreating(false) }
                    }}
                    className={`text-[12px] font-bold rounded-lg px-3 py-1.5 ${
                      !newPillar.trim() || creating ? 'bg-[#e5e7eb] text-[#9ca3af] cursor-not-allowed' : 'bg-[#6c4cd6] text-white hover:bg-[#5a3fc0]'
                    }`}>{creating ? t('Saving…') : t('Create pillar')}</button>
                </div>
              )}
            </div>

            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Boosted')}</p>
              <TriPick value={post.boosted} labels={[t('Organic'), t('Paid')]} onPick={v => onPatch({ boosted: v })} />
            </div>

            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">
                {t('Campaign')}
                <span className="normal-case font-medium text-[#cbd5e1]"> · {t('AON is the opposite')}</span>
              </p>
              <TriPick value={post.campaign} labels={[t('No'), t('Yes')]} onPick={v => onPatch({ campaign: v })} />
              {post.campaign !== null && (
                <p className="mt-1 text-[11px] text-[#9ca3af]">AON: <strong>{post.campaign ? t('No') : t('Yes')}</strong></p>
              )}
            </div>

            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Activity')}</p>
              {/* Tombol, bukan TriPick langsung: activity bukan lagi satu jawaban ya/tidak
                  melainkan lima field. Menyelipkan kelimanya ke kolom ini akan menenggelamkan
                  Pillar dan Free tags yang jauh lebih sering dipakai. */}
              <button onClick={() => setActivityOpen(true)} style={PJ}
                className="w-full flex items-center justify-between gap-2 text-left bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 hover:border-[#d1d5db]">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`text-[12px] font-semibold rounded-md px-2 py-0.5 ${
                    post.activity === true  ? 'bg-[#f3f0fd] text-[#6c4cd6]'
                    : post.activity === false ? 'bg-[#f3f4f6] text-[#6b7280]'
                    : 'bg-[#f9fafb] text-[#9ca3af]'
                  }`}>
                    {post.activity === true ? t('Yes') : post.activity === false ? t('No') : t('Not set')}
                  </span>
                  {post.activity === true && activity.name && (
                    <span className="truncate text-[12.5px] font-medium text-[#374151]">{activity.name}</span>
                  )}
                </span>
                <span className="material-symbols-outlined text-[18px] text-[#9ca3af]">tune</span>
              </button>
              {post.activity === true && activitySummary && (
                <p className="mt-1 text-[11px] text-[#9ca3af] truncate">{activitySummary}</p>
              )}
            </div>

            <div>
              <p style={PJ} className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1.5">{t('Free tags')}</p>
              <button onClick={() => setTagsOpen(true)} style={PJ}
                className="w-full flex items-center justify-between gap-2 text-left bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 hover:border-[#d1d5db]">
                <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  {post.tags.length > 0 ? post.tags.slice(0, 3).map(tg => (
                    <span key={tg} className="text-[11.5px] font-semibold text-[#6b7280] bg-[#f3f4f6] rounded-full px-2.5 py-0.5">{tg}</span>
                  )) : (
                    <span className="text-[12.5px] text-[#9ca3af]">{t('No tags yet')}</span>
                  )}
                  {post.tags.length > 3 && (
                    <span className="text-[11.5px] font-semibold text-[#9ca3af]">+{post.tags.length - 3}</span>
                  )}
                </span>
                <span className="material-symbols-outlined text-[18px] text-[#9ca3af]">tune</span>
              </button>
            </div>
          </div>
        </div>

        {tagsOpen && (
          <TagsModal
            t={t} tags={post.tags} knownTags={knownTags}
            onClose={() => setTagsOpen(false)} onPatch={onPatch}
          />
        )}

        {activityOpen && (
          <ActivityModal
            t={t} TriPick={TriPick}
            activity={post.activity} detail={activity}
            onClose={() => setActivityOpen(false)}
            onSave={(a, d) => { onPatch({ activity: a, activityDetail: d }); setActivityOpen(false) }}
          />
        )}

        <div className="px-5 py-3 border-t border-[#f1f3f5] flex items-center justify-between">
          <span className="text-[11px] text-[#9ca3af]">{t('Changes are saved as you make them.')}</span>
          <button onClick={onClose} style={PJ}
            className="text-[12.5px] font-bold text-white bg-[#1f2937] hover:bg-[#374151] rounded-lg px-4 py-2">{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}
