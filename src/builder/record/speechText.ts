// Turning the recogniser's results into words in Dan's note (research/speech.md 2.4 and 2.6).
// Pure functions, so they can be tested against the Chrome traces we recorded.

/** Minimal Web Speech types: TypeScript's lib.dom coverage varies by version. */
export interface SRAlternative {
  readonly transcript: string
  readonly confidence: number
}
export interface SRResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [i: number]: SRAlternative
}
export interface SRResultList {
  readonly length: number
  readonly [i: number]: SRResult
}
export interface SREvent extends Event {
  readonly resultIndex: number
  readonly results: SRResultList
}

const firstWord = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, '')
    .trim()
    .split(/\s+/)[0] ?? ''

/**
 * One per recognition session (result indexes restart at 0 each session). Final results are
 * committed once; interim text is shown on its own line. The rescue rule keeps a phrase Chrome
 * showed as interim and then replaced without ever making it final: in our recordings it lost
 * an opening "Two-twenty all up." in 7 of 7 runs, and this caught every one.
 */
export function createAssembler(gapMs = 1000) {
  let lastFinal = -1
  let pending = ''
  let pendingAt = 0
  return {
    onResult(e: SREvent, now: number): { commit: string[]; interim: string } {
      const commit: string[] = []
      let raw = ''
      let sawFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) {
          sawFinal = true
          if (i > lastFinal && t.trim()) commit.push(t.trim())
          lastFinal = Math.max(lastFinal, i)
        } else {
          raw += t // Chrome splits interim text into a stable part and an unstable tail
        }
      }
      const interim = raw.replace(/\s+/g, ' ').trim()
      if (sawFinal) pending = ''
      if (interim) {
        if (
          pending &&
          !sawFinal &&
          now - pendingAt > gapMs &&
          firstWord(interim) !== firstWord(pending)
        ) {
          commit.push(pending)
        }
        pending = interim
        pendingAt = now
      }
      return { commit, interim }
    },
    /** On end, error or the stop watchdog: keep words that never became final. */
    flush(): string[] {
      const out = pending ? [pending] : []
      pending = ''
      return out
    },
  }
}

export type Assembler = ReturnType<typeof createAssembler>

/** Add spoken words to the end of the note: one space, and a capital where a sentence starts. */
export function appendDictation(current: string, chunk: string): string {
  const text = chunk.replace(/\s+/g, ' ').trim()
  if (!text) return current
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (!current.trim()) return cap(text)
  const sep = /\s$/.test(current) ? '' : ' '
  return current + sep + (/[.?!]\s*$/.test(current) ? cap(text) : text)
}
