// The quote check (D12; research/speech.md 2.11). A price or a day count is kept only if the
// words Claude quotes really appear in Dan's note, and any number in the quote agrees with the
// amount. This is what makes "the AI never sets a price" a rule enforced by code.
//
// Deliberately no word-to-digit conversion: "two-twenty" never matches "220". Claude must copy
// the note character for character, and a miss fails safe (the field stays empty).

/** Both sides are normalised the same way before matching. */
export function normaliseForQuote(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/'/g, '')
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1') // 3,200 -> 3200
    .replace(/(\d):(?=\d{2}(?:\D|$))/g, '$1') // 2:20 -> 220 (the recogniser writes money as times)
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ') // $ , . - : and every dash or minus sign
    .trim()
}

/** True if the quote appears in the transcript as whole words. */
export function quoteAppears(quote: string, transcript: string): boolean {
  const q = normaliseForQuote(quote)
  if (!q) return false
  return ` ${normaliseForQuote(transcript)} `.includes(` ${q} `)
}

const numbersIn = (quote: string) => normaliseForQuote(quote).match(/\d+/g)

/**
 * Does the one number in the quote agree with the amount (equal, or x100 / x1000 for "2 grand"
 * style quotes)? null = no opinion: the quote has no digits ("Two-twenty all up") or several.
 */
export function amountMatchesQuote(dollars: number, quote: string): boolean | null {
  const nums = numbersIn(quote)
  if (!nums || nums.length !== 1) return null
  const n = Number(nums[0])
  const a = Math.abs(dollars)
  return a === n || a === n * 100 || a === n * 1000
}

/** Days are small numbers: the one number in the quote must equal the day count. */
export function daysMatchQuote(days: number, quote: string): boolean | null {
  const nums = numbersIn(quote)
  if (!nums || nums.length !== 1) return null
  return Number(nums[0]) === days
}

/**
 * The words just before and just after the quote in the transcript (normalised), so the
 * guardrails can see "about" before "150" or "plus GST" after "1250" when Claude quoted only
 * the number. Empty strings when the quote isn't found.
 */
export function quoteContext(
  quote: string,
  transcript: string,
  wordsBefore = 3,
  wordsAfter = 4,
): { before: string; after: string } {
  const q = normaliseForQuote(quote)
  const t = normaliseForQuote(transcript)
  const at = ` ${t} `.indexOf(` ${q} `)
  if (!q || at < 0) return { before: '', after: '' }
  const before = t
    .slice(0, Math.max(0, at - 1))
    .split(' ')
    .filter(Boolean)
    .slice(-wordsBefore)
    .join(' ')
  const after = t
    .slice(at + q.length)
    .split(' ')
    .filter(Boolean)
    .slice(0, wordsAfter)
    .join(' ')
  return { before, after }
}
