// Prepared replies for the five sample notes (ux-spec.md 9), in the exact shape Claude returns.
// Demo mode serves these: the public prototype, which has no AI key (D95), local development
// and the tests. They go through the same guardrails as a live reply, so the quote check, the
// price rules and the copy scrub all run for real; the screens label the drafts as prepared.
// Every quote is copied from the sample text, so the quote check passes as it would live.

import { SAMPLE_NOTES, type SampleNoteId } from './samples.ts'
import type { RecordChanges } from './schema.ts'

const FIXTURES: Record<SampleNoteId, (name: string) => RecordChanges> = {
  one_change: (name) => ({
    changes: [
      {
        title: 'Extra double power point on island bench',
        owner_title: 'Extra double power point on the island bench',
        items: [
          {
            text: 'Supply and install one extra double GPO on the end of the island bench',
            owner_text: 'One extra double power point on the end of the island bench',
          },
        ],
        reason: null,
        owner_reason: null,
        requested_by: 'owner',
        price_spoken: { dollars: 220, quote: 'Two-twenty all up' },
        delay_spoken: { days: 0, quote: 'won’t hold us up' },
        payment_spoken: null,
        permit_mentioned: null,
        explicit: true,
        detected_because: null,
        uncertain: [],
        evidence_quote: `${name}’s asked for an extra double power point on the end of the island bench`,
      },
    ],
    site_note: null,
    no_change_reason: null,
  }),

  two_changes: (name) => ({
    changes: [
      {
        title: 'Move pendant lights 300 mm left',
        owner_title: 'Hanging lights moved 300 mm to the left',
        items: [
          {
            text: 'Relocate the pendant lights over the bench 300 mm to the left',
            owner_text: 'Move the hanging lights over the bench 300 mm to the left',
          },
        ],
        reason: null,
        owner_reason: null,
        requested_by: 'owner',
        price_spoken: { dollars: 380, quote: 'that’s three-eighty' },
        delay_spoken: { days: 1, quote: 'an extra day' },
        payment_spoken: null,
        permit_mentioned: null,
        explicit: true,
        detected_because: null,
        uncertain: [],
        evidence_quote: `${name} wants the pendant lights over the bench moved 300 mil to the left`,
      },
      {
        title: 'Remove LED strip under cabinets',
        owner_title: 'No strip lighting under the cabinets',
        items: [
          {
            text: 'Delete the LED strip lighting under the overhead cabinets',
            owner_text: 'Leave out the LED strip lighting under the cabinets',
          },
        ],
        reason: null,
        owner_reason: null,
        requested_by: 'owner',
        price_spoken: { dollars: -400, quote: 'take four hundred off' },
        delay_spoken: null,
        payment_spoken: null,
        permit_mentioned: null,
        explicit: true,
        detected_because: null,
        uncertain: [],
        evidence_quote: `${name}’s dropping the LED strip under the cabinets`,
      },
    ],
    site_note: null,
    no_change_reason: null,
  }),

  rambling: () => ({
    changes: [
      {
        title: 'Move sink tap 200 mm right',
        owner_title: 'Sink tap moved 200 mm to the right',
        items: [
          {
            text: 'Relocate the sink tap 200 mm to the right, clear of the window frame',
            owner_text: 'The sink tap moved 200 mm to the right, clear of the window frame',
          },
        ],
        reason: 'The window frame was in the way of the tap',
        owner_reason: 'The window frame was in the way where the tap was meant to go',
        requested_by: 'site',
        price_spoken: { dollars: 150, quote: 'about one-fifty extra in fittings' },
        delay_spoken: null,
        payment_spoken: null,
        permit_mentioned: null,
        explicit: false,
        detected_because: 'You mentioned moving the sink tap while the wall was open',
        uncertain: [{ field: 'price', note: 'You said “about”, so check the exact amount.' }],
        evidence_quote:
          'we moved the sink tap 200 to the right because the window frame was in the way',
      },
    ],
    site_note:
      'Sparky finished the rough-in, plasterers are booked for Thursday, the weather has been good and the tiles land Monday.',
    no_change_reason: null,
  }),

  no_price: (name) => ({
    changes: [
      {
        title: 'Upgrade mixer tap to brushed brass',
        owner_title: 'Brushed brass mixer tap from the showroom',
        items: [
          {
            text: 'Supply and fit the brushed brass mixer tap from the showroom instead of the standard tap',
            owner_text: 'The brushed brass mixer tap from the showroom instead of the standard one',
          },
        ],
        reason: null,
        owner_reason: null,
        requested_by: 'owner',
        price_spoken: null,
        delay_spoken: null,
        payment_spoken: null,
        permit_mentioned: null,
        explicit: true,
        detected_because: null,
        uncertain: [
          { field: 'price', note: 'You said you need to check the price with the supplier.' },
        ],
        evidence_quote: `${name} wants to upgrade the mixer tap to the brushed brass one from the showroom`,
      },
    ],
    site_note: null,
    no_change_reason: null,
  }),

  nothing: () => ({
    changes: [],
    site_note:
      'Plasterers start Thursday, the skip bin was swapped today and everything is on track.',
    no_change_reason: 'This sounds like a progress update, not a change to the job.',
  }),
}

/** Lower case, straight apostrophes, single spaces: a typed sample still matches after a stray edit to spacing. */
const loose = (s: string) =>
  s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

/** The canned reply for a sample note, or null for any other note (fixture mode then says the AI
 *  isn't configured, which exercises the by-hand path). */
export function fixtureFor(transcript: string, firstName: string): RecordChanges | null {
  const t = loose(transcript)
  const sample = SAMPLE_NOTES.find((n) => loose(n.text.replaceAll('{name}', firstName)) === t)
  return sample ? FIXTURES[sample.id](firstName) : null
}
