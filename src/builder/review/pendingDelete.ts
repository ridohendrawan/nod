// Deleting a draft is instant, with 5 seconds to undo (D72). The draft is hidden at once and
// deleted for real when its "Draft deleted." toast goes without an Undo, or as the page closes.
// So an Undo never has to rebuild anything: the draft was never gone.
import { useSyncExternalStore } from 'react'
import { api } from '../../lib/api.ts'

const held = new Set<string>()
/** Deleted for good. Ids are never reused, so these stay hidden while a refetch catches up. */
const gone = new Set<string>()
const listeners = new Set<() => void>()
let hidden: ReadonlySet<string> = new Set()

function changed() {
  hidden = new Set([...held, ...gone])
  for (const listener of [...listeners]) listener()
}

/** Hide the draft now; it's deleted when `commitDelete` runs. */
export function holdDelete(id: string): void {
  held.add(id)
  changed()
}

/** Undo: the draft shows again, untouched. */
export function undoDelete(id: string): void {
  if (held.delete(id)) changed()
}

export async function commitDelete(id: string): Promise<void> {
  if (!held.has(id)) return
  try {
    await api.deleteVariation(id)
    gone.add(id)
  } catch {
    // Sent from another tab, or already gone: nothing to delete, so let it show as it is.
  } finally {
    held.delete(id)
    changed()
  }
}

/** Drafts the Job screen shouldn't list. */
export function useHiddenDrafts(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hidden,
  )
}

// Closing the tab inside the 5 seconds still deletes: Dan was told it's deleted.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const id of [...held]) void commitDelete(id)
  })
}
