// The Record screen's voice (D49): tap to talk, tap to stop. Final words go to `onText`; the
// words still forming come back as `interim`, for a lighter line under the note. Nothing is
// announced while the mic is open (a screen reader's voice could end up in the note); a take's
// end is announced once.
import { useEffect, useRef, useState } from 'react'
import { announce } from '../../lib/announce.ts'
import {
  SpeechController,
  detectSpeech,
  inAppBrowser,
  micPermission,
  type SpeechState,
  type Support,
} from './speech.ts'
import { voiceLines } from './voiceCopy.ts'

export function useSpeech(onText: (chunk: string) => void) {
  const [support] = useState<Support>(detectSpeech)
  const [state, setState] = useState<SpeechState>(() =>
    support.ok ? { status: 'idle' } : { status: 'unsupported', why: support.why },
  )
  const [interim, setInterim] = useState('')
  const [permission, setPermission] = useState<PermissionState | 'unknown'>('unknown')
  const [noSpeechRun, setNoSpeechRun] = useState(0)
  const controller = useRef<SpeechController | null>(null)
  const textRef = useRef(onText)
  useEffect(() => {
    textRef.current = onText
  })

  useEffect(() => {
    if (!support.ok) return
    let gone = false
    const checkPermission = () =>
      void micPermission().then((p) => {
        if (!gone) setPermission(p)
      })
    checkPermission()
    let misses = 0
    const c = new SpeechController(support, {
      onState: setState,
      onInterim: setInterim,
      onText: (chunk) => textRef.current(chunk),
      onFinished: (next, added) => {
        misses = next.status === 'error' && next.reason === 'no-speech' ? misses + 1 : 0
        setNoSpeechRun(misses)
        checkPermission()
        if (next.status === 'error') {
          const lines = voiceLines(next, {
            ios: support.ios,
            firstUse: false,
            offline: !navigator.onLine,
            inApp: inAppBrowser(),
            noSpeechAgain: misses >= 2,
          })
          announce(`${lines.main} ${lines.helper ?? ''}`.trim())
        } else {
          announce(added ? 'Recording stopped. Words added to your note.' : 'Recording stopped.')
        }
      },
    })
    controller.current = c
    // Leaving the app stops the mic and keeps the words (WebKit would cut it off anyway).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') c.stop('interrupted')
    }
    const onPageHide = () => c.stop('interrupted')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      c.cancel()
      controller.current = null
    }
  }, [support])

  return {
    support,
    state,
    interim,
    /** Not granted yet: show the first-use hint. Denied: say so before the first tap. */
    permission,
    noSpeechAgain: noSpeechRun >= 2,
    toggle: () => controller.current?.toggle(),
    stop: () => controller.current?.stop(),
  }
}
