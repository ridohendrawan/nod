// Nod's data, browser-only (decisions.md D91): one state document in IndexedDB, shared by every
// tab and iframe of this site. Writes are read-modify-write under a Web Lock, so Dan's frame and
// Sarah's frame can't overwrite each other, and each write pokes every view (src/lib/live.ts).
import type { PaymentTiming, RequestedBy, VariationStatus } from '../../shared/copy.ts'
import type { Canonical } from '../../shared/canonical.ts'
import type { StateCode } from '../../shared/states.ts'
import type { DraftAi, EventType } from '../../shared/types.ts'
import { notifyLive } from '../lib/live.ts'
import { getValue, putValue } from './db.ts'

export type Workspace = {
  id: string
  builder_name: string
  business_name: string
  builder_mobile: string
  ai_down: boolean
  /** The courtesy cap on AI notes (D15 as changed by D91): the Brisbane day, and calls that day.
   *  Optional because documents saved before M2 don't have them. */
  ai_day?: string | null
  ai_calls?: number
}

export type JobRecord = {
  id: string
  title: string
  client_name: string
  client_first_name: string
  client_mobile: string | null
  client_email: string | null
  address: string
  suburb: string
  postcode: string
  state: StateCode
  contract_price_cents: number
  contract_date: string
  variation_seq: number
  sort: number
  created_at: string
}

export type ItemRecord = { text: string; owner_text: string; owner_basis: string }

export type VariationRecord = {
  id: string
  job_id: string
  number: number | null
  status: VariationStatus
  source: 'ai' | 'manual'
  // Working copy: what Dan edits
  title: string
  owner_title: string
  /** The title Sarah's title was written from (D19). Missing on records saved before M2. */
  owner_title_basis?: string
  items: ItemRecord[]
  reason: string | null
  owner_reason: string | null
  requested_by: RequestedBy | null
  price_cents: number | null
  price_method: string | null
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  work_effect: string | null
  photo_id: string | null
  date_requested: string
  transcript: string | null
  ai: DraftAi | null
  // Sent copy: what Sarah sees (D6)
  version: number
  fingerprint: string | null
  sent_content: Canonical | null
  owner_token: string | null
  sent_at: string | null
  seen_at: string | null
  // Decision
  decided_at: string | null
  decided_name: string | null
  decided_fingerprint: string | null
  decided_meta: Record<string, unknown> | null
  decline_reason: string | null
  revises_id: string | null
  created_at: string
  updated_at: string
}

export type EventRecord = {
  id: number
  job_id: string | null
  variation_id: string | null
  type: EventType
  actor: 'builder' | 'owner' | 'nod'
  body: Record<string, unknown>
  at: string
}

export type StateDoc = {
  schema: 1
  workspace: Workspace
  jobs: JobRecord[]
  variations: VariationRecord[]
  events: EventRecord[]
  /** Event ids only ever grow, even across a demo reset, so a cursor never goes backwards. */
  next_event_id: number
}

const KEY = 'state'

export async function readDoc(): Promise<StateDoc | undefined> {
  const doc = await getValue<StateDoc>('kv', KEY)
  return doc?.schema === 1 ? doc : undefined
}

/** Run `fn` with the lock that every writer in every tab takes. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('nod-state', fn) as Promise<T>
  }
  return fn() // very old browsers: one tab is the norm
}

/**
 * Read the document, let `fn` change it (it may be async), write it back and poke every view.
 * `create` builds a fresh document when there is none yet (first visit, or storage was wiped).
 */
export async function mutate<T>(
  fn: (doc: StateDoc) => T | Promise<T>,
  create: () => Promise<StateDoc>,
): Promise<{ result: T; created: boolean }> {
  const out = await withLock(async () => {
    const existing = await readDoc()
    const doc = existing ?? (await create())
    const result = await fn(doc)
    await putValue('kv', KEY, doc)
    return { result, created: !existing }
  })
  notifyLive()
  return out
}

/** Append an event with the next id. Call inside `mutate`. */
export function addEvent(
  doc: StateDoc,
  e: Omit<EventRecord, 'id' | 'at' | 'body'> & { at?: string; body?: Record<string, unknown> },
): EventRecord {
  const event: EventRecord = { body: {}, at: new Date().toISOString(), ...e, id: doc.next_event_id }
  doc.next_event_id += 1
  doc.events.push(event)
  return event
}
