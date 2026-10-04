import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { builder } from '../shared/copy.ts'
import type { AiUnavailableReason } from '../shared/types.ts'

/**
 * Sarah's page is its own HTML file (D86). In dev and preview, `/o/<token>` serves `o.html`,
 * the same rewrite `vercel.json` does in production. The address bar keeps `/o/<token>`.
 */
export function ownerPageRewrite(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url && /^\/o\/[^/?#]+/.test(req.url)) req.url = '/o.html'
    next()
  }
  return {
    name: 'nod:owner-page-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

/**
 * Vite doesn't preload fonts referenced from CSS, so this adds one preload for the hashed
 * Inter file to each built HTML page (research/stack.md 2.12).
 */
export function preloadFont(match: RegExp): Plugin {
  return {
    name: 'nod:preload-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => match.test(f))
        if (!file) return []
        return [
          {
            tag: 'link',
            injectTo: 'head',
            attrs: {
              rel: 'preload',
              href: `/${file}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
          },
        ]
      },
    },
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function toHeaders(headers: IncomingHttpHeaders): Headers {
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) out.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return out
}

type NotesModule = typeof import('../api/notes.ts')
type ClaudeCodeModule = typeof import('./claude-code.ts')

/**
 * The /api/notes middleware for the dev and preview servers. Two test hooks, never in production:
 * `x-nod-delay: <ms>` waits before answering (for the 10 s "Fill it in by hand" exit, D66), and
 * `x-nod-force: <reason>` answers 503 ai_unavailable with that reason (for the failure screens).
 */
function notesMiddleware(
  load: () => Promise<NotesModule>,
  env: Record<string, string | undefined>,
  loadClaudeCode: () => Promise<ClaudeCodeModule>,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    void (async () => {
      const delay = Number(req.headers['x-nod-delay'] ?? 0)
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 60_000)))
      const force = String(req.headers['x-nod-force'] ?? '')
      if (Object.hasOwn(builder.aiUnavailable, force)) {
        const reason = force as AiUnavailableReason
        await readBody(req)
        res.statusCode = 503
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error: 'ai_unavailable',
            message: builder.aiUnavailable[reason],
            reason,
          }),
        )
        return
      }
      const mod = await load()
      const body = await readBody(req)
      // If the browser gives up (Dan chose "Fill it in by hand"), the handler's signal aborts.
      const gone = new AbortController()
      res.on('close', () => {
        if (!res.writableFinished) gone.abort()
      })
      const request = new Request(`http://localhost${req.originalUrl ?? '/api/notes'}`, {
        method: req.method,
        headers: toHeaders(req.headers),
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        signal: gone.signal,
      })
      // NOD_AI_MODE=claude-code: drafted by Claude Code on this machine (D96), never on Vercel.
      const drafter =
        env.NOD_AI_MODE === 'claude-code' ? (await loadClaudeCode()).claudeCodeDrafter() : undefined
      const response = await mod.handleNotes(request, env, drafter)
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    })().catch(next)
  }
}

/** Say once, at start, where the AI step's drafts come from in Claude Code mode. */
function announce(
  logger: { info: (msg: string) => void },
  env: Record<string, string | undefined>,
) {
  if (env.NOD_AI_MODE !== 'claude-code') return
  logger.info(
    '  Nod: notes are drafted live by Claude Code on this machine, on your own Claude plan (D96). All its tools are off.',
  )
}

/**
 * POST /api/notes on the dev and preview servers: the same handler Vercel runs (api/notes.ts).
 * Dev loads it through Vite (so edits apply at once); preview imports it with Node 24's own
 * TypeScript support. The caller passes the environment; vite.config.ts defaults it to fixture
 * mode, so development and e2e never call Claude by accident. With NOD_AI_MODE=claude-code
 * (`pnpm demo:claude`), notes are drafted by Claude Code on this machine (D96). Its module loads
 * the same way as the handler's, so the two share one copy of api/notes.ts.
 */
export function notesApiDev(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'nod:notes-api-dev',
    configureServer(server) {
      const load = () => server.ssrLoadModule('/api/notes.ts') as Promise<NotesModule>
      const loadClaudeCode = () =>
        server.ssrLoadModule('/scripts/claude-code.ts') as Promise<ClaudeCodeModule>
      server.middlewares.use('/api/notes', notesMiddleware(load, env, loadClaudeCode))
      announce(server.config.logger, env)
    },
    configurePreviewServer(server) {
      const at = (path: string) => pathToFileURL(resolve(server.config.root, path)).href
      const load = () => import(/* @vite-ignore */ at('api/notes.ts')) as Promise<NotesModule>
      const loadClaudeCode = () =>
        import(/* @vite-ignore */ at('scripts/claude-code.ts')) as Promise<ClaudeCodeModule>
      server.middlewares.use('/api/notes', notesMiddleware(load, env, loadClaudeCode))
      announce(server.config.logger, env)
    },
  }
}
