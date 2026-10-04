// TanStack Query owns the screens' data (D42). Nod is browser-only (D91): queries read the local
// store and refetch when a write pokes them (live.ts), so nothing polls.
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { announce } from '../lib/announce.ts'
import { isApiError } from '../lib/api.ts'

/** A 4xx won't fix itself on a retry: show it straight away. Network and 5xx get one retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  // A screen that fails to load says so on screen; this says it once to screen readers too.
  // Only when there's nothing to show: a failed background refresh keeps the old data quietly.
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = query.meta?.errorMessage
      if (query.state.data !== undefined || typeof message !== 'string') return
      if (isApiError(error) && error.status === 404) return // the screen's own "not found" covers it
      announce(message)
    },
  }),
  defaultOptions: {
    queries: { staleTime: 2_000, retry: shouldRetry },
    // Never retry a write on its own: Send and Approve are records, and the person decides.
    mutations: { retry: 0 },
  },
})
