// Limits the browser and the AI function share. Zod-free on purpose: the browser imports this at
// runtime, and importing anything that uses zod would put zod in Dan's bundle, with its eval
// probe that the CSP blocks (D46; tests/bundle-boundaries.test.ts).

/** Longest note Nod reads (about three minutes of speech). */
export const MAX_NOTE_CHARS = 4000
