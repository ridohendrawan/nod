import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import { applyGuardrails } from '../shared/ai/guardrails.ts'
import { sampleNote } from '../shared/ai/samples.ts'
import { ApiError } from '../src/data/errors.ts'
import {
  approve,
  askQuestion,
  decline,
  markSeen,
  needsSeen,
  ownerViewOf,
} from '../src/data/owner.ts'
import { freshDoc } from '../src/data/seed.ts'
import type { StateDoc, VariationRecord } from '../src/data/store.ts'
import {
  applyPatch,
  createAiDrafts,
  createManualDraft,
  discardEdits,
  discardEditsWithPhoto,
  hasPendingEdits,
  ownerCardFor,
  reply,
  revise,
  sendVariation,
  setPhoto,
  toVariation,
  updateJob,
  withdraw,
} from '../src/data/variations.ts'

const NBSP = ' '
const plain = (s: string) => s.replaceAll(NBSP, ' ')
const now = new Date('2026-10-01T04:15:00Z') // 2:15 pm in Brisbane
const later = new Date('2026-10-01T04:19:00Z')
const UA = 'Mozilla/5.0 (iPhone)'

let doc: StateDoc
let v: VariationRecord
let token: string

/** The golden path up to "sent": the power point, paid with the next progress claim. */
beforeEach(async () => {
  doc = await freshDoc(now)
  const note = sampleNote('one_change', 'Sarah')
  const g = applyGuardrails(fixtureFor(note, 'Sarah')!, note)
  ;[v] = createAiDrafts(
    doc,
    doc.jobs[0].id,
    note,
    {
      changes: g.changes,
      site_note: null,
      no_change_reason: null,
      meta: { model: 'fixture', mode: 'fixture', latency_ms: 0 },
    },
    now,
  )
  applyPatch(doc, v.id, { payment_timing: 'next_claim' }, now)
  await sendVariation(doc, v.id, 0, now)
  token = v.owner_token!
})

const rejects = (fn: () => unknown, code: string) => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).code).toBe(code)
    return
  }
  throw new Error(`expected ${code}`)
}

describe('Sarah’s page (ux-spec.md 7)', () => {
  it('shows Change 2 in her words, with the totals and the consent sentence', () => {
    const view = ownerViewOf(doc, token)
    expect(view).toMatchObject({ status: 'sent', number: 2, version: 1, client_name: 'Sarah Chen' })
    expect(view.card.title).toBe('Extra double power point on the island bench')
    expect(view.card.totals).toEqual({ before_cents: 4_895_000, after_cents: 4_917_000 })
    expect(view.consent).toBe(
      'I agree to this change to my building contract: extra double power point on the island bench. It adds $220 to the price. It does not add any time. My new contract total is $49,170.',
    )
    expect(view.payment_line).toBe('The $220 will be added to your next progress payment.')
    expect(view.update).toBeNull()
    expect(view.decision).toBeNull()
  })

  it('says the link isn’t working for an unknown token', () => {
    rejects(() => ownerViewOf(doc, 'not-a-real-token'), 'not_found')
  })

  it('records “opened” once per version, and never just from reading (D70)', () => {
    ownerViewOf(doc, token)
    expect(v.seen_at).toBeNull()
    expect(needsSeen(doc, token, 1)).toBe(true)
    markSeen(doc, token, 1, later)
    markSeen(doc, token, 1, later)
    expect(doc.events.filter((e) => e.type === 'opened' && e.variation_id === v.id)).toHaveLength(1)
    expect(needsSeen(doc, token, 1)).toBe(false)
  })
})

describe('approving (D7, D71)', () => {
  it('records her typed name, the version and the totals she saw', () => {
    approve(
      doc,
      token,
      { name: '  Sarah   Chen ', agreed: true, fingerprint: v.fingerprint! },
      UA,
      later,
    )
    expect(v).toMatchObject({
      status: 'approved',
      decided_name: 'Sarah Chen',
      decided_fingerprint: v.fingerprint,
    })
    expect(v.decided_meta).toEqual({
      user_agent: UA,
      version: 1,
      totals_shown: { before_cents: 4_895_000, after_cents: 4_917_000 },
    })
    const view = ownerViewOf(doc, token)
    expect(plain(view.decision!.line)).toBe(
      'Approved by Sarah Chen on Thursday 1 October 2026 at 2:19 pm (Brisbane time).',
    )
    expect(view.record_number).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('needs her name and the tick', () => {
    rejects(
      () =>
        approve(doc, token, { name: ' ', agreed: true, fingerprint: v.fingerprint! }, UA, later),
      'invalid',
    )
    rejects(
      () =>
        approve(
          doc,
          token,
          { name: 'Sarah Chen', agreed: false, fingerprint: v.fingerprint! },
          UA,
          later,
        ),
      'invalid',
    )
  })

  it('refuses a stale version with 409 changed, and a second answer with 409 locked', () => {
    rejects(
      () =>
        approve(doc, token, { name: 'Sarah Chen', agreed: true, fingerprint: 'old' }, UA, later),
      'changed',
    )
    approve(
      doc,
      token,
      { name: 'Sarah Chen', agreed: true, fingerprint: v.fingerprint! },
      UA,
      later,
    )
    rejects(
      () =>
        approve(
          doc,
          token,
          { name: 'Sarah Chen', agreed: true, fingerprint: v.fingerprint! },
          UA,
          later,
        ),
      'locked',
    )
    rejects(() => applyPatch(doc, v.id, { title: 'x' }, later), 'locked')
  })
})

describe('questions and replies (D25)', () => {
  it('waits on Dan after her question, and on her again after his reply', () => {
    askQuestion(doc, token, 'Is that the same finish as the others?', later)
    expect(v.status).toBe('question')
    reply(doc, v.id, 'Yes, the same white as the rest.', later)
    expect(v.status).toBe('sent')
    expect(ownerViewOf(doc, token).thread.map((t) => [t.from, t.text])).toEqual([
      ['owner', 'Is that the same finish as the others?'],
      ['builder', 'Yes, the same white as the rest.'],
    ])
  })

  it('lets her approve while the question is open', () => {
    askQuestion(doc, token, 'Which wall?', later)
    approve(
      doc,
      token,
      { name: 'Sarah Chen', agreed: true, fingerprint: v.fingerprint! },
      UA,
      later,
    )
    expect(v.status).toBe('approved')
  })
})

describe('saying no, and a new version (D26)', () => {
  it('locks the change and lets Dan start a new draft that replaces it', () => {
    decline(doc, token, { reason: 'Not this month', fingerprint: v.fingerprint! }, later)
    expect(v).toMatchObject({ status: 'declined', decline_reason: 'Not this month' })
    expect(plain(ownerViewOf(doc, token).decision!.line)).toBe(
      'You said no on Thursday 1 October 2026 at 2:19 pm (Brisbane time).',
    )
    const draft = revise(doc, v.id, later)
    expect(draft).toMatchObject({
      status: 'draft',
      number: null,
      revises_id: v.id,
      price_cents: 22_000,
    })
    applyPatch(doc, draft.id, {}, later)
    return sendVariation(doc, draft.id, 0, later).then(() => {
      expect(ownerViewOf(doc, draft.owner_token!).replaces).toEqual({ number: 2 })
    })
  })
})

describe('editing after sending (D68)', () => {
  it('keeps edits private until sent, then tells her what changed, on the same link', async () => {
    applyPatch(doc, v.id, { price_cents: 26_000 }, later)
    expect(hasPendingEdits(v)).toBe(true)
    expect(ownerViewOf(doc, token).card.facts[0].value).toBe('Adds $220 to the price')

    await sendVariation(doc, v.id, 1, later)
    expect(v).toMatchObject({ version: 2, owner_token: token, status: 'sent' })
    const view = ownerViewOf(doc, token)
    expect(view.update?.changes).toEqual(['The price changed from $220 to $260.'])
    expect(view.card.facts[0].value).toBe('Adds $260 to the price')
  })

  it('fails her approval of the old version after an update', async () => {
    const old = v.fingerprint!
    applyPatch(doc, v.id, { delay_days: 1 }, later)
    await sendVariation(doc, v.id, 1, later)
    rejects(
      () => approve(doc, token, { name: 'Sarah Chen', agreed: true, fingerprint: old }, UA, later),
      'changed',
    )
    expect(ownerViewOf(doc, token).update?.changes).toEqual([
      'The extra time changed from no extra time to about 1 extra working day.',
    ])
  })

  it('refuses an update with nothing new in it', async () => {
    await expect(sendVariation(doc, v.id, 1, later)).rejects.toMatchObject({
      code: 'invalid',
      message: 'Nothing has changed since Sarah got it.',
    })
  })

  it('hands back a pending photo nobody uses once the edits are thrown away', () => {
    setPhoto(doc, v.id, 'photo-1', later)
    const { orphan } = discardEditsWithPhoto(doc, v.id, later)
    expect(orphan).toBe('photo-1')
    expect(v.photo_id).toBeNull()
  })

  it('throws away edits Dan doesn’t want to send', () => {
    applyPatch(doc, v.id, { title: 'Two power points' }, later)
    discardEdits(doc, v.id, later)
    expect(v.title).toBe('Extra double power point on island bench')
    expect(hasPendingEdits(v)).toBe(false)
  })
})

describe('withdrawing', () => {
  it('locks the change and her page says so', () => {
    withdraw(doc, v.id, later)
    expect(ownerViewOf(doc, token).status).toBe('withdrawn')
    rejects(
      () =>
        approve(
          doc,
          token,
          { name: 'Sarah Chen', agreed: true, fingerprint: v.fingerprint! },
          UA,
          later,
        ),
      'locked',
    )
  })
})

describe('the job sheet', () => {
  it('switches the job to Victoria and logs it; sent changes keep their rules', () => {
    const job = updateJob(doc, doc.jobs[0].id, { state: 'VIC' }, later)
    expect(job.state).toBe('VIC')
    expect(doc.events.at(-1)).toMatchObject({
      type: 'state_changed',
      body: { before: { state: 'QLD' }, after: { state: 'VIC' } },
    })
    expect(v.sent_content?.rules.id).toBe('qld-1991')
  })

  it('a sent record keeps the state and time zone it was sent under (D10): her page promises it always shows what she approved', () => {
    approve(
      doc,
      token,
      { name: 'Sarah Chen', agreed: true, fingerprint: v.fingerprint! },
      UA,
      later,
    )
    updateJob(doc, doc.jobs[0].id, { state: 'VIC' }, later)
    const view = ownerViewOf(doc, token)
    expect(view.card.state).toBe('QLD')
    expect(plain(view.decision!.line)).toBe(
      'Approved by Sarah Chen on Thursday 1 October 2026 at 2:19 pm (Brisbane time).',
    )
    expect(toVariation(v).sent_state).toBe('QLD')
    expect(ownerCardFor(doc, doc.jobs[0], v).state).toBe('QLD')
    // Never sent: no sent state, and Dan's preview follows the job.
    const draft = createManualDraft(doc, doc.jobs[0].id, null, later)
    expect(toVariation(draft).sent_state).toBeNull()
    expect(ownerCardFor(doc, doc.jobs[0], draft).state).toBe('VIC')
  })

  it('refuses a bad contract price', () => {
    rejects(() => updateJob(doc, doc.jobs[0].id, { contract_price_cents: 0 }, later), 'invalid')
  })
})
