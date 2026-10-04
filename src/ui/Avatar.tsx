// A person's portrait on a soft tint: an illustration for the demo's people, initials for anyone
// else. Decorative: the name is always written beside it.
import { portraitFor } from './media.ts'

const TINTS = ['sky', 'sage', 'clay', 'amber'] as const

/** "Sarah Chen" -> "SC"; "Priya" -> "P". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** The same name always gets the same tint, so a person is recognisable across screens. */
function tintFor(name: string): (typeof TINTS)[number] {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
}

export function Avatar({
  name,
  size = 'md',
  ring,
}: {
  name: string
  size?: 'md' | 'lg'
  /** A white ring, for an avatar that overlaps a photo. */
  ring?: boolean
}) {
  const portrait = portraitFor(name)
  const px = size === 'lg' ? 64 : 48
  return (
    <span
      className={`avatar avatar-${tintFor(name)}${size === 'lg' ? ' avatar-lg' : ''}${ring ? ' avatar-ring' : ''}`}
      aria-hidden="true"
    >
      {portrait ? (
        <img src={portrait} alt="" width={px} height={px} decoding="async" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
