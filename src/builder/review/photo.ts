// Getting a site photo ready on the phone (D83): any photo the browser can open becomes a JPEG
// of 1,600 px or less at quality 0.8, stepping down until it's under 2 MB, before it's stored.
// Each failure has its own plain words, including HEIC files a browser can't open.

/** A reason the photo can't be used, in words Dan can act on. */
export class PhotoError extends Error {}

const MAX_BYTES = 2 * 1024 * 1024
const HEIC = /\.(heic|heif)$/i
const STEPS: readonly [edge: number, quality: number][] = [
  [1600, 0.8],
  [1600, 0.7],
  [1280, 0.7],
  [1024, 0.65],
]

export const NOT_A_PHOTO = 'That file isn’t a photo. Choose a JPEG, PNG or HEIC photo.'
export const NO_HEIC =
  'This browser can’t open HEIC photos. Take the photo in Nod, or choose a JPEG.'
export const COULD_NOT_USE = 'Nod couldn’t use that photo. Try taking it again.'

const isHeic = (file: File) =>
  file.type === 'image/heic' || file.type === 'image/heif' || HEIC.test(file.name)

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new PhotoError(NOT_A_PHOTO)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoError(isHeic(file) ? NO_HEIC : COULD_NOT_USE)
  }
  try {
    for (const [edge, quality] of STEPS) {
      const blob = await draw(bitmap, edge, quality)
      if (blob.size <= MAX_BYTES) return blob
    }
    throw new PhotoError(COULD_NOT_USE)
  } finally {
    bitmap.close()
  }
}

function draw(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new PhotoError(COULD_NOT_USE))
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoError(COULD_NOT_USE))),
      'image/jpeg',
      quality,
    ),
  )
}
