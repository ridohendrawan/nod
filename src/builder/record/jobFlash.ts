// One-off news for the Job screen, set by Record just before it goes back there: "Nod split your
// note into 2 changes", and which drafts are new (ux-spec 2 and 3). It lives in memory only and
// goes stale after a few seconds, so a later visit to the job never shows it again.

/** `prepared`: the drafts came from the demo's prepared results (D95), so the job screen says so. */
export type JobFlash = { newDrafts: readonly string[]; prepared: boolean }
type Flash = JobFlash & { at: number }

const FRESH_MS = 15_000
const flashes = new Map<string, Flash>()

export function setJobFlash(jobId: string, flash: JobFlash): void {
  flashes.set(jobId, { ...flash, at: Date.now() })
}

/** Read without clearing (StrictMode reads twice); the Job screen clears it once shown. */
export function peekJobFlash(jobId: string): JobFlash | null {
  const flash = flashes.get(jobId)
  return flash && Date.now() - flash.at < FRESH_MS ? flash : null
}

export function clearJobFlash(jobId: string): void {
  flashes.delete(jobId)
}
