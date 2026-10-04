// The contract between the screens and the data layer (src/lib/api.ts), and the AI function's
// reply. Types only: the browser imports nothing at runtime from here.

import type { PaymentTiming, RequestedBy, VariationStatus } from './copy.ts'
import type { OwnerCard } from './owner.ts'
import type { Evaluation, FieldId, RuleContext } from './rules/types.ts'
import type { StateCode } from './states.ts'
import type { MoneySummary, StatusLine } from './summary.ts'

export type ApiErrorBody = {
  error:
    | 'unauthorised'
    | 'not_found'
    | 'locked'
    | 'changed'
    | 'not_draft'
    | 'invalid'
    | 'incomplete'
    | 'ai_unavailable'
    | 'busy'
    | 'server_error'
  message: string
  [detail: string]: unknown
}

export type SessionResponse = {
  workspace: { id: string; builder_name: string; business_name: string; ai_down: boolean }
  /** The latest event id: only events after it become toasts. */
  cursor: number
  /** True when this request created and seeded the workspace. */
  created: boolean
}

export type JobSummary = {
  id: string
  title: string
  client_name: string
  client_first_name: string
  suburb: string
  state: StateCode
  total_cents: number
  status_line: StatusLine
  counts: { question: number; waiting: number; draft: number }
}

export type JobsResponse = { jobs: JobSummary[] }

export type Job = {
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
}

export type VariationRow = {
  id: string
  number: number | null
  status: VariationStatus
  title: string
  price_cents: number | null
  delay_days: number | null
  requested_by: RequestedBy | null
  payment_timing: PaymentTiming | null
  updated_at: string
}

export type JobResponse = {
  job: Job
  money: MoneySummary
  variations: VariationRow[]
}

export type EventType =
  | 'drafted'
  | 'sent'
  | 'updated'
  | 'opened'
  | 'question'
  | 'reply'
  | 'approved'
  | 'declined'
  | 'withdrawn'
  | 'revised'
  | 'deleted'
  | 'state_changed'
  | 'reset'

export type FeedEvent = {
  id: number
  type: EventType
  actor: 'builder' | 'owner' | 'nod'
  at: string
  job_id: string | null
  variation_id: string | null
  number: number | null
  title: string | null
  client_first_name: string | null
}

export type EventsResponse = { events: FeedEvent[]; cursor: number }

export type DemoResponse = { ai_down: boolean }

// ---------------------------------------------------------------------------------------
// M2: notes, drafts, review and send (architecture.md 4; ux-spec.md 3 to 5)
// ---------------------------------------------------------------------------------------

/** Why the AI step couldn't help; the screen offers "Fill it in by hand" for every reason.
 *  `demo`: the public prototype has no AI key, and this note isn't one of the samples (D95). */
export type AiUnavailableReason = 'not_configured' | 'down' | 'limit' | 'unreadable' | 'demo'

/** A line item: Dan's words and Sarah's words for the same line. */
export type Item = { text: string; owner_text: string }

/** A price Nod heard but won't use until Dan taps a button (D81). */
export type PriceHint =
  /** "about 150 extra in fittings": [Use $150]. */
  | { kind: 'approximate'; quote: string; cents: number }
  /** "1250 plus GST": [Use $1,375 (with GST)] or [$1,250 already includes GST]. */
  | { kind: 'plus_gst'; quote: string; cents: number; with_gst_cents: number }

/** What the AI step left on a draft (D12, D51, D64, D65, D81). Dan's side only, never Sarah's. */
export type DraftAi = {
  /** How many changes the note gave, and its site note: "Nod found 2 changes and a site note". */
  found_changes: number
  site_note: string | null
  /** False when Nod spotted the change in a passing remark. */
  explicit: boolean
  /** Follows "Nod spotted this in your note:". */
  detected_because: string | null
  /** Dan's exact words behind a filled field, for the source line: "You said '220 all up'". */
  quotes: { price: string | null; delay: string | null; payment: string | null }
  price_hint: PriceHint | null
  /** Payment words that didn't map to a chip, or "upfront" (D18): shown above the chips. */
  payment_said: { quote: string; upfront: boolean } | null
  /** "Worth checking" notes, each under its field (D65). The data layer drops a field's notes
   *  when Dan edits that field. */
  worth_checking: { field: FieldId; text: string }[]
  /** Fields Nod filled: each shows "From your note" until Dan edits it (D64). */
  from_note: FieldId[]
  /** A demo draft: prepared in advance for a sample note, not written live (D95). The screens
   *  say so (`builder.preparedDraft`). */
  prepared: boolean
}

/** One change as the AI step returns it, after the guardrails (POST /api/notes). */
export type DraftChange = {
  title: string
  owner_title: string
  items: Item[]
  reason: string | null
  owner_reason: string | null
  requested_by: RequestedBy | null
  price_cents: number | null
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  ai: Omit<DraftAi, 'found_changes' | 'site_note' | 'prepared'>
}

/** The AI function's reply. It stores nothing; the browser's data layer saves the drafts. */
export type NotesApiResponse = {
  changes: DraftChange[]
  site_note: string | null
  no_change_reason: string | null
  meta: {
    model: string
    mode: 'live' | 'fixture'
    latency_ms: number
    /** Token counts from a live call, for the eval's cost report. */
    usage?: {
      input_tokens: number
      output_tokens: number
      cache_read_input_tokens: number
      cache_creation_input_tokens: number
    }
  }
}

/** api.notes(): the drafts it saved. 0 drafts means "Nothing to sign here" (ux-spec.md 3). */
export type NotesResponse = {
  drafts: { id: string; title: string }[]
  site_note: string | null
  no_change_reason: string | null
  /** Demo mode answered from prepared results (D95): say so on the result. */
  prepared: boolean
}

/** A variation as Dan's screens see it. */
export type Variation = {
  id: string
  job_id: string
  /** null until the first send (D8). */
  number: number | null
  status: VariationStatus
  source: 'ai' | 'manual'
  // The working copy: what Dan edits
  title: string
  owner_title: string
  items: Item[]
  reason: string | null
  owner_reason: string | null
  requested_by: RequestedBy | null
  /** Integer cents: null = not stated, negative = credit, 0 = no charge. */
  price_cents: number | null
  price_method: string | null
  /** Working days; null = not stated; 0 is valid; halves allowed. */
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  work_effect: string | null
  photo_id: string | null
  /** YYYY-MM-DD in the job's time zone (QLD "Date Sarah asked"). */
  date_requested: string
  /** The note it came from, kept for "Fill it in by hand" and the source lines. */
  transcript: string | null
  ai: DraftAi | null
  /** Dan changed his wording after Sarah's was written (D19): "Check Sarah's wording". */
  owner_wording_stale: boolean
  // What Sarah has
  /** 0 until the first send. */
  version: number
  /** "7F3A-2C91", once sent. */
  record_number: string | null
  sent_at: string | null
  seen_at: string | null
  /** The state the sent version was checked under, from its snapshot; null until the first send.
   *  Its record keeps that state's rules and time zone even if the job's state changes later (D10):
   *  show sent times with `sent_state ?? job.state`. */
  sent_state: StateCode | null
  /** The working copy differs from what Sarah has (editing after sending, M4). */
  has_pending_edits: boolean
  // The decision
  decided_at: string | null
  decided_name: string | null
  decline_reason: string | null
  revises_id: string | null
  created_at: string
  updated_at: string
}

/** One line of a variation's history (ux-spec.md 6), oldest first. */
export type HistoryItem = {
  id: number
  type: EventType
  actor: 'builder' | 'owner' | 'nod'
  at: string
  version: number | null
  /** Her question, his reply or her reason for saying no. */
  text: string | null
}

/** How Dan gets the link to Sarah (ux-spec.md 5; D73, D82). */
export type Share = {
  owner_url: string
  /** The text message: plain ASCII, under 160 characters with the link, never the price. */
  sms_text: string
  /** Her mobile for the sms: link, when the job has one. */
  sms_to: string | null
  email: { to: string | null; subject: string; body: string; href: string }
}

/** api.variation(id): everything the Review and Status screens need. */
export type VariationResponse = {
  variation: Variation
  job: Job
  builder: { name: string; business: string; mobile: string }
  /** Pass to `evaluate` (shared/rules) to run the checklist live as Dan edits. */
  rule_context: RuleContext
  /** The checklist for the saved working copy. */
  checklist: Evaluation
  /** The job's money now. */
  money: MoneySummary
  /** What Sarah's page will show for the saved working copy ("What Sarah sees"). */
  owner_card: OwnerCard
  history: HistoryItem[]
  /** Once sent: the link and the messages that carry it. */
  share: Share | null
}

/** api.updateVariation(id, patch): autosave. Only the fields present change. */
export type VariationPatch = Partial<
  Pick<
    Variation,
    | 'title'
    | 'owner_title'
    | 'items'
    | 'reason'
    | 'owner_reason'
    | 'requested_by'
    | 'price_cents'
    | 'price_method'
    | 'delay_days'
    | 'payment_timing'
    | 'permit_change'
    | 'work_effect'
    | 'date_requested'
  >
> & {
  /** Dan has checked Sarah's wording against his own: clears the D19 flag. */
  owner_wording_checked?: true
}

/** api.send(id, expectedVersion). */
export type SendResponse = { variation: Variation; share: Share }

// ---------------------------------------------------------------------------------------
// M3: Sarah's page (ux-spec.md 7), through src/lib/ownerApi.ts
// ---------------------------------------------------------------------------------------

/** A line in the thread on her page: her question or Dan's reply. */
export type OwnerThreadItem = { id: number; from: 'owner' | 'builder'; text: string; at: string }

/** ownerApi.view(token): everything her page shows. The link (token) is the only credential. */
export type OwnerView = {
  token: string
  /** Never 'draft': a draft has no link. */
  status: VariationStatus
  number: number
  version: number
  /** What she approves: the fingerprint of this version (D7). Send it back with her answer. */
  fingerprint: string
  /** "7F3A-2C91". */
  record_number: string
  client_name: string
  card: OwnerCard
  /** The approve checkbox's whole-sentence label (ux-spec.md 7). */
  consent: string
  /** "The $220 will be added to your next progress payment." null at no charge. */
  payment_line: string | null
  /** Dan sent a new version (D68): "Dan updated this change at 2:40 pm" and what changed. */
  update: { at: string; changes: string[] } | null
  thread: OwnerThreadItem[]
  /** Her answer, once given. `line` is the record sentence ("Approved by Sarah Chen on ..."). */
  decision: {
    kind: 'approved' | 'declined'
    at: string
    line: string
    name: string | null
    reason: string | null
    totals: { before_cents: number; after_cents: number }
  } | null
  /** Other changes on this job waiting for her ("1 more change is waiting for you"). */
  others: { token: string; number: number; title: string }[]
  /** "This replaces Change 2, which you said no to." (D26) */
  replaces: { number: number } | null
  sent_at: string
}

/** ownerApi.approve(token, input): her typed name, the tick, and the fingerprint she saw. */
export type ApproveInput = { name: string; agreed: boolean; fingerprint: string }

/** ownerApi.decline(token, input): her optional reason, and the fingerprint she saw. */
export type DeclineInput = { reason: string | null; fingerprint: string }

/** api.updateJob(id, patch): the job sheet (ux-spec.md 2). Drafts follow the new rules at once;
 *  sent changes keep the rules they were sent under. */
export type JobPatch = { state?: StateCode; contract_price_cents?: number; contract_date?: string }
