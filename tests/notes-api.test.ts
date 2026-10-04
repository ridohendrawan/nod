import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL,
  extract,
  handleNotes,
  modeFor,
  reasonFor,
  Unavailable,
} from '../api/notes.ts'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import { sampleNote } from '../shared/ai/samples.ts'
import type { NotesRequest } from '../shared/ai/schema.ts'
import { builder } from '../shared/copy.ts'

const job: NotesRequest['job'] = {
  title: 'Kitchen renovation',
  client_name: 'Sarah Chen',
  client_first_name: 'Sarah',
  address: '14 Lilly St, Paddington QLD 4064',
  state: 'QLD',
  contract_price_cents: 4_750_000,
  variations: [{ number: 1, title: 'Full-height tiled splashback', status: 'approved' }],
}
const golden: NotesRequest = { transcript: sampleNote('one_change', 'Sarah'), job }

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('POST /api/notes', () => {
  it('drafts the golden note in fixture mode, through the guardrails', async () => {
    const res = await handleNotes(post(golden), { NOD_AI_MODE: 'fixture' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.meta).toMatchObject({ model: 'fixture', mode: 'fixture' })
    expect(body.changes[0]).toMatchObject({
      price_cents: 22_000,
      delay_days: 0,
      requested_by: 'owner',
    })
  })

  it('demo mode, with no key: the sample notes get prepared drafts, any other note is `demo` (D95)', async () => {
    const sample = await handleNotes(post(golden), {})
    expect(sample.status).toBe(200)
    expect((await sample.json()).meta).toMatchObject({ model: 'fixture', mode: 'fixture' })
    const other = { ...golden, transcript: 'Two more downlights in the hall, 160' }
    const res = await handleNotes(post(other), {})
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      error: 'ai_unavailable',
      reason: 'demo',
      message: builder.aiUnavailable.demo,
    })
  })

  it('NOD_AI_MODE=live never falls back to the demo: with no key it says not configured', async () => {
    const res = await handleNotes(post(golden), { NOD_AI_MODE: 'live' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'not_configured' })
  })

  it('refuses the wrong method, other sites, oversized bodies and bad requests', async () => {
    expect((await handleNotes(new Request('http://localhost/api/notes'), {})).status).toBe(405)
    expect((await handleNotes(post(golden, { 'sec-fetch-site': 'cross-site' }), {})).status).toBe(
      403,
    )
    expect((await handleNotes(post('x'.repeat(40_000)), {})).status).toBe(413)
    expect((await handleNotes(post('{not json'), {})).status).toBe(400)
    const empty = await handleNotes(post({ ...golden, transcript: '   ' }), {})
    expect(empty.status).toBe(422)
    expect(await empty.json()).toMatchObject({ error: 'invalid', field: 'transcript' })
  })
})

describe('prepared replies or Claude (modeFor, D95)', () => {
  const stand = {} as Anthropic
  it.each([
    ['no key: the demo', {}, undefined, 'fixture'],
    ['a key: Claude', { ANTHROPIC_API_KEY: 'set' }, undefined, 'live'],
    [
      'fixture wins over a key',
      { NOD_AI_MODE: 'fixture', ANTHROPIC_API_KEY: 'set' },
      undefined,
      'fixture',
    ],
    ['live, even with no key (then not configured)', { NOD_AI_MODE: 'live' }, undefined, 'live'],
    ['the tests’ stand-in client: Claude', {}, stand, 'live'],
    ['fixture wins over a stand-in client', { NOD_AI_MODE: 'fixture' }, stand, 'fixture'],
  ] as const)('%s', (_, env, client, mode) => {
    expect(modeFor(env, client !== undefined)).toBe(mode)
  })
})

describe('mapping failures to what Dan sees (research/anthropic-api.md)', () => {
  const api = (status: number, type: string) =>
    Anthropic.APIError.generate(
      status,
      { type: 'error', error: { type, message: type } },
      type,
      new Headers(),
    )

  it.each([
    [401, 'authentication_error', 'not_configured'],
    [402, 'billing_error', 'not_configured'],
    [403, 'permission_error', 'not_configured'],
    [404, 'not_found_error', 'not_configured'],
    [400, 'invalid_request_error', 'down'],
    [413, 'request_too_large', 'down'],
    [429, 'rate_limit_error', 'down'],
    [500, 'api_error', 'down'],
    [529, 'overloaded_error', 'down'],
  ])('%i %s is %s', (status, type, reason) => {
    expect(reasonFor(api(status, type))).toBe(reason)
  })

  it('treats network trouble and timeouts as down, and keeps our own reasons', () => {
    expect(reasonFor(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe('down')
    expect(reasonFor(new Anthropic.APIConnectionTimeoutError())).toBe('down')
    expect(reasonFor(new Unavailable('unreadable'))).toBe('unreadable')
    expect(reasonFor(new Error('anything else'))).toBe('down')
  })
})

describe('the Claude call (D1, D14, D16)', () => {
  /** A stand-in client that records the request and answers like `beta.messages.parse`. */
  function fakeClient(reply: Record<string, unknown>) {
    const calls: Record<string, unknown>[] = []
    const client = {
      beta: {
        messages: {
          parse: async (params: Record<string, unknown>) => {
            calls.push(params)
            return { model: params.model, stop_reason: 'end_turn', stop_details: null, ...reply }
          },
        },
      },
    } as unknown as Anthropic
    return { client, calls }
  }

  it('asks for structured output at low effort, with a cached system prompt and the fallback', async () => {
    const { client, calls } = fakeClient({ parsed_output: fixtureFor(golden.transcript, 'Sarah') })
    const out = await extract(golden, {}, client)
    expect(out.meta).toMatchObject({ model: DEFAULT_MODEL, mode: 'live' })
    expect(out.changes[0].price_cents).toBe(22_000)

    const params = calls[0] as {
      model: string
      max_tokens: number
      betas: string[]
      fallbacks: string
      output_config: { effort: string; format: unknown }
      system: { type: string; text: string; cache_control: unknown }[]
      messages: { role: string; content: string }[]
      temperature?: unknown
      thinking?: unknown
      tool_choice?: unknown
    }
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.max_tokens).toBe(16_000)
    expect(params.output_config.effort).toBe('low')
    expect(params.output_config.format).toBeDefined()
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(params.fallbacks).toBe('default')
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(params.messages[0].content).toContain('<note>')
    // Sonnet 5.5 rejects each of these with a 400.
    expect(params.temperature).toBeUndefined()
    expect(params.thinking).toBeUndefined()
    expect(params.tool_choice).toBeUndefined()
  })

  it('takes the model from NOD_MODEL, without the Sonnet-only fallback', async () => {
    const { client, calls } = fakeClient({ parsed_output: fixtureFor(golden.transcript, 'Sarah') })
    await extract(golden, { NOD_MODEL: 'claude-haiku-4-5' }, client)
    expect(calls[0]).toMatchObject({ model: 'claude-haiku-4-5' })
    expect(calls[0]).not.toHaveProperty('fallbacks')
  })

  it.each([
    ['a refusal', { stop_reason: 'refusal', parsed_output: null }],
    ['a cut-off reply', { stop_reason: 'max_tokens', parsed_output: null }],
    ['an unparsed reply', { parsed_output: null }],
  ])('treats %s as unreadable', async (_label, reply) => {
    const { client } = fakeClient(reply)
    await expect(extract(golden, {}, client)).rejects.toMatchObject({ reason: 'unreadable' })
  })
})
