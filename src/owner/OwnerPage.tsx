// Sarah's page (/o/:token; ux-spec 7, D62): decide about one change, calmly, in under a minute,
// and keep a record. It reads like a payment approval: who it's from, what changes, the price
// and her new total in words (D78), then three full-size choices. Nothing of Dan's app is in
// this bundle (D86), and there's no Nod logo: it's the business's page.
import { Check, CircleAlert, Copy, Link2Off, Phone } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { formatShortTime } from '../../shared/time.ts'
import type { OwnerView } from '../../shared/types.ts'
import { announce } from '../lib/announce.ts'
import { ownerApi } from '../lib/ownerApi.ts'
import { Button } from '../ui/Button.tsx'
import { Callout } from '../ui/Callout.tsx'
import { OwnerCard } from '../ui/OwnerCard.tsx'
import { Sheet } from '../ui/Sheet.tsx'
import { Skeleton } from '../ui/Skeleton.tsx'
import { usePhotoUrl } from '../ui/usePhotoUrl.ts'
import { useDelayed } from '../ui/useDelayed.ts'
import { ApproveSheet, AskSheet, SayNoSheet, type Conflict } from './OwnerSheets.tsx'
import { TickMark } from './TickMark.tsx'
import { tokenFromPath, useOwnerView, useSeenBeacon } from './useOwnerView.ts'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "BR" for Brightside Renovations: the business's monogram, standing in for a logo. */
const monogram = (business: string) =>
  business
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

type Sheet = 'approve' | 'ask' | 'no' | null

export function OwnerPage() {
  const [token] = useState(() => tokenFromPath(location.pathname))
  const [notice, setNotice] = useState<string | null>(null)
  const { state, reload, accept } = useOwnerView(token, (prev, next) => {
    // Live news while she reads (D79): said once, never while she's typing in a sheet.
    const lastNew = next.thread.at(-1)
    if (next.thread.length > prev.thread.length && lastNew?.from === 'builder') {
      announce(`${next.card.builder_name} replied.`)
    } else if (next.version > prev.version) {
      announce(`${next.card.builder_name} updated this change.`)
    } else if (next.status === 'withdrawn' && prev.status !== 'withdrawn') {
      announce(`${next.card.builder_name} withdrew this change.`)
    }
  })
  const view = state.kind === 'ready' ? state.view : null
  useSeenBeacon(view)

  const photoUrl = usePhotoUrl(view?.card.photo_id ?? null, ownerApi.photo)
  const [photoOpen, setPhotoOpen] = useState(false)

  // What she types survives a closed sheet (D71).
  const [sheet, setSheet] = useState<Sheet>(null)
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [question, setQuestion] = useState('')
  const [reason, setReason] = useState('')

  // After her answer, focus moves to the new page's heading, so she hears what happened. Two
  // frames: the first lets React put the new heading in place.
  const heading = useRef<HTMLHeadingElement>(null)
  const focusHeading = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => heading.current?.focus()))

  useEffect(() => {
    document.title = view
      ? `Change ${view.number} to your ${lowerFirst(view.card.job_title)}`
      : 'A change to your job'
  }, [view])

  const conflict = (why: Conflict) => {
    setSheet(null)
    setAgreed(false) // a new version needs a new tick; her typed name is kept
    if (why === 'changed') {
      setNotice('changed')
      announce('This change was updated. Check the new version before you approve.')
    } else {
      announce('This change has already been answered. Here’s the record.')
    }
    void reload()
  }

  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'missing') return <LinkNotWorking />
  if (state.kind === 'failed') return <CouldNotLoad onRetry={() => void reload()} />
  const v = state.view
  const builder = v.card.builder_name
  const open = v.status === 'sent' || v.status === 'question'

  return (
    <div className="owner-shell">
      <OwnerHeader business={v.card.business_name} />
      <main className="owner-page">
        {v.status === 'approved' ? (
          <Approved view={v} headingRef={heading} />
        ) : v.status === 'declined' ? (
          <Declined view={v} headingRef={heading} />
        ) : v.status === 'withdrawn' ? (
          <Withdrawn view={v} headingRef={heading} />
        ) : (
          <>
            <div className="owner-intro">
              <p className="owner-hello">Hi {v.card.client_first_name},</p>
              <h1 ref={heading} tabIndex={-1} className="owner-title">
                {builder} from {v.card.business_name} needs your OK on a change to your{' '}
                {lowerFirst(v.card.job_title)}.
              </h1>
            </div>

            {/* D68: what changed, in words. After a refused approval it also says to check. */}
            {v.update ? (
              <Callout
                tone="ask"
                title={`${builder} updated this change at ${formatShortTime(new Date(v.update.at), v.card.state)}.`}
              >
                {notice === 'changed' ? <p>Check the new version before you approve.</p> : null}
                {v.update.changes.length ? (
                  <ul className="owner-changes">
                    {v.update.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </Callout>
            ) : notice === 'changed' ? (
              <Callout tone="ask" title={`${builder} has updated this change.`}>
                Check the new version before you approve.
              </Callout>
            ) : null}
            {v.replaces ? (
              <Callout tone="neutral">
                This replaces Change {v.replaces.number}, which you said no to.
              </Callout>
            ) : null}
            <Others view={v} />

            <OwnerCard card={v.card} photoUrl={photoUrl} onPhoto={() => setPhotoOpen(true)} />
            <Thread view={v} />

            {open ? (
              <ChoiceButtons
                builder={builder}
                onApprove={() => setSheet('approve')}
                onAsk={() => setSheet('ask')}
                onNo={() => setSheet('no')}
              />
            ) : null}
          </>
        )}
        <Help view={v} />
        <Footer builder={builder} />
      </main>

      {photoUrl ? (
        <Sheet open={photoOpen} onOpenChange={setPhotoOpen} title="Photo">
          <img className="photo-large" src={photoUrl} alt={v.card.title} />
        </Sheet>
      ) : null}
      {open ? (
        <>
          <ApproveSheet
            open={sheet === 'approve'}
            onOpenChange={(o) => setSheet(o ? 'approve' : null)}
            view={v}
            name={name}
            onName={setName}
            agreed={agreed}
            onAgreed={setAgreed}
            onApproved={(next) => {
              setSheet(null)
              setNotice(null)
              accept(next)
              focusHeading()
            }}
            onConflict={conflict}
            onAsk={() => setSheet('ask')}
          />
          <AskSheet
            open={sheet === 'ask'}
            onOpenChange={(o) => setSheet(o ? 'ask' : null)}
            view={v}
            text={question}
            onText={setQuestion}
            onAsked={(next) => {
              setSheet(null)
              setQuestion('')
              accept(next)
              announce('Question sent.')
            }}
          />
          <SayNoSheet
            open={sheet === 'no'}
            onOpenChange={(o) => setSheet(o ? 'no' : null)}
            view={v}
            reason={reason}
            onReason={setReason}
            onDeclined={(next) => {
              setSheet(null)
              accept(next)
              focusHeading()
            }}
            onConflict={conflict}
            onAsk={() => setSheet('ask')}
          />
        </>
      ) : null}
    </div>
  )
}

function OwnerHeader({ business }: { business: string }) {
  return (
    <header className="owner-header">
      <span className="owner-monogram" aria-hidden="true">
        {monogram(business)}
      </span>
      <span className="owner-business">{business}</span>
    </header>
  )
}

/** Her three choices (D62): Approve is the only filled button; the other two are full size. */
function ChoiceButtons({
  builder,
  onApprove,
  onAsk,
  onNo,
}: {
  builder: string
  onApprove: () => void
  onAsk: () => void
  onNo: () => void
}) {
  return (
    <div className="owner-actions">
      <p className="owner-promise">{builder} won’t start this work until you approve it.</p>
      <Button variant="dark" size={56} block aria-haspopup="dialog" onClick={onApprove}>
        Approve
      </Button>
      <Button variant="outline" size={56} block aria-haspopup="dialog" onClick={onAsk}>
        Ask a question
      </Button>
      <Button
        variant="outline"
        size={56}
        block
        className="owner-say-no"
        aria-haspopup="dialog"
        onClick={onNo}
      >
        Say no
      </Button>
      <p className="owner-not-sure">
        Not sure? Ask {builder} first. Nothing changes until you decide.
      </p>
    </div>
  )
}

/** Her questions and Dan's replies, oldest first, in the job's time zone. */
function Thread({ view }: { view: OwnerView }) {
  if (!view.thread.length) return null
  const builder = view.card.builder_name
  const waiting = view.thread.at(-1)?.from === 'owner' && view.status === 'question'
  return (
    <section className="owner-thread" aria-labelledby="thread-title">
      <h2 id="thread-title" className="owner-section-title">
        Questions
      </h2>
      <ol className="thread">
        {view.thread.map((item) => (
          <li key={item.id} className={item.from === 'owner' ? 'bubble is-mine' : 'bubble'}>
            <p className="bubble-who">
              {item.from === 'owner' ? 'You asked' : `${builder} replied`}
            </p>
            <p className="bubble-text">{item.text}</p>
            <time className="bubble-time" dateTime={item.at}>
              {formatShortTime(new Date(item.at), view.card.state)}
            </time>
          </li>
        ))}
      </ol>
      {waiting ? (
        <p className="owner-waiting">
          Your question’s with {builder}. You can still approve or say no whenever you’re ready.
        </p>
      ) : null}
    </section>
  )
}

/** Other changes on this job waiting for her. */
function Others({ view, after }: { view: OwnerView; after?: boolean }) {
  if (!view.others.length) {
    return after ? <p className="owner-quiet">Nothing else needs your OK right now.</p> : null
  }
  const n = view.others.length
  return (
    <nav className="owner-others" aria-label="Other changes waiting for you">
      <p className="owner-others-title">
        {n === 1 ? '1 more change is waiting for you.' : `${n} more changes are waiting for you.`}
      </p>
      <ul>
        {view.others.map((o) => (
          <li key={o.token}>
            <a href={`/o/${encodeURIComponent(o.token)}`}>
              Change {o.number}: {o.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** "Questions? Call Dan on 0491 570 156", in the same place on every state (D69). */
function Help({ view }: { view: OwnerView }) {
  const tel = view.card.builder_mobile.replace(/[^\d+]/g, '')
  return (
    <p className="owner-help">
      <Phone size={20} strokeWidth={2.25} aria-hidden="true" />
      <span>
        Questions? Call {view.card.builder_name} on{' '}
        <a href={`tel:${tel}`}>{view.card.builder_mobile}</a>
      </span>
    </p>
  )
}

/** What's recorded about her, said plainly (D76). */
function Footer({ builder }: { builder: string }) {
  return (
    <footer className="owner-footer">
      {builder} can see when you’ve opened this. Your answer is recorded with your name, the time,
      the type of device you used and the exact version you saw.
    </footer>
  )
}

// ---- Done states ------------------------------------------------------------------------------

function Approved({
  view,
  headingRef,
}: {
  view: OwnerView
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const builder = view.card.builder_name
  return (
    <>
      <div className="owner-done">
        <TickMark />
        <h1 ref={headingRef} tabIndex={-1} className="owner-title">
          You approved this change
        </h1>
        <p className="owner-lede">
          Thanks {view.card.client_first_name}. {builder}’s been told and can start this work.
        </p>
      </div>
      <section className="owner-record" aria-label="Your record">
        {view.decision ? <p>{view.decision.line}</p> : null}
        <RecordNumber value={view.record_number} />
        {view.payment_line ? <p>{view.payment_line}</p> : null}
        <p className="owner-keep">Keep this link. It will always show what you approved.</p>
      </section>
      <OwnerCard card={view.card} />
      <Others view={view} after />
    </>
  )
}

function Declined({
  view,
  headingRef,
}: {
  view: OwnerView
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const builder = view.card.builder_name
  return (
    <>
      <div className="owner-done">
        <h1 ref={headingRef} tabIndex={-1} className="owner-title">
          You said no to this change
        </h1>
        <p className="owner-lede">{builder} has been told. Your contract hasn’t changed.</p>
      </div>
      <section className="owner-record" aria-label="Your record">
        {view.decision ? <p>{view.decision.line}</p> : null}
        {view.decision?.reason ? <p>Your reason: {view.decision.reason}</p> : null}
        <p>If you change your mind, ask {builder} to send it again.</p>
      </section>
      <OwnerCard card={view.card} />
    </>
  )
}

function Withdrawn({
  view,
  headingRef,
}: {
  view: OwnerView
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className="owner-done">
      <h1 ref={headingRef} tabIndex={-1} className="owner-title">
        {view.card.builder_name} withdrew this change
      </h1>
      <p className="owner-lede">There’s nothing for you to do.</p>
    </div>
  )
}

/** "Record number 7F3A-2C91" with Copy. */
function RecordNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const id = useId()
  return (
    <p className="owner-record-number">
      <span id={id}>
        Record number <b className="record-id">{value}</b>
      </span>
      <Button
        variant="outline"
        size={48}
        aria-describedby={id}
        icon={
          copied ? (
            <Check size={18} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Copy size={18} strokeWidth={2.25} aria-hidden="true" />
          )
        }
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            announce('Record number copied')
            setTimeout(() => setCopied(false), 2000)
          } catch {
            announce(`Record number ${value}`)
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </p>
  )
}

// ---- Loading and broken links -------------------------------------------------------------------

function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="owner-shell">
      <main className="owner-page owner-plain">{children}</main>
    </div>
  )
}

function Loading() {
  const shown = useDelayed()
  return (
    <Plain>
      <h1 className="visually-hidden">Loading the change</h1>
      {shown ? (
        <div className="owner-skeleton" aria-hidden="true">
          <Skeleton height={20} width="45%" />
          <Skeleton height={64} />
          <Skeleton height={320} radius={24} />
          <Skeleton height={56} radius={999} />
        </div>
      ) : null}
    </Plain>
  )
}

function LinkNotWorking() {
  return (
    <Plain>
      <span className="owner-mark" aria-hidden="true">
        <Link2Off size={28} strokeWidth={2} />
      </span>
      <h1 tabIndex={-1} className="owner-title">
        This link isn’t working
      </h1>
      <p className="owner-lede">
        It may be incomplete or out of date. Ask your builder to send it again.
      </p>
    </Plain>
  )
}

function CouldNotLoad({ onRetry }: { onRetry: () => void }) {
  return (
    <Plain>
      <span className="owner-mark" aria-hidden="true">
        <CircleAlert size={28} strokeWidth={2} />
      </span>
      <h1 tabIndex={-1} className="owner-title">
        This page didn’t load
      </h1>
      <p className="owner-lede">Nothing has changed. Try again in a moment.</p>
      <Button variant="dark" size={56} block onClick={onRetry}>
        Try again
      </Button>
    </Plain>
  )
}
