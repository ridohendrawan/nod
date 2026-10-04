/** Nod's mark: a happy home (Rido's call, 4 Oct; it replaced a head and tick that read as a
 *  checkbox). Every variation is a change to someone's home, and Nod gets it agreed before the
 *  work starts, so the house smiles. On "Ready for Sarah" it nods once.
 *  (Colours are literal: SVG presentation attributes don't reliably resolve CSS variables.) */
const MARK_SQUIRCLE = 'M32 0C55 0 64 9 64 32S55 64 32 64 0 55 0 32 9 0 32 0Z'
const MARK_HOUSE = 'M32 12.5 51 28v19.5a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V28z'
const MARK_EYES = 'M23.8 35.2q3-3.4 6 0M34.2 35.2q3-3.4 6 0'
const MARK_SMILE = 'M27.4 41.2q4.6 4 9.2 0'
const INK = '#14161A'
const AMBER = '#FFB800'

export function Logo({
  size = 32,
  draw,
}: {
  size?: 24 | 32 | 40 | 48 | 56
  /** The mark's one moment (D75): the house nods once, on "Ready for Sarah". */
  draw?: boolean
}) {
  return (
    <svg
      className={draw ? 'logo is-drawing' : 'logo'}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path d={MARK_SQUIRCLE} fill={INK} />
      <g className="logo-home">
        <rect x="39.5" y="14" width="6" height="11" rx="1.5" fill={AMBER} />
        <path d={MARK_HOUSE} fill={AMBER} stroke={AMBER} strokeWidth="3" strokeLinejoin="round" />
        <path
          d={`${MARK_EYES}${MARK_SMILE}`}
          fill="none"
          stroke={INK}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
