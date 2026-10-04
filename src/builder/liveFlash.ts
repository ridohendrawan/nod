// The card flash (D75): when Sarah does something, the row or job card it concerns tints once,
// so Dan's eye finds it. Each mark bumps a key; the screen re-mounts a small overlay with that
// key, which plays its fade once. Nothing here is announced: the toast or the announcer says it.
import { useSyncExternalStore } from 'react'
import type { FeedEvent } from '../../shared/types.ts'

const keys = new Map<string, number>()
const listeners = new Set<() => void>()
let next = 1

export function markChanged(events: readonly FeedEvent[]): void {
  for (const e of events) {
    if (e.variation_id) keys.set(e.variation_id, next)
    if (e.job_id) keys.set(e.job_id, next)
  }
  next += 1
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 0 until something about this id happens; then a new number each time. */
export function useFlashKey(id: string): number {
  return useSyncExternalStore(subscribe, () => keys.get(id) ?? 0)
}
