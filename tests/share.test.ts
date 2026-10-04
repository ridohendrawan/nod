import { describe, expect, it } from 'vitest'
import { ownerCard, type OwnerCardContent } from '../shared/owner.ts'
import {
  emailMessage,
  isGsm7Ascii,
  SMS_LIMIT,
  smsText,
  toAscii,
  type ShareInput,
} from '../shared/sms.ts'

const url = 'https://nod-good.vercel.app/o/Abcdefghijklmnopqrstuv'

const sarah: ShareInput = {
  url,
  clientFirstName: 'Sarah',
  builderName: 'Dan',
  businessName: 'Brightside Renovations',
  builderMobile: '0491 570 156',
  jobTitle: 'Kitchen renovation',
  update: false,
}

describe('the text message (D73)', () => {
  it('is the lock-screen sentence, with the link, in one plain segment', () => {
    const text = smsText(sarah)
    expect(text).toBe(
      `Hi Sarah, it's Dan from Brightside Renovations. Here's a change to your kitchen renovation for your OK: ${url}`,
    )
    expect(text.length).toBeLessThanOrEqual(SMS_LIMIT)
    expect(isGsm7Ascii(text)).toBe(true)
  })

  it('never carries the price', () => {
    expect(smsText(sarah)).not.toMatch(/\$|\d+ (dollars|bucks)/)
  })

  it('says “an updated change” for a new version', () => {
    expect(smsText({ ...sarah, update: true })).toContain(
      "Here's an updated change to your kitchen renovation",
    )
  })

  it('drops the business name for an update on the production link (165 would be too long)', () => {
    const text = smsText({ ...sarah, update: true })
    expect(text).toBe(
      `Hi Sarah, it's Dan. Here's an updated change to your kitchen renovation for your OK: ${url}`,
    )
    expect(text.length).toBeLessThanOrEqual(SMS_LIMIT)
  })

  it('steps down to shorter forms rather than going over 160 characters', () => {
    const long = smsText({
      ...sarah,
      businessName: 'Brightside Renovations and Extensions of the Greater Brisbane Region',
      jobTitle: 'Kitchen, laundry and downstairs bathroom renovation',
    })
    expect(long.length).toBeLessThanOrEqual(SMS_LIMIT)
    expect(long.endsWith(url)).toBe(true)
  })

  it('turns typographic characters into plain ones', () => {
    expect(toAscii('Sarah’s café')).toBe("Sarah's cafe")
  })
})

describe('the email (D60)', () => {
  it('builds a mailto link with the subject and a CRLF body', () => {
    const email = emailMessage({ ...sarah, to: 'sarah.chen@example.com' })
    expect(email.subject).toBe('A change to your kitchen renovation')
    expect(email.body).toContain(url)
    expect(email.body).toContain('Questions? Call Dan on 0491 570 156.')
    expect(
      email.href.startsWith(
        'mailto:sarah.chen@example.com?subject=A%20change%20to%20your%20kitchen%20renovation&body=',
      ),
    ).toBe(true)
    expect(email.href).toContain('%0D%0A')
  })
})

const golden: OwnerCardContent = {
  title: 'Extra double power point on island bench',
  owner_title: 'Extra double power point on the island bench',
  items: [
    {
      text: 'Install one extra double GPO',
      owner_text: 'One extra double power point on the end of the island bench',
    },
  ],
  reason: null,
  owner_reason: null,
  requested_by: 'owner',
  price_cents: 22_000,
  price_method: null,
  delay_days: 0,
  payment_timing: 'next_claim',
  permit_change: null,
  work_effect: null,
  photo_id: null,
}

const card = (content: OwnerCardContent, state: 'QLD' | 'VIC' = 'QLD') =>
  ownerCard({
    content,
    number: 2,
    job: { title: 'Kitchen renovation', client_first_name: 'Sarah', state },
    builder: { name: 'Dan', business: 'Brightside Renovations', mobile: '0491 570 156' },
    total_before_cents: 4_895_000,
  })

describe('Sarah’s card (ux-spec.md 7; D78)', () => {
  it('states the golden path in words, never symbols', () => {
    const c = card(golden)
    expect(c.title).toBe('Extra double power point on the island bench')
    expect(c.facts.map((f) => [f.label, f.value])).toEqual([
      ['Price', 'Adds $220 to the price'],
      ['Extra time', 'No extra time'],
      ['When it’s paid', 'Added to your next progress payment'],
      ['Asked for by', 'You'],
    ])
    expect(c.totals).toEqual({ before_cents: 4_895_000, after_cents: 4_917_000 })
    expect(c.saving).toBeNull()
    expect(JSON.stringify(c.facts)).not.toMatch(/[+−]/)
  })

  it('reads a credit as a saving', () => {
    const c = card({ ...golden, price_cents: -40_000, payment_timing: 'final_payment' })
    expect(c.facts[0].value).toBe('Takes $400 off the price')
    expect(c.saving).toBe('You save $400')
    expect(c.facts.find((f) => f.id === 'payment')).toMatchObject({
      label: 'When it’s credited',
      value: 'Taken off your final payment',
    })
  })

  it('adds the permit and the effect on the job in Victoria only', () => {
    const vic = { ...golden, permit_change: false, work_effect: 'Nothing else changes' }
    expect(card(vic, 'VIC').facts.map((f) => f.id)).toEqual([
      'price',
      'time',
      'payment',
      'permit',
      'work_effect',
      'asked_by',
    ])
    expect(card(vic, 'QLD').facts.map((f) => f.id)).not.toContain('permit')
  })

  it('falls back to Dan’s words where Sarah’s are blank', () => {
    const c = card({
      ...golden,
      owner_title: ' ',
      items: [{ text: 'Install a GPO', owner_text: '' }],
    })
    expect(c.title).toBe('Extra double power point on island bench')
    expect(c.items).toEqual(['Install a GPO'])
  })

  it('shows cents on every amount when one has them', () => {
    const c = card({ ...golden, price_cents: 22_050 })
    expect(c.cents).toBe(true)
    expect(c.facts[0].value).toBe('Adds $220.50 to the price')
  })
})
