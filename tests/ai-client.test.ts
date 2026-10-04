import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotesRequest } from '../shared/ai/schema.ts'
import { builder } from '../shared/copy.ts'
import type { NotesApiResponse } from '../shared/types.ts'
import { postNotes } from '../src/data/ai.ts'
import { ApiError } from '../src/data/errors.ts'

const body: NotesRequest = {
  transcript: 'Two-twenty all up.',
  job: {
    title: 'Kitchen renovation',
    client_name: 'Sarah Chen',
    client_first_name: 'Sarah',
    address: '14 Lilly St, Paddington QLD 4064',
    state: 'QLD',
    contract_price_cents: 4_750_000,
    variations: [],
  },
}

/** The next fetch answers with this status and body. */
function answer(status: number, payload: unknown, contentType = 'application/json'): void {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(text, { status, headers: { 'content-type': contentType } })),
    ),
  )
}

async function failure(): Promise<ApiError> {
  try {
    await postNotes(body)
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('postNotes resolved, but a failure was expected')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postNotes: the words on screen always come from shared/copy.ts', () => {
  it('rewords an ai_unavailable answer by its reason (the dev hook once said "Forced: limit")', async () => {
    answer(503, { error: 'ai_unavailable', message: 'Forced: limit', reason: 'limit' })
    const e = await failure()
    expect(e.status).toBe(503)
    expect(e.code).toBe('ai_unavailable')
    expect(e.message).toBe(builder.aiUnavailable.limit)
    expect(e.body?.reason).toBe('limit')
  })

  it('words the demo answer for a note that isn’t a sample (D95)', async () => {
    answer(503, { error: 'ai_unavailable', message: 'demo', reason: 'demo' })
    const e = await failure()
    expect(e.message).toBe(builder.aiUnavailable.demo)
    expect(e.body?.reason).toBe('demo')
  })

  it('reads a reason this build doesn’t know as “down”', async () => {
    answer(503, { error: 'ai_unavailable', message: 'Something new.', reason: 'maintenance' })
    const e = await failure()
    expect(e.message).toBe(builder.aiUnavailable.down)
    expect(e.body?.reason).toBe('down')
  })

  it('turns the Firewall’s plain-text 429 into “down”', async () => {
    answer(429, 'Too Many Requests', 'text/plain; charset=utf-8')
    const e = await failure()
    expect(e.code).toBe('ai_unavailable')
    expect(e.message).toBe(builder.aiUnavailable.down)
  })

  it('passes other errors through with their own words and details', async () => {
    answer(422, {
      error: 'invalid',
      message: 'Nod couldn’t read that request.',
      field: 'transcript',
    })
    const e = await failure()
    expect(e.code).toBe('invalid')
    expect(e.message).toBe('Nod couldn’t read that request.')
    expect(e.body?.field).toBe('transcript')
  })

  it('returns the drafts from a good reply', async () => {
    const reply: NotesApiResponse = {
      changes: [],
      site_note: null,
      no_change_reason: 'There’s no change in that note.',
      meta: { model: 'claude-sonnet-5-5', mode: 'fixture', latency_ms: 5 },
    }
    answer(200, reply)
    await expect(postNotes(body)).resolves.toEqual(reply)
  })

  it('says there’s no signal when the request never leaves the phone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const e = await failure()
    expect(e.code).toBe('network')
  })
})
