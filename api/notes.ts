// POST /api/notes: the AI step, the only server code in Nod (architecture.md 6; D91).
// Stateless: it takes Dan's note and the job's context, asks Claude for `record_changes`
// (structured outputs, D1), runs the guardrails and returns the drafts. It stores nothing; the
// browser saves the drafts. It never logs the note or the key.
//
// Demo mode (D95): with no key, the five sample notes get prepared replies, through the same
// guardrails, and any other note is answered `demo`. The public prototype runs this way.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import { applyGuardrails } from '../shared/ai/guardrails.ts'
import { renderUserMessage, SYSTEM_PROMPT } from '../shared/ai/prompt.ts'
import { NotesRequest, RecordChanges } from '../shared/ai/schema.ts'
import { builder } from '../shared/copy.ts'
import type { AiUnavailableReason, NotesApiResponse } from '../shared/types.ts'

export const DEFAULT_MODEL = 'claude-sonnet-5-5'
/** A 4,000-character note plus the job's context fits easily; anything bigger isn't Nod's. */
const MAX_BODY_CHARS = 32_000

export type NotesEnv = {
  ANTHROPIC_API_KEY?: string
  /** D16: swap the model without a deploy (for example during the live Q&A). */
  NOD_MODEL?: string
  /** "fixture": prepared replies for the five sample notes (demo mode; local development and
   *  tests). "live": always Claude (a pilot: a missing key is then an error, never a demo).
   *  "claude-code": the local dev and preview servers draft through Claude Code on this machine
   *  (D96; scripts/claude-code.ts), never Vercel. Unset: Claude when there's a key, otherwise
   *  demo mode (D95). */
  NOD_AI_MODE?: string
  /** "off" turns off the server-side refusal fallback, if it ever misbehaves. */
  NOD_AI_FALLBACK?: string
}

/** A reason the AI step can't help, raised by our own checks. */
export class Unavailable extends Error {
  readonly reason: AiUnavailableReason
  constructor(reason: AiUnavailableReason) {
    super(reason)
    this.reason = reason
  }
}

/**
 * Map a failure to the reason Dan sees (research/anthropic-api.md 2; error classes most specific
 * first, and the connection errors before APIError, their base class in the TS SDK).
 */
export function reasonFor(e: unknown): AiUnavailableReason {
  if (e instanceof Unavailable) return e.reason
  if (
    e instanceof Anthropic.AuthenticationError || // 401: key missing or wrong
    e instanceof Anthropic.PermissionDeniedError || // 403
    e instanceof Anthropic.NotFoundError // 404: usually a wrong model id
  ) {
    return 'not_configured'
  }
  if (e instanceof Anthropic.RateLimitError) return 'down' // 429
  if (e instanceof Anthropic.InternalServerError) return 'down' // 5xx, including 529 overloaded
  if (e instanceof Anthropic.APIConnectionError) return 'down' // network, and timeouts (a subclass)
  if (e instanceof Anthropic.BadRequestError) return 'down' // 400: our bug, logged loudly
  if (e instanceof Anthropic.APIError) return e.status === 402 ? 'not_configured' : 'down' // 402 billing, 413
  return 'down'
}

/** What to log about a failure: the class, status and type, never the note or the key. */
function describe(e: unknown): string {
  if (e instanceof Anthropic.APIError)
    return `${e.constructor.name} status=${e.status} type=${e.type ?? '-'}`
  return e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)
}

function finish(
  reply: RecordChanges,
  transcript: string,
  model: string,
  mode: 'live' | 'fixture',
  started: number,
  usage?: NotesApiResponse['meta']['usage'],
): NotesApiResponse {
  const guarded = applyGuardrails(reply, transcript)
  for (const line of guarded.log) console.warn('[notes]', line)
  return {
    changes: guarded.changes,
    site_note: guarded.site_note,
    no_change_reason: guarded.no_change_reason,
    meta: { model, mode, latency_ms: Date.now() - started, ...(usage ? { usage } : {}) },
  }
}

/** A live reply from somewhere other than the API: on this machine, Claude Code (D96). */
export type DraftReply = {
  reply: RecordChanges
  model: string
  usage?: NotesApiResponse['meta']['usage']
}
/** `signal` aborts when the browser gives up (Dan chose "Fill it in by hand"), so the work stops. */
export type Drafter = (
  req: NotesRequest,
  env: NotesEnv,
  signal?: AbortSignal,
) => Promise<DraftReply>

/** Prepared replies or Claude (D95). A client or drafter passed in (the tests' stand-in, or Claude
 *  Code on the local server, D96) means Claude. */
export function modeFor(env: NotesEnv, injected = false): 'live' | 'fixture' {
  if (env.NOD_AI_MODE === 'fixture') return 'fixture'
  if (env.NOD_AI_MODE === 'live' || injected) return 'live'
  return env.ANTHROPIC_API_KEY ? 'live' : 'fixture'
}

/** One note to drafts. Exported for the eval script, which calls Claude the same way. */
export async function extract(
  req: NotesRequest,
  env: NotesEnv,
  client?: Anthropic,
  drafter?: Drafter,
  signal?: AbortSignal,
): Promise<NotesApiResponse> {
  const started = Date.now()
  if (modeFor(env, Boolean(client ?? drafter)) === 'fixture') {
    const canned = fixtureFor(req.transcript, req.job.client_first_name)
    if (!canned) throw new Unavailable('demo')
    return finish(canned, req.transcript, 'fixture', 'fixture', started)
  }
  if (drafter) {
    const { reply, model, usage } = await drafter(req, env, signal)
    return finish(reply, req.transcript, model, 'live', started, usage)
  }
  if (!client && !env.ANTHROPIC_API_KEY) throw new Unavailable('not_configured')

  const model = env.NOD_MODEL?.trim() || DEFAULT_MODEL
  const anthropic =
    client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 })
  // Server-side refusal fallback (only Sonnet 5.5 takes the "default" form): it re-runs a cyber
  // or frontier_llm decline on Claude Sonnet 5. Renovation notes shouldn't trigger either.
  const fallback =
    model === DEFAULT_MODEL && env.NOD_AI_FALLBACK !== 'off'
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {}

  const message = await anthropic.beta.messages.parse({
    model,
    max_tokens: 16_000,
    ...fallback,
    // Adaptive thinking (the default) at low effort: the starting point for extraction (D14).
    output_config: { effort: 'low', format: betaZodOutputFormat(RecordChanges) },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: renderUserMessage(req.job, req.transcript) }],
  })
  // Check why it stopped before reading: a refusal or a cut-off reply has no usable card.
  if (
    message.stop_reason === 'refusal' ||
    message.stop_reason === 'max_tokens' ||
    !message.parsed_output
  ) {
    console.warn('[notes] unreadable', message.stop_reason, message.stop_details?.category ?? '')
    throw new Unavailable('unreadable')
  }
  const u = message.usage as typeof message.usage | undefined
  return finish(
    message.parsed_output,
    req.transcript,
    message.model,
    'live',
    started,
    u && {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    },
  )
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const problem = (
  status: number,
  error: string,
  message: string,
  detail: Record<string, unknown> = {},
) => json(status, { error, message, ...detail })

/** The request handler, for Vercel and the local dev server alike. The local server can pass a
 *  drafter (Claude Code, D96); Vercel never does. */
export async function handleNotes(
  request: Request,
  env: NotesEnv,
  drafter?: Drafter,
): Promise<Response> {
  if (request.method !== 'POST') return problem(405, 'invalid', 'Use POST.')
  // Only Nod's own pages call this; another site's page in someone's browser can't spend on it.
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return problem(403, 'invalid', 'This address is for Nod’s own pages.')
  }
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) {
    return problem(
      413,
      'invalid',
      'That note is too long for Nod to read. Split it into two notes.',
      {
        field: 'transcript',
      },
    )
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return problem(400, 'invalid', 'Nod couldn’t read that request.')
  }
  const parsed = NotesRequest.safeParse(body)
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join('.') ?? null
    return problem(422, 'invalid', 'Nod couldn’t read that request.', { field })
  }
  try {
    return json(200, await extract(parsed.data, env, undefined, drafter, request.signal))
  } catch (e) {
    const reason = reasonFor(e)
    if (!(e instanceof Unavailable)) console.error('[notes]', describe(e))
    return problem(503, 'ai_unavailable', builder.aiUnavailable[reason], { reason })
  }
}

export default {
  fetch: (request: Request) => handleNotes(request, process.env),
}
