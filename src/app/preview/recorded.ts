// What the AI step answers in demo mode for three sample notes on Sarah's kitchen job, recorded
// from the function's own prepared replies (shared/ai/fixtures.ts through the guardrails). The
// preview links (screens.ts) answer drafts from these, so no preview ever calls the function.
// If the fixtures change, record these again: draft each sample once and copy the response.
export const RECORDED: Record<'one_change' | 'two_changes' | 'nothing', unknown> = {
  one_change: {
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
        price_cents: 22000,
        delay_days: 0,
        payment_timing: null,
        permit_change: null,
        ai: {
          explicit: true,
          detected_because: null,
          quotes: {
            price: 'Two-twenty all up',
            delay: 'won’t hold us up',
            payment: null,
          },
          price_hint: null,
          payment_said: null,
          worth_checking: [],
          from_note: ['description', 'requested_by', 'price', 'delay'],
        },
      },
    ],
    site_note: null,
    no_change_reason: null,
    meta: {
      model: 'fixture',
      mode: 'fixture',
      latency_ms: 2,
    },
  },
  two_changes: {
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
        price_cents: 38000,
        delay_days: 1,
        payment_timing: null,
        permit_change: null,
        ai: {
          explicit: true,
          detected_because: null,
          quotes: {
            price: 'that’s three-eighty',
            delay: 'an extra day',
            payment: null,
          },
          price_hint: null,
          payment_said: null,
          worth_checking: [],
          from_note: ['description', 'requested_by', 'price', 'delay'],
        },
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
        price_cents: -40000,
        delay_days: null,
        payment_timing: null,
        permit_change: null,
        ai: {
          explicit: true,
          detected_because: null,
          quotes: {
            price: 'take four hundred off',
            delay: null,
            payment: null,
          },
          price_hint: null,
          payment_said: null,
          worth_checking: [],
          from_note: ['description', 'requested_by', 'price'],
        },
      },
    ],
    site_note: null,
    no_change_reason: null,
    meta: {
      model: 'fixture',
      mode: 'fixture',
      latency_ms: 0,
    },
  },
  nothing: {
    changes: [],
    site_note:
      'Plasterers start Thursday, the skip bin was swapped today and everything is on track.',
    no_change_reason: 'This sounds like a progress update, not a change to the job.',
    meta: {
      model: 'fixture',
      mode: 'fixture',
      latency_ms: 0,
    },
  },
}
