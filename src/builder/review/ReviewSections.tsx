// The Review screen's sections (ux-spec 4), in the order the checklist reads them (FIELD_ORDER).
// Which sections show, and which are required, comes from the rules engine's checks for this
// job, never from a second copy of the law here. Each control that a checklist gap can point at
// sits in [data-field], so a press on the gap (or on a blocked Send) lands on it.
// "From your note" (D64) and "Worth checking" (D65) stay on their own field.
import {
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Landmark,
  Plus,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { builder, owner, type PaymentTiming, type RequestedBy } from '../../../shared/copy.ts'
import { formatMoney, hasCents } from '../../../shared/money.ts'
import type { Check, Evaluation, FieldId } from '../../../shared/rules/types.ts'
import { formatDate } from '../../../shared/time.ts'
import type { DraftAi, Job } from '../../../shared/types.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Callout } from '../../ui/Callout.tsx'
import { ChipGroup, Segmented } from '../../ui/ChipGroup.tsx'
import { TextArea, TextField } from '../../ui/Field.tsx'
import { MoneyInput } from '../../ui/MoneyInput.tsx'
import { SourceLine, SourceNone, SourceSuggestions } from '../../ui/SourceLine.tsx'
import { LIMITS, hasCheck, priceFrom, priceParts, type PriceKind, type Working } from './working.ts'

export type SectionProps = {
  w: Working
  set: (patch: Partial<Working>) => void
  job: Job
  ai: DraftAi | null
  /** Fields Dan has touched here: their tags and notes clear at once, before the save lands. */
  touched: ReadonlySet<FieldId>
  evaluation: Evaluation
  /** Dan pressed a blocked Send: the gaps now read as errors, not just to-dos. */
  attempted: boolean
  /** Open the note with these words highlighted (D64). */
  onShowQuote: (quote: string) => void
}

/** The required item still missing for this field, once Dan has tried to send. */
function gapFor(p: SectionProps, field: FieldId): Check | null {
  if (!p.attempted) return null
  return p.evaluation.gaps.find((g) => g.field === field) ?? null
}

const errorOf = (gap: Check | null) => (gap?.action ? `${gap.action}.` : null)

const drafted = (p: SectionProps, field: FieldId) =>
  !!p.ai?.from_note.includes(field) && !p.touched.has(field)

/** Dan's exact words behind a value, until he touches the field (D64). */
function quoteFor(p: SectionProps, key: 'price' | 'delay' | 'payment', field: FieldId) {
  return p.touched.has(field) ? null : (p.ai?.quotes[key] ?? null)
}

function Quote({ p, quote }: { p: SectionProps; quote: string }) {
  return <SourceLine quote={quote} onShow={() => p.onShowQuote(quote)} />
}

/** "Worth checking" notes for one field (D65), until Dan touches it. */
function WorthChecking({ p, field }: { p: SectionProps; field: FieldId }) {
  if (p.touched.has(field)) return null
  const notes = p.ai?.worth_checking.filter((n) => n.field === field) ?? []
  return (
    <>
      {notes.map((n) => (
        <Callout key={n.text} tone="wait" title="Worth checking">
          {n.text}
        </Callout>
      ))}
    </>
  )
}

function FormCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section className="card form-card" aria-labelledby={id}>
      <div className="form-card-head">
        <span className="form-card-icon" aria-hidden="true">
          {icon}
        </span>
        <h2 id={id} className="t-title-2">
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

const ICON = { size: 20, strokeWidth: 2.25 } as const

/** Focus something that renders on the next frame (a new line item, an opened field). */
function focusSoon(selector: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus())
}

// ---- 1. What's changing ----------------------------------------------------------------------

export function WhatSection(p: SectionProps & { flag?: ReactNode }) {
  const items = p.w.items
  const gap = gapFor(p, 'description')
  const titleMissing = !p.w.title.trim()
  const setItem = (index: number, text: string) =>
    p.set({ items: items.map((it, i) => (i === index ? { ...it, text } : it)) })
  const removeItem = (index: number) => {
    p.set({ items: items.filter((_, i) => i !== index) })
    focusSoon(`[data-item="${Math.max(0, index - 1)}"] textarea`)
  }
  const addItem = () => {
    p.set({ items: [...items, { text: '', owner_text: '' }] })
    focusSoon(`[data-item="${items.length}"] textarea`)
  }
  return (
    <FormCard icon={<ClipboardList {...ICON} />} title="What’s changing">
      <div data-field="description">
        <TextArea
          label="Title"
          value={p.w.title}
          rows={2}
          maxLength={LIMITS.title}
          className="title-input"
          drafted={drafted(p, 'description')}
          error={gap && titleMissing ? errorOf(gap) : null}
          enterKeyHint="next"
          onKeyDown={(e) => {
            // A title is one line: Return moves on to the first item instead.
            if (e.key === 'Enter') {
              e.preventDefault()
              focusSoon('[data-item="0"] textarea')
            }
          }}
          onChange={(e) => p.set({ title: e.target.value.replace(/\s*\n+\s*/g, ' ') })}
        />
      </div>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">
          Line items
          {drafted(p, 'description') ? <span className="drafted-tag">From your note</span> : null}
        </legend>
        <ol className="item-list">
          {items.map((item, i) => (
            <li
              key={i}
              className="item-row"
              data-item={i}
              data-field={i === 0 ? 'description-items' : undefined}
            >
              <TextArea
                label={`Item ${i + 1}`}
                value={item.text}
                rows={2}
                maxLength={LIMITS.text}
                className="item-input"
                error={gap && !titleMissing && i === 0 ? errorOf(gap) : null}
                onChange={(e) => setItem(i, e.target.value)}
              />
              {items.length > 1 ? (
                <IconButton
                  className="item-remove"
                  label={`Remove item ${i + 1}`}
                  icon={<X size={20} strokeWidth={2.25} aria-hidden="true" />}
                  onClick={() => removeItem(i)}
                />
              ) : null}
            </li>
          ))}
        </ol>
        {items.length < LIMITS.items ? (
          <Button
            variant="outline"
            size={48}
            className="item-add"
            icon={<Plus size={20} strokeWidth={2.5} aria-hidden="true" />}
            onClick={addItem}
          >
            Add an item
          </Button>
        ) : null}
      </fieldset>
      <WorthChecking p={p} field="description" />
      {p.flag}
    </FormCard>
  )
}

// ---- 2 and 3. Who asked, and why --------------------------------------------------------------

export function WhoWhySection(p: SectionProps) {
  const first = p.job.client_first_name
  const reasonRequired = hasCheck(p.evaluation, 'reason')
  // Victoria, a builder or site change: paid only if it couldn't have been foreseen (D58).
  const foreseeable = p.evaluation.notes.find((n) => n.id === 'vic_foreseeable')?.text
  const who = (by: RequestedBy) => ({ value: by, label: builder.requestedBy(by, first) })
  return (
    <FormCard icon={<UsersRound {...ICON} />} title="Who asked, and why">
      <div data-field="requested_by">
        <ChipGroup<RequestedBy>
          legend="Who asked for this?"
          options={[who('owner'), who('builder'), who('site')]}
          value={p.w.requested_by}
          drafted={drafted(p, 'requested_by')}
          invalid={!!gapFor(p, 'requested_by')}
          error={errorOf(gapFor(p, 'requested_by'))}
          onChange={(requested_by) => p.set({ requested_by })}
        />
      </div>
      <WorthChecking p={p} field="requested_by" />
      <div data-field="reason">
        <TextArea
          label={reasonRequired ? 'Why it’s needed' : 'Why it’s needed (optional)'}
          hint={foreseeable}
          value={p.w.reason ?? ''}
          rows={3}
          maxLength={LIMITS.text}
          drafted={drafted(p, 'reason')}
          error={errorOf(gapFor(p, 'reason'))}
          onChange={(e) => p.set({ reason: e.target.value || null })}
        />
      </div>
      <WorthChecking p={p} field="reason" />
    </FormCard>
  )
}

// ---- 4. Price -------------------------------------------------------------------------------

export function PriceSection(p: SectionProps) {
  const first = p.job.client_first_name
  const state = p.job.state
  const price = p.w.price_cents
  const parts = priceParts(price)
  // Before there's an amount, Extra cost or Credit is still Dan's choice to remember.
  const [pickedKind, setPickedKind] = useState<PriceKind>(parts.kind)
  const kind: PriceKind = price === null ? pickedKind : parts.kind
  // The amount survives a trip to "No charge" and back, like any form would keep it.
  const [lastSize, setLastSize] = useState<number | null>(parts.size)
  const touched = p.touched.has('price')
  const quote = quoteFor(p, 'price', 'price')
  const hint = touched ? null : (p.ai?.price_hint ?? null)
  const [methodOpen, setMethodOpen] = useState(!!p.w.price_method)
  const options = { cents: hasCents([price]) }

  const setKind = (next: PriceKind) => {
    setPickedKind(next)
    p.set({ price_cents: priceFrom(next, parts.size ?? lastSize) })
  }
  const setSize = (cents: number | null) => {
    if (cents !== null) setLastSize(cents)
    p.set({ price_cents: priceFrom(kind === 'none' ? 'extra' : kind, cents) })
  }
  const pick = (cents: number) => {
    setLastSize(Math.abs(cents))
    setPickedKind(cents < 0 ? 'credit' : 'extra')
    p.set({ price_cents: cents })
  }

  // A fuzzy price ("about one-fifty", "plus GST") comes with one-tap answers; they win over a
  // plain source line, because Dan has a choice to make (D81).
  const source = hint ? (
    <div className="price-hint">
      <Quote p={p} quote={hint.quote} />
      {hint.kind === 'plus_gst' ? (
        <p className="field-hint">{first} has to see the price with GST.</p>
      ) : null}
      <SourceSuggestions
        options={
          hint.kind === 'approximate'
            ? [{ label: `Use ${formatMoney(hint.cents)}`, onPick: () => pick(hint.cents) }]
            : [
                {
                  label: `Use ${formatMoney(hint.with_gst_cents)} (with GST)`,
                  onPick: () => pick(hint.with_gst_cents),
                },
                {
                  label: `${formatMoney(hint.cents)} already includes GST`,
                  onPick: () => pick(hint.cents),
                },
              ]
        }
      />
    </div>
  ) : quote ? (
    <Quote p={p} quote={quote} />
  ) : p.ai && price === null && !touched ? (
    <SourceNone>You didn’t say a price. Nod never guesses one.</SourceNone>
  ) : null

  return (
    <FormCard icon={<CircleDollarSign {...ICON} />} title="Price">
      <Segmented<PriceKind>
        legend="Extra cost, credit or no charge"
        hideLegend
        options={[
          { value: 'extra', label: 'Extra cost' },
          { value: 'credit', label: 'Credit' },
          { value: 'none', label: 'No charge' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === 'none' ? (
        <p className="money-preview">
          {first} will see: <b>{owner.price(0)}</b>
        </p>
      ) : (
        <div data-field="price">
          <MoneyInput
            cents={parts.size}
            onChange={setSize}
            missing={price === null}
            drafted={drafted(p, 'price')}
            source={source}
            preview={
              price === null ? null : (
                <>
                  {first} will see: <b>{owner.price(price, options)}</b>
                </>
              )
            }
          />
        </div>
      )}
      <WorthChecking p={p} field="price" />
      {state === 'QLD' || state === 'NSW' ? (
        methodOpen ? (
          <div data-field="price_method">
            <TextArea
              label={state === 'QLD' ? 'How it’s worked out' : 'How the price adds up (optional)'}
              hint={state === 'QLD' ? 'For example: supplier’s price plus 10%.' : undefined}
              value={p.w.price_method ?? ''}
              rows={2}
              maxLength={LIMITS.method}
              onChange={(e) => p.set({ price_method: e.target.value || null })}
            />
          </div>
        ) : (
          <Button
            variant="text"
            size={48}
            className="price-method-open"
            icon={<Plus size={18} strokeWidth={2.5} aria-hidden="true" />}
            onClick={() => {
              setMethodOpen(true)
              focusSoon('[data-field="price_method"] textarea')
            }}
          >
            {state === 'QLD' ? 'Or say how it’s worked out' : 'Add how the price adds up'}
          </Button>
        )
      ) : null}
    </FormCard>
  )
}

// ---- 5. Extra working days, and QLD's date asked -----------------------------------------------

const DAY_PRESETS = ['0', '1', '2', '3', '5'] as const
type DayChoice = (typeof DAY_PRESETS)[number] | 'other'

const DAY_OPTIONS: readonly { value: DayChoice; label: string }[] = [
  ...DAY_PRESETS.map((d) => ({ value: d, label: builder.days(Number(d)) ?? d })),
  { value: 'other', label: 'Other' },
]

/** "4", "1.5" or "1,5" as whole or half days; null for anything else. */
function parseDays(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n <= 365 && Number.isInteger(n * 2) ? n : null
}

export function TimeSection(p: SectionProps & { today: string }) {
  const first = p.job.client_first_name
  const d = p.w.delay_days
  const preset: DayChoice | null =
    d === null ? null : (DAY_PRESETS.find((x) => x === String(d)) ?? 'other')
  const [otherOpen, setOtherOpen] = useState(preset === 'other')
  const [otherText, setOtherText] = useState(preset === 'other' && d !== null ? String(d) : '')
  const [otherError, setOtherError] = useState<string | null>(null)
  const choice: DayChoice | null = otherOpen ? 'other' : preset
  const quote = quoteFor(p, 'delay', 'delay')
  const showDate = hasCheck(p.evaluation, 'date_requested')
  const [editingDate, setEditingDate] = useState(false)

  return (
    <FormCard icon={<CalendarClock {...ICON} />} title="Time">
      <div data-field="delay">
        <ChipGroup<DayChoice>
          legend="Extra working days"
          options={DAY_OPTIONS}
          value={choice}
          drafted={drafted(p, 'delay')}
          invalid={!!gapFor(p, 'delay')}
          error={errorOf(gapFor(p, 'delay'))}
          onChange={(value) => {
            if (value === 'other') {
              setOtherOpen(true)
              setOtherText(d === null ? '' : String(d))
              focusSoon('[data-days-other] input')
              return
            }
            setOtherOpen(false)
            setOtherError(null)
            p.set({ delay_days: Number(value) })
          }}
        />
      </div>
      {otherOpen ? (
        <div data-days-other="">
          <TextField
            label="How many working days?"
            hint="Halves are fine, like 1.5."
            inputMode="decimal"
            autoComplete="off"
            value={otherText}
            error={otherError}
            onChange={(e) => {
              setOtherText(e.target.value)
              const n = parseDays(e.target.value)
              if (n !== null) setOtherError(null)
              p.set({ delay_days: n })
            }}
            onBlur={() => {
              if (otherText.trim() && parseDays(otherText) === null)
                setOtherError('Enter whole or half days, like 4 or 1.5.')
            }}
          />
        </div>
      ) : null}
      {quote ? <Quote p={p} quote={quote} /> : null}
      <WorthChecking p={p} field="delay" />
      {showDate ? (
        <div className="date-asked" data-field="date_requested">
          {editingDate ? (
            <TextField
              label={`Date ${first} asked`}
              type="date"
              max={p.today}
              value={p.w.date_requested}
              onChange={(e) => {
                if (e.target.value && e.target.value <= p.today)
                  p.set({ date_requested: e.target.value })
              }}
            />
          ) : (
            <>
              <p className="field-label">Date {first} asked</p>
              <div className="date-asked-row">
                <span className="date-asked-value">
                  {formatDate(p.w.date_requested)}
                  {p.w.date_requested === p.today ? ' (today)' : ''}
                </span>
                <Button
                  variant="outline"
                  size={48}
                  onClick={() => {
                    setEditingDate(true)
                    focusSoon('[data-field="date_requested"] input')
                  }}
                >
                  Change<span className="visually-hidden"> the date {first} asked</span>
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </FormCard>
  )
}

// ---- 6. QLD: when it's paid --------------------------------------------------------------------

export function PaymentSection(p: SectionProps) {
  const credit = (p.w.price_cents ?? 0) < 0
  const timings: PaymentTiming[] = credit
    ? ['next_claim', 'final_payment']
    : ['next_claim', 'on_completion', 'final_payment']
  const quote = quoteFor(p, 'payment', 'payment')
  const said = p.touched.has('payment') ? null : (p.ai?.payment_said ?? null)
  return (
    <FormCard icon={<Wallet {...ICON} />} title="Payment">
      {said ? (
        <div className="payment-said">
          <Quote p={p} quote={said.quote} />
          {said.upfront ? (
            <p className="field-hint">Payment can’t be asked for before the work starts.</p>
          ) : null}
        </div>
      ) : null}
      <div data-field="payment">
        <ChipGroup<PaymentTiming>
          legend={credit ? 'When is it credited?' : 'When is it paid?'}
          hint="You can’t ask for it before this work starts."
          options={timings.map((t) => ({ value: t, label: builder.payment(t, credit) }))}
          value={
            p.w.payment_timing && timings.includes(p.w.payment_timing) ? p.w.payment_timing : null
          }
          drafted={drafted(p, 'payment')}
          invalid={!!gapFor(p, 'payment')}
          error={errorOf(gapFor(p, 'payment'))}
          onChange={(payment_timing) => p.set({ payment_timing })}
        />
      </div>
      {quote ? <Quote p={p} quote={quote} /> : null}
      <WorthChecking p={p} field="payment" />
    </FormCard>
  )
}

// ---- 8 and 9. VIC: the permit, and the effect on the rest of the job ---------------------------

const NOTHING_ELSE = 'Nothing else changes'

export function VicSection(p: SectionProps) {
  const effect = p.w.work_effect
  const askEffect = hasCheck(p.evaluation, 'work_effect')
  const [describing, setDescribing] = useState(effect !== null && effect !== NOTHING_ELSE)
  const effectChoice = describing ? 'describe' : effect === NOTHING_ELSE ? 'nothing' : null
  return (
    <FormCard
      icon={<Landmark {...ICON} />}
      title={askEffect ? 'Permit and the rest of the job' : 'Permit'}
    >
      <div data-field="permit">
        <ChipGroup<'no' | 'yes'>
          legend="Does a permit need changing?"
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
          value={p.w.permit_change === null ? null : p.w.permit_change ? 'yes' : 'no'}
          drafted={drafted(p, 'permit')}
          invalid={!!gapFor(p, 'permit')}
          error={errorOf(gapFor(p, 'permit'))}
          onChange={(v) => p.set({ permit_change: v === 'yes' })}
        />
      </div>
      <WorthChecking p={p} field="permit" />
      {askEffect ? (
        <>
          <div data-field="work_effect">
            <ChipGroup<'nothing' | 'describe'>
              legend="Effect on the rest of the job"
              options={[
                { value: 'nothing', label: NOTHING_ELSE },
                { value: 'describe', label: 'Describe it' },
              ]}
              value={effectChoice}
              drafted={drafted(p, 'work_effect')}
              invalid={!!gapFor(p, 'work_effect') && !describing}
              error={describing ? null : errorOf(gapFor(p, 'work_effect'))}
              onChange={(v) => {
                if (v === 'nothing') {
                  setDescribing(false)
                  p.set({ work_effect: NOTHING_ELSE })
                  return
                }
                setDescribing(true)
                p.set({ work_effect: effect === NOTHING_ELSE ? null : effect })
                focusSoon('[data-effect-text] textarea')
              }}
            />
          </div>
          {describing ? (
            <div data-effect-text="">
              <TextArea
                label="How it affects the rest of the job"
                value={effect === NOTHING_ELSE ? '' : (effect ?? '')}
                rows={2}
                maxLength={LIMITS.text}
                error={errorOf(gapFor(p, 'work_effect'))}
                onChange={(e) => p.set({ work_effect: e.target.value || null })}
              />
            </div>
          ) : null}
          <WorthChecking p={p} field="work_effect" />
        </>
      ) : null}
    </FormCard>
  )
}
