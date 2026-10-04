// Live updates in a browser-only Nod (decisions.md D91): every write pokes every other tab and
// iframe of this site through a BroadcastChannel, and this tab's own listeners too. A poke
// carries no data (D9): screens refetch from the local store, and toasts come from the event feed.
const CHANNEL = 'nod'

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null

function fire() {
  for (const listener of [...listeners]) listener()
}

function ensureChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: string } | null
    if (data?.type === 'poke') fire()
  }
  return channel
}

/** Run `onPoke` whenever Nod's data changes, here or in another tab. Returns an unsubscribe. */
export function subscribeLive(onPoke: () => void): () => void {
  ensureChannel()
  listeners.add(onPoke)
  return () => {
    listeners.delete(onPoke)
  }
}

/** Tell every view that the data changed: other tabs now, this tab on the next task. */
export function notifyLive(): void {
  ensureChannel()?.postMessage({ type: 'poke' })
  setTimeout(fire, 0)
}
