// A phone, drawn around a page of Nod (D91: Nod is built for phones). The page runs in a same-
// origin iframe at phone width, so it behaves exactly as it does on a phone: its own scrolling,
// sheets and toasts inside the screen, and the same data as every other tab. The frame draws a
// status bar and a home indicator over the page; the page leaves room for them (data-frame).
// Drawn twice, side by side, on the demo stage, which is what a computer gets (ux-spec 0.5).
import type { ReactNode, Ref } from 'react'
import { cx } from './cx.ts'
import { useMinute } from './useMinute.ts'

export function PhoneFrame({
  src,
  title,
  frameRef,
  children,
  timeZone,
  light,
  className,
}: {
  /** A page to run inside, at phone width. Leave it out to draw `children` instead. */
  src?: string
  /** The iframe's accessible name. */
  title?: string
  frameRef?: Ref<HTMLIFrameElement>
  /** Drawn content (the demo stage's lock screen) when there's no page. */
  children?: ReactNode
  /** The status bar's clock: this computer's zone unless given (the stage shows Brisbane). */
  timeZone?: string
  /** White status icons, for a dark screen like the lock screen. */
  light?: boolean
  className?: string
}) {
  return (
    <div className={cx('phone', className)}>
      <span className="phone-button phone-button-action" aria-hidden="true" />
      <span className="phone-button phone-button-up" aria-hidden="true" />
      <span className="phone-button phone-button-down" aria-hidden="true" />
      <span className="phone-button phone-button-side" aria-hidden="true" />
      <div className="phone-screen">
        {src ? (
          <iframe
            ref={frameRef}
            className="phone-page"
            src={src}
            title={title}
            allow="microphone; camera; clipboard-write; web-share"
          />
        ) : (
          children
        )}
        <div className={cx('phone-status', light && 'is-light')} aria-hidden="true">
          <PhoneClock timeZone={timeZone} />
          <span className="phone-island" />
          <StatusIcons colour={light ? '#FFFFFF' : '#14161A'} />
        </div>
        <span className={cx('phone-home', light && 'is-light')} aria-hidden="true" />
      </div>
    </div>
  )
}

/** "2:15", like a phone's status bar: no am or pm. */
function PhoneClock({ timeZone }: { timeZone?: string }) {
  const now = useMinute()
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(now)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? ''
  return (
    <span className="phone-clock">
      {hour}:{minute}
    </span>
  )
}

/** Signal, wi-fi and a full battery (literal colours: SVG attributes). */
function StatusIcons({ colour }: { colour: string }) {
  return (
    <span className="phone-icons">
      <svg width="18" height="12" viewBox="0 0 18 12" focusable="false">
        <rect x="0" y="8" width="3" height="4" rx="1" fill={colour} />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill={colour} />
        <rect x="10" y="3" width="3" height="9" rx="1" fill={colour} />
        <rect x="15" y="0" width="3" height="12" rx="1" fill={colour} />
      </svg>
      <svg width="16" height="12" viewBox="0 0 16 12" focusable="false">
        <path
          d="M8 2.6c2.3 0 4.4.9 5.9 2.4l1.1-1.1A9.7 9.7 0 0 0 8 1 9.7 9.7 0 0 0 1 3.9L2.1 5A8.2 8.2 0 0 1 8 2.6Zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.1-1.1A6.6 6.6 0 0 0 8 4.3a6.6 6.6 0 0 0-4.7 1.9l1.1 1.1c1-.9 2.2-1.4 3.6-1.4Zm0 3.2c.6 0 1.1.2 1.5.6L8 11.2 6.5 9.7c.4-.4.9-.6 1.5-.6Z"
          fill={colour}
        />
      </svg>
      <svg width="27" height="13" viewBox="0 0 27 13" focusable="false">
        <rect
          x="0.5"
          y="0.5"
          width="23"
          height="12"
          rx="3.6"
          fill="none"
          stroke={colour}
          strokeOpacity="0.4"
        />
        <rect x="2" y="2" width="20" height="9" rx="2.2" fill={colour} />
        <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill={colour} fillOpacity="0.45" />
      </svg>
    </span>
  )
}
