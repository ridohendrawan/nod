import type { Photo } from './media.ts'

/**
 * A job's photo, cover-cropped into its box. A tiny blurred copy fills the box at once, so the
 * layout never jumps and the colours arrive before the pixels. Decorative: the job is named
 * in text beside it.
 */
export function JobPhoto({
  photo,
  sizes,
  className,
  priority,
}: {
  photo: Photo
  /** How wide the photo shows, so the browser picks the 640 or the 1280 file. */
  sizes: string
  className?: string
  /** The screen's main image: load it first. */
  priority?: boolean
}) {
  return (
    <span className={className} style={{ backgroundImage: `url("${photo.placeholder}")` }}>
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        alt=""
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </span>
  )
}
