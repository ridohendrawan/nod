// What every builder screen can reach: the session (once the store has opened, and seeded a new
// browser) and the event feed. Both are null while the session is still loading.
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import type { SessionResponse } from '../../shared/types.ts'
import { api } from '../lib/api.ts'
import type { EventFeed } from './eventFeed.ts'

export type Shell = { session: SessionResponse | null; feed: EventFeed | null }

export const ShellContext = createContext<Shell>({ session: null, feed: null })

export const useShell = (): Shell => useContext(ShellContext)

export const SESSION_KEY = ['session'] as const

/** Get or create this browser's workspace. Asked once per visit: it seeds demo data if needed. */
export function useSessionQuery() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: api.session,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** Refetch every screen's data, but never the session itself. */
export function invalidateData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
}
