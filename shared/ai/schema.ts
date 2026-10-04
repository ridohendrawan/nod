// The AI step's schemas (architecture.md 6). `RecordChanges` is sent to Claude as the structured
// output format, so the reply always has this shape. Only the AI function and the tests import
// this file at runtime: the browser imports types only, so zod stays out of the bundle (D46).
//
// Structured outputs don't support length or range limits, so word limits ("up to 7 words") live
// in the prompt and the guardrails, not here.

import { z } from 'zod'
import { MAX_NOTE_CHARS } from './limits.ts'

/** Fields a "worth checking" note can sit under (D65). */
export const NOTE_FIELDS = [
  'description',
  'requested_by',
  'reason',
  'price',
  'delay',
  'payment',
  'permit',
] as const

const Change = z.object({
  /** Dan's words, up to 7 words. */
  title: z.string(),
  /** Sarah's words, up to 8 words, plain English. */
  owner_title: z.string(),
  items: z.array(z.object({ text: z.string(), owner_text: z.string() })),
  reason: z.string().nullable(),
  owner_reason: z.string().nullable(),
  /** Anything else reads as `unknown`, so one odd word can't sink the whole reply: the SDK sends
   *  enums to the model as a hint, not a constraint. */
  requested_by: z.enum(['owner', 'builder', 'site', 'unknown']).catch('unknown'),
  /** Negative for a credit. `quote` is copied from the note character for character. */
  price_spoken: z.object({ dollars: z.number(), quote: z.string() }).nullable(),
  /** Working days. */
  delay_spoken: z.object({ days: z.number(), quote: z.string() }).nullable(),
  /** Dan's words about when it's paid, copied from the note. */
  payment_spoken: z.string().nullable(),
  permit_mentioned: z.boolean().nullable(),
  /** False when the change was only mentioned in passing. */
  explicit: z.boolean(),
  /** Why Nod thinks a passing remark is a change, written to follow "Nod spotted this in your note:". */
  detected_because: z.string().nullable(),
  /** Short notes to Dan, each about one field. A note under a field Nod doesn't have is dropped
   *  (null here, filtered by the guardrails), not the whole reply. */
  uncertain: z.array(
    z
      .object({ field: z.enum(NOTE_FIELDS), note: z.string() })
      .nullable()
      .catch(null),
  ),
  /** The words in the note this change comes from. */
  evidence_quote: z.string(),
})

export const RecordChanges = z.object({
  changes: z.array(Change),
  /** Routine progress (deliveries, trades booked, weather), in one or two short sentences. */
  site_note: z.string().nullable(),
  /** When there are no changes: a friendly sentence saying why. */
  no_change_reason: z.string().nullable(),
})

export type RecordChanges = z.infer<typeof RecordChanges>
export type RecordedChange = z.infer<typeof Change>

/** What the browser sends to POST /api/notes. */
export const NotesRequest = z.object({
  transcript: z.string().trim().min(1).max(MAX_NOTE_CHARS),
  job: z.object({
    title: z.string().max(200),
    client_name: z.string().max(200),
    client_first_name: z.string().max(100),
    address: z.string().max(300),
    state: z.enum(['NSW', 'QLD', 'VIC']),
    contract_price_cents: z.number().int().nonnegative(),
    variations: z
      .array(
        z.object({
          number: z.number().int().nullable(),
          title: z.string().max(200),
          status: z.enum(['draft', 'sent', 'question', 'approved', 'declined', 'withdrawn']),
        }),
      )
      .max(100),
  }),
})

export type NotesRequest = z.infer<typeof NotesRequest>
