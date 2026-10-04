// Sarah's card (ux-spec 7): one component for her page and for Dan's "What Sarah sees" preview,
// so the preview can't drift from the real thing (design-system principle 8). Built from
// shared/owner.ts, which already speaks her words (D78): "Adds $220 to the price", "Was $48,950".
import type { OwnerCard as Card } from '../../shared/owner.ts'
import { formatMoney } from '../../shared/money.ts'
import { owner } from '../../shared/copy.ts'
import { Button } from './Button.tsx'

export function OwnerCard({
  card,
  headingLevel = 2,
  photoUrl,
  onPhoto,
}: {
  card: Card
  headingLevel?: 2 | 3
  /** The photo Dan attached, as an object URL (D83). */
  photoUrl?: string | null
  /** Show it larger (Sarah's page: tap to enlarge). */
  onPhoto?: () => void
}) {
  const options = { cents: card.cents }
  const Title = headingLevel === 2 ? 'h2' : 'h3'
  // Alt text is the change's title (ux-spec 7); screen readers already say it's an image.
  const photoAlt = card.title || 'The change'
  return (
    <article className="owner-card" aria-label={owner.changeName(card.number)}>
      <p className="owner-card-kicker">{owner.changeName(card.number)}</p>
      <Title className="owner-card-title">{card.title || 'A change to your job'}</Title>
      {card.items.length ? (
        <ul className="owner-card-items">
          {card.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : null}
      {card.reason ? (
        <p className="owner-card-reason">
          <span className="owner-card-label-inline">Why: </span>
          {card.reason}
        </p>
      ) : null}
      {photoUrl ? (
        onPhoto ? (
          <button
            type="button"
            className="owner-photo"
            aria-label={`${photoAlt}. Show it larger.`}
            onClick={onPhoto}
          >
            <img src={photoUrl} alt="" />
          </button>
        ) : (
          <img className="owner-photo" src={photoUrl} alt={photoAlt} />
        )
      ) : null}
      {card.facts.length ? (
        <dl className="owner-facts">
          {card.facts.map((fact) => (
            <div key={fact.id}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="owner-total">
        <p className="owner-total-label">Your new contract total</p>
        {card.totals.after_cents === null ? (
          <p className="owner-total-pending">Shown once there’s a price</p>
        ) : (
          <p className="owner-total-figure t-money-total">
            {formatMoney(card.totals.after_cents, options)}
          </p>
        )}
        <p className="owner-total-was">Was {formatMoney(card.totals.before_cents, options)}</p>
        {card.saving ? <p className="owner-total-saving">{card.saving}</p> : null}
      </div>
    </article>
  )
}

/** Her three choices (D62). In Dan's preview they're drawn but inert: nothing to press there. */
export function OwnerActions({ builderName, inert }: { builderName: string; inert?: boolean }) {
  return (
    <div className="owner-actions" inert={inert}>
      <p className="owner-promise">{builderName} won’t start this work until you approve it.</p>
      <Button variant="dark" size={56} block>
        Approve
      </Button>
      <Button variant="outline" size={56} block>
        Ask a question
      </Button>
      <Button variant="outline" size={56} block className="owner-say-no">
        Say no
      </Button>
      <p className="owner-not-sure">
        Not sure? Ask {builderName} first. Nothing changes until you decide.
      </p>
    </div>
  )
}
