// React Router leaves focus alone on navigation, so screen-reader and keyboard users would be
// stranded on a link that no longer exists. On every navigation (not the first load) focus the
// new page's h1; going Back, return to the card or row the user came from (ux-spec 0.1, D79).
// Focus moves without scrolling, so Back keeps the place ScrollRestoration restores; if the
// target is then out of sight (Back from an edit to a heading above the screen), it comes in.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { revealIfOffScreen } from '../ui/reveal.ts'

export function RouteFocus() {
  const location = useLocation()
  const navigationType = useNavigationType()
  // Keyed on the location, so StrictMode's second effect run in development is a no-op.
  const lastKey = useRef(location.key)
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    if (lastKey.current === location.key) return
    lastKey.current = location.key
    const cameFrom = lastPath.current
    lastPath.current = location.pathname

    const frame = requestAnimationFrame(() => {
      const main = document.querySelector('main')
      if (!main) return
      if (navigationType === 'POP') {
        const link = [...main.querySelectorAll<HTMLAnchorElement>('a[href]')].find(
          (a) => a.getAttribute('href') === cameFrom,
        )
        if (link) {
          link.focus({ preventScroll: true })
          revealIfOffScreen(link)
          return
        }
      }
      const heading = main.querySelector<HTMLElement>('h1')
      heading?.focus({ preventScroll: true })
      revealIfOffScreen(heading)
    })
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.pathname, navigationType])

  return null
}
