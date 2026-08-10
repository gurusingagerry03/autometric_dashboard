import cloudinary from './client'

export async function uploadAvatarFromUrl(
  sourceUrl: string,
  publicId: string,
): Promise<string | null> {
  try {
    const result = await cloudinary.uploader.upload(sourceUrl, {
      folder:        'autometric/avatars',
      public_id:     publicId,
      overwrite:     true,
      resource_type: 'image',
    })
    return result.secure_url
  } catch (err) {
    console.error('[Cloudinary] avatar upload failed', err)
    return null
  }
}

/**
 * Uploads an avatar the user picked from their own machine, handed over as a
 * base64 data URI. Same folder/public-id scheme as uploadAvatarFromUrl, so a
 * brand's avatar keeps one stable Cloudinary id however it was set.
 */
export async function uploadAvatarFromDataUri(
  dataUri: string,
  publicId: string,
): Promise<string | null> {
  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder:        'autometric/avatars',
      public_id:     publicId,
      overwrite:     true,
      resource_type: 'image',
    })
    return result.secure_url
  } catch (err) {
    console.error('[Cloudinary] avatar data-uri upload failed', err)
    return null
  }
}

