'use client'

import { useEffect, useRef, useState } from 'react'

const PJ = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/**
 * In-app modal for saving the current report as a reusable template — replaces the
 * browser's window.prompt. Owns the name field + loading/error state; the parent
 * supplies onSave (which performs the actual persistence) and returns a result.
 *
 * When the report was started from a saved template, `activeTemplate` is set and
 * the modal offers to overwrite it — otherwise picking a template back up to keep
 * working would leave a duplicate behind every time.
 */
export default function SaveTemplateModal({
  open, defaultName, onClose, onSave, activeTemplate,
}: {
  open: boolean
  defaultName: string
  onClose: () => void
  /** `templateId` is null for "save as new", or the id of the template to overwrite. */
  onSave: (name: string, templateId: string | null) => Promise<{ ok: boolean; error?: string }>
  activeTemplate?: { id: string; name: string } | null
}) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState<'update' | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset each time the modal opens, then focus the field. When a template is
  // loaded, its own name is the sensible default — the user is editing that one.
  useEffect(() => {
    if (!open) return
    setName(activeTemplate?.name ?? defaultName)
    setError(null)
    setSaving(null)
    const t = setTimeout(() => inputRef.current?.select(), 0)
    return () => clearTimeout(t)
  }, [open, defaultName, activeTemplate])

  if (!open) return null

  const busy = saving !== null
  const primaryMode: 'update' | 'new' = activeTemplate ? 'update' : 'new'
  const close = () => { if (!busy) onClose() }

  async function submit(mode: 'update' | 'new') {
    const trimmed = name.trim()
    if (!trimmed) { setError('Template name is required.'); return }
    setSaving(mode)
    setError(null)
    const res = await onSave(trimmed, mode === 'update' ? activeTemplate?.id ?? null : null)
    if (res.ok) { onClose(); return }
    setError(res.error ?? 'Could not save template.')
    setSaving(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-[#0f172a]/50 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[440px] p-7 rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,23,42,0.30)]">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-[#E6E7F3] text-[#2C3079] flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]">bookmark_add</span>
          </span>
          <div>
            <h2 style={PJ} className="text-[16px] font-bold text-[#0f172a]">
              {activeTemplate ? 'Save template' : 'Save as template'}
            </h2>
            <p className="text-[12.5px] text-[#94a3b8] mt-0.5 leading-snug">
              {activeTemplate
                ? <>You started from <span className="font-semibold text-[#475569]">{activeTemplate.name}</span>. Save your changes back onto it, or keep it and create a separate template.</>
                : 'Reuse this report’s structure (cover style + slides) for any brand or period.'}
            </p>
          </div>
        </div>

        <label style={PJ} className="block text-[12px] font-semibold text-[#475569] mb-1.5">Template name</label>
        <input
          ref={inputRef}
          value={name}
          onChange={e => { setName(e.target.value); if (error) setError(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') submit(activeTemplate ? 'update' : 'new')
            if (e.key === 'Escape') close()
          }}
          placeholder="e.g. Monthly performance report"
          disabled={busy}
          style={PJ}
          className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[13px] text-[#111827] bg-white focus:border-[#1B8A80] focus:outline-none disabled:bg-[#f9fafb]"
        />
        {error && <p className="text-[11.5px] text-[#dc2626] mt-1.5">{error}</p>}

        <div className="flex justify-end gap-2.5 mt-6">
          <button
            onClick={close}
            disabled={busy}
            style={PJ}
            className="px-4 py-2.5 rounded-lg text-[13px] font-bold text-[#475569] hover:bg-[#f1f3f5] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          {activeTemplate && (
            <button
              onClick={() => submit('new')}
              disabled={busy || !name.trim()}
              style={PJ}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold text-[#2C3079] border border-[#c9cbe4] hover:bg-[#f4f5fb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving === 'new' && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              {saving === 'new' ? 'Saving…' : 'Save as new'}
            </button>
          )}

          <button
            onClick={() => submit(primaryMode)}
            disabled={busy || !name.trim()}
            style={PJ}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold text-white bg-[#2C3079] hover:bg-[#20224F] shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving === primaryMode && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
            {saving === primaryMode ? 'Saving…' : activeTemplate ? 'Update template' : 'Save template'}
          </button>
        </div>
      </div>
    </div>
  )
}
