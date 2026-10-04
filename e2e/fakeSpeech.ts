// A fake SpeechRecognition for Playwright (research/speech.md 2.14): installed with
// page.addInitScript before the app loads, so the real voice code runs unchanged against it.
// It says `text` word by word, or fails with `error`, and can act out what real engines do: end
// by itself after a sentence (Android), ignore Stop, never get the mic, or keep talking. Real
// recognition needs Google's servers and a microphone, so tests never use it.

export type FakeSpeechOptions = {
  /** Said word by word after each start(). */
  text?: string
  /** One per start(), in turn: each restart makes a new recogniser. Later starts hear nothing. */
  takes?: string[]
  /** Fail with this error code soon after start(). */
  error?: string
  wordMs?: number
  /** After its last word the engine ends by itself, as Android's does after each sentence. */
  endAfterWords?: boolean
  /** stop() never sends `end`, as engines sometimes don't. */
  ignoreStop?: boolean
  /** The mic never opens: no audio, no words (a permission prompt left waiting). */
  noAudio?: boolean
  /** Keep saying a word every `wordMs` until stopped (the 3-minute cap). */
  chatter?: boolean
}

export function fakeSpeech(opts: FakeSpeechOptions) {
  // How many times a recogniser started, for tests of the quiet restarts.
  const seen = { starts: 0 }
  Object.assign(window, { __fakeSpeech: seen })
  let take = 0

  class FakeRecognition extends EventTarget {
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 1
    onaudiostart: ((e: Event) => void) | null = null
    onspeechstart: ((e: Event) => void) | null = null
    onresult: ((e: Event) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    onend: ((e: Event) => void) | null = null
    private timers: number[] = []
    private said: string[] = []
    private done = false

    private fire(type: string, extra: object = {}) {
      const e = Object.assign(new Event(type), extra)
      const handler = (this as unknown as Record<string, ((e: Event) => void) | null>)[`on${type}`]
      handler?.(e)
      this.dispatchEvent(e)
    }

    private result(isFinal: boolean) {
      const alt = { transcript: this.said.join(' '), confidence: 0.9 }
      const res = Object.assign([alt], { isFinal })
      this.fire('result', { resultIndex: 0, results: [res] })
    }

    start() {
      seen.starts += 1
      const text = opts.takes ? (opts.takes[take++] ?? '') : (opts.text ?? '')
      const wordMs = opts.wordMs ?? 60
      const at = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, ms))
      if (opts.error) {
        at(200, () => {
          this.fire('error', { error: opts.error, message: '' })
          this.end()
        })
        return
      }
      if (opts.noAudio) return
      at(50, () => this.fire('audiostart'))
      at(150, () => this.fire('speechstart'))
      if (opts.chatter) {
        this.timers.push(
          window.setInterval(() => {
            this.said.push('and')
            this.result(false)
          }, wordMs),
        )
        return
      }
      const words = text.split(' ').filter(Boolean)
      words.forEach((w, i) =>
        at(250 + i * wordMs, () => {
          this.said.push(w)
          this.result(i === words.length - 1)
          if (opts.endAfterWords && i === words.length - 1) at(50, () => this.end())
        }),
      )
    }

    stop() {
      if (this.said.length) this.result(true)
      if (!opts.ignoreStop) this.end()
    }

    abort() {
      this.fire('error', { error: 'aborted', message: '' })
      this.end()
    }

    private end() {
      if (this.done) return
      this.done = true
      this.timers.forEach(clearTimeout) // clears intervals too
      this.fire('end')
    }
  }
  Object.assign(window, {
    SpeechRecognition: FakeRecognition,
    webkitSpeechRecognition: FakeRecognition,
  })
}
