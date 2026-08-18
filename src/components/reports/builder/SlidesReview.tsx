'use client'

import { useRef, useState } from 'react'
import { CoverColors } from '@/lib/reports/cover/colors'
import { ContentSlide, SlideChrome } from '@/lib/reports/data/slideModel'
import SlidePreview from '../slides/SlidePreview'
import { PJ } from './ui'
import { useT } from '@/lib/i18n/LanguageContext'

export default function SlidesReview({
  slides, colors, isExporting, cover, chromeFor,
  onAdd, onOpen, onRename, onDelete, onMove, onExport, onSaveTemplate, onEditCover,
}: {
  slides: ContentSlide[]
  colors: CoverColors
  isExporting: boolean
  cover: React.ReactNode
  chromeFor: (index: number) => SlideChrome
  onAdd: () => void
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  /** Reorder: move the slide at `from` to index `to` (both 0-based in `slides`). */
  onMove: (from: number, to: number) => void
  onExport: (mode: 'export' | 'export-save') => void
  onSaveTemplate: () => void
  onEditCover: () => void
}) {
  const t = useT()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // Reorder state. `dragIndex` = the slide being dragged, `overIndex` = the card it
  // would drop onto, `posIndex` = the card whose page-number badge is being typed into.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [posIndex, setPosIndex] = useState<number | null>(null)
  // A drop fires a trailing click on some browsers — suppress it so reordering a
  // slide doesn't also open the editor.
  const droppedRef = useRef(false)
  // Set when the position input is dismissed with Escape, so its blur doesn't commit.
  const posCancelRef = useRef(false)

  function openSlide(id: string) {
    if (droppedRef.current) { droppedRef.current = false; return }
    onOpen(id)
  }

  // Commit a typed page number. Cover is page 1, so content slide i is page i + 2.
  function commitPosition(from: number, raw: string) {
    setPosIndex(null)
    const page = Number(raw.trim())
    if (!Number.isFinite(page)) return
    onMove(from, Math.round(page) - 2)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2.5 mb-6">
        <button
          onClick={onSaveTemplate}
          disabled={isExporting}
          style={PJ}
          className="flex items-center gap-2 bg-white hover:bg-[#F1F2FB] disabled:opacity-60 text-[#2C3079] text-[13px] font-bold px-5 py-2.5 rounded-xl border border-[#2C3079]/30 hover:border-[#2C3079] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">bookmark_add</span>
          Save Template
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            disabled={isExporting}
            style={PJ}
            className="flex items-center gap-2 bg-[#2C3079] hover:bg-[#20224F] disabled:opacity-60 text-white text-[13px] font-bold pl-5 pr-4 py-2.5 rounded-xl shadow-[0_4px_14px_rgba(30,79,73,0.30)] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {isExporting ? t('Exporting…') : t('Export PPTX')}
            <span className={`material-symbols-outlined text-[18px] transition-transform ${menuOpen ? 'rotate-180' : ''}`}>expand_more</span>
          </button>

          {menuOpen && !isExporting && (
            <>
              {/* click-outside catcher */}
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-[#e5e7eb] shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden z-20 py-1">
                <button
                  onClick={() => { setMenuOpen(false); onExport('export') }}
                  style={PJ}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F1F2FB] transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#2C3079] mt-0.5">download</span>
                  <span>
                    <span className="block text-[13px] font-bold text-[#0f172a]">{t('Export only')}</span>
                    <span className="block text-[11.5px] text-[#94a3b8]">{t('Download the .pptx to this device')}</span>
                  </span>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onExport('export-save') }}
                  style={PJ}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F1F2FB] transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-[20px] text-[#2C3079] mt-0.5">cloud_upload</span>
                  <span>
                    <span className="block text-[13px] font-bold text-[#0f172a]">Export &amp; save</span>
                    <span className="block text-[11.5px] text-[#94a3b8]">{t('Download and store in your reports library')}</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 style={PJ} className="text-[22px] font-bold text-[#0f172a] tracking-[-0.02em]">{t('Slides')}</h2>
          <p className="text-[13px] text-[#94a3b8] mt-0.5">
            Click a slide to edit. Drag a slide to reorder it, or click its page number to move it to a specific position.
          </p>
        </div>
        <span style={PJ} className="text-[12px] font-semibold text-[#64748b] bg-[#f3f4f6] px-3 py-1.5 rounded-full">
          {slides.length + 1} slide{slides.length + 1 !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Cover slide (edits via the cover step) */}
        <div
          onClick={onEditCover}
          className="group cursor-pointer bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden hover:shadow-[0_8px_26px_rgba(15,23,42,0.10)] hover:border-[#2C3079] hover:-translate-y-0.5 transition-all"
        >
          <div className="aspect-video relative border-b border-[#f1f3f5] overflow-hidden">
            {cover}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <span style={PJ} className="flex items-center gap-1.5 bg-white px-3.5 py-2 rounded-lg text-[12px] font-bold text-[#2C3079] shadow-sm">
                <span className="material-symbols-outlined text-[16px]">edit</span> Edit cover
              </span>
            </div>
          </div>
          <div className="px-4 h-14 flex items-center justify-between">
            <h3 style={PJ} className="text-[13.5px] font-bold text-[#0f172a]">{t('Cover')}</h3>
            <span style={PJ} className="text-[10px] font-bold uppercase tracking-wide text-[#2C3079] bg-[#E6E7F3] px-2 py-0.5 rounded-full">{t('Cover')}</span>
          </div>
        </div>

        {/* Content slides */}
        {slides.map((s, i) => (
          <div
            key={s.id}
            draggable={editingId !== s.id && posIndex !== i}
            onDragStart={e => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={e => { if (dragIndex !== null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIndex(i) } }}
            onDragLeave={() => setOverIndex(o => (o === i ? null : o))}
            onDrop={e => {
              e.preventDefault()
              if (dragIndex !== null && dragIndex !== i) {
                droppedRef.current = true
                // Any synthesized click lands in this same interaction task; clearing
                // on a timer means the flag can never go stale and eat a real click.
                setTimeout(() => { droppedRef.current = false }, 0)
                onMove(dragIndex, i)
              }
              setDragIndex(null); setOverIndex(null)
            }}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
            onClick={() => openSlide(s.id)}
            className={`group cursor-pointer bg-white rounded-2xl border overflow-hidden transition-all ${
              dragIndex === i
                ? 'opacity-40 border-[#1B8A80]'
                : overIndex === i && dragIndex !== null
                  ? 'border-[#1B8A80] ring-2 ring-[#1B8A80]/40 shadow-[0_8px_26px_rgba(15,23,42,0.10)]'
                  : 'border-[#e5e7eb] hover:shadow-[0_8px_26px_rgba(15,23,42,0.10)] hover:border-[#1B8A80] hover:-translate-y-0.5'
            }`}
          >
            <div className="aspect-video relative border-b border-[#f1f3f5] overflow-hidden">
              <SlidePreview slide={s} colors={colors} chrome={chromeFor(i)} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <span style={PJ} className="flex items-center gap-1.5 bg-white px-3.5 py-2 rounded-lg text-[12px] font-bold text-[#1B8A80] shadow-sm">
                  <span className="material-symbols-outlined text-[16px]">edit</span> Edit slide
                </span>
              </div>
              {/* Page number — click to type the position this slide should move to. */}
              {posIndex === i ? (
                <input
                  autoFocus
                  type="number"
                  min={2}
                  max={slides.length + 1}
                  defaultValue={i + 2}
                  onClick={e => e.stopPropagation()}
                  // Blur is the single commit path: committing on Enter as well would
                  // run twice (the unmount blurs the input) and the second run would
                  // move whichever slide had drifted into this index.
                  onBlur={e => {
                    if (posCancelRef.current) { posCancelRef.current = false; setPosIndex(null); return }
                    commitPosition(i, e.target.value)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') { posCancelRef.current = true; e.currentTarget.blur() }
                  }}
                  style={PJ}
                  className="absolute top-2.5 left-2.5 z-10 w-12 h-6 text-[11px] font-bold text-center text-[#0f172a] bg-white border-2 border-[#1B8A80] rounded-md outline-none"
                />
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setPosIndex(i) }}
                  title={t('Move to position…')}
                  style={PJ}
                  className="absolute top-2.5 left-2.5 text-[10px] font-bold bg-white/90 text-[#64748b] w-6 h-6 flex items-center justify-center rounded-md hover:bg-white hover:text-[#1B8A80] hover:ring-2 hover:ring-[#1B8A80]/40 transition"
                >
                  {i + 2}
                </button>
              )}
              {/* Drag affordance — the whole card is draggable; this marks it. */}
              <span
                title={t('Drag to reorder')}
                className="absolute top-2.5 right-2.5 w-6 h-6 items-center justify-center rounded-md bg-white/90 text-[#94a3b8] cursor-grab active:cursor-grabbing hidden group-hover:flex"
              >
                <span className="material-symbols-outlined text-[15px]">drag_indicator</span>
              </span>
            </div>
            <div className="px-4 h-14 flex items-center justify-between gap-2">
              {editingId === s.id ? (
                <input
                  autoFocus
                  defaultValue={s.title}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { onRename(s.id, e.target.value); setEditingId(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onRename(s.id, e.currentTarget.value); setEditingId(null) }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  style={PJ}
                  className="flex-1 text-[13.5px] font-bold text-[#0f172a] border-b-2 border-[#1B8A80] outline-none bg-transparent"
                />
              ) : (
                <>
                  <h3 style={PJ} className="flex-1 text-[13.5px] font-bold text-[#0f172a] truncate">
                    {s.title || t('Untitled slide')}
                  </h3>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(s.id) }}
                      title={t('Rename')}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-[#9ca3af] hover:text-[#1B8A80] hover:bg-[#f0f7fa] transition"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                      title={t('Delete')}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-[#9ca3af] hover:text-[#dc2626] hover:bg-[#fef2f2] transition"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Add slide */}
        <button
          onClick={onAdd}
          className="aspect-[16/10] rounded-2xl border-2 border-dashed border-[#d1d5db] hover:border-[#2C3079] hover:bg-[#F1F2FB] transition-all flex flex-col items-center justify-center gap-3 group"
        >
          <span className="w-12 h-12 rounded-full bg-[#f3f4f6] group-hover:bg-[#dcebe6] flex items-center justify-center text-[#9ca3af] group-hover:text-[#2C3079] transition-colors">
            <span className="material-symbols-outlined text-[26px]">add</span>
          </span>
          <span style={PJ} className="text-[13px] font-semibold text-[#6b7280] group-hover:text-[#2C3079]">{t('Add slide')}</span>
        </button>
      </div>
    </div>
  )
}
