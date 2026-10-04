// The variation operations (architecture.md 4), as plain functions over the state document so
// they're unit-tested without IndexedDB. service.ts runs each one inside `mutate`, under the lock.

import {
  type Canonical,
  type CanonicalContent,
  fingerprint,
  recordNumber,
  stableStringify,
} from '../../shared/canonical.ts'
import type { PaymentTiming, RequestedBy } from '../../shared/copy.ts'
import { randomToken } from '../../shared/encoding.ts'
import { MAX_CENTS } from '../../shared/money.ts'
import { STATES } from '../../shared/states.ts'
import {
  describeChanges,
  ownerCard,
  type OwnerCard,
  type OwnerCardContent,
} from '../../shared/owner.ts'
import { evaluate } from '../../shared/rules/evaluate.ts'
import { ruleSetFor } from '../../shared/rules/registry.ts'
import type { DraftInput, FieldId, RuleContext } from '../../shared/rules/types.ts'
import { emailMessage, smsText } from '../../shared/sms.ts'
import { todayIn } from '../../shared/time.ts'
import type {
  HistoryItem,
  Item,
  Job,
  JobPatch,
  NotesApiResponse,
  Share,
  Variation,
  VariationPatch,
} from '../../shared/types.ts'
import { changed, incomplete, invalid, locked, notDraft, notFound } from './errors.ts'
import { addEvent, type JobRecord, type StateDoc, type VariationRecord } from './store.ts'

const DECIDED = new Set(['approved', 'declined', 'withdrawn'])

// ---------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------

export function findVariation(doc: StateDoc, id: string): { v: VariationRecord; job: JobRecord } {
  const v = doc.variations.find((x) => x.id === id)
  const job = v && doc.jobs.find((j) => j.id === v.job_id)
  if (!v || !job) throw notFound('That variation')
  return { v, job }
}

export function toJob(job: JobRecord): Job {
  return {
    id: job.id,
    title: job.title,
    client_name: job.client_name,
    client_first_name: job.client_first_name,
    client_mobile: job.client_mobile,
    client_email: job.client_email,
    address: job.address,
    suburb: job.suburb,
    postcode: job.postcode,
    state: job.state,
    contract_price_cents: job.contract_price_cents,
    contract_date: job.contract_date,
  }
}

export const fullAddress = (job: JobRecord) =>
  `${job.address}, ${job.suburb} ${job.state} ${job.postcode}`

/** What the rules see of the working copy. */
export const draftInputOf = (v: VariationRecord): DraftInput => ({
  title: v.title,
  items: v.items,
  requested_by: v.requested_by,
  reason: v.reason,
  price_cents: v.price_cents,
  price_method: v.price_method,
  delay_days: v.delay_days,
  payment_timing: v.payment_timing,
  permit_change: v.permit_change,
  work_effect: v.work_effect,
  photo_id: v.photo_id,
  date_requested: v.date_requested,
})

/** The contract total before this change: the original plus every other approved change. */
export function totalBefore(doc: StateDoc, job: JobRecord, exceptId: string | null): number {
  return doc.variations
    .filter((x) => x.job_id === job.id && x.status === 'approved' && x.id !== exceptId)
    .reduce((sum, x) => sum + (x.price_cents ?? 0), job.contract_price_cents)
}

export function ruleContextFor(
  doc: StateDoc,
  job: JobRecord,
  v: VariationRecord,
  now: Date,
): RuleContext {
  return {
    state: job.state,
    contract_date: job.contract_date,
    contract_price_cents: job.contract_price_cents,
    total_now_cents: totalBefore(doc, job, v.id),
    today: todayIn(job.state, now),
    sent: v.version > 0,
    approved: v.status === 'approved',
  }
}

/** Sarah's wording was written from different trade wording (D19). */
export function ownerWordingStale(v: VariationRecord): boolean {
  const titleStale = v.owner_title.trim().length > 0 && (v.owner_title_basis ?? v.title) !== v.title
  const itemStale = v.items.some((i) => i.owner_text.trim().length > 0 && i.owner_basis !== i.text)
  return titleStale || itemStale
}

/** The content as it would be sent now: Dan's words stand in for any of Sarah's left blank. */
export function contentOf(v: VariationRecord): CanonicalContent {
  const items = v.items
    .filter((i) => i.text.trim() || i.owner_text.trim())
    .map((i) => ({ text: i.text.trim(), owner_text: (i.owner_text.trim() || i.text).trim() }))
  return {
    title: v.title.trim(),
    owner_title: v.owner_title.trim() || v.title.trim(),
    items,
    reason: v.reason?.trim() || null,
    owner_reason: v.owner_reason?.trim() || v.reason?.trim() || null,
    requested_by: v.requested_by,
    price_cents: v.price_cents,
    price_method: v.price_method?.trim() || null,
    delay_days: v.delay_days,
    payment_timing: v.payment_timing,
    permit_change: v.permit_change,
    work_effect: v.work_effect?.trim() || null,
    date_requested: v.date_requested,
    photo_id: v.photo_id,
  }
}

/** The working copy differs from what Sarah has (editing after sending, M4). */
export function hasPendingEdits(v: VariationRecord): boolean {
  if (v.version === 0 || !v.sent_content) return false
  return stableStringify(contentOf(v)) !== stableStringify(v.sent_content.content)
}

export function toVariation(v: VariationRecord): Variation {
  return {
    id: v.id,
    job_id: v.job_id,
    number: v.number,
    status: v.status,
    source: v.source,
    title: v.title,
    owner_title: v.owner_title,
    items: v.items.map((i) => ({ text: i.text, owner_text: i.owner_text })),
    reason: v.reason,
    owner_reason: v.owner_reason,
    requested_by: v.requested_by,
    price_cents: v.price_cents,
    price_method: v.price_method,
    delay_days: v.delay_days,
    payment_timing: v.payment_timing,
    permit_change: v.permit_change,
    work_effect: v.work_effect,
    photo_id: v.photo_id,
    date_requested: v.date_requested,
    transcript: v.transcript,
    ai: v.ai,
    owner_wording_stale: ownerWordingStale(v),
    version: v.version,
    record_number: v.fingerprint ? recordNumber(v.fingerprint) : null,
    sent_at: v.sent_at,
    seen_at: v.seen_at,
    sent_state: v.sent_content?.job.state ?? null,
    has_pending_edits: hasPendingEdits(v),
    decided_at: v.decided_at,
    decided_name: v.decided_name,
    decline_reason: v.decline_reason,
    revises_id: v.revises_id,
    created_at: v.created_at,
    updated_at: v.updated_at,
  }
}

/** Sarah's card: the working copy while it's a draft, what she was sent after that, under the
 *  state it was sent under (D10). */
export function ownerCardFor(doc: StateDoc, job: JobRecord, v: VariationRecord): OwnerCard {
  const sent = v.status !== 'draft' ? v.sent_content : null
  const content: OwnerCardContent = sent ? sent.content : contentOf(v)
  return ownerCard({
    content,
    number: v.number ?? job.variation_seq + 1,
    job: {
      title: job.title,
      client_first_name: job.client_first_name,
      state: sent ? sent.job.state : job.state,
    },
    builder: {
      name: doc.workspace.builder_name,
      business: doc.workspace.business_name,
      mobile: doc.workspace.builder_mobile,
    },
    total_before_cents: totalBefore(doc, job, v.id),
  })
}

export function historyFor(doc: StateDoc, variationId: string): HistoryItem[] {
  return doc.events
    .filter((e) => e.variation_id === variationId)
    .sort((a, b) => a.id - b.id)
    .map((e) => {
      const body = e.body as { version?: unknown; text?: unknown; reason?: unknown }
      const text =
        typeof body.text === 'string'
          ? body.text
          : typeof body.reason === 'string'
            ? body.reason
            : null
      return {
        id: e.id,
        type: e.type,
        actor: e.actor,
        at: e.at,
        version: typeof body.version === 'number' ? body.version : null,
        text,
      }
    })
}

export function shareFor(
  doc: StateDoc,
  job: JobRecord,
  v: VariationRecord,
  origin: string,
): Share | null {
  if (!v.owner_token || v.version === 0) return null
  const input = {
    url: `${origin}/o/${v.owner_token}`,
    clientFirstName: job.client_first_name,
    builderName: doc.workspace.builder_name,
    businessName: doc.workspace.business_name,
    builderMobile: doc.workspace.builder_mobile,
    jobTitle: job.title,
    update: v.version > 1,
  }
  return {
    owner_url: input.url,
    sms_text: smsText(input),
    sms_to: job.client_mobile,
    email: emailMessage({ ...input, to: job.client_email }),
  }
}

// ---------------------------------------------------------------------------------------
// Creating drafts
// ---------------------------------------------------------------------------------------

function blankRecord(job: JobRecord, now: Date, at: string): VariationRecord {
  return {
    id: crypto.randomUUID(),
    job_id: job.id,
    number: null,
    status: 'draft',
    source: 'manual',
    title: '',
    owner_title: '',
    owner_title_basis: '',
    items: [{ text: '', owner_text: '', owner_basis: '' }],
    reason: null,
    owner_reason: null,
    requested_by: null,
    price_cents: null,
    price_method: null,
    delay_days: null,
    payment_timing: null,
    permit_change: null,
    work_effect: null,
    photo_id: null,
    date_requested: todayIn(job.state, now),
    transcript: null,
    ai: null,
    version: 0,
    fingerprint: null,
    sent_content: null,
    owner_token: null,
    sent_at: null,
    seen_at: null,
    decided_at: null,
    decided_name: null,
    decided_fingerprint: null,
    decided_meta: null,
    decline_reason: null,
    revises_id: null,
    created_at: at,
    updated_at: at,
  }
}

/** "Fill it in by hand": an empty draft with the note attached (ux-spec.md 3). */
export function createManualDraft(
  doc: StateDoc,
  jobId: string,
  transcript: string | null,
  now: Date,
): VariationRecord {
  const job = doc.jobs.find((j) => j.id === jobId)
  if (!job) throw notFound('That job')
  const v = blankRecord(job, now, now.toISOString())
  v.transcript = transcript?.trim() || null
  doc.variations.push(v)
  addEvent(doc, {
    job_id: job.id,
    variation_id: v.id,
    type: 'drafted',
    actor: 'builder',
    body: { source: 'manual' },
    at: v.created_at,
  })
  return v
}

/** The AI step's drafts, saved in the note's order (the first change shows first). */
export function createAiDrafts(
  doc: StateDoc,
  jobId: string,
  transcript: string,
  reply: NotesApiResponse,
  now: Date,
): VariationRecord[] {
  const job = doc.jobs.find((j) => j.id === jobId)
  if (!job) throw notFound('That job')
  return reply.changes.map((c, i) => {
    // Newest first on the Job screen, so the first change gets the latest time.
    const at = new Date(now.getTime() - i).toISOString()
    const v = blankRecord(job, now, at)
    Object.assign(v, {
      source: 'ai',
      title: c.title,
      owner_title: c.owner_title,
      owner_title_basis: c.title,
      items: c.items.map((it) => ({
        text: it.text,
        owner_text: it.owner_text,
        owner_basis: it.text,
      })),
      reason: c.reason,
      owner_reason: c.owner_reason,
      requested_by: c.requested_by,
      price_cents: c.price_cents,
      delay_days: c.delay_days,
      payment_timing: c.payment_timing,
      permit_change: c.permit_change,
      transcript: transcript.trim(),
      ai: {
        ...c.ai,
        found_changes: reply.changes.length,
        site_note: reply.site_note,
        // Demo mode's prepared reply, not a live one (D95): the screens say so.
        prepared: reply.meta.mode === 'fixture',
      },
    } satisfies Partial<VariationRecord>)
    doc.variations.push(v)
    addEvent(doc, {
      job_id: job.id,
      variation_id: v.id,
      type: 'drafted',
      actor: 'builder',
      body: { source: 'ai' },
      at,
    })
    return v
  })
}

// ---------------------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------------------

const LIMITS = { title: 200, text: 500, items: 20, method: 300 }
const REQUESTED: readonly (RequestedBy | null)[] = ['owner', 'builder', 'site', null]
const TIMINGS: readonly (PaymentTiming | null)[] = [
  'next_claim',
  'on_completion',
  'final_payment',
  null,
]

function checkText(field: string, value: unknown, max: number, nullable: boolean): void {
  if (value === null && nullable) return
  if (typeof value !== 'string') throw invalid(field, 'That field can’t be saved as it is.')
  if (value.length > max) throw invalid(field, `Keep it under ${max} characters.`)
}

function validatePatch(p: VariationPatch, today: string): void {
  if ('title' in p) checkText('title', p.title, LIMITS.title, false)
  if ('owner_title' in p) checkText('owner_title', p.owner_title, LIMITS.title, false)
  if ('reason' in p) checkText('reason', p.reason, LIMITS.text, true)
  if ('owner_reason' in p) checkText('owner_reason', p.owner_reason, LIMITS.text, true)
  if ('price_method' in p) checkText('price_method', p.price_method, LIMITS.method, true)
  if ('work_effect' in p) checkText('work_effect', p.work_effect, LIMITS.text, true)
  if ('items' in p) {
    if (!Array.isArray(p.items) || p.items.length > LIMITS.items)
      throw invalid('items', `Keep it to ${LIMITS.items} items or fewer.`)
    for (const it of p.items) {
      checkText('items', it?.text, LIMITS.text, false)
      checkText('items', it?.owner_text, LIMITS.text, false)
    }
  }
  if ('requested_by' in p && !REQUESTED.includes(p.requested_by ?? null))
    throw invalid('requested_by', 'Choose who asked.')
  if ('payment_timing' in p && !TIMINGS.includes(p.payment_timing ?? null))
    throw invalid('payment_timing', 'Choose when it’s paid.')
  if ('permit_change' in p && p.permit_change !== null && typeof p.permit_change !== 'boolean')
    throw invalid('permit_change', 'Say if the permit changes.')
  if ('price_cents' in p && p.price_cents !== null) {
    const c = p.price_cents
    if (typeof c !== 'number' || !Number.isInteger(c) || Math.abs(c) > MAX_CENTS)
      throw invalid('price_cents', 'Enter the price in dollars, like 220 or 1,450.50.')
  }
  if ('delay_days' in p && p.delay_days !== null) {
    const d = p.delay_days
    if (typeof d !== 'number' || d < 0 || d > 365 || !Number.isInteger((d ?? 0) * 2))
      throw invalid('delay_days', 'Enter whole or half days, like 1 or 0.5.')
  }
  if ('date_requested' in p) {
    const d = p.date_requested
    if (
      typeof d !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      Number.isNaN(Date.parse(`${d}T00:00:00Z`))
    )
      throw invalid('date_requested', 'Choose a date.')
    if (d > today) throw invalid('date_requested', 'That date can’t be in the future.')
  }
}

/** Which Review fields a patch touches: their "From your note" tags and notes clear (D64, D65). */
function touchedFields(p: VariationPatch): Set<FieldId> {
  const f = new Set<FieldId>()
  if ('title' in p || 'items' in p) f.add('description')
  if ('requested_by' in p) f.add('requested_by')
  if ('reason' in p) f.add('reason')
  if ('price_cents' in p) f.add('price')
  if ('price_method' in p) f.add('price_method')
  if ('delay_days' in p) f.add('delay')
  if ('payment_timing' in p) f.add('payment')
  if ('date_requested' in p) f.add('date_requested')
  if ('permit_change' in p) f.add('permit')
  if ('work_effect' in p) f.add('work_effect')
  return f
}

/** Save what Dan changed. Drafts, and sent changes as pending edits; decided ones are locked. */
export function applyPatch(
  doc: StateDoc,
  id: string,
  p: VariationPatch,
  now: Date,
): VariationRecord {
  const { v, job } = findVariation(doc, id)
  if (DECIDED.has(v.status)) throw locked()
  validatePatch(p, todayIn(job.state, now))

  const prevItems = v.items
  if ('title' in p) v.title = p.title!
  if ('owner_title' in p) {
    v.owner_title = p.owner_title!
    // Sarah's title was (re)written against the title as it is now (D19).
    v.owner_title_basis = v.title
  }
  if ('items' in p) {
    v.items = p.items!.map((it: Item, k: number) => {
      const prev = prevItems[k]
      const ownerKept = prev !== undefined && prev.owner_text === it.owner_text
      return {
        text: it.text,
        owner_text: it.owner_text,
        owner_basis: ownerKept ? prev.owner_basis : it.text,
      }
    })
  }
  if ('reason' in p) v.reason = p.reason ?? null
  if ('owner_reason' in p) v.owner_reason = p.owner_reason ?? null
  if ('requested_by' in p) v.requested_by = p.requested_by ?? null
  if ('price_cents' in p) v.price_cents = p.price_cents ?? null
  if ('price_method' in p) v.price_method = p.price_method ?? null
  if ('delay_days' in p) v.delay_days = p.delay_days ?? null
  if ('payment_timing' in p) v.payment_timing = p.payment_timing ?? null
  if ('permit_change' in p) v.permit_change = p.permit_change ?? null
  if ('work_effect' in p) v.work_effect = p.work_effect ?? null
  if ('date_requested' in p) v.date_requested = p.date_requested!
  if (p.owner_wording_checked) {
    v.owner_title_basis = v.title
    v.items = v.items.map((it) => ({ ...it, owner_basis: it.text }))
  }

  if (v.ai) {
    const touched = touchedFields(p)
    v.ai = {
      ...v.ai,
      from_note: v.ai.from_note.filter((f) => !touched.has(f)),
      worth_checking: v.ai.worth_checking.filter((w) => !touched.has(w.field)),
      // Dan has dealt with the price or the payment words himself.
      price_hint: touched.has('price') ? null : v.ai.price_hint,
      payment_said: touched.has('payment') ? null : v.ai.payment_said,
    }
  }
  v.updated_at = now.toISOString()
  return v
}

/** Drafts only; the screen gives 5 seconds to undo before calling this (D72). Returns the id of
 *  a photo nothing else uses any more, so its Blob can go too. */
export function deleteDraft(doc: StateDoc, id: string): { orphan: string | null } {
  const { v } = findVariation(doc, id)
  if (v.status !== 'draft') throw notDraft()
  doc.variations = doc.variations.filter((x) => x.id !== id)
  const orphan = v.photo_id && !photoInUse(doc, v.photo_id) ? v.photo_id : null
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: null,
    type: 'deleted',
    actor: 'builder',
    body: { title: v.title },
  })
  return { orphan }
}

// ---------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------

/**
 * Sign and send (D7, D8, D22). The rules run again here, whatever the screen showed. The first
 * send gives the change its number and Sarah's link; a later send of a changed working copy is
 * version + 1, on the same link. The fingerprint covers exactly what her page will show.
 */
export async function sendVariation(
  doc: StateDoc,
  id: string,
  expectedVersion: number,
  now: Date,
): Promise<VariationRecord> {
  const { v, job } = findVariation(doc, id)
  if (DECIDED.has(v.status)) throw locked()
  if (v.version !== expectedVersion) throw changed({ version: v.version, status: v.status })
  if (v.version > 0 && !hasPendingEdits(v)) {
    throw invalid('status', `Nothing has changed since ${job.client_first_name} got it.`)
  }

  const ctx = { ...ruleContextFor(doc, job, v, now), sent: false, approved: false }
  const evaluation = evaluate(draftInputOf(v), ctx, job.client_first_name)
  if (!evaluation.can_send) throw incomplete(evaluation.gaps)

  // What Sarah reads: Dan's words stand in for any of hers left blank, and the working copy
  // keeps what was sent, so "Check Sarah's wording" starts clean.
  const content = contentOf(v)
  v.owner_title = content.owner_title
  v.owner_title_basis = v.title
  v.items = content.items.map((it) => ({ ...it, owner_basis: it.text }))
  v.owner_reason = content.owner_reason

  if (v.number === null) {
    job.variation_seq += 1
    v.number = job.variation_seq
  }
  v.version += 1
  const rules = ruleSetFor(job.state, job.contract_date)
  const canonical: Canonical = {
    v: 1,
    variation: { id: v.id, number: v.number, version: v.version },
    job: { id: job.id, title: job.title, address: fullAddress(job), state: job.state },
    builder: { name: doc.workspace.builder_name, business: doc.workspace.business_name },
    owner: { name: job.client_name },
    rules: { id: rules.id, law: rules.law },
    content,
  }
  // D68: what changed for Sarah since the version she has, in words.
  const previous = v.sent_content
  const changes = previous ? describeChanges(previous.content, canonical.content) : []
  v.fingerprint = await fingerprint(canonical)
  v.sent_content = canonical
  v.owner_token ??= randomToken(16)
  v.sent_at = now.toISOString()
  v.seen_at = null
  if (v.status === 'draft') v.status = 'sent'
  v.updated_at = v.sent_at

  addEvent(doc, {
    job_id: job.id,
    variation_id: v.id,
    type: v.version === 1 ? 'sent' : 'updated',
    actor: 'builder',
    at: v.sent_at,
    body: { version: v.version, fingerprint: v.fingerprint, ...(previous ? { changes } : {}) },
  })
  return v
}

// ---------------------------------------------------------------------------------------
// After sending (M4): reply, withdraw, start a new version, discard edits
// ---------------------------------------------------------------------------------------

function sentOnly(v: VariationRecord, what: string): void {
  if (DECIDED.has(v.status)) throw locked()
  if (v.status === 'draft') throw invalid('status', `Send the change before you ${what}.`)
}

/** Dan answers her question; the change waits on her again (D25). */
export function reply(doc: StateDoc, id: string, text: string, now: Date): VariationRecord {
  const { v } = findVariation(doc, id)
  const answer = typeof text === 'string' ? text.trim() : ''
  if (!answer) throw invalid('text', 'Type your reply first.')
  if (answer.length > 1000) throw invalid('text', 'Keep your reply under 1,000 characters.')
  sentOnly(v, 'reply')
  v.status = 'sent'
  v.updated_at = now.toISOString()
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'reply',
    actor: 'builder',
    at: v.updated_at,
    body: { text: answer },
  })
  return v
}

/** Withdraw: her link then says Dan withdrew it, and she can't approve it. */
export function withdraw(doc: StateDoc, id: string, now: Date): VariationRecord {
  const { v } = findVariation(doc, id)
  sentOnly(v, 'withdraw it')
  v.status = 'withdrawn'
  v.updated_at = now.toISOString()
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'withdrawn',
    actor: 'builder',
    at: v.updated_at,
    body: { version: v.version },
  })
  return v
}

/** "Start a new version" after she said no (D26): a new draft copied from what she was sent. */
export function revise(doc: StateDoc, id: string, now: Date): VariationRecord {
  const { v, job } = findVariation(doc, id)
  if (v.status !== 'declined' || !v.sent_content) {
    throw invalid(
      'status',
      `Only a change ${job.client_first_name} said no to can start a new version.`,
    )
  }
  const c = v.sent_content.content
  const draft = blankRecord(job, now, now.toISOString())
  Object.assign(draft, {
    source: v.source,
    title: c.title,
    owner_title: c.owner_title,
    owner_title_basis: c.title,
    items: c.items.map((it) => ({ ...it, owner_basis: it.text })),
    reason: c.reason,
    owner_reason: c.owner_reason,
    requested_by: c.requested_by,
    price_cents: c.price_cents,
    price_method: c.price_method,
    delay_days: c.delay_days,
    payment_timing: c.payment_timing,
    permit_change: c.permit_change,
    work_effect: c.work_effect,
    photo_id: c.photo_id,
    transcript: v.transcript,
    revises_id: v.id,
  } satisfies Partial<VariationRecord>)
  doc.variations.push(draft)
  addEvent(doc, {
    job_id: job.id,
    variation_id: v.id,
    type: 'revised',
    actor: 'builder',
    at: draft.created_at,
    body: { draft_id: draft.id },
  })
  addEvent(doc, {
    job_id: job.id,
    variation_id: draft.id,
    type: 'drafted',
    actor: 'builder',
    at: draft.created_at,
    body: { source: 'revision', revises: v.number },
  })
  return draft
}

/** Throw away edits made after sending: the working copy goes back to what she has. */
export function discardEdits(doc: StateDoc, id: string, now: Date): VariationRecord {
  const { v } = findVariation(doc, id)
  sentOnly(v, 'discard edits')
  const c = v.sent_content!.content
  Object.assign(v, {
    title: c.title,
    owner_title: c.owner_title,
    owner_title_basis: c.title,
    items: c.items.map((it) => ({ ...it, owner_basis: it.text })),
    reason: c.reason,
    owner_reason: c.owner_reason,
    requested_by: c.requested_by,
    price_cents: c.price_cents,
    price_method: c.price_method,
    delay_days: c.delay_days,
    payment_timing: c.payment_timing,
    permit_change: c.permit_change,
    work_effect: c.work_effect,
    photo_id: c.photo_id,
    date_requested: c.date_requested,
    updated_at: now.toISOString(),
  } satisfies Partial<VariationRecord>)
  return v
}

/** discardEdits, plus a pending photo nothing uses any more, so its Blob can go too. */
export function discardEditsWithPhoto(
  doc: StateDoc,
  id: string,
  now: Date,
): { v: VariationRecord; orphan: string | null } {
  const before = findVariation(doc, id).v.photo_id
  const v = discardEdits(doc, id, now)
  const orphan = before && before !== v.photo_id && !photoInUse(doc, before) ? before : null
  return { v, orphan }
}

// ---------------------------------------------------------------------------------------
// The job sheet (M4): state, contract price, contract date
// ---------------------------------------------------------------------------------------

/** Drafts follow the new rules at once; sent changes keep theirs (the rule set is in what she
 *  was sent). Logs `state_changed` when anything changes. */
export function updateJob(doc: StateDoc, jobId: string, p: JobPatch, now: Date): JobRecord {
  const job = doc.jobs.find((j) => j.id === jobId)
  if (!job) throw notFound('That job')
  if (p.state !== undefined && !STATES.includes(p.state)) throw invalid('state', 'Choose a state.')
  if (p.contract_price_cents !== undefined) {
    const c = p.contract_price_cents
    if (typeof c !== 'number' || !Number.isInteger(c) || c <= 0 || c > MAX_CENTS)
      throw invalid('contract_price_cents', 'Enter the contract price in dollars, like 47,500.')
  }
  if (p.contract_date !== undefined) {
    const d = p.contract_date
    if (
      typeof d !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      Number.isNaN(Date.parse(`${d}T00:00:00Z`))
    )
      throw invalid('contract_date', 'Choose the date the contract was signed.')
  }
  const before = {
    state: job.state,
    contract_price_cents: job.contract_price_cents,
    contract_date: job.contract_date,
  }
  if (p.state !== undefined) job.state = p.state
  if (p.contract_price_cents !== undefined) job.contract_price_cents = p.contract_price_cents
  if (p.contract_date !== undefined) job.contract_date = p.contract_date
  const after = {
    state: job.state,
    contract_price_cents: job.contract_price_cents,
    contract_date: job.contract_date,
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    addEvent(doc, {
      job_id: job.id,
      variation_id: null,
      type: 'state_changed',
      actor: 'builder',
      at: now.toISOString(),
      body: { before, after },
    })
  }
  return job
}

// ---------------------------------------------------------------------------------------
// Photos (D83): the Blob lives in the photos store; the working copy holds its id
// ---------------------------------------------------------------------------------------

const photoInUse = (doc: StateDoc, photoId: string) =>
  doc.variations.some((x) => x.photo_id === photoId || x.sent_content?.content.photo_id === photoId)

/** Point the working copy at a photo (or none). Returns the old photo's id if nothing uses it now. */
export function setPhoto(
  doc: StateDoc,
  id: string,
  photoId: string | null,
  now: Date,
): { v: VariationRecord; orphan: string | null } {
  const { v } = findVariation(doc, id)
  if (DECIDED.has(v.status)) throw locked()
  const previous = v.photo_id
  v.photo_id = photoId
  v.updated_at = now.toISOString()
  return {
    v,
    orphan: previous && previous !== photoId && !photoInUse(doc, previous) ? previous : null,
  }
}
