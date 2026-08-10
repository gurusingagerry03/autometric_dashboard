import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyBrandAccess, updateBrandAvatar } from '@/lib/brands/queries'
import { uploadAvatarFromUrl, uploadAvatarFromDataUri } from '@/lib/cloudinary/upload'

export const runtime = 'nodejs'

type Params = { params: Promise<{ brandId: string }> }

// Base64 balloons a file by ~33%, so this caps the original at roughly 2 MB.
const MAX_DATA_URI_CHARS = 2_800_000

const DATA_URI_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * PUT /api/brands/[brandId]/avatar
 *
 * Body is either `{ image: "data:image/png;base64,…" }` (a file the user picked)
 * or `{ url: "https://…" }` (an image address they pasted). Both are re-hosted on
 * Cloudinary so the brand avatar can't break when someone else's link rots — a
 * pasted URL falls back to being stored as-is when Cloudinary isn't configured.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const image = typeof body?.image === 'string' ? body.image.trim() : ''
    const url = typeof body?.url === 'string' ? body.url.trim() : ''

    if (!image && !url) {
      return NextResponse.json({ error: 'Provide an image file or an image URL.' }, { status: 400 })
    }

    let profileUrl: string | null = null

    if (image) {
      if (!DATA_URI_RE.test(image)) {
        return NextResponse.json({ error: 'That file is not a supported image.' }, { status: 400 })
      }
      if (image.length > MAX_DATA_URI_CHARS) {
        return NextResponse.json({ error: 'Image is too large — keep it under 2 MB.' }, { status: 400 })
      }
      profileUrl = await uploadAvatarFromDataUri(image, `brand_${brandId}`)
      if (!profileUrl) {
        return NextResponse.json({ error: 'Could not upload the image. Try again.' }, { status: 502 })
      }
    } else {
      if (!isHttpUrl(url)) {
        return NextResponse.json({ error: 'Enter a valid http(s) image address.' }, { status: 400 })
      }
      // Re-host when we can; otherwise keep the original link so the feature still works.
      profileUrl = (await uploadAvatarFromUrl(url, `brand_${brandId}`)) ?? url
    }

    await updateBrandAvatar(brandId, profileUrl)
    return NextResponse.json({ data: { id: brandId, profile_url: profileUrl } })
  } catch (err) {
    console.error('[PUT /api/brands/[brandId]/avatar]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// DELETE — clear the avatar; the UI falls back to the initials badge.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { brandId } = await params
    const orgId = await verifyBrandAccess(brandId, userId)
    if (!orgId) return NextResponse.json({ error: 'Brand not found.' }, { status: 404 })

    await updateBrandAvatar(brandId, null)
    return NextResponse.json({ data: { id: brandId, profile_url: null } })
  } catch (err) {
    console.error('[DELETE /api/brands/[brandId]/avatar]', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
