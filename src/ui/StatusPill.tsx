import { builder, type Tone, type VariationStatus } from '../../shared/copy.ts'

/** Status is never colour alone: every chip has a word, and a dot as a backup (WCAG 1.4.1).
 *  Question and "said no" are solid, because Dan has to act on them. */
export function StatusPill({ status, firstName }: { status: VariationStatus; firstName: string }) {
  const { text, tone } = builder.status(status, firstName)
  const solid = status === 'question' || status === 'declined'
  return <span className={`pill pill-${tone}${solid ? ' pill-solid' : ''}`}>{text}</span>
}

/** A chip with any words in a tone, for summaries like "1 waiting on Sarah". */
export function TonePill({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}
