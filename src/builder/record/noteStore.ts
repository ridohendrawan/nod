// Dan's unsent note, kept on this phone per job (ux-spec 3): a dropped call, a locked screen or a
// closed tab never loses it, and it comes back with "Your unsent note from 2:10 pm is back."
// localStorage is enough: one short note per job, read once when Record opens.

export type SavedNote = { text: string; savedAt: string }

const key = (jobId: string) => `nod:note:${jobId}`

export function readNote(jobId: string): SavedNote | null {
  try {
    const raw = localStorage.getItem(key(jobId))
    if (!raw) return null
    const note = JSON.parse(raw) as Partial<SavedNote>
    return typeof note.text === 'string' && note.text.trim() && typeof note.savedAt === 'string'
      ? { text: note.text, savedAt: note.savedAt }
      : null
  } catch {
    return null
  }
}

/** Save, or forget the note when it's empty. Returns false if this browser won't store it. */
export function writeNote(jobId: string, text: string): boolean {
  try {
    if (text.trim()) {
      const note: SavedNote = { text, savedAt: new Date().toISOString() }
      localStorage.setItem(key(jobId), JSON.stringify(note))
    } else {
      localStorage.removeItem(key(jobId))
    }
    return true
  } catch {
    return false
  }
}

/** Nod has read it, or a draft now holds it. */
export function forgetNote(jobId: string): void {
  try {
    localStorage.removeItem(key(jobId))
  } catch {
    // Nothing stored.
  }
}
