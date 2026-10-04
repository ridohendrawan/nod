// The AI step through Claude Code on this machine (D96): live drafting for the presenter's own
// demo and the eval, with no API key, on the presenter's own Claude plan. Only the local dev and
// preview servers use it (NOD_AI_MODE=claude-code, `pnpm demo:claude`). Vercel never does: a
// public site can't run on a personal Claude plan (Anthropic's rule for products), and it has no
// Claude Code anyway.
//
// It runs `claude -p` with Nod's own system prompt and the same record_changes schema the API path
// sends. Every tool is off, so a note can't make it read files or run commands. No MCP servers,
// no skills and no saved session, from a neutral working folder, so nothing else reaches the
// model. The reply then goes through the same guardrails as an API reply (api/notes.ts). Like the
// function, it never logs the note.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join, sep } from 'node:path'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { DEFAULT_MODEL, Unavailable, type Drafter, type NotesEnv } from '../api/notes.ts'
import { renderUserMessage, SYSTEM_PROMPT } from '../shared/ai/prompt.ts'
import { RecordChanges } from '../shared/ai/schema.ts'

/** A cold start plus a slow reply fits; the browser gives up at 45 s (AI_TIMEOUT_MS). */
export const CLAUDE_CODE_TIMEOUT_MS = 40_000

/** What `claude -p --output-format json` prints, as far as Nod reads it. */
export type CliResult = {
  subtype?: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

/** The flags: Nod's prompt and schema, the model at low effort (D14), and nothing else. */
export function claudeCodeArgs(env: NotesEnv): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(betaZodOutputFormat(RecordChanges).schema),
    '--system-prompt',
    SYSTEM_PROMPT,
    '--model',
    env.NOD_MODEL?.trim() || DEFAULT_MODEL,
    '--effort',
    'low',
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ]
}

/** Where Claude Code is: NOD_CLAUDE_BIN, then `claude` on the PATH, then where its native
 *  installer puts it (~/.local/bin), which a shell's PATH doesn't always include. */
export function claudeCommand(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): string {
  const set = env.NOD_CLAUDE_BIN?.trim()
  if (set) return set
  const onPath = (env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir !== '' && existsSync(join(dir, 'claude')))
  if (onPath) return 'claude'
  const native = join(home, '.local', 'bin', 'claude')
  return existsSync(native) ? native : 'claude'
}

/** The command as the presenter would type it, with their home folder as `~`, for the hints:
 *  plain `claude` isn't always on the PATH, so a hint names the one Nod found. */
export function shownCommand(command: string, home = homedir()): string {
  return command.startsWith(`${home}${sep}`) ? `~${command.slice(home.length)}` : command
}

/** Why a run failed, and what to tell the presenter in the server log. */
export function failureOf(
  text: string,
  command = 'claude',
): { reason: 'not_configured' | 'down'; hint: string } {
  if (/another claude code session|nested/i.test(text))
    return {
      reason: 'down',
      hint: 'Claude Code won’t start inside another Claude Code session: run `pnpm demo:claude` from a normal terminal.',
    }
  // Before the sign-in check: a limit message can still mention /login (to switch accounts).
  if (/usage limit|limit reached|rate limit/i.test(text))
    return { reason: 'down', hint: 'Claude Code says the plan’s usage limit is reached.' }
  if (
    /\blog(?:ged)? ?in\b|\bsign(?:ed)? ?in\b|api key|authenticat|credential|unauthori[sz]ed|oauth/i.test(
      text,
    )
  )
    return {
      reason: 'not_configured',
      hint: `Claude Code isn’t signed in: run \`${command}\` in a terminal and sign in.`,
    }
  return { reason: 'down', hint: `Claude Code failed: ${firstLine(text) || 'no message'}` }
}

/** The reply in a result: the validated structured output, or JSON in the text (an older Claude
 *  Code that skipped the schema). Null when there's neither. */
export function replyFrom(result: CliResult): unknown {
  if (result.structured_output !== undefined && result.structured_output !== null)
    return result.structured_output
  const text = result.result ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

/** The JSON result line, if the run printed one. */
export function resultFrom(stdout: string): CliResult | null {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .at(-1)
  if (!line) return null
  try {
    return JSON.parse(line) as CliResult
  } catch {
    return null
  }
}

function firstLine(s: string): string {
  return s.trim().split('\n')[0]?.slice(0, 200) ?? ''
}

type Run = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  missing: boolean
  cancelled: boolean
}

function run(
  command: string[],
  args: string[],
  input: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Run> {
  return new Promise((resolve) => {
    const [bin = 'claude', ...before] = command
    const out: Run = {
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: false,
      cancelled: false,
    }
    // The browser already gave up: don't start Claude Code at all.
    if (signal?.aborted) {
      out.cancelled = true
      resolve(out)
      return
    }
    let settled = false
    const child = spawn(bin, [...before, ...args], { cwd: tmpdir() })
    const timer = setTimeout(() => {
      out.timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)
    // Dan chose "Fill it in by hand" while it drafted: stop, so the plan isn't spent for nothing.
    const cancel = () => {
      out.cancelled = true
      child.kill('SIGTERM')
    }
    signal?.addEventListener('abort', cancel, { once: true })
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      resolve(out)
    }
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out.stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (out.stderr += d))
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') out.missing = true
      done()
    })
    child.on('close', (code) => {
      out.code = code
      done()
    })
    // The note goes in on stdin, so it never shows in the process list.
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

/** A drafter for api/notes.ts that asks Claude Code. `command` is for tests (a stand-in CLI);
 *  otherwise it's found by `claudeCommand`. */
export function claudeCodeDrafter(
  options: { command?: string[]; timeoutMs?: number } = {},
): Drafter {
  return async (req, env, signal) => {
    const command = options.command ?? [claudeCommand()]
    const typed = shownCommand(command.join(' '))
    const model = env.NOD_MODEL?.trim() || DEFAULT_MODEL
    const out = await run(
      command,
      claudeCodeArgs(env),
      renderUserMessage(req.job, req.transcript),
      options.timeoutMs ?? CLAUDE_CODE_TIMEOUT_MS,
      signal,
    )
    if (out.cancelled) {
      console.warn('[notes] Claude Code stopped: the browser gave up on this draft.')
      throw new Unavailable('down')
    }
    if (out.missing) {
      console.warn('[notes] Claude Code isn’t installed here: see https://code.claude.com')
      throw new Unavailable('not_configured')
    }
    if (out.timedOut) {
      console.warn('[notes] Claude Code took too long to answer.')
      throw new Unavailable('down')
    }
    const result = resultFrom(out.stdout)
    if (out.code !== 0 || !result || result.is_error) {
      const failure = failureOf(`${result?.result ?? ''}\n${out.stderr}`, typed)
      console.warn(`[notes] ${failure.hint}`)
      throw new Unavailable(failure.reason)
    }
    const reply = RecordChanges.safeParse(replyFrom(result))
    if (!reply.success) {
      console.warn(
        `[notes] Claude Code gave no record_changes reply. \`${typed} update\` may help: --json-schema works fully from 2.1.205.`,
      )
      throw new Unavailable('unreadable')
    }
    const u = result.usage
    return {
      reply: reply.data,
      model: `${model} via Claude Code`,
      ...(u
        ? {
            usage: {
              input_tokens: u.input_tokens ?? 0,
              output_tokens: u.output_tokens ?? 0,
              cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
              cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
            },
          }
        : {}),
    }
  }
}
