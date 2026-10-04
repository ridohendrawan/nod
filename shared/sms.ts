// The messages that carry Sarah's link (ux-spec.md 5; D60, D73). The text is written for a
// lock screen: plain ASCII (so it stays one GSM-7 segment), under 160 characters including the
// link, and never the price. Built and measured here, so no screen can send a longer one.

export const SMS_LIMIT = 160

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Plain ASCII (line breaks kept): typographic quotes become straight ones, accents are dropped,
 *  the rest goes. */
export function toAscii(s: string): string {
  return s
    .replace(/\s*\u2014\s*/g, ', ')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–‒−]/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '')
}

/** True if every character is in the GSM-7 basic set we allow (ASCII letters, digits, punctuation). */
export function isGsm7Ascii(s: string): boolean {
  // GSM-7 has no backtick, caret, braces, brackets, pipe, backslash or tilde in its basic set.
  return /^[A-Za-z0-9 \n.,'"!?:;/()&%+\-=_@#*<>$]*$/.test(s)
}

export type ShareInput = {
  url: string
  clientFirstName: string
  builderName: string
  businessName: string
  builderMobile: string
  jobTitle: string
  /** An update to a change she already has (version 2 or later). */
  update: boolean
}

/** The text message, stepping down to shorter forms only if the long one won't fit. */
export function smsText(i: ShareInput): string {
  const job = lowerFirst(i.jobTitle)
  const what = i.update ? 'an updated change' : 'a change'
  const candidates = [
    `Hi ${i.clientFirstName}, it's ${i.builderName} from ${i.businessName}. Here's ${what} to your ${job} for your OK: ${i.url}`,
    `Hi ${i.clientFirstName}, it's ${i.builderName}. Here's ${what} to your ${job} for your OK: ${i.url}`,
    `Hi ${i.clientFirstName}, it's ${i.builderName}. Here's ${what} to your job for your OK: ${i.url}`,
    `Here's ${what} to your job for your OK: ${i.url}`,
  ].map(toAscii)
  return (
    candidates.find((t) => t.length <= SMS_LIMIT && isGsm7Ascii(t)) ??
    candidates[candidates.length - 1]
  )
}

/** The email (QLD lists email, not SMS, as a way to give her a copy: D60). */
export function emailMessage(i: ShareInput & { to: string | null }): {
  to: string | null
  subject: string
  body: string
  href: string
} {
  const job = lowerFirst(i.jobTitle)
  const subject = toAscii(`${i.update ? 'An updated change' : 'A change'} to your ${job}`)
  const body = toAscii(
    [
      `Hi ${i.clientFirstName},`,
      '',
      `${i.builderName} from ${i.businessName} needs your OK on ${i.update ? 'an updated change' : 'a change'} to your ${job}. You can read it and approve it here:`,
      i.url,
      '',
      `Questions? Call ${i.builderName} on ${i.builderMobile}.`,
      '',
      i.builderName,
      i.businessName,
    ].join('\n'),
  )
  // RFC 6068: line breaks in a mailto body are CRLF, percent-encoded.
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
  return { to: i.to, subject, body, href: `mailto:${i.to ?? ''}?${query}` }
}
