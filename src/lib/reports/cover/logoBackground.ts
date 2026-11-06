// Logo brand dengan latar transparan (Post-UAT least priority: "Logo kalo bisa
// transparent background"). Logo yang dimuat otomatis adalah foto profil akun
// (JPG persegi berlatar putih/berwarna), jadi di cover dan footer slide ia
// tampil sebagai kotak. Di sini latar itu dibuang di browser — tanpa layanan luar.
//
// Caranya: warna tepi gambar dibaca; kalau sebagian besar tepinya satu warna
// (latar polos), area berwarna itu yang TERSAMBUNG ke tepi di-flood-fill jadi
// transparan. Warna sama yang tertutup di dalam logo (mis. lubang huruf "O"
// yang tidak menyentuh tepi) tidak ikut terhapus kecuali tersambung. Piksel
// peralihan di batas diberi alpha sebagian supaya tepinya tidak bergerigi.
//
// Mengembalikan null kalau tidak ada yang perlu/bisa dibuang: gambar sudah
// transparan, latarnya tidak polos (foto), atau hampir seluruh gambar adalah
// "latar" (logo yang warnanya sama dengan latarnya).

const MAX_SIDE = 1024
/** Jarak warna (RGB euclid) yang masih dianggap latar. */
const TOL = 42
/** Di atas TOL s.d. TOL + FEATHER → alpha sebagian (anti-aliasing tepi). */
const FEATHER = 38

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function removeLogoBackground(src: string): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const img = await loadImage(src)
  if (!img) return null
  const iw = img.naturalWidth, ih = img.naturalHeight
  if (!iw || !ih) return null
  const k = Math.min(1, MAX_SIDE / Math.max(iw, ih))
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  let data: ImageData
  try { data = ctx.getImageData(0, 0, w, h) } catch { return null }
  const px = data.data

  // ── Tepi gambar ──────────────────────────────────────────────────────────
  const border: number[] = []
  for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x) }
  for (let y = 1; y < h - 1; y++) { border.push(y * w, y * w + w - 1) }
  // Sudah transparan di tepinya → biarkan apa adanya.
  const clear = border.filter(i => px[i * 4 + 3] < 250).length
  if (clear / border.length > 0.1) return null

  const med = (c: number) => {
    const v = border.map(i => px[i * 4 + c]).sort((a, b) => a - b)
    return v[v.length >> 1]
  }
  const bg = [med(0), med(1), med(2)]
  const dist = (i: number) => {
    const o = i * 4
    const dr = px[o] - bg[0], dg = px[o + 1] - bg[1], db = px[o + 2] - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db)
  }
  // Latar polos = mayoritas tepi berwarna itu. Foto/gradien → batal.
  const uniform = border.filter(i => dist(i) <= TOL).length / border.length
  if (uniform < 0.6) return null

  // ── Flood fill dari tepi ─────────────────────────────────────────────────
  const n = w * h
  const state = new Uint8Array(n) // 0 belum, 1 latar, 2 sudah diantre
  const queue = new Int32Array(n)
  let head = 0, tail = 0
  for (const i of border) if (state[i] === 0 && dist(i) <= TOL) { state[i] = 2; queue[tail++] = i }
  let filled = 0
  while (head < tail) {
    const i = queue[head++]
    state[i] = 1; filled++
    const x = i % w, y = (i / w) | 0
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
    for (const j of nb) {
      if (j >= 0 && state[j] === 0 && dist(j) <= TOL) { state[j] = 2; queue[tail++] = j }
    }
  }
  // Tidak ada latar berarti, atau hampir semuanya latar (logo hilang).
  if (filled / n < 0.04 || filled / n > 0.96) return null

  for (let i = 0; i < n; i++) {
    if (state[i] === 1) { px[i * 4 + 3] = 0; continue }
    // Piksel di batas latar: makin mirip warna latar, makin transparan.
    const x = i % w, y = (i / w) | 0
    const touches = (x > 0 && state[i - 1] === 1) || (x < w - 1 && state[i + 1] === 1)
      || (y > 0 && state[i - w] === 1) || (y < h - 1 && state[i + w] === 1)
    if (!touches) continue
    const d = dist(i)
    if (d < TOL + FEATHER) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * ((d - TOL) / FEATHER) ** 0.8)
  }
  ctx.putImageData(data, 0, 0)

  // Pangkas area kosong supaya logo tidak tampak mengecil di kotaknya.
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < x0 || y1 < y0) return null
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02)
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}
