import { createContext, useContext } from 'react'

export type ToastAction = { label: string; onClick: () => void }

/** How a toast went away: its action was pressed, it timed out, or Dan closed it. */
export type ToastEnd = 'action' | 'timeout' | 'closed'

export type ShowOptions = {
  action?: ToastAction
  /** Also send the text to the announcer (default true). */
  announce?: boolean
  /** How long it stays, in ms (default about 8 s). Undo toasts use 5 s (D72). */
  duration?: number
  /** Called once when the toast goes, whichever way. "Draft deleted." deletes on anything but
   *  its Undo, so a finger resting on the toast keeps the draft safe. */
  onEnd?: (how: ToastEnd) => void
}

export const ToastContext = createContext<{
  show: (text: string, options?: ShowOptions) => void
} | null>(null)

/** Show a toast (and announce it once). Needs a ToastProvider above. */
export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts needs a ToastProvider')
  return ctx
}
