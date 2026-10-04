import { useEffect, useState } from 'react'

/**
 * A stored photo as an object URL for an <img> (D91: photos are Blobs in this browser; the CSP
 * allows blob: images). The URL is released when the photo changes or the screen goes.
 */
export function usePhotoUrl(
  photoId: string | null,
  load: (photoId: string) => Promise<Blob | undefined>,
): string | null {
  const [shown, setShown] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!photoId) return
    let url: string | null = null
    let gone = false
    void load(photoId).then((blob) => {
      if (gone || !blob) return
      url = URL.createObjectURL(blob)
      setShown({ id: photoId, url })
    })
    return () => {
      gone = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [photoId, load])
  return shown && shown.id === photoId ? shown.url : null
}
