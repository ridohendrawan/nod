// Sarah's page's data: her change, read from this browser's store by the token in her link, and
// read again whenever anything changes in any tab (D9, D91). Plain React state rather than a
// query library, so her page stays small (D86).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OwnerView } from '../../shared/types.ts'
import { ownerApi, subscribeLive, isApiError } from '../lib/ownerApi.ts'

export type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; view: OwnerView }
  /** Unknown link, a browser without Nod's data, or a draft that was never sent. */
  | { kind: 'missing' }
  | { kind: 'failed' }

/** The token in /o/<token>. */
export const tokenFromPath = (path: string) => decodeURIComponent(path.split('/')[2] ?? '')

export function useOwnerView(token: string, onChange?: (prev: OwnerView, next: OwnerView) => void) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const last = useRef<OwnerView | null>(null)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  const load = useCallback(async () => {
    try {
      const view = await ownerApi.view(token)
      const prev = last.current
      last.current = view
      setState({ kind: 'ready', view })
      if (prev) changed.current?.(prev, view)
    } catch (e) {
      setState(isApiError(e) && e.status === 404 ? { kind: 'missing' } : { kind: 'failed' })
    }
  }, [token])

  useEffect(() => {
    // The first read happens after mount, like a fetch; the poke keeps it fresh.
    const first = setTimeout(() => void load(), 0)
    const stop = subscribeLive(() => void load())
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load()
    }
    window.addEventListener('pageshow', onShow)
    return () => {
      clearTimeout(first)
      stop()
      window.removeEventListener('pageshow', onShow)
    }
  }, [load])

  /** Use an answer's fresh view at once (approve, ask, say no return one). */
  const accept = useCallback((view: OwnerView) => {
    last.current = view
    setState({ kind: 'ready', view })
  }, [])

  return { state, reload: load, accept }
}

/**
 * "Opened" means a person saw it (D70): once the page has been visible for about a second, and
 * only once per version. Loading the link never counts, so previews and scanners can't fake it.
 */
export function useSeenBeacon(view: OwnerView | null) {
  const sent = useRef(new Set<string>())
  const token = view?.token
  const version = view?.version
  const open = view?.status === 'sent' || view?.status === 'question'

  useEffect(() => {
    if (!token || version === undefined || !open) return
    const key = `${token}:${version}`
    if (sent.current.has(key)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        if (sent.current.has(key)) return
        sent.current.add(key)
        void ownerApi.seen(token, version).catch(() => sent.current.delete(key))
      }, 1000)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [token, version, open])
}
