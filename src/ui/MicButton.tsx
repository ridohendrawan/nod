// The 96 px mic (D49, D53): tap to talk, tap to stop. Its name changes with its job ("Tap to
// talk" / "Tap to stop"), so no aria-pressed (APG). Pass the id of the visible label under it, so
// the name is exactly the words on screen (WCAG 2.5.3). While speech is heard, a slow amber
// ring; never a sound meter, and nothing is announced while the mic is open (a screen reader's
// voice could end up in the note).
import { Mic } from 'lucide-react'
import { cx } from './cx.ts'

export function MicButton({
  listening,
  hearing,
  onPress,
  labelledBy,
}: {
  listening: boolean
  /** Speech is coming in right now: the ring pulses. */
  hearing?: boolean
  onPress: () => void
  /** The visible label's id. Without one, the button names itself. */
  labelledBy?: string
}) {
  return (
    <button
      type="button"
      className={cx(
        'mic-button',
        listening && 'is-listening',
        listening && hearing && 'is-hearing',
      )}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : listening ? 'Tap to stop' : 'Tap to talk'}
      onClick={onPress}
    >
      {listening ? (
        <span className="mic-stop" aria-hidden="true" />
      ) : (
        <Mic size={40} strokeWidth={2.25} aria-hidden="true" />
      )}
    </button>
  )
}
