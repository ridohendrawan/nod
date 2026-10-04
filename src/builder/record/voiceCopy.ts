// What the voice area says in each state (ux-spec 3; research/speech.md 2.13). Calm and
// specific: what happened, then what to do. The note sits above the mic on this screen, so the
// helpers point to "your note" rather than "below".
import type { SpeechState } from './speech.ts'

export type VoiceContext = {
  ios: boolean
  /** The microphone permission hasn't been granted yet. */
  firstUse: boolean
  offline: boolean
  inApp: boolean
  /** "No speech" twice in a row. */
  noSpeechAgain: boolean
}

export type VoiceLines = { main: string; helper: string | null }

export function voiceLines(state: SpeechState, ctx: VoiceContext): VoiceLines {
  switch (state.status) {
    case 'unsupported':
      if (state.why === 'ios-home-screen')
        return {
          main: 'Voice doesn’t work from the Home Screen app.',
          helper: 'Open Nod in Safari to talk, or type the change in your note.',
        }
      if (state.why === 'insecure')
        return {
          main: 'Voice needs a secure link.',
          helper: 'Open the https address, or type the change in your note.',
        }
      return {
        main: 'Voice isn’t available in this browser.',
        helper: 'Type the change in your note. Voice works in Chrome and Safari.',
      }
    case 'requesting':
      return { main: 'Getting the mic ready', helper: null }
    case 'listening':
      return { main: 'Listening', helper: 'Tap Stop when you’re done.' }
    case 'stopping':
      return { main: 'Finishing up', helper: null }
    case 'idle':
      if (state.note === 'quiet')
        return {
          main: 'Stopped after a quiet spell.',
          helper: 'Check your note, or tap the mic to keep going.',
        }
      if (state.note === 'max-length')
        return {
          main: 'Stopped at 3 minutes.',
          helper: 'Check your note. Tap the mic to add more.',
        }
      if (state.note === 'interrupted')
        return { main: 'Voice stopped.', helper: 'Your words are kept. Tap the mic to carry on.' }
      return {
        main: 'Tap to talk',
        helper: ctx.firstUse
          ? `First time? Your phone will ask to use the microphone${ctx.ios ? ' and speech recognition' : ''}. Tap Allow.`
          : 'Say what changed, and the price if you agreed one.',
      }
    case 'error':
      switch (state.reason) {
        case 'not-allowed':
          return {
            main: 'Nod can’t use the microphone.',
            helper:
              'Type the change in your note, or allow the microphone in your browser settings.',
          }
        case 'busy':
          return {
            main: 'The microphone is busy.',
            helper: 'Close other apps using it, then tap to try again. Or type your note.',
          }
        case 'service-not-allowed':
          return ctx.inApp || !ctx.ios
            ? {
                main: 'Voice works best in Safari or Chrome.',
                helper: 'Open this page in your browser, or type the change in your note.',
              }
            : {
                main: 'Voice needs Dictation turned on.',
                helper:
                  'Settings, General, Keyboard, Enable Dictation. Or type the change in your note.',
              }
        case 'no-speech':
          return {
            main: 'Didn’t catch anything.',
            helper: ctx.noSpeechAgain
              ? 'Noisy? Typing works too.'
              : 'Tap the mic to try again, or type it in your note.',
          }
        case 'audio-capture':
          return {
            main: 'Nod couldn’t hear the microphone.',
            helper: 'Check nothing else is using it, then tap to try again.',
          }
        case 'network':
          return ctx.offline
            ? {
                main: 'You’re offline.',
                helper: 'Type the change in your note. It’s saved on this phone.',
              }
            : {
                main: 'Voice can’t connect right now.',
                helper: 'Type the change in your note, or try again in a minute.',
              }
        default:
          return { main: 'Voice isn’t working here.', helper: 'Type the change in your note.' }
      }
  }
}
