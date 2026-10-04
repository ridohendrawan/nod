// Sarah's side (ux-spec.md 7; D6, D7, D68, D70, D71). Her link's token is the only credential.
// Plain functions over the state document, like variations.ts; ownerService.ts runs them under
// the lock. Nothing here imports Dan's screens, so her page's bundle stays small (D86).

import { recordNumber } from '../../shared/canonical.ts'
import { owner } from '../../shared/copy.ts'
import { ownerCard, ownerWording } from '../../shared/owner.ts'
import type { ApproveInput, DeclineInput, OwnerThreadItem, OwnerView } from '../../shared/types.ts'
import { changed, invalid, locked, notFound } from './errors.ts'
import { addEvent, type JobRecord, type StateDoc, type VariationRecord } from './store.ts'

const DECIDED = new Set(['approved', 'declined', 'withdrawn'])
const OPEN = new Set(['sent', 'question'])

/** Her link: unknown, or a draft that was never sent, reads "This link isn't working". */
export function findByToken(doc: StateDoc, token: string): { v: VariationRecord; job: JobRecord } {
  const v = doc.variations.find((x) => x.owner_token === token)
  const job = v && doc.jobs.find((j) => j.id === v.job_id)
  if (!v || !job || !v.sent_content || !v.fingerprint || v.number === null)
    throw notFound('That link')
  return { v, job }
}

/** The contract total before this change: the original plus every other approved change. */
function totalBefore(doc: StateDoc, job: JobRecord, exceptId: string): number {
  return doc.variations
    .filter((x) => x.job_id === job.id && x.status === 'approved' && x.id !== exceptId)
    .reduce((sum, x) => sum + (x.price_cents ?? 0), job.contract_price_cents)
}

function threadFor(doc: StateDoc, variationId: string): OwnerThreadItem[] {
  return doc.events
    .filter((e) => e.variation_id === variationId && (e.type === 'question' || e.type === 'reply'))
    .sort((a, b) => a.id - b.id)
    .map((e) => ({
      id: e.id,
      from: e.type === 'question' ? 'owner' : 'builder',
      text: typeof e.body.text === 'string' ? e.body.text : '',
      at: e.at,
    }))
}

/** What her page shows. Reading never writes: "opened" comes only from `markSeen` (D70). */
export function ownerViewOf(doc: StateDoc, token: string): OwnerView {
  const { v, job } = findByToken(doc, token)
  const sent = v.sent_content!
  const content = sent.content
  // The state it was sent under, not the job's today: her record keeps its rules and its time
  // zone if Dan later switches the job's state (D10; "It will always show what you approved").
  const state = sent.job.state
  const before = totalBefore(doc, job, v.id)
  const card = ownerCard({
    content,
    number: v.number!,
    job: { title: job.title, client_first_name: job.client_first_name, state },
    builder: {
      name: doc.workspace.builder_name,
      business: doc.workspace.business_name,
      mobile: doc.workspace.builder_mobile,
    },
    total_before_cents: before,
  })
  const options = { cents: card.cents }
  const price = content.price_cents ?? 0

  // D68: the newest update, with what changed since the version before it.
  const lastUpdate = doc.events
    .filter((e) => e.variation_id === v.id && e.type === 'updated')
    .sort((a, b) => b.id - a.id)[0]
  const changes =
    lastUpdate && Array.isArray(lastUpdate.body.changes)
      ? (lastUpdate.body.changes as string[])
      : []

  let decision: OwnerView['decision'] = null
  if ((v.status === 'approved' || v.status === 'declined') && v.decided_at) {
    const at = new Date(v.decided_at)
    const shown = (v.decided_meta?.totals_shown ?? null) as {
      before_cents: number
      after_cents: number
    } | null
    decision = {
      kind: v.status,
      at: v.decided_at,
      line:
        v.status === 'approved'
          ? owner.approvedLine(v.decided_name ?? job.client_name, at, state)
          : owner.declinedLine(at, state),
      name: v.decided_name,
      reason: v.decline_reason,
      totals: shown ?? { before_cents: before, after_cents: before + price },
    }
  }

  const revised = v.revises_id ? doc.variations.find((x) => x.id === v.revises_id) : undefined
  return {
    token,
    status: v.status,
    number: v.number!,
    version: v.version,
    fingerprint: v.fingerprint!,
    record_number: recordNumber(v.fingerprint!),
    client_name: job.client_name,
    card,
    consent: owner.consent({
      title: ownerWording(content).title,
      price_cents: price,
      delay_days: content.delay_days ?? 0,
      total_after_cents: before + price,
      options,
    }),
    payment_line: content.payment_timing
      ? owner.paymentLine(content.payment_timing, price, options)
      : null,
    update: lastUpdate && v.version > 1 ? { at: lastUpdate.at, changes } : null,
    thread: threadFor(doc, v.id),
    decision,
    others: doc.variations
      .filter(
        (x) =>
          x.job_id === job.id &&
          x.id !== v.id &&
          OPEN.has(x.status) &&
          x.owner_token &&
          x.number !== null,
      )
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .map((x) => ({
        token: x.owner_token!,
        number: x.number!,
        title: x.sent_content ? ownerWording(x.sent_content.content).title : x.owner_title,
      })),
    replaces: revised?.number ? { number: revised.number } : null,
    sent_at: v.sent_at ?? '',
  }
}

/** True if this call should record "opened": the current version, still open, not yet seen. */
export function needsSeen(doc: StateDoc, token: string, version: number): boolean {
  const { v } = findByToken(doc, token)
  return OPEN.has(v.status) && v.version === version && v.seen_at === null
}

/** Her page was visible for about a second (D70): record "opened" once per version. */
export function markSeen(doc: StateDoc, token: string, version: number, now: Date): void {
  if (!needsSeen(doc, token, version)) return
  const { v } = findByToken(doc, token)
  v.seen_at = now.toISOString()
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'opened',
    actor: 'owner',
    at: v.seen_at,
    body: { version },
  })
}

/** Her answer must be for the version she's looking at, and nothing may be decided yet (D7). */
function checkAnswerable(v: VariationRecord, fingerprint: string): void {
  if (DECIDED.has(v.status)) throw locked()
  if (!OPEN.has(v.status)) throw notFound('That link')
  if (v.fingerprint !== fingerprint)
    throw changed({ version: v.version, fingerprint: v.fingerprint })
}

/** Approve (D71: never optimistic). Records her typed name, the tick and the totals she saw. */
export function approve(
  doc: StateDoc,
  token: string,
  input: ApproveInput,
  userAgent: string,
  now: Date,
): void {
  const { v, job } = findByToken(doc, token)
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2) throw invalid('name', 'Type your full name to approve.')
  if (name.length > 100) throw invalid('name', 'Keep your name under 100 characters.')
  if (input.agreed !== true) throw invalid('agreed', 'Tick the box to agree to this change.')
  checkAnswerable(v, input.fingerprint)

  const before = totalBefore(doc, job, v.id)
  const price = v.sent_content!.content.price_cents ?? 0
  v.status = 'approved'
  v.decided_at = now.toISOString()
  v.decided_name = name
  v.decided_fingerprint = input.fingerprint
  v.decided_meta = {
    user_agent: userAgent.slice(0, 300),
    version: v.version,
    totals_shown: { before_cents: before, after_cents: before + price },
  }
  v.updated_at = v.decided_at
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'approved',
    actor: 'owner',
    at: v.decided_at,
    body: { fingerprint: input.fingerprint, version: v.version },
  })
}

/** Ask Dan a question: the change waits on Dan until he replies (D25). She can still answer. */
export function askQuestion(doc: StateDoc, token: string, text: string, now: Date): void {
  const { v } = findByToken(doc, token)
  const question = typeof text === 'string' ? text.trim() : ''
  if (!question) throw invalid('text', 'Type your question first.')
  if (question.length > 1000) throw invalid('text', 'Keep your question under 1,000 characters.')
  if (DECIDED.has(v.status)) throw locked()
  v.status = 'question'
  v.updated_at = now.toISOString()
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'question',
    actor: 'owner',
    at: v.updated_at,
    body: { text: question },
  })
}

/** Say no, with an optional reason. Locked afterwards; Dan can start a new version (D26). */
export function decline(doc: StateDoc, token: string, input: DeclineInput, now: Date): void {
  const { v } = findByToken(doc, token)
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (reason.length > 500) throw invalid('reason', 'Keep your reason under 500 characters.')
  checkAnswerable(v, input.fingerprint)
  v.status = 'declined'
  v.decided_at = now.toISOString()
  v.decided_fingerprint = input.fingerprint
  v.decline_reason = reason || null
  v.decided_meta = { version: v.version }
  v.updated_at = v.decided_at
  addEvent(doc, {
    job_id: v.job_id,
    variation_id: v.id,
    type: 'declined',
    actor: 'owner',
    at: v.decided_at,
    body: { fingerprint: input.fingerprint, version: v.version, reason: reason || null },
  })
}
