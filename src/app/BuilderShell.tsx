// Dan's app frame: gets the session, listens for pokes, turns new events into toasts, and keeps
// focus, titles and scroll sensible between screens. Screens render inside the Outlet.
// Nod is browser-only (D91): data lives in IndexedDB, and every write pokes every open view
// (this tab included) over BroadcastChannel, so nothing polls.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router'
import type { FeedEvent } from '../../shared/types.ts'
import { awayText, eventHereText, isToastEvent, joinToastText } from '../builder/eventText.ts'
import { markChanged } from '../builder/liveFlash.ts'
import { announce } from '../lib/announce.ts'
import { subscribeLive } from '../lib/live.ts'
import { Button } from '../ui/Button.tsx'
import { Logo } from '../ui/Logo.tsx'
import { ToastProvider } from '../ui/Toasts.tsx'
import { useToasts } from '../ui/toastContext.ts'
import { usePageTitle } from '../ui/usePageTitle.ts'
import { createEventFeed } from './eventFeed.ts'
import { RouteFocus } from './RouteFocus.tsx'
import { invalidateData, ShellContext, useSessionQuery, type Shell } from './shell.ts'

export function BuilderShell() {
  return (
    <ToastProvider>
      <ShellBody />
    </ToastProvider>
  )
}

/** The while-you-were-away toast says more than one event, so it stays longer than 8 s. */
const AWAY_MS = 12_000

function ShellBody() {
  const sessionQuery = useSessionQuery()
  const session = sessionQuery.data ?? null
  const queryClient = useQueryClient()
  const { show } = useToasts()
  const navigate = useNavigate()
  const location = useLocation()

  // One feed per workspace; it outlives renders and starts at the session's cursor.
  const workspaceId = session?.workspace.id
  const startCursor = session?.cursor
  const feed = useMemo(
    () =>
      workspaceId === undefined || startCursor === undefined ? null : createEventFeed(startCursor),
    [workspaceId, startCursor],
  )

  // Owner events that arrived while the app was in the background (D77).
  const missed = useRef<FeedEvent[]>([])

  // Its handlers read the current route, so they're refreshed after every render.
  useLayoutEffect(() => {
    feed?.setHandlers({
      onReset: () => {
        // Reseeding gives every job a new id, so old job screens can't come back, and news held
        // from before the reset is about changes that no longer exist.
        missed.current = []
        queryClient.removeQueries({ queryKey: ['job'] })
        void invalidateData(queryClient)
        show('Demo data reset.')
        if (location.pathname !== '/') void navigate('/', { replace: true })
      },
      onEvents: (events) => {
        const toastable = events.filter(isToastEvent)
        if (!toastable.length) return
        // In the background a toast would fade unseen: keep it for one line on return (D77).
        if (document.visibilityState === 'hidden') {
          missed.current.push(...toastable)
          return
        }
        markChanged(toastable)
        // Already looking at that change: the page updates, so just say it (ux-spec 0.4).
        const here = /^\/v\/([^/]+)$/.exec(location.pathname)?.[1]
        const onScreen = toastable.filter((e) => e.variation_id === here)
        const elsewhere = toastable.filter((e) => e.variation_id !== here)
        if (onScreen.length) announce(onScreen.map(eventHereText).join(' '))
        if (!elsewhere.length) return
        const ids = new Set(elsewhere.map((e) => e.variation_id))
        const only = ids.size === 1 ? elsewhere[0].variation_id : null
        show(
          joinToastText(elsewhere),
          only
            ? { action: { label: 'Open', onClick: () => void navigate(`/v/${only}`) } }
            : undefined,
        )
      },
    })
  })

  // Back in the app: what happened while it was hidden, as one toast that stays a little longer.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missed.current.length) return
      const events = missed.current
      missed.current = []
      markChanged(events)
      const text = awayText(events)
      if (!text) return
      // All about one change, and not the one on screen: [Open] goes there.
      const ids = new Set(events.map((e) => e.variation_id))
      const only = ids.size === 1 ? events[0].variation_id : null
      const here = /^\/v\/([^/]+)$/.exec(window.location.pathname)?.[1]
      show(text, {
        duration: AWAY_MS,
        action:
          only && only !== here
            ? { label: 'Open', onClick: () => void navigate(`/v/${only}`) }
            : undefined,
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [show, navigate])

  // Pokes: refetch what's on screen, then ask the feed what happened (D9).
  useEffect(() => {
    if (!feed) return
    return subscribeLive(() => {
      void invalidateData(queryClient)
      void feed.pull()
    })
  }, [feed, queryClient])

  // Back from the back/forward cache: catch up on anything another tab did meanwhile.
  useEffect(() => {
    if (!feed) return
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      void invalidateData(queryClient)
      void feed.pull()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [feed, queryClient])

  const shell = useMemo<Shell>(() => ({ session, feed }), [session, feed])

  return (
    <ShellContext.Provider value={shell}>
      <RouteFocus />
      <ScrollRestoration />
      {sessionQuery.isError ? (
        <StorageFailed
          retrying={sessionQuery.isFetching}
          onRetry={() => void sessionQuery.refetch()}
        />
      ) : (
        <Outlet />
      )}
    </ShellContext.Provider>
  )
}

/** Nod keeps everything in this browser's storage; if the browser won't open it, say how to fix it. */
function StorageFailed({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  usePageTitle('Can’t start Nod: Nod')
  return (
    <div className="screen screen-glow screen-glow-soft">
      <main className="page page-builder full-state">
        <Logo size={48} />
        <h1 tabIndex={-1} className="t-title-1">
          Nod can’t start in this browser
        </h1>
        <p>
          It keeps your jobs in this browser’s storage, and the browser said no. In a private
          window, open Nod in a normal one, then try again.
        </p>
        <Button variant="primary" size={56} block pending={retrying} onClick={onRetry}>
          Try again
        </Button>
      </main>
    </div>
  )
}
