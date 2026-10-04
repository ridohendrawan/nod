// Status (/v/:id once sent; ux-spec 6): where the change stands, what Sarah was sent, and its
// history, oldest first (D77). The callout always says what Dan may do on site: "Don't start this
// work until it's approved" until it is. Words for Dan come from shared/copy.ts.
import { useQueryClient } from '@tanstack/react-query'
import { PencilLine, Share2 } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { builder, type Tone } from '../../../shared/copy.ts'
import { hasCents } from '../../../shared/money.ts'
import type { StateCode } from '../../../shared/states.ts'
import { formatRecordTime, formatShortTime } from '../../../shared/time.ts'
import type { HistoryItem, Variation, VariationResponse } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { api, isApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { Callout } from '../../ui/Callout.tsx'
import { TextArea } from '../../ui/Field.tsx'
import { ConfirmSheet } from '../../ui/Sheet.tsx'
import { StatusPill } from '../../ui/StatusPill.tsx'
import { useToasts } from '../../ui/toastContext.ts'
import { usePageTitle } from '../../ui/usePageTitle.ts'
import { AppHeader, BackLink } from '../AppHeader.tsx'
import { backTo } from '../nav.ts'
import { variationKey } from '../queries.ts'

export function StatusScreen({
  data,
  onShare,
  onEdit,
  collision,
  headingRef,
}: {
  data: VariationResponse
  onShare: () => void
  /** Open Review in update mode (after Dan confirms). */
  onEdit: () => void
  /** She answered while Dan was editing (D77): his edits weren't sent. */
  collision?: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const { variation: v, job } = data
  const first = job.client_first_name
  const name = builder.variationName(v.number)
  usePageTitle(`${name}: Nod`)
  const open = v.status === 'sent' || v.status === 'question'
  const canShare = open && data.share !== null

  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { show } = useToasts()
  const [confirm, setConfirm] = useState<'edit' | 'withdraw' | 'discard' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editButton = useRef<HTMLButtonElement>(null)

  /** Put a fresh variation in the cache at once; the poke refetches the rest. */
  const settle = (next: Variation) =>
    queryClient.setQueryData<VariationResponse>(variationKey(v.id), (old) =>
      old ? { ...old, variation: next } : old,
    )

  const run = async (work: () => Promise<void>, failed: string) => {
    setPending(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      const message = isApiError(e) ? e.message : failed
      setError(message)
      announce(message)
    } finally {
      setPending(false)
    }
  }

  const withdraw = () =>
    run(async () => {
      const { variation } = await api.withdraw(v.id)
      settle(variation)
      setConfirm(null)
      announce(`${name} withdrawn. ${first}’s link now says so.`)
    }, 'That didn’t go through. Nothing was withdrawn. Try again.')

  const discard = () =>
    run(async () => {
      const { variation } = await api.discardEdits(v.id)
      settle(variation)
      setConfirm(null)
      show(`Changes discarded. ${first} still has version ${v.version}.`)
    }, 'That didn’t go through. Your edits are still here. Try again.')

  const startNewVersion = () =>
    run(async () => {
      const { variation } = await api.revise(v.id)
      void navigate(`/v/${variation.id}`, { state: backTo(`/v/${v.id}`) })
    }, 'That didn’t go through. Try again.')

  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader floating left={<BackLink to={`/job/${job.id}`} label={job.title} />} />
      <main className="page page-builder status">
        <div className="page-head">
          <p className="kicker">
            {name}
            <StatusPill status={v.status} firstName={first} />
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="t-title-1">
            {v.title || 'Untitled change'}
          </h1>
        </div>

        {collision ? (
          <Callout tone="ask" title="Your edits weren’t sent.">
            {v.status === 'approved'
              ? `${first} approved version ${v.version} while you were editing. Record a new change for anything else.`
              : `${first} said no to version ${v.version} while you were editing. Start a new version if you still need the change.`}
          </Callout>
        ) : null}
        <StatusCallout
          data={data}
          onReplied={settle}
          onStartNewVersion={() => void startNewVersion()}
          pending={pending}
        />
        {open && v.has_pending_edits ? (
          <Callout
            tone="neutral"
            title="You’ve started editing this change."
            action={
              <div className="callout-buttons">
                <Button variant="primary" size={48} onClick={onEdit}>
                  Continue editing
                </Button>
                <Button variant="outline" size={48} onClick={() => setConfirm('discard')}>
                  Discard changes
                </Button>
              </div>
            }
          >
            {first} still sees version {v.version} until you send the update.
          </Callout>
        ) : null}
        {error ? (
          <p className="send-bar-error" role="alert">
            {error}
          </p>
        ) : null}
        <Summary data={data} />
        <History items={data.history} state={v.sent_state ?? job.state} firstName={first} />

        {open ? (
          <div className="stack-actions">
            {canShare ? (
              <Button
                variant="outline"
                size={56}
                block
                icon={<Share2 size={20} strokeWidth={2.25} aria-hidden="true" />}
                onClick={onShare}
              >
                Share again
              </Button>
            ) : null}
            {v.has_pending_edits ? null : (
              <Button
                ref={editButton}
                variant="outline"
                size={56}
                block
                icon={<PencilLine size={20} strokeWidth={2.25} aria-hidden="true" />}
                aria-haspopup="dialog"
                onClick={() => setConfirm('edit')}
              >
                Edit
              </Button>
            )}
            <Button
              variant="text"
              size={48}
              className="withdraw-link"
              aria-haspopup="dialog"
              onClick={() => setConfirm('withdraw')}
            >
              Withdraw
            </Button>
          </div>
        ) : null}
      </main>

      <ConfirmSheet
        open={confirm === 'edit'}
        onOpenChange={(o) => setConfirm(o ? 'edit' : null)}
        title={`Edit a change ${first} already has?`}
        consequence={`${first} will see “${data.builder.name} updated this change” and will need to approve the new version. The link stays the same.`}
        confirmLabel="Edit and resend"
        cancelLabel="Cancel"
        danger={false}
        finalFocus={editButton}
        onConfirm={() => {
          setConfirm(null)
          onEdit()
        }}
      />
      <ConfirmSheet
        open={confirm === 'withdraw'}
        onOpenChange={(o) => setConfirm(o ? 'withdraw' : null)}
        title={`Withdraw ${name}?`}
        consequence={`${first}’s link will say you’ve withdrawn it, and it can’t be approved after this.`}
        confirmLabel={`Withdraw ${name}`}
        pending={pending}
        error={error}
        finalFocus={headingRef}
        onConfirm={() => void withdraw()}
      />
      <ConfirmSheet
        open={confirm === 'discard'}
        onOpenChange={(o) => setConfirm(o ? 'discard' : null)}
        title="Discard your changes?"
        consequence={`${first} keeps seeing version ${v.version}, and your edits since then are thrown away.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep them"
        pending={pending}
        error={error}
        finalFocus={headingRef}
        onConfirm={() => void discard()}
      />
    </div>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "9 minutes", "2 hours", "3 days": how long the yes took (D20). */
function took(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000))
  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) return plural(minutes, 'minute', 'minutes')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return plural(hours, 'hour', 'hours')
  return plural(Math.round(hours / 24), 'day', 'days')
}

/** The callout for each state (ux-spec 6), in the client's name, never a pronoun (D94). */
function StatusCallout({
  data,
  onReplied,
  onStartNewVersion,
  pending,
}: {
  data: VariationResponse
  onReplied: (next: Variation) => void
  onStartNewVersion: () => void
  pending: boolean
}) {
  const { variation: v, job } = data
  const first = job.client_first_name
  // Times on a sent change stay in the zone it was sent under (D10), even if the job's state
  // changes afterwards: her record must not move.
  const state = v.sent_state ?? job.state
  const at = (iso: string) => formatShortTime(new Date(iso), state)
  const lastQuestion = [...data.history].reverse().find((h) => h.type === 'question')
  const lastTalk = [...data.history]
    .reverse()
    .find((h) => h.type === 'question' || h.type === 'reply')

  switch (v.status) {
    case 'sent':
      if (lastTalk?.type === 'reply') {
        return (
          <Callout tone="wait" title={`You replied at ${at(lastTalk.at)}. Waiting on ${first}.`}>
            Don’t start this work until it’s approved.
          </Callout>
        )
      }
      return v.seen_at ? (
        <Callout tone="wait" title={`${first} opened it at ${at(v.seen_at)}.`}>
          Don’t start this work until it’s approved.
        </Callout>
      ) : (
        <Callout tone="wait" title={`Sent. Waiting on ${first}.`}>
          <p>{first} hasn’t opened it yet. Don’t start this work until it’s approved.</p>
          {v.sent_at ? <p className="callout-meta">Sent {at(v.sent_at)}</p> : null}
        </Callout>
      )
    case 'question':
      return (
        <Callout tone="ask" title={`${first} asked a question`}>
          {lastQuestion?.text ? (
            <blockquote className="callout-quote">
              <p>{lastQuestion.text}</p>
              <footer className="callout-meta">{at(lastQuestion.at)}</footer>
            </blockquote>
          ) : null}
          <ReplyForm id={v.id} firstName={first} onReplied={onReplied} />
          <p>{first} can still approve or say no while waiting for your answer.</p>
        </Callout>
      )
    case 'approved':
      return (
        <Callout tone="go" title="Approved. OK to start.">
          {v.decided_at ? (
            <p>
              Approved by {v.decided_name ?? first},{' '}
              {formatRecordTime(new Date(v.decided_at), state)}.
              {v.record_number ? (
                <>
                  {' '}
                  Record <span className="record-id">{v.record_number}</span>.
                </>
              ) : null}
            </p>
          ) : null}
          {v.decided_at ? (
            <p className="callout-meta">
              Approved {took(v.created_at, v.decided_at)} after you recorded it.
            </p>
          ) : null}
        </Callout>
      )
    case 'declined':
      return (
        <Callout
          tone="stop"
          title={`${first} said no. Don’t do this work.`}
          action={
            <Button variant="outline" size={48} pending={pending} onClick={onStartNewVersion}>
              Start a new version
            </Button>
          }
        >
          {v.decline_reason ? (
            <p>
              {first}’s reason: {v.decline_reason}
            </p>
          ) : (
            <p>{first} didn’t give a reason.</p>
          )}
        </Callout>
      )
    case 'withdrawn':
      return (
        <Callout tone="neutral" title="You withdrew this change.">
          {first}’s link says it’s withdrawn, so it can’t be approved.
        </Callout>
      )
    default:
      return null
  }
}

/** Dan's answer to the question (D25): it shows on the client's page, and the change waits on them again. */
function ReplyForm({
  id,
  firstName,
  onReplied,
}: {
  id: string
  firstName: string
  onReplied: (next: Variation) => void
}) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const send = async () => {
    if (!text.trim()) {
      setError('Type your reply first.')
      box.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      const { variation } = await api.reply(id, text)
      setText('')
      onReplied(variation)
      announce(`Reply sent. It shows on ${firstName}’s page.`)
    } catch (e) {
      const message = isApiError(e)
        ? e.message
        : 'That reply didn’t send. It’s still here. Try again.'
      setError(message)
      announce(message)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="reply-form">
      <TextArea
        ref={box}
        label="Your reply"
        rows={3}
        maxLength={1000}
        value={text}
        error={error}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value.trim()) setError(null)
        }}
      />
      <Button variant="primary" size={48} pending={pending} onClick={() => void send()}>
        Send reply
      </Button>
    </div>
  )
}

/** What was sent, in Dan's words, with the version and the record number. */
function Summary({ data }: { data: VariationResponse }) {
  const { variation: v, job } = data
  const first = job.client_first_name
  const options = { cents: hasCents([v.price_cents]) }
  const credit = (v.price_cents ?? 0) < 0
  const items = v.items.filter((i) => i.text.trim())
  const rows: { label: string; value: string }[] = []
  const price = builder.price(v.price_cents, options)
  if (price) rows.push({ label: 'Price', value: price })
  else if (v.price_method) rows.push({ label: 'How it’s worked out', value: v.price_method })
  const days = builder.days(v.delay_days)
  if (days) rows.push({ label: 'Extra time', value: days })
  if (v.payment_timing && v.price_cents !== 0)
    rows.push({
      label: credit ? 'When it’s credited' : 'When it’s paid',
      value: builder.payment(v.payment_timing, credit),
    })
  if (v.requested_by)
    rows.push({ label: 'Asked for by', value: builder.requestedBy(v.requested_by, first) })
  if (v.reason) rows.push({ label: 'Why', value: v.reason })
  // What was sent follows the rules it was sent under, even if the job's state changed since.
  const sentUnderVic = (v.sent_state ?? job.state) === 'VIC'
  if (sentUnderVic && v.permit_change !== null)
    rows.push({ label: 'Permit', value: builder.permit(v.permit_change) })
  if (sentUnderVic && v.work_effect)
    rows.push({ label: 'Effect on the rest of the job', value: v.work_effect })

  return (
    <section className="card summary-card" aria-labelledby="summary-title">
      <h2 id="summary-title" className="t-title-2">
        What you sent
      </h2>
      {items.length ? (
        <ul className="summary-items">
          {items.map((item, i) => (
            <li key={i}>{item.text}</li>
          ))}
        </ul>
      ) : null}
      <dl className="summary-facts">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="summary-record">
        Version {v.version}
        {v.record_number ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="visually-hidden">, </span>
            Record <span className="record-id">{v.record_number}</span>
          </>
        ) : null}
      </p>
    </section>
  )
}

const HISTORY_TONE: Partial<Record<HistoryItem['type'], Tone>> = {
  sent: 'wait',
  updated: 'wait',
  opened: 'wait',
  question: 'ask',
  reply: 'neutral',
  approved: 'go',
  declined: 'stop',
}

function historyText(h: HistoryItem, first: string): string | null {
  const said = h.text ? `: “${h.text}”` : ''
  switch (h.type) {
    case 'drafted':
      return 'Recorded by you'
    case 'sent':
      return `Sent to ${first}${h.version ? ` (version ${h.version})` : ''}`
    case 'updated':
      return `Updated and sent again${h.version ? ` (version ${h.version})` : ''}`
    case 'opened':
      return `${first} opened it`
    case 'question':
      return `${first} asked${said}`
    case 'reply':
      return `You replied${said}`
    case 'approved':
      return `${first} approved it`
    case 'declined':
      return `${first} said no${said}`
    case 'withdrawn':
      return 'You withdrew it'
    case 'revised':
      return 'You started a new version'
    default:
      return null
  }
}

/** Oldest first (D77), each with its time on site. */
function History({
  items,
  state,
  firstName,
}: {
  items: HistoryItem[]
  state: StateCode
  firstName: string
}) {
  const lines = items
    .map((h) => ({ h, text: historyText(h, firstName) }))
    .filter((l): l is { h: HistoryItem; text: string } => l.text !== null)
  if (!lines.length) return null
  return (
    <section className="section" aria-labelledby="history-title">
      <h2 id="history-title" className="t-title-2">
        History
      </h2>
      <ol className="card history">
        {lines.map(({ h, text }) => (
          <li key={h.id} className={`history-item is-${HISTORY_TONE[h.type] ?? 'neutral'}`}>
            <span className="history-dot" aria-hidden="true" />
            <span className="history-text">{text}</span>
            <time className="history-time" dateTime={h.at}>
              {formatShortTime(new Date(h.at), state)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
