// Dan's data. Nod is browser-only (D91): the api reads the local store, and every write pokes
// every open view, so queries never poll. They wait for the session, which seeds a new browser.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { JobsResponse, JobSummary } from '../../shared/types.ts'
import { useShell } from '../app/shell.ts'
import { api } from '../lib/api.ts'

export const jobsKey = ['jobs'] as const
export const jobKey = (id: string) => ['job', id] as const

export function useJobs() {
  const { session } = useShell()
  return useQuery({
    queryKey: jobsKey,
    queryFn: api.jobs,
    enabled: session !== null,
    meta: { errorMessage: 'Nod couldn’t load your jobs.' },
  })
}

export function useJob(id: string) {
  const { session } = useShell()
  return useQuery({
    queryKey: jobKey(id),
    queryFn: () => api.job(id),
    enabled: session !== null,
    meta: { errorMessage: 'Nod couldn’t load this job.' },
  })
}

/** What the Jobs list already knows about a job, so its screen can show the title at once. */
export function useCachedJobSummary(id: string): JobSummary | undefined {
  const queryClient = useQueryClient()
  return queryClient.getQueryData<JobsResponse>(jobsKey)?.jobs.find((j) => j.id === id)
}

export const variationKey = (id: string) => ['variation', id] as const

/** Everything the Review and Status screens need for one variation (api.variation). */
export function useVariation(id: string) {
  const { session } = useShell()
  return useQuery({
    queryKey: variationKey(id),
    queryFn: () => api.variation(id),
    enabled: session !== null,
    meta: { errorMessage: 'Nod couldn’t load this change.' },
  })
}
