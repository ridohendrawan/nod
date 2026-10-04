// D46: the browser never loads zod or the Anthropic SDK (nor any test tool). Zod 4 probes `Function` as it builds a
// schema, which the strict CSP blocks (a red console error on every page), and both only add
// weight. This walks every runtime import from the two HTML entries. `import type` is erased, but
// `import { type X }` still loads its module (verbatimModuleSyntax), so it counts.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const ENTRIES = ['src/app/main.tsx', 'src/owner/main.tsx']
/** Server and test packages: none of them belongs in a page. */
const FORBIDDEN = [
  'zod',
  '@anthropic-ai/sdk',
  '@axe-core/playwright',
  'axe-core',
  '@playwright/test',
  'playwright',
  'vitest',
]
const CODE = /\.(ts|tsx|js|mjs)$/

/** Comments out, so a commented-out import doesn't count (`://` in URLs survives). */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Every module a file loads at runtime. */
function runtimeSpecifiers(text: string): string[] {
  const code = stripComments(text)
  const found: string[] = []
  // import x from 'p', import { a, type b } from 'p', export { a } from 'p', export * from 'p'
  for (const m of code.matchAll(
    /^\s*(?:import|export)\s+(?!type\s)[^;='"`]*?\s*from\s*['"]([^'"]+)['"]/gm,
  ))
    found.push(m[1]!)
  // import 'p' (for its side effects, like a stylesheet)
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.push(m[1]!)
  // import('p')
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1]!)
  return found
}

/** A local import's file: as written, or with the extensions Vite would try. */
function resolveLocal(from: string, spec: string): string | null {
  const target = (spec.startsWith('/') ? join(root, spec) : resolve(dirname(from), spec)).split(
    '?',
  )[0]!
  if (CODE.test(target)) return target
  if (/\.[a-z0-9]+$/i.test(target)) return null // a stylesheet, an image, a font
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (existsSync(target + ext)) return target + ext
  }
  return target
}

const packageOf = (spec: string) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!

type Graph = { files: number; packages: Map<string, string> }
let walked: Graph | null = null

/** The browser's runtime import graph: how many files, and for each package the import chain
 *  that first reaches it ("src/app/main.tsx > ... > zod"). */
function walk(): Graph {
  if (walked) return walked
  const parent = new Map<string, string | null>()
  const packages = new Map<string, string>()
  const chain = (file: string): string[] => {
    const up = parent.get(file)
    return [...(up ? chain(up) : []), relative(root, file)]
  }
  const queue: string[] = []
  for (const e of ENTRIES) {
    parent.set(join(root, e), null)
    queue.push(join(root, e))
  }
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const spec of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        const target = resolveLocal(file, spec)
        if (target === null || parent.has(target)) continue
        if (!existsSync(target))
          throw new Error(`${relative(root, file)} imports a missing ${spec}`)
        parent.set(target, file)
        queue.push(target)
      } else if (!packages.has(packageOf(spec))) {
        packages.set(packageOf(spec), [...chain(file), packageOf(spec)].join(' > '))
      }
    }
  }
  walked = { files: parent.size, packages }
  return walked
}

describe('the browser bundle (D46)', () => {
  it('reaches the screens, the data layer and the shared code from both entries', () => {
    const { files, packages } = walk()
    expect(files).toBeGreaterThan(30)
    expect(packages.has('react')).toBe(true)
  })

  for (const name of FORBIDDEN) {
    it(`never loads ${name}`, () => {
      expect(walk().packages.get(name) ?? null).toBeNull()
    })
  }

  it('the walk itself would catch a runtime import (checked on the old service.ts line)', () => {
    expect(
      runtimeSpecifiers(
        "import { MAX_NOTE_CHARS, type NotesRequest } from '../../shared/ai/schema.ts'",
      ),
    ).toEqual(['../../shared/ai/schema.ts'])
    expect(
      runtimeSpecifiers("import type { NotesRequest } from '../../shared/ai/schema.ts'"),
    ).toEqual([])
  })
})
