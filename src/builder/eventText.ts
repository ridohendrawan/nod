// What Dan's toasts say when something happens on the other side (ux-spec 0.4). Only the
// owner's events become toasts: Dan's own actions already show on his screen.
import { builder } from '../../shared/copy.ts'
import type { FeedEvent } from '../../shared/types.ts'

const OWNER_TYPES = new Set<FeedEvent['type']>(['opened', 'question', 'approved', 'declined'])

export const isToastEvent = (e: FeedEvent) => e.actor === 'owner' && OWNER_TYPES.has(e.type)

/** "Sarah approved Variation 2. OK to start." */
export function eventToastText(e: FeedEvent): string {
  const who = e.client_first_name ?? 'Your client'
  const which = builder.variationName(e.number)
  switch (e.type) {
    case 'opened':
      return `${who} opened ${which}.`
    case 'question':
      return `${who} asked a question about ${which}.`
    case 'approved':
      return `${who} approved ${which}. OK to start.`
    case 'declined':
      return `${who} said no to ${which}. Don’t do this work.`
    default:
      return ''
  }
}

/** Events that arrive together share one toast, so a burst never stacks up. */
export function joinToastText(events: readonly FeedEvent[]): string {
  return events.map(eventToastText).filter(Boolean).join(' ')
}

/** On that change's own Status page there's no toast, just this, said once (ux-spec 0.4). */
export function eventHereText(e: FeedEvent): string {
  const who = e.client_first_name ?? 'Your client'
  switch (e.type) {
    case 'opened':
      return `${who} opened this variation.`
    case 'question':
      return `${who} asked a question about this variation.`
    case 'approved':
      return `${who} approved this variation. OK to start.`
    case 'declined':
      return `${who} said no to this variation. Don’t do this work.`
    default:
      return ''
  }
}

/** "Sarah approved Variation 2", for the while-you-were-away line. */
function clause(e: FeedEvent, withName: boolean): string {
  const who = withName ? `${e.client_first_name ?? 'Your client'} ` : ''
  const which = builder.variationName(e.number)
  switch (e.type) {
    case 'opened':
      return `${who}opened ${which}`
    case 'question':
      return `${who}asked a question about ${which}`
    case 'approved':
      return `${who}approved ${which}`
    case 'declined':
      return `${who}said no to ${which}`
    default:
      return ''
  }
}

/** At most this many things in the line; the rest are counted. */
const AWAY_MAX = 3

/** D77, ux-spec 0.4: "While you were away: Sarah approved Variation 2 and opened Variation 3."
 *  One clause per piece of news: "opened" steps aside when the same change has more to say, a
 *  repeat is said once, and a long list ends "and 2 more updates". A name is said once while the
 *  same person keeps acting. Empty if there's nothing to say. */
export function awayText(events: readonly FeedEvent[]): string {
  const news = events.filter((e, i) => {
    const same = (o: FeedEvent) => o.variation_id === e.variation_id
    if (events.findIndex((o) => same(o) && o.type === e.type) !== i) return false
    return e.type !== 'opened' || !events.some((o) => same(o) && o.type !== 'opened')
  })
  const shown = news.slice(0, AWAY_MAX)
  const parts = shown
    .map((e, i) => clause(e, i === 0 || shown[i - 1].client_first_name !== e.client_first_name))
    .filter(Boolean)
  if (!parts.length) return ''
  const rest = news.length - shown.length
  if (rest) parts.push(`${rest} more ${rest === 1 ? 'update' : 'updates'}`)
  const list =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `While you were away: ${list}.`
}
