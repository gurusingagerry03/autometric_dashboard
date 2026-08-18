'use client'

import { useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useBrandDetail } from './BrandDetailContext'
import BrandAvatar from '../BrandAvatar'
import { useT } from '@/lib/i18n/LanguageContext'

const PJB = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const

/** Matches the server's cap (~2 MB before base64 inflates it by a third). */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

export default function BrandSettingsTab() {
  const t = useT()
  const { brand, updateBrandName, updateBrandAvatar, deleteBrand } = useBrandDetail()
  const router  = useRouter()
  const params  = useParams()
  const orgSlug = params?.orgSlug as string

  const [name,        setName]        = useState(brand.name)
  const [saved,       setSaved]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Avatar
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarUrl,   setAvatarUrl]   = useState('')
  const [avatarBusy,  setAvatarBusy]  = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const isDirty = name.trim() !== brand.name

  async function runAvatar(action: () => Promise<void>) {
    setAvatarBusy(true)
    setAvatarError(null)
    try {
      await action()
      // The avatar also shows on server-rendered surfaces (brand list, sidebar),
      // so refresh those rather than leaving a stale picture behind.
      router.refresh()
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : t('Could not update the avatar.'))
    } finally {
      setAvatarBusy(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again after an error
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError(t('Pick an image file.')); return }
    if (file.size > MAX_AVATAR_BYTES)    { setAvatarError(t('Image is too large — keep it under 2 MB.')); return }

    const reader = new FileReader()
    reader.onerror = () => setAvatarError(t('Could not read that file.'))
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : ''
      if (image) runAvatar(() => updateBrandAvatar({ image }))
    }
    reader.readAsDataURL(file)
  }

  function handleUrl() {
    const url = avatarUrl.trim()
    if (!url) return
    runAvatar(async () => {
      await updateBrandAvatar({ url })
      setAvatarUrl('')
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateBrandName(name.trim())
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    await deleteBrand()
    router.push(`/organizations/${orgSlug}/brands`)
  }

  return (
    <div className="w-full max-w-3xl">

      {/* General */}
      <div className="w-full border-b border-[#e5e7eb] pb-6">
        <div className="py-5">
          <span style={PJB} className="text-[11px] font-bold uppercase tracking-widest text-[#9ca3af]">{t('General')}</span>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <BrandAvatar brand={{ ...brand, name }} size={64} />

          <div className="flex-1 min-w-0">
            <p style={PJB} className="text-[16px] font-bold text-[#111827]">{name || t('Brand name')}</p>
            <p className="text-[12px] text-[#9ca3af] mt-0.5">{brand.accounts.length} channels · {brand.competitors.length} competitors</p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                style={PJB}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-semibold border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-outlined text-[15px] ${avatarBusy ? 'animate-spin' : ''}`}>
                  {avatarBusy ? 'progress_activity' : 'upload'}
                </span>
                {avatarBusy ? t('Working…') : t('Upload image')}
              </button>

              {brand.profile_url && (
                <button
                  onClick={() => runAvatar(() => updateBrandAvatar(null))}
                  disabled={avatarBusy}
                  style={PJB}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-semibold text-[#dc2626] hover:bg-[#fef2f2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <input
                type="url"
                value={avatarUrl}
                onChange={e => { setAvatarUrl(e.target.value); setAvatarError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleUrl() }}
                placeholder={t('…or paste an image address (https://…)')}
                disabled={avatarBusy}
                style={{ ...PJB, width: '100%', maxWidth: '20rem' }}
                className="h-8 px-3 text-[12.5px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#1B8A80] focus:ring-1 focus:ring-[#1B8A80]/20 transition disabled:bg-[#f9fafb]"
              />
              <button
                onClick={handleUrl}
                disabled={avatarBusy || !avatarUrl.trim()}
                style={PJB}
                className="h-8 px-3 rounded-lg text-[12.5px] font-semibold border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use link
              </button>
            </div>

            {avatarError
              ? <p className="text-[11.5px] text-[#dc2626] mt-1.5">{avatarError}</p>
              : <p className="text-[11.5px] text-[#9ca3af] mt-1.5">PNG, JPG, GIF or WebP · up to 2 MB. Leave it empty to show the brand’s initials.</p>}
          </div>
        </div>

        <div className="w-full mb-5">
          <label style={PJB} className="block text-[12px] font-semibold text-[#374151] mb-1.5">{t('Brand Name')}</label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false) }}
            style={{ ...PJB, width: '100%', maxWidth: '24rem' }}
            className="h-9 px-3 text-[13.5px] border border-[#e5e7eb] rounded-lg focus:outline-none focus:border-[#1B8A80] focus:ring-1 focus:ring-[#1B8A80]/20 transition"
          />
        </div>

        <button onClick={handleSave} disabled={(!isDirty && !saved) || saving} style={PJB}
          className={`flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold transition-all ${
            saved
              ? 'bg-[#ecfdf5] text-[#059669] border border-[#059669]/20'
              : isDirty
              ? 'bg-[#1B8A80] hover:bg-[#177A70] text-white'
              : 'bg-[#f3f4f6] text-[#9ca3af] cursor-not-allowed'
          }`}>
          {saved
            ? <><span className="material-symbols-outlined text-[15px]">check</span> {t('Saved')}</>
            : <><span className="material-symbols-outlined text-[15px]">save</span> {saving ? t('Saving…') : t('Save Changes')}</>
          }
        </button>
      </div>

      {/* Danger Zone */}
      <div className="py-5">
        <span style={PJB} className="text-[11px] font-bold uppercase tracking-widest text-[#dc2626]">{t('Danger Zone')}</span>

        <div className="mt-4 border border-[#fca5a5] rounded-xl px-5 py-4 flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p style={PJB} className="text-[13.5px] font-semibold text-[#111827]">{t('Delete this brand')}</p>
            <p className="text-[12.5px] text-[#9ca3af] mt-0.5">
              Permanently remove <span className="font-medium text-[#6b7280]">{brand.name}</span> and all its data. This cannot be undone.
            </p>
          </div>

          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)} style={PJB}
              className="flex-shrink-0 flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold border border-[#fca5a5] text-[#dc2626] hover:bg-[#fef2f2] transition-colors">
              <span className="material-symbols-outlined text-[15px]">delete</span>
              Delete Brand
            </button>
          ) : (
            <div className="flex-shrink-0 flex items-center gap-2">
              <span style={PJB} className="text-[12px] text-[#9ca3af]">{t('Are you sure?')}</span>
              <button onClick={() => setShowConfirm(false)} style={PJB}
                className="h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} style={PJB}
                className="h-8 px-3 text-[12px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-lg transition-colors">
                Yes, delete
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
