import type { CSSProperties } from 'react'

/** A placeholder block. Hidden from screen readers: the heading says what's happening.
 *  Pair it with useDelayed (useDelayed.ts) so fast responses never flash it. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
}: {
  height?: number
  width?: number | string
  radius?: number
}) {
  const style: CSSProperties = { height, width, borderRadius: radius }
  return <span className="skeleton" style={style} aria-hidden="true" />
}
