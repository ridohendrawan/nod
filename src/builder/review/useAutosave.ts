// Autosave for the Review screen (ux-spec 4: "Saved" / "Saving…" / "Not saved. Retrying").
// Edits merge into one patch and save half a second after Dan stops typing; saves run one at a
// time, in order. A failed save keeps its patch and retries with a growing pause, and says so
// once. `flush()` saves now and tells you whether everything is saved: Send waits on it, so
// Sarah gets exactly what's on screen.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VariationPatch } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { api, isApiError, type ApiError } from '../../lib/api.ts'

/** `failed`: it can never save as it is (answered or deleted elsewhere); the screen explains. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'retrying' | 'failed'

const DEBOUNCE_MS = 500

export function useAutosave(id: string, onFailed?: (error: ApiError) => void) {
  const [state, setState] = useState<SaveState>('idle')
  const pending = useRef<VariationPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const failures = useRef(0)
  const failed = useRef(onFailed)
  useEffect(() => {
    failed.current = onFailed
  })

  // One save of everything pending. A retry schedules the next one through `retry` below.
  const saveNow = useRef<() => Promise<void>>(async () => undefined)
  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current)
    chain.current = chain.current.then(() => saveNow.current())
    return chain.current.then(() => Object.keys(pending.current).length === 0)
  }, [])

  useEffect(() => {
    saveNow.current = async () => {
      const patch = pending.current
      if (Object.keys(patch).length === 0) return
      pending.current = {}
      setState('saving')
      try {
        await api.updateVariation(id, patch)
        failures.current = 0
        setState(Object.keys(pending.current).length ? 'saving' : 'saved')
      } catch (e) {
        // Keep the edits (newer ones win).
        pending.current = { ...patch, ...pending.current }
        if (isApiError(e) && e.status >= 400 && e.status < 500) {
          setState('failed')
          failed.current?.(e)
          return
        }
        failures.current += 1
        if (failures.current === 1) announce('Not saved. Retrying.')
        setState('retrying')
        timer.current = setTimeout(() => void flush(), Math.min(8000, 1000 * 2 ** failures.current))
      }
    }
  }, [id, flush])

  const queue = useCallback(
    (patch: VariationPatch) => {
      pending.current = { ...pending.current, ...patch }
      setState('saving')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS)
    },
    [flush],
  )

  // Leaving the screen or the app: save what's pending straight away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void flush()
    }
  }, [flush])

  return { state, queue, flush }
}
