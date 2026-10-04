// What the Jobs and Job screens summarise (ux-spec.md 1 and 2; D27). Pure, so it's tested once
// and used by the API.

import type { Tone, VariationStatus } from './copy.ts'

export type VariationForSummary = {
  status: VariationStatus
  price_cents: number | null
  delay_days: number | null
}

export type MoneySummary = {
  original_cents: number
  approved_cents: number
  approved_count: number
  approved_days: number
  waiting_cents: number
  waiting_count: number
  total_cents: number
  /** The total if every change waiting on the client is approved. */
  if_approved_cents: number
}

const isWaiting = (s: VariationStatus) => s === 'sent' || s === 'question'

export function moneySummary(
  contractCents: number,
  variations: readonly VariationForSummary[],
): MoneySummary {
  let approved = 0
  let approvedCount = 0
  let approvedDays = 0
  let waiting = 0
  let waitingCount = 0
  for (const v of variations) {
    if (v.status === 'approved') {
      approved += v.price_cents ?? 0
      approvedCount += 1
      approvedDays += v.delay_days ?? 0
    } else if (isWaiting(v.status)) {
      waiting += v.price_cents ?? 0
      waitingCount += 1
    }
  }
  const total = contractCents + approved
  return {
    original_cents: contractCents,
    approved_cents: approved,
    approved_count: approvedCount,
    approved_days: approvedDays,
    waiting_cents: waiting,
    waiting_count: waitingCount,
    total_cents: total,
    if_approved_cents: total + waiting,
  }
}

export type StatusLine = { tone: Tone; text: string }

/** A job card's status line: the first match wins (D27). */
export function jobStatusLine(statuses: readonly VariationStatus[], firstName: string): StatusLine {
  const count = (s: VariationStatus) => statuses.filter((x) => x === s).length
  const questions = count('question')
  if (questions > 0) {
    return {
      tone: 'ask',
      text:
        questions === 1
          ? `1 question from ${firstName}`
          : `${questions} questions from ${firstName}`,
    }
  }
  const waiting = count('sent')
  if (waiting > 0) return { tone: 'wait', text: `${waiting} waiting on ${firstName}` }
  const drafts = count('draft')
  if (drafts > 0)
    return { tone: 'neutral', text: drafts === 1 ? '1 draft to send' : `${drafts} drafts to send` }
  if (count('approved') > 0) return { tone: 'go', text: 'All changes signed' }
  return { tone: 'neutral', text: 'No changes yet' }
}

/** The line under "Morning, Dan" on the Jobs screen. */
export function jobsSummaryLine(allStatuses: readonly VariationStatus[]): StatusLine {
  const questions = allStatuses.filter((s) => s === 'question').length
  if (questions > 0) {
    return {
      tone: 'ask',
      text: questions === 1 ? '1 question to answer' : `${questions} questions to answer`,
    }
  }
  const waiting = allStatuses.filter((s) => s === 'sent').length
  if (waiting > 0) {
    return {
      tone: 'wait',
      text:
        waiting === 1 ? '1 change waiting on a client' : `${waiting} changes waiting on clients`,
    }
  }
  const drafts = allStatuses.filter((s) => s === 'draft').length
  if (drafts > 0)
    return { tone: 'neutral', text: drafts === 1 ? '1 draft to send' : `${drafts} drafts to send` }
  return { tone: 'go', text: 'Everything’s signed' }
}
