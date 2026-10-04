// Where a value came from (D64, D81): "You said ‘220 all up’" with Dan's words exactly as the
// recogniser wrote them (D51). Tapping it shows those words in the note. When nobody said a
// price, it says so plainly; when Dan's words were fuzzy, it offers his own number in one tap.
// The quote marks are real characters, not CSS ones, so screen readers say them too.
import { CircleAlert, Quote } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button.tsx'

/** "You said ‘220 all up’" (a button when it can show the words in the note). */
export function SourceLine({ quote, onShow }: { quote: string; onShow?: () => void }) {
  const said = `You said ‘${quote}’`
  const body = (
    <>
      <Quote size={16} strokeWidth={2.5} aria-hidden="true" />
      <span>{said}</span>
    </>
  )
  return onShow ? (
    <button
      type="button"
      className="source-line"
      aria-label={`${said}. Show it in your note.`}
      onClick={onShow}
    >
      {body}
    </button>
  ) : (
    <p className="source-line">{body}</p>
  )
}

/** Nobody said this value, and Nod never guesses one. */
export function SourceNone({ children }: { children: ReactNode }) {
  return (
    <p className="source-line is-none">
      <CircleAlert size={16} strokeWidth={2.5} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** One-tap answers built by code from Dan's own words (D81): "Use $150". */
export function SourceSuggestions({
  options,
}: {
  options: readonly { label: string; onPick: () => void }[]
}) {
  return (
    <div className="source-suggestions">
      {options.map((o) => (
        <Button key={o.label} variant="outline" size={48} onClick={o.onPick}>
          {o.label}
        </Button>
      ))}
    </div>
  )
}
