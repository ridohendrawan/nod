// Sarah's three sheets (ux-spec 7): Approve, Ask a question and Say no. None is optimistic
// (D71): each waits for the store, says what happened, and never loses what she typed. Her name
// and question live on the page, so closing a sheet and coming back keeps them.
import { useId, useRef, useState } from 'react'
import { formatMoney } from '../../shared/money.ts'
import type { OwnerView } from '../../shared/types.ts'
import { announce } from '../lib/announce.ts'
import { isApiError, ownerApi } from '../lib/ownerApi.ts'
import { Button } from '../ui/Button.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { TextArea, TextField } from '../ui/Field.tsx'
import { Sheet, SheetActions } from '../ui/Sheet.tsx'

/** Why an answer didn't land: Dan updated it meanwhile, or it was already answered (D7). */
export type Conflict = 'changed' | 'locked'

const fact = (view: OwnerView, id: string) => view.card.facts.find((f) => f.id === id)?.value

// ---- Approve --------------------------------------------------------------------------------

export function ApproveSheet({
  open,
  onOpenChange,
  view,
  name,
  onName,
  agreed,
  onAgreed,
  onApproved,
  onConflict,
  onAsk,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: OwnerView
  name: string
  onName: (name: string) => void
  agreed: boolean
  onAgreed: (agreed: boolean) => void
  onApproved: (view: OwnerView) => void
  onConflict: (why: Conflict) => void
  onAsk: () => void
}) {
  const builder = view.card.builder_name
  const nameRef = useRef<HTMLInputElement>(null)
  const tickRef = useRef<HTMLInputElement>(null)
  const reasonId = useId()
  const tickErrorId = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [tickError, setTickError] = useState<string | null>(null)

  // The version she opened the sheet on. If Dan sends an update meanwhile, the sheet says so
  // and Approve waits until she has looked at the new version.
  const [openedOn, setOpenedOn] = useState(view.version)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setOpenedOn(view.version)
      setError(null)
    }
  }
  const updatedMeanwhile = open && view.version !== openedOn

  const missing = !name.trim() || !agreed
  const blocked = missing || updatedMeanwhile
  const options = { cents: view.card.cents }
  const after = view.card.totals.after_cents

  const showMissing = () => {
    if (!name.trim()) {
      setNameError('Type your full name to approve.')
      nameRef.current?.focus()
    } else if (!agreed) {
      setTickError('Tick the box to agree to this change.')
      tickRef.current?.focus()
    }
  }

  const approve = async () => {
    setPending(true)
    setError(null)
    try {
      const next = await ownerApi.approve(view.token, {
        name,
        agreed,
        fingerprint: view.fingerprint,
      })
      onApproved(next)
    } catch (e) {
      if (isApiError(e) && (e.code === 'changed' || e.code === 'locked')) {
        onConflict(e.code)
      } else if (isApiError(e) && e.code === 'invalid') {
        if (e.body?.field === 'agreed') setTickError(e.message)
        else {
          setNameError(e.message)
          nameRef.current?.focus()
        }
      } else {
        const message = 'Your approval didn’t go through. Nothing has been approved yet. Try again.'
        setError(message)
        announce(message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Approve this change" hasFields>
      {updatedMeanwhile ? (
        <p className="sheet-notice" role="note">
          {builder} has just updated this change. Check the new version before you approve.
        </p>
      ) : null}
      <dl className="approve-summary">
        <div>
          <dt>Change</dt>
          <dd>{view.card.title}</dd>
        </div>
        {fact(view, 'price') ? (
          <div>
            <dt>Price</dt>
            <dd>{fact(view, 'price')}</dd>
          </div>
        ) : null}
        {fact(view, 'time') ? (
          <div>
            <dt>Time</dt>
            <dd>{fact(view, 'time')}</dd>
          </div>
        ) : null}
        {after !== null ? (
          <div>
            <dt>New contract total</dt>
            <dd>{formatMoney(after, options)}</dd>
          </div>
        ) : null}
      </dl>
      <TextField
        ref={nameRef}
        label="Type your full name"
        hint="This is your signature."
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="done"
        spellCheck={false}
        maxLength={100}
        value={name}
        error={nameError}
        onChange={(e) => {
          onName(e.target.value)
          if (e.target.value.trim()) setNameError(null)
        }}
      />
      <div className="field">
        <Checkbox
          ref={tickRef}
          checked={agreed}
          invalid={!!tickError}
          describedBy={tickError ? tickErrorId : undefined}
          onChange={(next) => {
            onAgreed(next)
            if (next) setTickError(null)
          }}
        >
          {view.consent}
        </Checkbox>
        {tickError ? (
          <p id={tickErrorId} className="field-error">
            <span>{tickError}</span>
          </p>
        ) : null}
      </div>
      {error ? <p className="sheet-error">{error}</p> : null}
      {blocked ? (
        <p id={reasonId} className="sheet-reason">
          {updatedMeanwhile
            ? 'Close this and check the new version first.'
            : 'To approve, type your name and tick the box.'}
        </p>
      ) : null}
      <SheetActions>
        <Button
          variant="dark"
          size={56}
          block
          blocked={blocked}
          pending={pending}
          aria-describedby={blocked ? reasonId : undefined}
          onBlockedPress={updatedMeanwhile ? () => onOpenChange(false) : showMissing}
          onClick={() => void approve()}
        >
          {pending ? 'Recording your approval' : 'Approve change'}
        </Button>
        <Button variant="outline" size={56} block onClick={() => onOpenChange(false)}>
          Not now
        </Button>
      </SheetActions>
      <p className="fine-print">
        We keep a record of your typed name, the date and time, and exactly what you approved.{' '}
        {builder} gets the same record.
      </p>
      <Button variant="text" size={48} className="sheet-link" onClick={onAsk}>
        Not ready? Ask {builder} a question instead.
      </Button>
    </Sheet>
  )
}

// ---- Ask a question -------------------------------------------------------------------------

export function AskSheet({
  open,
  onOpenChange,
  view,
  text,
  onText,
  onAsked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: OwnerView
  text: string
  onText: (text: string) => void
  onAsked: (view: OwnerView) => void
}) {
  const builder = view.card.builder_name
  const box = useRef<HTMLTextAreaElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    if (!text.trim()) {
      setError('Type your question first.')
      box.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      onAsked(await ownerApi.question(view.token, text))
    } catch (e) {
      const message =
        isApiError(e) && e.code === 'invalid'
          ? e.message
          : 'Your question didn’t send. It’s still here, so you can try again.'
      setError(message)
      announce(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Ask ${builder} a question`}
      hasFields
      initialFocus={box}
    >
      <TextArea
        ref={box}
        label="Your question"
        hint={`${builder} will reply on this page. Nothing changes until you decide.`}
        rows={4}
        maxLength={1000}
        value={text}
        error={error}
        onChange={(e) => {
          onText(e.target.value)
          if (e.target.value.trim()) setError(null)
        }}
      />
      <SheetActions>
        <Button variant="dark" size={56} block pending={pending} onClick={() => void send()}>
          Send question
        </Button>
        <Button variant="outline" size={56} block onClick={() => onOpenChange(false)}>
          Not now
        </Button>
      </SheetActions>
    </Sheet>
  )
}

// ---- Say no ---------------------------------------------------------------------------------

export function SayNoSheet({
  open,
  onOpenChange,
  view,
  reason,
  onReason,
  onDeclined,
  onConflict,
  onAsk,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: OwnerView
  reason: string
  onReason: (reason: string) => void
  onDeclined: (view: OwnerView) => void
  onConflict: (why: Conflict) => void
  onAsk: () => void
}) {
  const builder = view.card.builder_name
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fromSite = view.card.facts.some(
    (f) => f.id === 'asked_by' && f.value === 'What was found on site',
  )

  const decline = async () => {
    setPending(true)
    setError(null)
    try {
      onDeclined(
        await ownerApi.decline(view.token, {
          reason: reason.trim() || null,
          fingerprint: view.fingerprint,
        }),
      )
    } catch (e) {
      if (isApiError(e) && (e.code === 'changed' || e.code === 'locked')) {
        onConflict(e.code)
        return
      }
      const message =
        isApiError(e) && e.code === 'invalid'
          ? e.message
          : 'That didn’t go through. Nothing has changed yet. Try again.'
      setError(message)
      announce(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Say no to this change"
      description={`${builder} won’t do this work, and your contract stays as it is.`}
      hasFields
    >
      {fromSite ? (
        <p className="sheet-prose-line">
          {builder} found this on site and may call you to talk through other options.
        </p>
      ) : null}
      <TextArea
        label={`Tell ${builder} why (optional)`}
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => onReason(e.target.value)}
      />
      {error ? <p className="sheet-error">{error}</p> : null}
      <SheetActions>
        <Button variant="dark" size={56} block pending={pending} onClick={() => void decline()}>
          Say no
        </Button>
        <Button variant="outline" size={56} block onClick={() => onOpenChange(false)}>
          Go back
        </Button>
      </SheetActions>
      <Button variant="text" size={48} className="sheet-link" onClick={onAsk}>
        Not sure? Ask {builder} a question instead.
      </Button>
    </Sheet>
  )
}
