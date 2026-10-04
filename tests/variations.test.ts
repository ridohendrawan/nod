import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import { applyGuardrails } from '../shared/ai/guardrails.ts'
import { sampleNote } from '../shared/ai/samples.ts'
import { fingerprint } from '../shared/canonical.ts'
import type { NotesApiResponse } from '../shared/types.ts'
import { ApiError } from '../src/data/errors.ts'
import { freshDoc } from '../src/data/seed.ts'
import type { StateDoc } from '../src/data/store.ts'
import {
  applyPatch,
  createAiDrafts,
  createManualDraft,
  deleteDraft,
  ownerCardFor,
  sendVariation,
  setPhoto,
  shareFor,
  toVariation,
} from '../src/data/variations.ts'

// 1 Oct 2026, 2:15 pm in Brisbane.
const now = new Date('2026-10-01T04:15:00Z')

let doc: StateDoc
let kitchenId: string

beforeEach(async () => {
  doc = await freshDoc(now)
  kitchenId = doc.jobs[0].id
})

/** What POST /api/notes would return for a sample note, in fixture mode. */
function reply(
  id: Parameters<typeof sampleNote>[0],
  name = 'Sarah',
): { note: string; res: NotesApiResponse } {
  const note = sampleNote(id, name)
  const guarded = applyGuardrails(fixtureFor(note, name)!, note)
  return {
    note,
    res: {
      changes: guarded.changes,
      site_note: guarded.site_note,
      no_change_reason: guarded.no_change_reason,
      meta: { model: 'fixture', mode: 'fixture', latency_ms: 0 },
    },
  }
}

const rejects = async (p: Promise<unknown> | (() => unknown), code: string, status: number) => {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).code).toBe(code)
    expect((e as ApiError).status).toBe(status)
    return e as ApiError
  }
  throw new Error(`expected ${code}`)
}

describe('drafts from a note', () => {
  it('saves the golden note as one draft, with its sources and a drafted event', () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(v).toMatchObject({
      status: 'draft',
      source: 'ai',
      number: null,
      price_cents: 22_000,
      delay_days: 0,
      requested_by: 'owner',
      date_requested: '2026-10-01',
      transcript: note,
    })
    expect(v.ai).toMatchObject({ found_changes: 1, site_note: null, explicit: true })
    expect(doc.events.at(-1)).toMatchObject({ type: 'drafted', variation_id: v.id })
  })

  it('marks a demo mode reply as prepared, and a live one as not (D95)', () => {
    const { note, res } = reply('one_change')
    const [demo] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(demo.ai?.prepared).toBe(true)
    const live = {
      ...res,
      meta: { ...res.meta, model: 'claude-sonnet-5-5', mode: 'live' as const },
    }
    const [real] = createAiDrafts(doc, kitchenId, note, live, now)
    expect(real.ai?.prepared).toBe(false)
  })

  it('keeps the note’s order, newest first on the Job screen', () => {
    const { note, res } = reply('two_changes')
    const [first, second] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(first.created_at > second.created_at).toBe(true)
    expect(first.ai?.found_changes).toBe(2)
  })

  it('makes an empty manual draft with the note attached', () => {
    const v = createManualDraft(doc, kitchenId, '  the note  ', now)
    expect(v).toMatchObject({ source: 'manual', title: '', transcript: 'the note', ai: null })
    expect(v.items).toEqual([{ text: '', owner_text: '', owner_basis: '' }])
  })
})

describe('autosave', () => {
  it('clears “From your note” and the notes for the fields Dan edits (D64, D65)', () => {
    const { note, res } = reply('no_price')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(v.ai?.worth_checking.map((w) => w.field)).toEqual(['price'])
    applyPatch(doc, v.id, { price_cents: 64_000 }, now)
    expect(v.ai?.worth_checking).toEqual([])
    expect(v.price_cents).toBe(64_000)
    applyPatch(doc, v.id, { title: 'Brushed brass mixer tap' }, now)
    expect(v.ai?.from_note).not.toContain('description')
  })

  it('drops the [Use $150] hint once Dan sets the price himself (D81)', () => {
    const { note, res } = reply('rambling')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(v.ai?.price_hint?.kind).toBe('approximate')
    applyPatch(doc, v.id, { price_cents: 15_000 }, now)
    expect(v.ai?.price_hint).toBeNull()
  })

  it('flags Sarah’s wording when Dan changes his own after it was written (D19)', () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    expect(toVariation(v).owner_wording_stale).toBe(false)
    applyPatch(
      doc,
      v.id,
      { items: [{ text: 'Install two double GPOs', owner_text: v.items[0].owner_text }] },
      now,
    )
    expect(toVariation(v).owner_wording_stale).toBe(true)
    applyPatch(doc, v.id, { owner_wording_checked: true }, now)
    expect(toVariation(v).owner_wording_stale).toBe(false)
  })

  it('refuses bad values with the field named', async () => {
    const v = createManualDraft(doc, kitchenId, null, now)
    const e = await rejects(() => applyPatch(doc, v.id, { delay_days: 0.3 }, now), 'invalid', 422)
    expect(e.body?.field).toBe('delay_days')
    await rejects(
      () => applyPatch(doc, v.id, { date_requested: '2026-10-02' }, now),
      'invalid',
      422,
    )
  })

  it('locks a decided change (D7)', async () => {
    const approved = doc.variations[0]
    await rejects(() => applyPatch(doc, approved.id, { title: 'x' }, now), 'locked', 409)
  })
})

describe('sending (D7, D8, D22)', () => {
  it('re-runs the rules and names the gap', async () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    const e = await rejects(sendVariation(doc, v.id, 0, now), 'incomplete', 422)
    expect(e.message).toBe('Something’s still missing: choose when it’s paid.')
    expect(v.version).toBe(0)
  })

  it('sends the golden path: number 2, version 1, a link and a fingerprint of what Sarah sees', async () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    applyPatch(doc, v.id, { payment_timing: 'next_claim' }, now)
    await sendVariation(doc, v.id, 0, now)

    expect(v).toMatchObject({ status: 'sent', number: 2, version: 1, sent_at: now.toISOString() })
    expect(v.owner_token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(v.fingerprint).toBe(await fingerprint(v.sent_content!))
    expect(v.sent_content?.content.owner_title).toBe('Extra double power point on the island bench')
    expect(v.sent_content?.rules).toEqual({
      id: 'qld-1991',
      law: 'QBCC Act 1991 (Qld), Sch 1B, ss 40–41',
    })
    expect(doc.jobs[0].variation_seq).toBe(2)
    expect(doc.events.at(-1)).toMatchObject({ type: 'sent', body: { version: 1 } })

    const share = shareFor(doc, doc.jobs[0], v, 'https://nod-good.vercel.app')!
    expect(share.owner_url).toBe(`https://nod-good.vercel.app/o/${v.owner_token}`)
    expect(share.sms_text).toContain('Here’s a change'.replace('’', "'"))
    expect(share.sms_to).toBe('0491 570 157')
    expect(toVariation(v).record_number).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('shows Sarah’s card with the new total, in words', async () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    const card = ownerCardFor(doc, doc.jobs[0], v)
    expect(card.number).toBe(2)
    expect(card.totals).toEqual({ before_cents: 4_895_000, after_cents: 4_917_000 })
    expect(card.facts[0].value).toBe('Adds $220 to the price')
  })

  it('fails a stale send with 409 changed', async () => {
    const { note, res } = reply('one_change')
    const [v] = createAiDrafts(doc, kitchenId, note, res, now)
    applyPatch(doc, v.id, { payment_timing: 'next_claim' }, now)
    await rejects(sendVariation(doc, v.id, 1, now), 'changed', 409)
  })

  it('fills Sarah’s blank wording from Dan’s, so a manual draft still reads well', async () => {
    const v = createManualDraft(doc, kitchenId, null, now)
    applyPatch(
      doc,
      v.id,
      {
        title: 'Extra downlight',
        items: [{ text: 'One more downlight in the hall', owner_text: '' }],
        price_cents: 16_000,
        delay_days: 0,
        payment_timing: 'on_completion',
      },
      now,
    )
    await sendVariation(doc, v.id, 0, now)
    expect(v.sent_content?.content.owner_title).toBe('Extra downlight')
    expect(v.sent_content?.content.items).toEqual([
      { text: 'One more downlight in the hall', owner_text: 'One more downlight in the hall' },
    ])
  })
})

describe('deleting', () => {
  it('deletes drafts only', async () => {
    const v = createManualDraft(doc, kitchenId, null, now)
    deleteDraft(doc, v.id)
    expect(doc.variations.find((x) => x.id === v.id)).toBeUndefined()
    expect(doc.events.at(-1)?.type).toBe('deleted')
    await rejects(() => deleteDraft(doc, doc.variations[0].id), 'not_draft', 409)
  })

  it('hands back the draft’s photo so its Blob can go too', () => {
    const v = createManualDraft(doc, kitchenId, null, now)
    setPhoto(doc, v.id, 'photo-9', now)
    expect(deleteDraft(doc, v.id)).toEqual({ orphan: 'photo-9' })
  })
})
