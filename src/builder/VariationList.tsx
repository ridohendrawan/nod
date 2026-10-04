// The Job screen's variation rows, newest first (ux-spec 2), on one white card. Each row opens
// the change (/v/:id): Review while it's a draft, Status once sent. Coming back is a real Back,
// so the list keeps its place and focus returns to the row.
import { Mic, PencilLine } from 'lucide-react'
import { Link } from 'react-router'
import { builder } from '../../shared/copy.ts'
import type { MoneyOptions } from '../../shared/money.ts'
import type { VariationRow as Row } from '../../shared/types.ts'
import { cx } from '../ui/cx.ts'
import { Skeleton } from '../ui/Skeleton.tsx'
import { StatusPill } from '../ui/StatusPill.tsx'
import { useFlashKey } from './liveFlash.ts'
import { backTo } from './nav.ts'

export function VariationList({
  variations,
  firstName,
  options,
  jobPath,
  fresh,
}: {
  variations: Row[]
  firstName: string
  options: MoneyOptions
  /** This job's screen, for the rows' Back. */
  jobPath: string
  /** Drafts that a note has just become: they flash once and carry a "New" tag. */
  fresh?: ReadonlySet<string>
}) {
  if (variations.length === 0) {
    return (
      <div className="card empty-state">
        <span className="empty-mark" aria-hidden="true">
          <Mic size={26} strokeWidth={2.25} />
        </span>
        <p>No variations yet. When something changes on site, tap Record a change and say it.</p>
      </div>
    )
  }
  return (
    <ul className="card variation-list">
      {variations.map((v) => (
        <li key={v.id}>
          <Link
            to={`/v/${v.id}`}
            state={backTo(jobPath)}
            className={cx('variation-row', fresh?.has(v.id) && 'is-fresh')}
          >
            <VariationRowBody
              variation={v}
              firstName={firstName}
              options={options}
              fresh={fresh?.has(v.id) ?? false}
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function VariationRowBody({
  variation: v,
  firstName,
  options,
  fresh,
}: {
  variation: Row
  firstName: string
  options: MoneyOptions
  fresh: boolean
}) {
  const price = builder.price(v.price_cents, options)
  const days = builder.days(v.delay_days)
  const { tone } = builder.status(v.status, firstName)
  const flash = useFlashKey(v.id)
  return (
    <>
      {flash ? <span key={flash} className="live-flash" aria-hidden="true" /> : null}
      {v.number === null ? (
        // A draft has no number yet; its chip already says "Draft", so the tile shows a pencil.
        <span className={`variation-tile tile-${tone}`} aria-hidden="true">
          <PencilLine size={20} strokeWidth={2.25} />
        </span>
      ) : (
        <span className={`variation-tile tile-${tone}`}>{builder.variationTag(v.number)}</span>
      )}
      <span className="variation-main">
        <span className="variation-title">
          {fresh ? <span className="new-tag">New</span> : null}
          {fresh ? <span className="visually-hidden">: </span> : null}
          {v.title || 'Untitled draft'}
        </span>
        <span className="variation-meta">
          {price ? (
            <span className="num">{price}</span>
          ) : (
            <span className="no-price">No price yet</span>
          )}
          {days ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="visually-hidden">, </span>
              <span>{days}</span>
            </>
          ) : null}
        </span>
      </span>
      <StatusPill status={v.status} firstName={firstName} />
    </>
  )
}

export function VariationListSkeleton() {
  return (
    <ul className="card variation-list" aria-hidden="true">
      {[0, 1].map((i) => (
        <li key={i}>
          <span className="variation-row is-skeleton">
            <Skeleton height={46} width={46} radius={14} />
            <span className="variation-main">
              <Skeleton height={18} width="70%" />
              <Skeleton height={16} width="45%" />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
