// A stand-in for `claude -p` in tests/claude-code.test.ts. It never calls a model: it reads the
// note from stdin, records how it was called (FAKE_CLAUDE_LOG), and answers the way FAKE_CLAUDE
// says, in the shape `claude -p --output-format json` prints.
import { writeFileSync } from 'node:fs'

const mode = process.env.FAKE_CLAUDE ?? 'structured'
const reply = process.env.FAKE_CLAUDE_REPLY ? JSON.parse(process.env.FAKE_CLAUDE_REPLY) : null
const print = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (input += d))
process.stdin.on('end', () => {
  if (process.env.FAKE_CLAUDE_LOG) {
    const log = { args: process.argv.slice(2), cwd: process.cwd(), input }
    writeFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(log))
  }
  switch (mode) {
    case 'structured':
      print({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        structured_output: reply,
        usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 900 },
      })
      break
    case 'text':
      print({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: `Here it is:\n${JSON.stringify(reply)}`,
      })
      break
    case 'prose':
      print({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'It sounds like a power point.',
      })
      break
    case 'login':
      print({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Invalid API key. Please run /login',
      })
      process.exitCode = 1
      break
    case 'limit':
      print({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Claude usage limit reached',
      })
      process.exitCode = 1
      break
    case 'nested':
      process.stderr.write(
        'Error: Claude Code cannot be launched inside another Claude Code session.\n',
      )
      process.exitCode = 1
      break
    case 'hang':
      setInterval(() => {}, 1000)
      break
    default:
      process.stdout.write('not json\n')
  }
})
