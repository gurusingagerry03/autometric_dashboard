// Kunci gambar post untuk report — dipakai bersama oleh query (server), resolver
// (server), dan slide/exporter (browser), jadi file ini tidak boleh mengimpor
// apa pun yang hanya ada di server.
//
// Bentuknya `<kind>:<platform>:<post_id>`:
//   b = post milik brand (l1_silver.unified_post)
//   c = post kompetitor  (l0_raw.*_competitor_media)
// post_id ditaruh paling belakang karena isinya bebas (id Facebook memuat '_').

export type ImageKind = 'b' | 'c'

/** Batas key per request — satu report paling banyak memuat beberapa puluh kartu. */
export const MAX_IMAGE_KEYS = 60

export interface ImageRef {
  kind: ImageKind
  platform: string
  postId: string
}

export const imageKey = (kind: ImageKind, platform: string, postId: string) =>
  `${kind}:${platform}:${postId}`

export function parseImageKey(key: string): ImageRef | null {
  const m = /^([bc]):(instagram|tiktok|facebook):(.+)$/.exec(key)
  return m ? { kind: m[1] as ImageKind, platform: m[2], postId: m[3] } : null
}

/** Sudah tersimpan permanen di Cloudinary — tidak perlu diselesaikan lagi. */
export const isStoredImage = (url: string | null | undefined) =>
  !!url && url.includes('res.cloudinary.com')
