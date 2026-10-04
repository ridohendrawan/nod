// The top of every builder screen and the bottom Record dock. On inner screens the header floats:
// its controls are opaque pills, so they stay readable over whatever scrolls beneath.
import { ChevronLeft } from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { cx } from '../ui/cx.ts'
import { Logo } from '../ui/Logo.tsx'
import { cameFrom } from './nav.ts'

function onScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/** True once the page has scrolled past `px` (never for a header that doesn't float). */
function useScrolledPast(px: number | null): boolean {
  return useSyncExternalStore(
    onScroll,
    () => px !== null && window.scrollY > px,
    () => false,
  )
}

export function AppHeader({
  left,
  right,
  floating,
  fadeAfter = 8,
}: {
  left: ReactNode
  right?: ReactNode
  /** Sticky, with the page scrolling under the controls (inner screens). */
  floating?: boolean
  /** Scrolled this far, a soft band of paper fades in behind the controls, so words scrolling
   *  beneath never show between them. Past the cover on the Job screen. */
  fadeAfter?: number
}) {
  const scrolled = useScrolledPast(floating ? fadeAfter : null)
  const header = useRef<HTMLElement>(null)
  useCover(header, 'top')
  return (
    <header
      ref={header}
      className={cx('app-header', floating && 'is-floating', scrolled && 'is-scrolled')}
    >
      <div className="app-header-inner">
        <div className="app-header-left">{left}</div>
        {right ? <div className="app-header-right">{right}</div> : null}
      </div>
    </header>
  )
}

/** Nod's mark and name, top left: "Nod by Good" (a Good Ops product). */
export function Brand() {
  return (
    <span className="brand">
      <Logo size={40} />
      <span className="brand-text">
        <span className="brand-name">Nod</span>
        <span className="brand-by">
          by <b>Good</b>
        </span>
      </span>
    </span>
  )
}

/**
 * Back to the screen above. If we came from there, it's a real Back: the browser restores the
 * scroll position and focus returns to the card we left (RouteFocus). Otherwise (a deep link),
 * it's a plain link up.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const cameFromThere = cameFrom(location.state, to)
  return (
    <Link
      to={to}
      className="back-link"
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!cameFromThere || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return
        event.preventDefault()
        void navigate(-1)
      }}
    >
      <ChevronLeft size={24} strokeWidth={2.25} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  )
}

/** The bottom bar for a screen's one main action. In-flow and sticky, never over a field (D84).
 *  A named region, so a screen reader can jump straight to it from the landmarks list. */
export function ActionBar({ children }: { children: ReactNode }) {
  const bar = useRef<HTMLElement>(null)
  useCover(bar, 'bottom')
  return (
    <section ref={bar} className="action-bar" aria-label="Actions">
      <div className="action-bar-inner">{children}</div>
    </section>
  )
}

// ---- What floats over the page (WCAG 2.2, Focus Not Obscured) --------------------------------

/** How much of the page's top and bottom each floating header and bar covers. One of each on
 *  screen, but a route change can briefly hold two, so the one leaving never clears the
 *  newcomer's. */
const covering = { top: new Map<HTMLElement, number>(), bottom: new Map<HTMLElement, number>() }

/**
 * Keeps the page's scroll padding (screens.css) the size of what floats over it while it floats,
 * so whatever gets focus is scrolled into full view, at any text size and however tall the
 * voice's messages make the Record dock. A fixed padding couldn't: at 390 px the dock is 234 px
 * tall with the mic's first-time help, and the bar steps into the page while a field has the
 * keyboard and on short screens.
 */
function useCover(ref: RefObject<HTMLElement | null>, edge: 'top' | 'bottom') {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const sizes = covering[edge]
    const publish = () =>
      document.documentElement.style.setProperty(
        edge === 'top' ? '--header-cover' : '--bar-cover',
        `${Math.max(0, ...sizes.values())}px`,
      )
    const measure = () => {
      sizes.set(el, getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0)
      publish()
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(el)
    document.addEventListener('focusin', measure)
    document.addEventListener('focusout', measure)
    window.addEventListener('resize', measure)
    return () => {
      resize.disconnect()
      document.removeEventListener('focusin', measure)
      document.removeEventListener('focusout', measure)
      window.removeEventListener('resize', measure)
      sizes.delete(el)
      publish()
    }
  }, [ref, edge])
}
