'use client'

import { createContext, useContext } from 'react'
import type { AreaState, DataArea } from '@/lib/dashboard/dataAreas'

/**
 * Kesiapan data per-card saat sebuah brand baru pertama kali dihubungkan.
 *
 * MASALAH YANG DISELESAIKAN
 *   Sebelum ini, brand yang belum punya data sama sekali tidak menampilkan dashboard:
 *   seluruh tab diganti satu panel progres selayar penuh. User jadi menunggu di depan
 *   layar yang tidak memberi tahu apa pun soal isi yang akan datang, dan begitu panel
 *   hilang semua card muncul sekaligus.
 *
 *   Sekarang dashboard yang sebenarnya langsung tampil. Tiap card menyatakan area datanya
 *   sendiri, lalu menampilkan skeleton selama procedure pembangunnya belum sampai ke sana
 *   — dan terisi satu per satu seiring pipeline berjalan.
 *
 * KENAPA JUDUL CARD TETAP DITAMPILKAN SAAT SKELETON
 *   Skeleton yang menelan seluruh card menghilangkan satu-satunya informasi yang sudah
 *   pasti benar: nama metriknya. `Card` sengaja mempertahankan `CardHead` dan hanya
 *   mengganti isinya, jadi user tahu "Story Retention Funnel sedang dihitung", bukan
 *   sekadar melihat kotak abu-abu tanpa keterangan.
 *
 * KENAPA ADA `empty` TERPISAH DARI `building`
 *   Brand yang tidak pernah memakai Story tidak akan pernah punya baris di
 *   story_metric_daily. Tanpa pembeda ini, card-nya akan memutar skeleton selamanya.
 *   `empty` berarti procedure-nya sudah lewat dan memang tidak ada apa-apa — card
 *   menggambar empty state biasa. Lihat dataAreas.ts untuk cara membedakannya.
 */

/** Area yang BELUM siap. Absen = sudah ada datanya, gambar seperti biasa. */
const ReadinessContext = createContext<Partial<Record<DataArea, AreaState>>>({})

export function DataReadinessProvider({ areas, children }: {
  areas: Partial<Record<DataArea, AreaState>>
  children: React.ReactNode
}) {
  return <ReadinessContext.Provider value={areas}>{children}</ReadinessContext.Provider>
}

/**
 * Nasib area sebuah card. `undefined` (termasuk saat `area` tidak diisi) berarti tidak
 * ada yang perlu diubah — card menggambar isinya sendiri.
 */
export function useAreaState(area?: DataArea | null): AreaState | undefined {
  const areas = useContext(ReadinessContext)
  return area ? areas[area] : undefined
}

/**
 * Masih ada area yang tabelnya sedang dibangun pipeline.
 *
 * Dipakai tab untuk memutuskan antara "belum ada apa-apa, tunggu" dan "memang tidak ada
 * apa-apa". Tiap tab berhenti lebih awal dengan pesan "No data for this filter yet."
 * begitu payload-nya kosong — dan untuk brand yang baru connect, pesan itu SALAH: datanya
 * bukan tidak ada, tapi belum selesai dibangun. Selama masih ada yang dibangun, tab
 * menampilkan TabSkeleton sebagai gantinya.
 */
export function useAnyBuilding(): boolean {
  const areas = useContext(ReadinessContext)
  return Object.values(areas).some(v => v === 'building')
}

/* ── Bentuk skeleton ──────────────────────────────────────────────────────── */

/**
 * Bentuk isi card, supaya placeholder-nya menyerupai yang akan menggantikannya dan tata
 * letak tidak melompat saat data datang.
 */
export type SkeletonKind = 'chart' | 'table' | 'kpi' | 'text'

const BAR = 'bg-[#eef0f2] rounded'

function Bar({ w, h = 'h-2.5', className = '' }: { w: string; h?: string; className?: string }) {
  return <div className={`${BAR} ${h} ${className}`} style={{ width: w }} />
}

/** Tinggi batang chart palsu — sengaja tidak acak supaya tidak berubah tiap render. */
const CHART_BARS = [52, 74, 41, 88, 63, 79, 48, 92, 57, 70, 45, 83]

export function CardSkeleton({ kind = 'chart' }: { kind?: SkeletonKind }) {
  if (kind === 'kpi') {
    return (
      <div className="px-4 pb-4 pt-1 animate-pulse flex flex-col gap-2.5">
        <Bar w="45%" h="h-2" />
        <Bar w="60%" h="h-6" />
        <Bar w="30%" h="h-3" />
      </div>
    )
  }

  if (kind === 'table') {
    return (
      <div className="animate-pulse">
        <div className="flex gap-2 px-4 py-2.5 border-y border-[#eef0f2] bg-[#fafbfb]">
          {['18%', '26%', '14%', '14%'].map((w, i) => <Bar key={i} w={w} h="h-2" />)}
        </div>
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2 px-4 py-3 border-b border-[#f3f4f6] last:border-0">
              <div className={`${BAR} w-6 h-6 rounded-full flex-shrink-0`} />
              <Bar w="30%" />
              <div className="flex-1" />
              <Bar w="12%" />
              <Bar w="12%" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === 'text') {
    return (
      <div className="px-4 pb-4 pt-1 animate-pulse flex flex-col gap-2">
        <Bar w="92%" /><Bar w="86%" /><Bar w="64%" />
      </div>
    )
  }

  // chart — batang setinggi area plot, ditutup deretan label sumbu palsu.
  return (
    <div className="px-4 pb-4 pt-2 animate-pulse">
      <div className="flex items-end gap-1.5 h-[150px]">
        {CHART_BARS.map((h, i) => (
          <div key={i} className={`${BAR} flex-1`} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex justify-between mt-2.5">
        {[0, 1, 2, 3, 4, 5].map(i => <Bar key={i} w="8%" h="h-1.5" />)}
      </div>
    </div>
  )
}

/** Card kosong lengkap dengan judul palsu, untuk TabSkeleton. */
function GhostCard({ kind, className = '' }: { kind: SkeletonKind; className?: string }) {
  return (
    <div className={`bg-white border border-[#e5e7eb] rounded-xl ${className}`}>
      {kind !== 'kpi' && (
        <div className="px-4 pt-3.5 pb-2 animate-pulse flex flex-col gap-1.5">
          <Bar w="38%" h="h-3" />
          <Bar w="55%" h="h-2" />
        </div>
      )}
      <CardSkeleton kind={kind} />
    </div>
  )
}

/**
 * Bentuk seluruh tab saat brand baru belum punya data apa pun.
 *
 * Dipakai menggantikan pesan "No data for this filter yet." selama pipeline masih
 * membangun. Sengaja generik — pada titik ini tab belum menerima payload, jadi judul
 * card yang sebenarnya belum diketahui. Yang penting tersampaikan: halaman ini akan
 * terisi, dan bentuknya kira-kira begini.
 */
export function TabSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[0, 1, 2, 3].map(i => <GhostCard key={i} kind="kpi" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {[0, 1].map(i => <GhostCard key={i} kind="chart" />)}
      </div>
      <GhostCard kind="table" />
    </>
  )
}
