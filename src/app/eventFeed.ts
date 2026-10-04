// The event feed (coordination.md 5): pokes say "something changed", and this pulls
// events after the cursor to find out what. Each event id is handled once, so a poke, a poll
// and a refocus arriving together never toast twice. Calls that overlap share one follow-up pull.
import type { FeedEvent } from '../../shared/types.ts'
import { api } from '../lib/api.ts'

/** The API returns at most this many events per call; a full page means there may be more. */
const PAGE = 50

export type FeedHandlers = {
  /** A demo reset happened (here or in another tab). Older events in the batch are the reseed. */
  onReset: () => void
  /** New events after any reset in this batch, oldest first. */
  onEvents: (events: FeedEvent[]) => void
}

export type EventFeed = {
  /** Fetch and handle everything new. Resolves once a pull that started after this call ends. */
  pull: () => Promise<void>
  /** The id of the newest reset this feed has handled (0 if none). */
  lastResetId: () => number
  /** The screen's latest handlers (they read the current route, so they change as Dan moves). */
  setHandlers: (next: FeedHandlers) => void
}

export function createEventFeed(startCursor: number): EventFeed {
  let handlers: FeedHandlers = { onReset: () => {}, onEvents: () => {} }
  let cursor = startCursor
  let lastReset = 0
  let inflight: Promise<void> | null = null
  let queued: Promise<void> | null = null

  async function run(): Promise<void> {
    const batch: FeedEvent[] = []
    try {
      for (;;) {
        const page = await api.events(cursor)
        batch.push(...page.events)
        cursor = Math.max(cursor, page.cursor)
        if (page.events.length < PAGE) break
      }
    } catch {
      // Storage hiccup: the next poke tries again from the cursor.
    }
    try {
      handle(batch)
    } catch (error) {
      console.error('Nod: an event handler failed', error)
    }
  }

  function handle(batch: FeedEvent[]) {
    if (batch.length === 0) return
    const resetAt = batch.reduce((id, e) => (e.type === 'reset' && e.id > id ? e.id : id), 0)
    if (resetAt > lastReset) {
      lastReset = resetAt
      handlers.onReset()
    }
    const fresh = batch.filter((e) => e.id > lastReset && e.type !== 'reset')
    if (fresh.length) handlers.onEvents(fresh)
  }

  function pull(): Promise<void> {
    if (!inflight) {
      inflight = run().finally(() => {
        inflight = null
      })
      return inflight
    }
    // A pull is running; it may have fetched before this call's news landed, so run once more.
    queued ??= inflight.then(() => {
      queued = null
      return pull()
    })
    return queued
  }

  return {
    pull,
    lastResetId: () => lastReset,
    setHandlers: (next) => {
      handlers = next
    },
  }
}
