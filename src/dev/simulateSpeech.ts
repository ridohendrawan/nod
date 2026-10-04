// Development only (research/speech.md 2.14): /?simulate=golden (the golden path's note) or any
// sample note's id, like ?simulate=two_changes, stands in for the microphone, saying that note
// word by word through the real voice code. Useful where there's no microphone, like the browser
// pane. Never in a production build, so the live demo's voice is always real.
import { SAMPLE_NOTES, sampleNote, type SampleNoteId } from '../../shared/ai/samples.ts'

export function installSimulatedSpeech(): void {
  const asked = new URLSearchParams(location.search).get('simulate')
  const id = asked === 'golden' ? 'one_change' : asked
  if (!SAMPLE_NOTES.some((n) => n.id === id)) return
  // The demo's main job is Sarah's kitchen.
  const text = sampleNote(id as SampleNoteId, 'Sarah')

  class SimulatedRecognition extends EventTarget {
    lang = ''
    continuous = false
    interimResults = false
    maxAlternatives = 1
    onaudiostart: ((e: Event) => void) | null = null
    onspeechstart: ((e: Event) => void) | null = null
    onresult: ((e: Event) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    onend: ((e: Event) => void) | null = null
    private timers: ReturnType<typeof setTimeout>[] = []
    private said: string[] = []
    private done = false

    private fire(type: string, extra: object = {}) {
      const e = Object.assign(new Event(type), extra)
      const handler = (this as unknown as Record<string, ((e: Event) => void) | null>)[`on${type}`]
      handler?.(e)
      this.dispatchEvent(e)
    }

    private result(isFinal: boolean) {
      const alternative = { transcript: this.said.join(' '), confidence: 0.9 }
      this.fire('result', { resultIndex: 0, results: [Object.assign([alternative], { isFinal })] })
    }

    start() {
      const at = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms))
      at(80, () => this.fire('audiostart'))
      at(240, () => this.fire('speechstart'))
      const words = text.split(' ')
      words.forEach((word, i) =>
        at(400 + i * 220, () => {
          this.said.push(word)
          this.result(i === words.length - 1)
        }),
      )
    }

    stop() {
      if (this.said.length) this.result(true)
      this.end()
    }

    abort() {
      this.fire('error', { error: 'aborted', message: '' })
      this.end()
    }

    private end() {
      if (this.done) return
      this.done = true
      this.timers.forEach(clearTimeout)
      this.fire('end')
    }
  }

  Object.assign(window, {
    SpeechRecognition: SimulatedRecognition,
    webkitSpeechRecognition: SimulatedRecognition,
  })

  // The simulated microphone is always allowed, whatever this browser says about the real one
  // (the browser pane blocks it, and Record would say "Nod can't use the microphone").
  const permissions = navigator.permissions as Permissions | undefined
  if (!permissions) return
  const query = permissions.query.bind(permissions)
  const allowed = {
    name: 'microphone',
    state: 'granted',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as PermissionStatus
  Object.defineProperty(permissions, 'query', {
    configurable: true,
    value: (descriptor: PermissionDescriptor) =>
      descriptor.name === ('microphone' as PermissionName)
        ? Promise.resolve(allowed)
        : query(descriptor),
  })
}
