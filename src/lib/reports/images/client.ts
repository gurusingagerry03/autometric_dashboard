// Sisi browser dari resolver gambar report (lihat ./resolve).
//
// Setiap slide Visual Content meminta gambar untuk kartunya sendiri, dan exporter
// PPTX meminta lagi untuk semua slide. Permintaan dalam satu tick digabung jadi
// satu request, dan hasilnya diingat per key selama halaman terbuka — jadi
// preview dan export tidak pernah memicu scrape yang sama dua kali.
import { MAX_IMAGE_KEYS } from './keys'

export type ImageResolver = (keys: string[]) => Promise<Record<string, string | null>>

const memo = new Map<string, Promise<string | null>>()

export function createImageResolver(orgId: string, brandId: string): ImageResolver {
  let queue: { key: string; resolve: (v: string | null) => void }[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    const batch = queue
    queue = []
    for (let i = 0; i < batch.length; i += MAX_IMAGE_KEYS) {
      const chunk = batch.slice(i, i + MAX_IMAGE_KEYS)
      fetch(`/api/organizations/${orgId}/reports/post-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandId, keys: chunk.map(q => q.key) }),
      })
        .then(r => (r.ok ? r.json() : { images: {} }))
        .then((d: { images?: Record<string, string | null> }) => {
          for (const q of chunk) q.resolve(d.images?.[q.key] ?? null)
        })
        .catch(err => {
          console.error('[report] post images failed:', err)
          for (const q of chunk) q.resolve(null)
        })
    }
  }

  const one = (key: string): Promise<string | null> => {
    const id = `${orgId}|${brandId}|${key}`
    let p = memo.get(id)
    if (!p) {
      p = new Promise<string | null>(resolve => {
        queue.push({ key, resolve })
        if (!timer) timer = setTimeout(flush, 30)
      })
      // Gagal (null) tidak diingat: report yang dibuka lagi boleh mencoba ulang —
      // jeda untuk post yang memang tidak bisa diambil dijaga di server.
      p.then(v => { if (v === null) memo.delete(id) })
      memo.set(id, p)
    }
    return p
  }

  return async keys => {
    const uniq = [...new Set(keys)]
    const vals = await Promise.all(uniq.map(one))
    return Object.fromEntries(uniq.map((k, i) => [k, vals[i]]))
  }
}
