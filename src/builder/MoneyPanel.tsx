// Dan's money: the ink instrument card (design-system 1.1 and 7). One hero number, a ring that
// shows how many sent changes are signed (Nod's north star: signed before the work starts), the
// ledger, and the money still waiting on the client in amber. A changing total counts up (D75);
// screen readers get the final amount, never the frames in between.
import { CalendarClock, CircleCheck, FileText, Hourglass } from 'lucide-react'
import { builder } from '../../shared/copy.ts'
import { formatMoney, formatSignedMoney, type MoneyOptions } from '../../shared/money.ts'
import type { MoneySummary } from '../../shared/summary.ts'
import { MoneyFigure } from '../ui/MoneyFigure.tsx'
import { Skeleton } from '../ui/Skeleton.tsx'
import { useCountUp } from '../ui/useCountUp.ts'

export function MoneyPanel({
  money,
  firstName,
  options,
}: {
  money: MoneySummary
  firstName: string
  options: MoneyOptions
}) {
  const shown = useCountUp(money.total_cents)
  const sent = money.approved_count + money.waiting_count
  return (
    <section className="money-panel" aria-label="Money">
      <div className="money-top">
        <p className="money-hero">
          <span className="money-hero-label">Contract total now</span>
          <MoneyFigure
            cents={money.total_cents}
            shown={shown}
            options={options}
            className="t-money-hero"
          />
        </p>
        {sent > 0 ? <SignedRing signed={money.approved_count} of={sent} /> : null}
      </div>
      <dl className="money-rows">
        <div>
          <dt>
            <FileText size={18} strokeWidth={2} aria-hidden="true" />
            Original contract
          </dt>
          <dd>{formatMoney(money.original_cents, options)}</dd>
        </div>
        <div>
          <dt>
            <CircleCheck size={18} strokeWidth={2} aria-hidden="true" />
            Approved changes ({money.approved_count})
          </dt>
          <dd>{formatSignedMoney(money.approved_cents, options)}</dd>
        </div>
        <div>
          <dt>
            <CalendarClock size={18} strokeWidth={2} aria-hidden="true" />
            Extra working days
          </dt>
          <dd>{builder.days(money.approved_days)}</dd>
        </div>
      </dl>
      {money.waiting_count > 0 ? (
        <div className="money-waiting">
          <span className="money-waiting-icon" aria-hidden="true">
            <Hourglass size={18} strokeWidth={2.25} />
          </span>
          <p className="money-waiting-label">
            Waiting on {firstName} ({money.waiting_count})
          </p>
          <p className="money-waiting-value">{formatSignedMoney(money.waiting_cents, options)}</p>
          <p className="money-if">
            If {firstName} approves: {formatMoney(money.if_approved_cents, options)}
          </p>
        </div>
      ) : null}
    </section>
  )
}

const R = 40
const C = 2 * Math.PI * R

/** "1 of 2 signed": an amber arc for the signed share of the changes this job has sent. */
function SignedRing({ signed, of }: { signed: number; of: number }) {
  const share = of > 0 ? signed / of : 0
  return (
    <p className="signed-ring">
      {/* Literal colours: SVG presentation attributes don't reliably resolve CSS variables. */}
      <svg viewBox="0 0 92 92" aria-hidden="true" focusable="false">
        <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
        {share > 0 ? (
          <circle
            cx="46"
            cy="46"
            r={R}
            fill="none"
            stroke="#FFB800"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${share >= 1 ? C : Math.max(0.0001, share * C - 4)} ${C}`}
            transform="rotate(-90 46 46)"
          />
        ) : null}
      </svg>
      <span className="signed-ring-text">
        <span className="signed-ring-count">
          {signed} of {of}
        </span>
        <span className="signed-ring-word">signed</span>
      </span>
    </p>
  )
}

export function MoneyPanelSkeleton() {
  return (
    <div className="money-panel is-skeleton" aria-hidden="true">
      <Skeleton height={14} width="40%" />
      <Skeleton height={44} width="62%" radius={10} />
      <Skeleton height={16} width="100%" />
      <Skeleton height={16} width="100%" />
      <Skeleton height={16} width="100%" />
    </div>
  )
}
