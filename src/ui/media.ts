// The demo's pictures (design-system 1.1): a photo for each kind of job and an illustrated
// portrait for each person. All are self-hosted under public/img, because the CSP only allows
// images from Nod itself; sources and licences are in public/img/CREDITS.txt.
// The photos illustrate the kind of job; they aren't photos of the client's site.

export type Photo = {
  /** The 640 px file, for browsers that ignore srcset. */
  src: string
  srcSet: string
  /** A tiny blurred copy (about 170 bytes) shown while the photo loads. */
  placeholder: string
}

const photo = (name: string, placeholder: string): Photo => ({
  src: `/img/jobs/${name}-640.webp`,
  srcSet: `/img/jobs/${name}-640.webp 640w, /img/jobs/${name}-1280.webp 1280w`,
  placeholder,
})

const PHOTOS = {
  kitchen: photo(
    'kitchen',
    'data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAADwAQCdASoQAAoAAsBMJZACdADcoVKBP7gA/vYsUPToY+MUYO2T4/yk/0bgbHTLv9FoxDZS11goONogyjIp9UOVDlsqbc9R5VbL9OOPmwwnHxQRsieiYcAA',
  ),
  bathroom: photo(
    'bathroom',
    'data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAAAwAgCdASoQAAoAAsBMJZQCdAELz8kkpvxoAAD+3wt/DFEYU5wz+TGfYoJvTMZsdjN0pDPeol+gNaqqV9H8R0RpbkRd8JmEzzcAqHVcpSIAAA==',
  ),
  deck: photo(
    'deck',
    'data:image/webp;base64,UklGRnIAAABXRUJQVlA4IGYAAAAwAgCdASoQAAoAAsBMJbACdAEem3i01cY6AAD+6hoLj88J2OW6zFfyGKue5segV6myU2g99U4rdoru2OYONYOLE0LJdK17AmIpYkqI17btDNX7DPuR5Ur/cjlcA1wxr4+1ewFAAAA=',
  ),
} as const

/** The photo for a job, by what the job is ("Kitchen renovation"), or null for anything else. */
export function jobPhoto(title: string): Photo | null {
  const t = title.toLowerCase()
  if (t.includes('kitchen')) return PHOTOS.kitchen
  if (t.includes('bath') || t.includes('ensuite')) return PHOTOS.bathroom
  if (t.includes('deck') || t.includes('laundry') || t.includes('outdoor')) return PHOTOS.deck
  return null
}

/** Illustrated portraits for the demo's people (DiceBear Notionists, CC0). Others get initials. */
const PORTRAITS: Record<string, string> = {
  'Sarah Chen': '/img/avatars/sarah-chen.svg',
  'Tom Nguyen': '/img/avatars/tom-nguyen.svg',
  'Priya Shah': '/img/avatars/priya-shah.svg',
  Dan: '/img/avatars/dan.svg',
}

export const portraitFor = (name: string): string | null => PORTRAITS[name] ?? null
