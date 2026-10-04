// The tick that draws itself once when Sarah approves (D75): a green circle and a white tick.
// Her page has no Nod logo, so it's a plain tick, not the mark. Decorative: the heading says it.
// (Literal colours: SVG presentation attributes don't reliably resolve CSS variables.)
export function TickMark() {
  return (
    <svg className="tick-mark" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="36" fill="#E3F2E8" />
      <circle cx="36" cy="36" r="26" fill="#137A3F" />
      <path
        className="tick-mark-path"
        d="M24 37.5 32.5 46 48.5 28"
        pathLength={1}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
