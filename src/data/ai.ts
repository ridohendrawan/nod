// The one network call Nod makes: POST /api/notes, the stateless AI function (D91). It stores
// nothing; the drafts are saved here in the browser once the reply arrives.
import type { NotesRequest } from '../../shared/ai/schema.ts'
import type { ApiErrorBody, NotesApiResponse } from '../../shared/types.ts'
import { ApiError, aiUnavailable, isAiUnavailableReason, offline, timedOut } from './errors.ts'

/** The function tries Claude for up to 20 s and retries once, so give it a little longer. */
export const AI_TIMEOUT_MS = 45_000

/** The courtesy cap per browser per Brisbane day (D15 as changed by D91). */
export const AI_DAILY_LIMIT = 80

/** AbortSignal.any where the browser has it (Safari 17.4+), a hand-made one where it doesn't. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals)
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true })
  }
  return controller.signal
}

/**
 * Send the note. Rejects with an AbortError if `signal` aborts (Dan chose "Fill it in by hand"
 * while waiting, D66), so a late reply never creates drafts nobody wants.
 */
export async function postNotes(
  body: NotesRequest,
  signal?: AbortSignal,
): Promise<NotesApiResponse> {
  const timeout = AbortSignal.timeout(AI_TIMEOUT_MS)
  const combined = signal ? anySignal([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: combined,
    })
  } catch (e) {
    if (signal?.aborted) throw signal.reason ?? e
    if (timeout.aborted) throw timedOut()
    throw offline()
  }
  const json: unknown = await res.json().catch(() => null)
  // The signals also cover reading the body.
  if (signal?.aborted) throw signal.reason
  if (timeout.aborted && json === null) throw timedOut()
  if (res.ok && json && typeof json === 'object' && 'changes' in json)
    return json as NotesApiResponse
  const err = json as ApiErrorBody | null
  if (err && typeof err.error === 'string' && typeof err.message === 'string') {
    // The words on screen come from shared/copy.ts, whatever the function, the dev hook or an
    // older deploy said; a reason this build doesn't know reads as "down".
    if (err.error === 'ai_unavailable')
      throw aiUnavailable(isAiUnavailableReason(err.reason) ? err.reason : 'down')
    throw new ApiError(res.status, err.error, err.message, err)
  }
  // No JSON error from the function (a gateway page, a missing route): the AI can't help.
  throw aiUnavailable('down')
}
