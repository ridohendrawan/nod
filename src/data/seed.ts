// The demo data every browser starts with (handover.md 2; setup.md "Demo data rules").
// Names and addresses are the brief's fictional seed. Phone numbers are ones ACMA reserves for
// fiction, so a tap can never ring a real person; emails use example.com.
import { type Canonical, fingerprint } from '../../shared/canonical.ts'
import { randomToken } from '../../shared/encoding.ts'
import { ruleSetFor } from '../../shared/rules/registry.ts'
import { addDays, todayIn } from '../../shared/time.ts'
import { addEvent, type JobRecord, type StateDoc, type VariationRecord } from './store.ts'

export const BUILDER = { name: 'Dan', business: 'Brightside Renovations', mobile: '0491 570 156' }

type SeedJob = Omit<JobRecord, 'id' | 'variation_seq' | 'sort' | 'created_at'>

// Contract dates are before Victoria's reform starts, so its old ss 37-38 apply (D55).
const JOBS: SeedJob[] = [
  {
    title: 'Kitchen renovation',
    client_name: 'Sarah Chen',
    client_first_name: 'Sarah',
    client_mobile: '0491 570 157',
    client_email: 'sarah.chen@example.com',
    address: '14 Lilly St',
    suburb: 'Paddington',
    postcode: '4064',
    state: 'QLD',
    contract_price_cents: 4_750_000,
    contract_date: '2026-07-20',
  },
  {
    title: 'Bathroom renovation',
    client_name: 'Tom Nguyen',
    client_first_name: 'Tom',
    client_mobile: '0491 570 158',
    client_email: 'tom.nguyen@example.com',
    address: '7 Weston St',
    suburb: 'Brunswick',
    postcode: '3056',
    state: 'VIC',
    contract_price_cents: 3_890_000,
    contract_date: '2026-08-24',
  },
  {
    title: 'Laundry and deck',
    client_name: 'Priya Shah',
    client_first_name: 'Priya',
    client_mobile: '0491 570 159',
    client_email: 'priya.shah@example.com',
    address: '22 Ada St',
    suburb: 'Marrickville',
    postcode: '2204',
    state: 'NSW',
    contract_price_cents: 2_460_000,
    contract_date: '2026-09-07',
  },
]

const HOUR = 3_600_000
const MINUTE = 60_000

/** A brand-new document: the workspace, the three jobs and the kitchen's approved Variation 1. */
export async function freshDoc(now = new Date()): Promise<StateDoc> {
  const doc: StateDoc = {
    schema: 1,
    workspace: {
      id: crypto.randomUUID(),
      builder_name: BUILDER.name,
      business_name: BUILDER.business,
      builder_mobile: BUILDER.mobile,
      ai_down: false,
      ai_day: null,
      ai_calls: 0,
    },
    jobs: [],
    variations: [],
    events: [],
    next_event_id: 1,
  }
  await seedJobs(doc, now)
  return doc
}

/** Replace the jobs (and everything on them) with the seed. Keeps the workspace and its switches. */
export async function seedJobs(doc: StateDoc, now = new Date()): Promise<void> {
  doc.jobs = JOBS.map((job, i) => ({
    ...job,
    id: crypto.randomUUID(),
    variation_seq: 0,
    sort: i,
    created_at: now.toISOString(),
  }))
  doc.variations = []
  doc.events = []
  await seedSplashback(doc, doc.jobs[0], now)
}

/** Variation 1 on the kitchen: the full-height splashback Sarah approved three days ago. */
async function seedSplashback(doc: StateDoc, job: JobRecord, now: Date) {
  const decidedAt = new Date(now.getTime() - 72 * HOUR)
  const sentAt = new Date(decidedAt.getTime() - 2 * HOUR - 14 * MINUTE)
  const seenAt = new Date(sentAt.getTime() + 11 * MINUTE)
  const createdAt = new Date(sentAt.getTime() - 9 * MINUTE)
  const id = crypto.randomUUID()

  const items = [
    {
      text: 'Extend the wall tiles to full height, from the benchtop to the rangehood',
      owner_text: 'Tiles all the way up the wall behind the bench, to the rangehood',
    },
  ]
  const content: Canonical['content'] = {
    title: 'Full-height tiled splashback',
    owner_title: 'Tiles all the way up behind the bench',
    items,
    reason: 'Sarah asked for full-height tiles instead of the standard 600 mm splashback',
    owner_reason: 'You asked for tiles all the way up instead of the standard height',
    requested_by: 'owner',
    price_cents: 145_000,
    price_method: null,
    delay_days: 1,
    payment_timing: 'next_claim',
    permit_change: null,
    work_effect: null,
    date_requested: addDays(todayIn(job.state, now), -3),
    photo_id: null,
  }
  const rules = ruleSetFor(job.state, job.contract_date)
  const canonical: Canonical = {
    v: 1,
    variation: { id, number: 1, version: 1 },
    job: {
      id: job.id,
      title: job.title,
      address: `${job.address}, ${job.suburb} ${job.state} ${job.postcode}`,
      state: job.state,
    },
    builder: { name: doc.workspace.builder_name, business: doc.workspace.business_name },
    owner: { name: job.client_name },
    rules: { id: rules.id, law: rules.law },
    content,
  }
  const fp = await fingerprint(canonical)

  const variation: VariationRecord = {
    id,
    job_id: job.id,
    number: 1,
    status: 'approved',
    source: 'manual',
    title: content.title,
    owner_title: content.owner_title,
    owner_title_basis: content.title,
    items: items.map((it) => ({ ...it, owner_basis: it.text })),
    reason: content.reason,
    owner_reason: content.owner_reason,
    requested_by: content.requested_by,
    price_cents: content.price_cents,
    price_method: null,
    delay_days: content.delay_days,
    payment_timing: content.payment_timing,
    permit_change: null,
    work_effect: null,
    photo_id: null,
    date_requested: content.date_requested,
    transcript: null,
    ai: null,
    version: 1,
    fingerprint: fp,
    sent_content: canonical,
    owner_token: randomToken(16),
    sent_at: sentAt.toISOString(),
    seen_at: seenAt.toISOString(),
    decided_at: decidedAt.toISOString(),
    decided_name: job.client_name,
    decided_fingerprint: fp,
    decided_meta: {
      user_agent: 'Demo data',
      version: 1,
      totals_shown: {
        before_cents: job.contract_price_cents,
        after_cents: job.contract_price_cents + 145_000,
      },
    },
    decline_reason: null,
    revises_id: null,
    created_at: createdAt.toISOString(),
    updated_at: decidedAt.toISOString(),
  }
  doc.variations.push(variation)
  job.variation_seq = 1

  const history = [
    { type: 'drafted', actor: 'builder', at: createdAt, body: {} },
    { type: 'sent', actor: 'builder', at: sentAt, body: { version: 1, fingerprint: fp } },
    { type: 'opened', actor: 'owner', at: seenAt, body: { version: 1 } },
    { type: 'approved', actor: 'owner', at: decidedAt, body: { fingerprint: fp } },
  ] as const
  for (const e of history) {
    addEvent(doc, {
      job_id: job.id,
      variation_id: id,
      type: e.type,
      actor: e.actor,
      at: e.at.toISOString(),
      body: e.body,
    })
  }
}
