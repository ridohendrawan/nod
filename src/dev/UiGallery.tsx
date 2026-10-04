// Development only (/dev/ui): every M2 form primitive with real content, to check the look at
// 390, 360 and 320 px before the screens exist. The checklist comes from the real rules engine.
import { useState } from 'react'
import { owner } from '../../shared/copy.ts'
import { evaluate, type DraftInput, type RuleContext } from '../../shared/rules/index.ts'
import { AppHeader, BackLink } from '../builder/AppHeader.tsx'
import { Checkbox } from '../ui/Checkbox.tsx'
import { ChipGroup, Segmented } from '../ui/ChipGroup.tsx'
import { Checklist } from '../ui/Checklist.tsx'
import { TextArea, TextField } from '../ui/Field.tsx'
import { MicButton } from '../ui/MicButton.tsx'
import { MoneyInput } from '../ui/MoneyInput.tsx'
import { SourceLine, SourceNone, SourceSuggestions } from '../ui/SourceLine.tsx'
import { usePageTitle } from '../ui/usePageTitle.ts'

const golden: DraftInput = {
  title: 'Extra double power point on the island bench',
  items: [{ text: 'Supply and install one double power point on the end of the island bench' }],
  requested_by: 'owner',
  reason: null,
  price_cents: 22_000,
  price_method: null,
  delay_days: 0,
  payment_timing: null,
  permit_change: null,
  work_effect: null,
  photo_id: null,
  date_requested: '2026-10-01',
}

const qld: RuleContext = {
  state: 'QLD',
  contract_date: '2026-07-20',
  contract_price_cents: 4_750_000,
  total_now_cents: 4_895_000,
  today: '2026-10-01',
  sent: false,
  approved: false,
}

type Kind = 'extra' | 'credit' | 'none'

export function UiGallery() {
  usePageTitle('UI gallery: Nod')
  const [who, setWho] = useState<'owner' | 'builder' | 'site' | null>('owner')
  const [kind, setKind] = useState<Kind>('extra')
  const [cents, setCents] = useState<number | null>(22_000)
  const [empty, setEmpty] = useState<number | null>(null)
  const [days, setDays] = useState<string | null>('0')
  const [paid, setPaid] = useState<'next_claim' | 'on_completion' | 'final_payment' | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [listening, setListening] = useState(false)

  const evaluation = evaluate({ ...golden, payment_timing: paid }, qld, 'Sarah')
  const signed = kind === 'credit' ? -(cents ?? 0) : kind === 'none' ? 0 : (cents ?? 0)

  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader floating left={<BackLink to="/" label="Jobs" />} />
      <main className="page page-builder">
        <div className="page-head">
          <h1 tabIndex={-1} className="t-title-1">
            UI gallery
          </h1>
          <p className="t-secondary">The M2 form pieces, with real content.</p>
        </div>

        <section className="card form-card">
          <TextField label="Title" drafted defaultValue="Extra double power point" />
          <TextArea
            label="Why it’s needed"
            hint="You’re only paid for this if you couldn’t reasonably have seen it coming when you signed the contract. Say why."
            error="Say why this change is needed."
          />
        </section>

        <section className="card form-card">
          <ChipGroup
            legend="Who asked for this?"
            options={[
              { value: 'owner', label: 'Sarah' },
              { value: 'builder', label: 'Me' },
              { value: 'site', label: 'Site conditions' },
            ]}
            value={who}
            onChange={setWho}
          />
          <ChipGroup
            legend="Extra working days"
            options={[
              { value: '0', label: 'No extra time' },
              { value: '1', label: '+1 day' },
              { value: '2', label: '+2 days' },
              { value: '3', label: '+3 days' },
              { value: '5', label: '+5 days' },
              { value: 'other', label: 'Other' },
            ]}
            value={days}
            onChange={setDays}
          />
          <SourceLine quote="won’t hold us up" onShow={() => undefined} />
        </section>

        <section className="card form-card">
          <Segmented
            legend="Price"
            options={[
              { value: 'extra', label: 'Extra cost' },
              { value: 'credit', label: 'Credit' },
              { value: 'none', label: 'No charge' },
            ]}
            value={kind}
            onChange={setKind}
          />
          {kind === 'none' ? null : (
            <MoneyInput
              cents={cents}
              onChange={setCents}
              source={<SourceLine quote="220 all up" onShow={() => undefined} />}
              preview={
                <>
                  Sarah will see: <b>{owner.price(signed)}</b>
                </>
              }
            />
          )}
          <MoneyInput
            label="Amount in dollars, including GST (nothing said yet)"
            cents={empty}
            onChange={setEmpty}
            missing
            source={
              <>
                <SourceNone>You didn’t say a price. Nod never guesses one.</SourceNone>
                <SourceSuggestions
                  options={[{ label: 'Use $150', onPick: () => setEmpty(15_000) }]}
                />
              </>
            }
          />
        </section>

        <section className="card form-card">
          <ChipGroup
            legend="When is it paid?"
            hint="You can’t ask for it before this work starts."
            invalid={paid === null}
            options={[
              { value: 'next_claim', label: 'With the next progress claim' },
              { value: 'on_completion', label: 'When this work is done' },
              { value: 'final_payment', label: 'With the final payment' },
            ]}
            value={paid}
            onChange={setPaid}
          />
        </section>

        <Checklist evaluation={evaluation} onGoTo={() => undefined} />

        <section className="card form-card">
          <Checkbox checked={agreed} onChange={setAgreed}>
            I agree to this change to my building contract: an extra double power point on the
            island bench. It adds $220 to the price. It does not add any time. My new contract total
            is $49,170.
          </Checkbox>
        </section>

        <section className="card form-card mic-stage">
          <MicButton listening={listening} hearing onPress={() => setListening((x) => !x)} />
          <p className="t-secondary">
            {listening ? 'Listening 0:12. Tap to stop.' : 'Tap to talk'}
          </p>
        </section>
      </main>
    </div>
  )
}
