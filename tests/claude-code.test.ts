// Live drafting through Claude Code on the presenter's machine (D96; scripts/claude-code.ts),
// against a stand-in CLI (tests/fixtures/fake-claude.mjs): no model is called here. The first real
// run is the presenter's, on their own Claude plan (`pnpm demo:claude`).
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleNotes } from '../api/notes.ts'
import {
  claudeCodeArgs,
  claudeCodeDrafter,
  claudeCommand,
  failureOf,
  replyFrom,
  resultFrom,
  shownCommand,
} from '../scripts/claude-code.ts'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import { SYSTEM_PROMPT } from '../shared/ai/prompt.ts'
import { sampleNote } from '../shared/ai/samples.ts'
import type { NotesRequest } from '../shared/ai/schema.ts'

const fake = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url))
const drafter = (timeoutMs?: number) =>
  claudeCodeDrafter({ command: [process.execPath, fake], ...(timeoutMs ? { timeoutMs } : {}) })

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

const post = (body: unknown) =>
  new Request('http://localhost/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** The stand-in answers this way, with the golden note's reply. */
function stand(mode: string): void {
  vi.stubEnv('FAKE_CLAUDE', mode)
  vi.stubEnv('FAKE_CLAUDE_REPLY', JSON.stringify(fixtureFor(golden.transcript, 'Sarah')))
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const env = { NOD_AI_MODE: 'claude-code' }

describe('drafting through Claude Code (D96)', () => {
  it('drafts the golden note live, through the same guardrails as the API', async () => {
    stand('structured')
    const res = await handleNotes(post(golden), env, drafter())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.meta).toMatchObject({ mode: 'live', model: 'claude-sonnet-5-5 via Claude Code' })
    expect(body.meta.usage).toMatchObject({ input_tokens: 1200, output_tokens: 300 })
    expect(body.changes).toHaveLength(1)
    expect(body.changes[0]).toMatchObject({ price_cents: 22_000, delay_days: 0 })
    expect(body.changes[0].ai.quotes.price).toBe('Two-twenty all up')
  })

  it('runs Claude Code locked down: no tools, MCP, skills or saved session; Nod’s prompt and schema; the note on stdin; a neutral folder', async () => {
    stand('structured')
    const log = join(mkdtempSync(join(tmpdir(), 'nod-cc-')), 'call.json')
    vi.stubEnv('FAKE_CLAUDE_LOG', log)
    await handleNotes(post(golden), env, drafter())
    const call = JSON.parse(readFileSync(log, 'utf8')) as {
      args: string[]
      cwd: string
      input: string
    }
    const after = (flag: string) => call.args[call.args.indexOf(flag) + 1]
    expect(call.args[0]).toBe('-p')
    expect(after('--tools')).toBe('')
    expect(call.args).toEqual(
      expect.arrayContaining([
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--no-session-persistence',
      ]),
    )
    expect(after('--system-prompt')).toBe(SYSTEM_PROMPT)
    expect(after('--output-format')).toBe('json')
    expect(JSON.parse(after('--json-schema') ?? '')).toMatchObject({ type: 'object' })
    expect(after('--model')).toBe('claude-sonnet-5-5')
    expect(after('--effort')).toBe('low')
    expect(realpathSync(call.cwd)).toBe(realpathSync(tmpdir()))
    expect(call.input).toContain(golden.transcript)
    // The note travels on stdin, never in the arguments (the process list shows those).
    expect(call.args.some((a) => a.includes(golden.transcript))).toBe(false)
  })

  it('reads the reply from the text when an older Claude Code skips the schema', async () => {
    stand('text')
    const res = await handleNotes(post(golden), env, drafter())
    expect(res.status).toBe(200)
    expect((await res.json()).changes[0].price_cents).toBe(22_000)
  })

  it.each([
    ['login', 'not_configured', /sign in/],
    ['limit', 'down', /usage limit/],
    ['nested', 'down', /normal terminal/],
    ['prose', 'unreadable', /record_changes/],
    ['garbage', 'down', /failed/],
  ])('a %s answer is %s, with a hint in the server log', async (mode, reason, hint) => {
    stand(mode)
    const res = await handleNotes(post(golden), env, drafter())
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: 'ai_unavailable', reason })
    expect(warn.mock.calls.flat().join(' ')).toMatch(hint)
  })

  it('gives up on a run that takes too long', async () => {
    stand('hang')
    const res = await handleNotes(post(golden), env, drafter(400))
    expect(await res.json()).toMatchObject({ reason: 'down' })
  })

  it('stops Claude Code when the browser gives up, without waiting for the timeout', async () => {
    stand('hang')
    const gone = new AbortController()
    const started = Date.now()
    setTimeout(() => gone.abort(), 150)
    await expect(drafter(10_000)(golden, env, gone.signal)).rejects.toMatchObject({
      reason: 'down',
    })
    expect(Date.now() - started).toBeLessThan(3_000)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/browser gave up/)
  })

  it('carries the request’s signal through the handler, and never starts after a cancel', async () => {
    stand('hang')
    const gone = new AbortController()
    setTimeout(() => gone.abort(), 150)
    const request = new Request('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(golden),
      signal: gone.signal,
    })
    const started = Date.now()
    const res = await handleNotes(request, env, drafter(10_000))
    expect(await res.json()).toMatchObject({ reason: 'down' })
    expect(Date.now() - started).toBeLessThan(3_000)
    const already = new AbortController()
    already.abort()
    const quick = Date.now()
    await expect(drafter(10_000)(golden, env, already.signal)).rejects.toMatchObject({
      reason: 'down',
    })
    expect(Date.now() - quick).toBeLessThan(200)
  })

  it('names the command it ran in the sign-in hint, since plain `claude` may not be on the PATH', async () => {
    stand('login')
    await handleNotes(post(golden), env, drafter())
    expect(warn.mock.calls.flat().join(' ')).toContain(`${fake}\` in a terminal and sign in`)
    expect(shownCommand('/Users/x/.local/bin/claude', '/Users/x')).toBe('~/.local/bin/claude')
    expect(shownCommand('/Users/xy/claude', '/Users/x')).toBe('/Users/xy/claude')
    expect(shownCommand('claude', '/Users/x')).toBe('claude')
    expect(failureOf('Not logged in', '~/.local/bin/claude').hint).toContain(
      'run `~/.local/bin/claude` in a terminal',
    )
    expect(failureOf('Not logged in').hint).toContain('run `claude` in a terminal')
  })

  it('says not configured when Claude Code isn’t installed', async () => {
    const missing = claudeCodeDrafter({ command: ['/nonexistent/nod/claude'] })
    const res = await handleNotes(post(golden), env, missing)
    expect(await res.json()).toMatchObject({ reason: 'not_configured' })
  })

  it('never runs in fixture mode, which always wins', async () => {
    stand('login')
    const res = await handleNotes(post(golden), { NOD_AI_MODE: 'fixture' }, drafter())
    expect(res.status).toBe(200)
    expect((await res.json()).meta.mode).toBe('fixture')
  })

  it('finds Claude Code: NOD_CLAUDE_BIN, then the PATH, then the native installer’s ~/.local/bin', () => {
    const home = mkdtempSync(join(tmpdir(), 'nod-home-'))
    const bin = join(home, 'bin')
    mkdirSync(bin)
    expect(claudeCommand({ NOD_CLAUDE_BIN: '/opt/claude', PATH: bin }, home)).toBe('/opt/claude')
    expect(claudeCommand({ PATH: bin }, home)).toBe('claude') // nothing anywhere: let spawn say so
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'claude'), '')
    expect(claudeCommand({ PATH: bin }, home)).toBe(join(home, '.local', 'bin', 'claude'))
    writeFileSync(join(bin, 'claude'), '')
    expect(claudeCommand({ PATH: bin }, home)).toBe('claude')
  })

  it('reads the last JSON line, prefers the structured output, and sorts failures', () => {
    expect(resultFrom('warming up\n{"result":"a"}\n{"result":"b"}\n')).toEqual({ result: 'b' })
    expect(resultFrom('nothing here')).toBeNull()
    expect(replyFrom({ structured_output: { x: 1 }, result: '{"y":2}' })).toEqual({ x: 1 })
    expect(replyFrom({ result: 'no json' })).toBeNull()
    expect(failureOf('Not logged in. Please run /login').reason).toBe('not_configured')
    expect(failureOf('Not logged in').reason).toBe('not_configured')
    expect(failureOf('OAuth token has expired').reason).toBe('not_configured')
    expect(failureOf('Tool not assigned in this run').reason).toBe('down')
    expect(failureOf('Claude usage limit reached. Run /login to switch accounts')).toMatchObject({
      reason: 'down',
      hint: expect.stringMatching(/usage limit/),
    })
    expect(failureOf('overloaded').reason).toBe('down')
    expect(claudeCodeArgs({ NOD_MODEL: 'claude-haiku-4-5' })).toContain('claude-haiku-4-5')
  })
})
