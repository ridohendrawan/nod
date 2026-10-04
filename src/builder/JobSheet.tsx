// The job sheet (ux-spec 2; D55): which state's rules apply, the contract price and the date
// the contract was signed. Drafts follow a change at once; anything already sent keeps the rules
// it was sent under, because the rule set is part of what Sarah approved.
import { useState } from 'react'
import { VIC_REFORM_START } from '../../shared/rules/index.ts'
import { STATE_NAME, STATES, type StateCode } from '../../shared/states.ts'
import { formatDateLong } from '../../shared/time.ts'
import type { Job } from '../../shared/types.ts'
import { announce } from '../lib/announce.ts'
import { api, isApiError } from '../lib/api.ts'
import { Button } from '../ui/Button.tsx'
import { Callout } from '../ui/Callout.tsx'
import { ChipGroup } from '../ui/ChipGroup.tsx'
import { TextField } from '../ui/Field.tsx'
import { MoneyInput } from '../ui/MoneyInput.tsx'
import { Sheet, SheetActions } from '../ui/Sheet.tsx'
import { useToasts } from '../ui/toastContext.ts'

export function JobSheet({
  open,
  onOpenChange,
  job,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
}) {
  const { show } = useToasts()
  const [state, setState] = useState<StateCode>(job.state)
  const [price, setPrice] = useState<number | null>(job.contract_price_cents)
  const [date, setDate] = useState(job.contract_date)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Opening again starts from the job as it is now.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setState(job.state)
      setPrice(job.contract_price_cents)
      setDate(job.contract_date)
      setError(null)
    }
  }

  const reform = state === 'VIC' && date >= VIC_REFORM_START

  const save = async () => {
    if (price === null || price <= 0) {
      setError('Enter the contract price in dollars, like 47,500.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await api.updateJob(job.id, { state, contract_price_cents: price, contract_date: date })
      onOpenChange(false)
      // Said once: as a toast for the eye, announced with it (D79).
      show(
        state !== job.state
          ? `Checklist updated for ${STATE_NAME[state]}.`
          : 'Job details saved. Drafts follow them now.',
      )
    } catch (e) {
      const message = isApiError(e) ? e.message : 'That didn’t save. Try again.'
      setError(message)
      announce(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Job details" hasFields>
      <ChipGroup<StateCode>
        legend="State rules"
        options={STATES.map((s) => ({ value: s, label: STATE_NAME[s] }))}
        value={state}
        onChange={setState}
      />
      <MoneyInput label="Contract price" cents={price} onChange={setPrice} />
      <TextField
        label="Contract signed"
        type="date"
        value={date}
        hint={formatDateLong(date)}
        onChange={(e) => {
          if (e.target.value) setDate(e.target.value)
        }}
      />
      <p className="sheet-prose-line">
        Drafts update to the new rules straight away. Changes you’ve already sent keep the rules
        they were sent under.
      </p>
      {reform ? (
        <Callout tone="wait">
          Contracts signed from {formatDateLong(VIC_REFORM_START).replace(/^\w+day\s/, '')} use
          Victoria’s new rules: every change needs both signatures, and there’s no 2% exception.
        </Callout>
      ) : null}
      {error ? <p className="sheet-error">{error}</p> : null}
      <SheetActions>
        <Button variant="primary" size={56} block pending={pending} onClick={() => void save()}>
          Save
        </Button>
        <Button variant="outline" size={56} block onClick={() => onOpenChange(false)}>
          Not now
        </Button>
      </SheetActions>
    </Sheet>
  )
}
