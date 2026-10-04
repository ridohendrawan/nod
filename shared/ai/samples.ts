// The five sample notes (ux-spec.md 9): the "Try a sample note" buttons, the AI fixtures and
// the eval all use these exact words. `{name}` is the job's client first name.

export type SampleNoteId = 'one_change' | 'two_changes' | 'rambling' | 'no_price' | 'nothing'

export type SampleNote = { id: SampleNoteId; label: string; text: string }

export const SAMPLE_NOTES: readonly SampleNote[] = [
  {
    id: 'one_change',
    label: 'One change',
    text: '{name}’s asked for an extra double power point on the end of the island bench. Two-twenty all up, won’t hold us up.',
  },
  {
    id: 'two_changes',
    label: 'Two in one breath',
    text: 'Right, two things. {name} wants the pendant lights over the bench moved 300 mil to the left, that’s three-eighty and an extra day. And {name}’s dropping the LED strip under the cabinets, so take four hundred off.',
  },
  {
    id: 'rambling',
    label: 'Rambling site note',
    text: 'Quick update. Sparky finished the rough-in, plasterers are booked for Thursday, weather’s been good. Oh, while we had the wall open we moved the sink tap 200 to the right because the window frame was in the way, about one-fifty extra in fittings. Tiles land Monday.',
  },
  {
    id: 'no_price',
    label: 'No price said',
    text: '{name} wants to upgrade the mixer tap to the brushed brass one from the showroom. I need to check the price with the supplier.',
  },
  {
    id: 'nothing',
    label: 'Nothing to sign',
    text: 'Plasterers start Thursday, skip bin got swapped today, all on track.',
  },
]

/** A sample note with the client's first name filled in. */
export function sampleNote(id: SampleNoteId, firstName: string): string {
  const note = SAMPLE_NOTES.find((n) => n.id === id)
  if (!note) throw new Error(`Unknown sample note ${id}`)
  return note.text.replaceAll('{name}', firstName)
}
