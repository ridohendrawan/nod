// Voice for the Record screen (D2, D49, D53; research/speech.md 2.5 and 2.13): tap to start, tap
// to stop, with quiet restarts when the engine cuts off by itself, a stop after 10 seconds of
// quiet and at 3 minutes, and a screen that stays awake while listening. Plain TypeScript, so a
// take's timers and late events live outside React; useSpeech wraps it.
import { createAssembler, type Assembler, type SREvent } from './speechText.ts'

interface SRErrorEvent extends Event {
  readonly error: string
}

interface SR extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onaudiostart: ((e: Event) => void) | null
  onspeechstart: ((e: Event) => void) | null
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: ((e: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRCtor = new () => SR

export type Unsupported = 'no-api' | 'insecure' | 'ios-home-screen'
export type Support =
  | { ok: true; Ctor: SRCtor; android: boolean; ios: boolean }
  | { ok: false; why: Unsupported; ios: boolean }

export function detectSpeech(): Support {
  const ua = navigator.userAgent
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (!window.isSecureContext) return { ok: false, why: 'insecure', ios }
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return { ok: false, why: 'no-api', ios }
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  // WebKit has never enabled recognition in Home Screen apps (bug 225298).
  if (ios && standalone) return { ok: false, why: 'ios-home-screen', ios }
  return { ok: true, Ctor, android: /Android/i.test(ua), ios }
}

/** The microphone permission, where the browser will say (not Android WebView). */
export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state
  } catch {
    return 'unknown'
  }
}

/** A recogniser in a Facebook, Instagram or similar in-app browser: voice rarely works there. */
export const inAppBrowser = () =>
  /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Twitter|MicroMessenger|GSA\//i.test(navigator.userAgent)

export type SpeechReason =
  | 'not-allowed'
  | 'busy'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'language-not-supported'
  | 'unknown'

export type StopNote = 'quiet' | 'max-length' | 'interrupted'

export type SpeechState =
  | { status: 'unsupported'; why: Unsupported }
  | { status: 'idle'; note?: StopNote }
  | { status: 'requesting' }
  | { status: 'listening'; hearing: boolean }
  | { status: 'stopping' }
  | { status: 'error'; reason: SpeechReason }

export type SpeechEvents = {
  onState: (state: SpeechState) => void
  onInterim: (text: string) => void
  /** A finished chunk of words, to add to the end of the note. */
  onText: (chunk: string) => void
  /** The take is over: how it ended, and whether any words went into the note. */
  onFinished: (state: SpeechState, addedWords: boolean) => void
}

const PASS_THROUGH: readonly string[] = [
  'service-not-allowed',
  'audio-capture',
  'network',
  'language-not-supported',
]

export const MAX_TAKE_MS = 180_000
export const QUIET_MS = 10_000 // D49
const NOTHING_HEARD_MS = 10_000
const STOP_WATCHDOG_MS = 2_500

type Take = {
  wantOn: boolean
  startedAt: number
  lastResultAt: number
  restarts: number
  perm: PermissionState | 'unknown'
  note?: StopNote
  rec: SR | null
  asm: Assembler
  quiet?: ReturnType<typeof setTimeout>
  timers: ReturnType<typeof setTimeout>[]
  added: boolean
  wake: WakeLockSentinel | null
}

export class SpeechController {
  private take: Take | null = null
  private readonly support: Support
  private readonly events: SpeechEvents

  constructor(support: Support, events: SpeechEvents) {
    this.support = support
    this.events = events
  }

  get active(): boolean {
    return this.take !== null
  }

  toggle(): void {
    if (this.take) this.stop()
    else this.start()
  }

  /** Call inside the tap: permission prompts behave best that way. */
  start(): void {
    const support = this.support
    if (!support.ok || this.take) return
    const t: Take = {
      wantOn: true,
      startedAt: Date.now(),
      lastResultAt: 0,
      restarts: 0,
      perm: 'unknown',
      rec: null,
      asm: createAssembler(),
      timers: [],
      added: false,
      wake: null,
    }
    this.take = t
    this.events.onState({ status: 'requesting' })
    t.timers.push(
      setTimeout(() => {
        if (this.take === t) this.stop('max-length')
      }, MAX_TAKE_MS),
    )
    this.open(t)
    void micPermission().then((p) => {
      t.perm = p
    })
    // Keep the screen awake while Dan talks (D53). Not everywhere, and never essential.
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (this.take === t) t.wake = lock
        else void lock.release()
      })
      .catch(() => undefined)
  }

  /** Stop and keep the words: Chrome sends the last final result, then `end`. */
  stop(note?: StopNote): void {
    const t = this.take
    if (!t || !t.wantOn) return
    t.wantOn = false
    t.note ??= note
    this.events.onState({ status: 'stopping' })
    try {
      t.rec?.stop()
    } catch {
      // Already ended.
    }
    t.timers.push(
      setTimeout(() => {
        if (this.take === t) this.finish({ status: 'idle', note: t.note })
      }, STOP_WATCHDOG_MS),
    )
  }

  /** Leaving the screen: release the mic and drop words that never became final. */
  cancel(): void {
    const t = this.take
    if (!t) return
    this.take = null
    this.cleanUp(t)
  }

  private cleanUp(t: Take) {
    t.timers.forEach(clearTimeout)
    clearTimeout(t.quiet)
    if (t.rec) {
      t.rec.onresult = null
      t.rec.onerror = null
      t.rec.onend = null
      t.rec.onaudiostart = null
      t.rec.onspeechstart = null
      try {
        t.rec.abort() // harmless if it already ended; releases the mic after an error
      } catch {
        // Nothing to release.
      }
    }
    void t.wake?.release().catch(() => undefined)
  }

  private emit(t: Take, chunks: string[]) {
    for (const chunk of chunks) {
      t.added = true
      this.events.onText(chunk)
    }
  }

  private finish(next: SpeechState, keepWords = true) {
    const t = this.take
    if (!t) return
    this.take = null // late events from this take are ignored from here on
    if (keepWords) this.emit(t, t.asm.flush())
    this.cleanUp(t)
    this.events.onInterim('')
    this.events.onState(next)
    this.events.onFinished(next, t.added)
  }

  private open(t: Take) {
    const support = this.support
    if (!support.ok) return
    const rec = new support.Ctor()
    rec.lang = 'en-AU'
    // Android turns every partial into a "final" in continuous mode, duplicating words.
    rec.continuous = !support.android
    rec.interimResults = true
    rec.maxAlternatives = 1
    t.rec = rec
    t.asm = createAssembler()
    const live = () => this.take === t && t.rec === rec
    const armQuiet = () => {
      clearTimeout(t.quiet)
      t.quiet = setTimeout(() => {
        if (live()) this.stop('quiet')
      }, QUIET_MS)
    }

    rec.onaudiostart = () => {
      if (!live() || !t.wantOn) return
      this.events.onState({ status: 'listening', hearing: false })
      if (!t.lastResultAt) {
        // Safari never sends 'no-speech'.
        t.timers.push(
          setTimeout(() => {
            if (live() && !t.lastResultAt) this.finish({ status: 'error', reason: 'no-speech' })
          }, NOTHING_HEARD_MS),
        )
      }
    }
    rec.onspeechstart = () => {
      if (live() && t.wantOn) this.events.onState({ status: 'listening', hearing: true })
    }
    rec.onresult = (e) => {
      if (!live()) return
      t.lastResultAt = Date.now()
      const { commit, interim } = t.asm.onResult(e, t.lastResultAt)
      this.emit(t, commit)
      this.events.onInterim(interim)
      if (t.wantOn) armQuiet()
    }
    rec.onerror = (e) => {
      if (!live()) return
      switch (e.error) {
        case 'aborted': // ours, another tab took the mic, or the page was suspended; `end` follows
          if (t.wantOn) {
            t.wantOn = false
            t.note = 'interrupted'
          }
          return
        case 'no-speech':
          if (t.lastResultAt) {
            // Spoke earlier: end gently.
            t.wantOn = false
            t.note ??= 'quiet'
            return
          }
          return this.finish({ status: 'error', reason: 'no-speech' })
        case 'not-allowed': // Android also says this when the recogniser is busy
          return this.finish({
            status: 'error',
            reason: t.perm === 'granted' ? 'busy' : 'not-allowed',
          })
        default: // final: Chrome sends no `end` after language-not-supported
          return this.finish({
            status: 'error',
            reason: PASS_THROUGH.includes(e.error) ? (e.error as SpeechReason) : 'unknown',
          })
      }
    }
    rec.onend = () => {
      if (!live()) return
      const now = Date.now()
      const spokeRecently = t.lastResultAt > 0 && now - t.lastResultAt < 5_000
      if (t.wantOn && spokeRecently && now - t.startedAt < MAX_TAKE_MS && t.restarts < 30) {
        // The engine cut off by itself (Android after each sentence, iPhone at random).
        this.emit(t, t.asm.flush())
        this.events.onInterim('')
        t.restarts += 1
        t.timers.push(
          setTimeout(() => {
            if (this.take === t && t.wantOn) this.open(t)
          }, 250),
        )
        return
      }
      if (t.wantOn && !t.lastResultAt) return this.finish({ status: 'error', reason: 'no-speech' })
      this.finish({ status: 'idle', note: t.note ?? (t.wantOn ? 'quiet' : undefined) })
    }
    try {
      rec.start()
    } catch {
      this.finish({ status: 'error', reason: 'unknown' }) // InvalidStateError
    }
  }
}
