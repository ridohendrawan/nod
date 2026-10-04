// Toasts are visual only (D79): the same words go to the one announcer once, and the card and
// timeline stay the record, so a toast can fade. Top of the screen, about 8 s, paused while
// touched, hovered or focused, with a 48 px close button.
import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { announce } from '../lib/announce.ts'
import { ToastContext, type ShowOptions, type ToastAction, type ToastEnd } from './toastContext.ts'

type Toast = {
  id: number
  text: string
  action?: ToastAction
  duration: number
  onEnd?: (how: ToastEnd) => void
}

const TOAST_MS = 8000
const MAX_SHOWN = 3
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // Every toast ends exactly once, even one pushed out by newer toasts.
  const ended = useRef(new Set<number>())

  const end = useCallback((toast: Toast, how: ToastEnd) => {
    if (ended.current.has(toast.id)) return
    ended.current.add(toast.id)
    setToasts((list) => list.filter((t) => t.id !== toast.id))
    toast.onEnd?.(how)
  }, [])

  const show = useCallback(
    (text: string, options: ShowOptions = {}) => {
      if (options.announce !== false) announce(text)
      const toast: Toast = {
        id: nextId++,
        text,
        action: options.action,
        duration: options.duration ?? TOAST_MS,
        onEnd: options.onEnd,
      }
      setToasts((list) => {
        const next = [...list, toast]
        // The oldest go first; their onEnd runs after this update, never inside it.
        const dropped = next.slice(0, Math.max(0, next.length - MAX_SHOWN))
        if (dropped.length) queueMicrotask(() => dropped.forEach((t) => end(t, 'timeout')))
        return next.slice(-MAX_SHOWN)
      })
    },
    [end],
  )

  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <section className="toasts" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onEnd={(how) => end(t, how)} />
        ))}
      </section>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onEnd }: { toast: Toast; onEnd: (how: ToastEnd) => void }) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(toast.duration)
  const startedAt = useRef(0)

  // onEnd is a new function on every provider render; keep it in a ref so the timer restarts
  // only when pausing changes.
  const endRef = useRef(onEnd)
  useEffect(() => {
    endRef.current = onEnd
  })

  useEffect(() => {
    if (paused) return
    startedAt.current = Date.now()
    const timer = setTimeout(() => endRef.current('timeout'), remaining.current)
    return () => {
      clearTimeout(timer)
      // Resuming gives at least 1.5 s more, so a toast never vanishes the instant a finger lifts.
      remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current))
    }
  }, [paused])

  return (
    <div
      className="toast"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <p className="toast-text">{toast.text}</p>
      {toast.action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick()
            onEnd('action')
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        className="toast-close"
        aria-label="Close notification"
        onClick={() => onEnd('closed')}
      >
        <X size={22} aria-hidden="true" />
      </button>
    </div>
  )
}
