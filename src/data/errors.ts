// Errors keep the shape the screens already handle: a status, a code and a calm message.
// Nod is browser-only now (decisions.md D91), so most codes come from local checks
// (not_found, locked, changed); network and timeout remain for the one AI call.
// Messages are the ux-spec.md copy, so a screen can show them as they are.
import { builder } from '../../shared/copy.ts'
import type { Check } from '../../shared/rules/types.ts'
import type { AiUnavailableReason, ApiErrorBody } from '../../shared/types.ts'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorBody['error'] | 'network' | 'timeout'
  readonly body: ApiErrorBody | null

  constructor(
    status: number,
    code: ApiError['code'],
    message: string,
    body: ApiErrorBody | null = null,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

const withBody = (status: number, error: ApiErrorBody['error'], message: string, detail = {}) =>
  new ApiError(status, error, message, { error, message, ...detail })

export const notFound = (what = 'That') => withBody(404, 'not_found', `${what} doesn’t exist.`)

/** Approved, declined and withdrawn changes reject every write (D7). */
export const locked = () =>
  withBody(409, 'locked', 'This change has already been answered, so it can’t change.')

/** The version moved since the screen loaded it (D7, D77). */
export const changed = (current?: unknown) =>
  withBody(409, 'changed', 'This change was updated somewhere else. Check the latest version.', {
    current,
  })

export const notDraft = () => withBody(409, 'not_draft', 'Only a draft can be deleted.')

/** A field that can't be saved as it is. */
export const invalid = (field: string, message: string) =>
  withBody(422, 'invalid', message, { field })

/** The rules re-ran at send and something required is missing (ux-spec.md 4, Sending). */
export const incomplete = (gaps: Check[]) => {
  const first = gaps[0]
  const what = first ? (first.action ?? first.label) : 'a required item'
  return withBody(
    422,
    'incomplete',
    `Something’s still missing: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`,
    { gaps },
  )
}

/** A reason the screens know how to word (anything else reads as "down"). */
export const isAiUnavailableReason = (r: unknown): r is AiUnavailableReason =>
  typeof r === 'string' && Object.hasOwn(builder.aiUnavailable, r)

/** The AI step can't help; every reason offers "Fill it in by hand" (ux-spec.md 3, Failures). */
export const aiUnavailable = (reason: AiUnavailableReason) =>
  withBody(503, 'ai_unavailable', builder.aiUnavailable[reason], { reason })

export const offline = () =>
  new ApiError(
    0,
    'network',
    'No signal. Your note is saved on this phone. Try again when you’re back online.',
  )

export const timedOut = () =>
  new ApiError(0, 'timeout', 'That didn’t go through. Your note is saved. Try again.')
