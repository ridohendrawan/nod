// The Sent sheet (ux-spec 5): "Ready for Sarah", the exact text Dan is about to send, and the
// ways to get the link to her. Each action decides inside the tap (D82): a phone opens its
// Messages app with her number and the text filled in; a desktop opens the share sheet, or
// copies. The status line stays live, so Dan sees "Sarah opened it" without leaving the sheet.
import { Check, Copy, Mail, MessageSquareText, Share2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { builder, type Tone } from '../../../shared/copy.ts'
import { hasCents } from '../../../shared/money.ts'
import type { StateCode } from '../../../shared/states.ts'
import { formatShortTime } from '../../../shared/time.ts'
import type { Share, Variation, VariationResponse } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { Button } from '../../ui/Button.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { Sheet, SheetActions } from '../../ui/Sheet.tsx'

export function SentSheet({
  open,
  onDone,
  data,
  share,
  finalFocus,
}: {
  open: boolean
  onDone: () => void
  data: VariationResponse
  share: Share
  /** Where focus lands after Done: the Status view's heading. */
  finalFocus?: RefObject<HTMLElement | null>
}) {
  const { variation: v, job } = data
  const first = job.client_first_name
  // In the zone it was sent under (D10), like Status: Share again can open this after the job's
  // state has changed.
  const status = sentStatus(v, v.sent_state ?? job.state, first)
  const options = { cents: hasCents([v.price_cents]) }
  const facts = [
    builder.variationName(v.number),
    builder.price(v.price_cents, options),
    builder.days(v.delay_days),
  ].filter((f): f is string => !!f)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone()
      }}
      title={v.version > 1 ? 'Update sent' : `Ready for ${first}`}
      titleIcon={<Logo size={40} draw />}
      description={
        <>
          {facts.map((f, i) => (
            <span key={f}>
              {i > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="visually-hidden">, </span>
                </>
              ) : null}
              {f}
            </span>
          ))}
        </>
      }
      finalFocus={finalFocus}
    >
      <p className={`sent-status tone-${status.tone}`}>
        <span className="sent-status-dot" aria-hidden="true" />
        {status.text}
      </p>
      <div className="sms-preview">
        <p className="label-sm">Your text to {first}</p>
        <p className="sms-bubble">{share.sms_text}</p>
      </div>
      <SheetActions>
        <TextIt
          share={share}
          firstName={first}
          sender={`${data.builder.name} (${data.builder.business})`}
        />
        <a className="btn btn-outline btn-56 btn-block" href={share.email.href}>
          <Mail size={20} strokeWidth={2.25} aria-hidden="true" />
          <span>Email it</span>
        </a>
        <CopyLink url={share.owner_url} firstName={first} />
        {canShare() ? (
          <Button
            variant="text"
            size={48}
            block
            icon={<Share2 size={20} strokeWidth={2.25} aria-hidden="true" />}
            onClick={() => void shareSheet(share)}
          >
            More ways to share
          </Button>
        ) : null}
        <Button variant="dark" size={56} block onClick={onDone}>
          Done
        </Button>
      </SheetActions>
    </Sheet>
  )
}

/** The live line (D67, kept by D91 for the sheet): it only moves when her page reports a view. */
function sentStatus(v: Variation, state: StateCode, first: string): { text: string; tone: Tone } {
  switch (v.status) {
    case 'approved':
      return { text: `${first} approved it.`, tone: 'go' }
    case 'declined':
      return { text: `${first} said no.`, tone: 'stop' }
    case 'question':
      return { text: `${first} asked a question.`, tone: 'ask' }
    case 'withdrawn':
      return { text: 'You withdrew it.', tone: 'neutral' }
    default:
      return v.seen_at
        ? {
            text: `${first} opened it at ${formatShortTime(new Date(v.seen_at), state)}.`,
            tone: 'wait',
          }
        : { text: `Waiting for ${first} to open it.`, tone: 'wait' }
  }
}

// ---- The actions ------------------------------------------------------------------------------

const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

const isPhone = () => isApple() || /Android/i.test(navigator.userAgent)

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** Her number and the text, filled in (D82): `&body=` on Apple, `?body=` everywhere else. */
function smsHref(share: Share): string {
  const to = (share.sms_to ?? '').replace(/[^\d+]/g, '')
  const body = encodeURIComponent(share.sms_text)
  return isApple() ? `sms:${to}&body=${body}` : `sms:${to}?body=${body}`
}

/** The share sheet gets the link separately, never inside the text too (D73). */
async function shareSheet(share: Share): Promise<void> {
  const text = share.sms_text.replace(share.owner_url, '').trim()
  try {
    await navigator.share({ text, url: share.owner_url })
  } catch {
    // Cancelled, or the sheet couldn't open: nothing happened, and nothing needs saying.
  }
}

function TextIt({
  share,
  firstName,
  sender,
}: {
  share: Share
  firstName: string
  /** "Dan (Brightside Renovations)", as her phone would show the text. */
  sender: string
}) {
  const [copied, setCopied] = useState(false)
  const [sentHere, setSentHere] = useState(false)
  const label = `Text it to ${firstName}`
  const icon = <MessageSquareText size={20} strokeWidth={2.25} aria-hidden="true" />
  // On the demo stage the text goes to the phone beside this one, not a real Messages app (D24).
  if (document.documentElement.dataset.stage === 'builder') {
    return (
      <Button
        variant="primary"
        size={56}
        block
        icon={sentHere ? <Check size={20} strokeWidth={2.5} aria-hidden="true" /> : icon}
        onClick={() => {
          const message = { type: 'nod:sent', link: share.owner_url, text: share.sms_text, sender }
          window.parent.postMessage(message, location.origin)
          setSentHere(true)
          announce(`Sent to ${firstName}’s phone (demo).`)
        }}
      >
        {sentHere ? `Sent to ${firstName}’s phone (demo)` : label}
      </Button>
    )
  }
  if (isPhone()) {
    return (
      <a className="btn btn-primary btn-56 btn-block" href={smsHref(share)}>
        {icon}
        <span>{label}</span>
      </a>
    )
  }
  // A desktop: the share sheet, or copy the whole text when there isn't one.
  return (
    <Button
      variant="primary"
      size={56}
      block
      icon={copied ? <Check size={20} strokeWidth={2.5} aria-hidden="true" /> : icon}
      onClick={async () => {
        if (canShare()) return void shareSheet(share)
        try {
          await navigator.clipboard.writeText(share.sms_text)
          setCopied(true)
          announce('Text copied. Paste it into a message.')
        } catch {
          announce('Copy didn’t work here. Use Copy link instead.')
        }
      }}
    >
      {copied ? 'Text copied' : label}
    </Button>
  )
}

function CopyLink({ url, firstName }: { url: string; firstName: string }) {
  const id = useId()
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  if (manual) {
    return (
      <div className="field copy-manual">
        <label className="field-label" htmlFor={id}>
          {firstName}’s link
        </label>
        <input
          ref={field}
          id={id}
          className="input"
          readOnly
          value={url}
          aria-describedby={`${id}-hint`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <p id={`${id}-hint`} className="field-hint">
          Press and hold the link to copy it.
        </p>
      </div>
    )
  }
  return (
    <Button
      variant="outline"
      size={56}
      block
      icon={
        copied ? (
          <Check size={20} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Copy size={20} strokeWidth={2.25} aria-hidden="true" />
        )
      }
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          announce('Link copied')
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
          // No clipboard here (an old browser, or permission refused): show the link to copy.
          setManual(true)
          requestAnimationFrame(() => {
            field.current?.focus()
            field.current?.select()
          })
        }
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  )
}
