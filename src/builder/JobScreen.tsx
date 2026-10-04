// Job (/job/:id): the money and the variations for one job; the one big action is Record
// (ux-spec 2).
import { ArrowRight, MapPin, MapPinOff, Mic } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { builder } from '../../shared/copy.ts'
import { hasCents } from '../../shared/money.ts'
import { STATE_NAME } from '../../shared/states.ts'
import { isApiError } from '../lib/api.ts'
import { Avatar } from '../ui/Avatar.tsx'
import { ButtonLink } from '../ui/ButtonLink.tsx'
import { Callout } from '../ui/Callout.tsx'
import { JobPhoto } from '../ui/JobPhoto.tsx'
import { LoadError } from '../ui/LoadError.tsx'
import { jobPhoto } from '../ui/media.ts'
import { Skeleton } from '../ui/Skeleton.tsx'
import { StateChip } from '../ui/StateChip.tsx'
import { useDelayed } from '../ui/useDelayed.ts'
import { usePageTitle } from '../ui/usePageTitle.ts'
import { ActionBar, AppHeader, BackLink } from './AppHeader.tsx'
import { MoneyPanel, MoneyPanelSkeleton } from './MoneyPanel.tsx'
import { JobSheet } from './JobSheet.tsx'
import { backTo } from './nav.ts'
import { useCachedJobSummary, useJob } from './queries.ts'
import { clearJobFlash, peekJobFlash } from './record/jobFlash.ts'
import { useHiddenDrafts } from './review/pendingDelete.ts'
import { VariationList, VariationListSkeleton } from './VariationList.tsx'

export function JobScreen() {
  const { id = '' } = useParams()
  const query = useJob(id)
  const cached = useCachedJobSummary(id)
  const data = query.data
  const missing = isApiError(query.error) && query.error.status === 404
  const hidden = useHiddenDrafts()
  // A note that just became several drafts (ux-spec 3): say so once, and mark them new.
  const [flash] = useState(() => peekJobFlash(id))
  const [fresh] = useState(() => new Set(flash?.newDrafts ?? []))
  useEffect(() => clearJobFlash(id), [id])
  const variations = useMemo(
    () => data?.variations.filter((v) => !hidden.has(v.id)) ?? [],
    [data, hidden],
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const chip = useRef<HTMLButtonElement>(null)

  const title = data?.job.title ?? cached?.title
  const state = data?.job.state ?? cached?.state
  const clientName = data?.job.client_name ?? cached?.client_name
  const photo = title ? jobPhoto(title) : null
  usePageTitle(missing ? 'Job not found: Nod' : `${title ?? 'Job'}: Nod`)

  if (missing) return <JobMissing />

  const options = data
    ? {
        cents: hasCents([
          data.money.original_cents,
          data.money.approved_cents,
          data.money.waiting_cents,
          data.money.total_cents,
          data.money.if_approved_cents,
          ...variations.map((v) => v.price_cents),
        ]),
      }
    : {}

  return (
    <div className={photo ? 'screen has-cover' : 'screen screen-glow screen-glow-soft'}>
      {photo ? <JobPhoto photo={photo} sizes="100vw" className="photo job-cover" priority /> : null}
      <AppHeader
        floating
        fadeAfter={photo ? 172 : 8}
        left={<BackLink to="/" label="Jobs" />}
        right={
          data ? (
            // The state decides the rules; tapping it changes the job's details (D55).
            <button
              ref={chip}
              type="button"
              className="state-chip state-chip-button"
              aria-label={`${STATE_NAME[data.job.state]} rules. Change job details`}
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              {data.job.state}
            </button>
          ) : state ? (
            <StateChip state={state} />
          ) : null
        }
      />
      <main className="page page-builder">
        <div className="job-hero">
          {clientName ? <Avatar name={clientName} size="lg" ring={!!photo} /> : null}
          <div className="job-hero-text">
            <h1 tabIndex={-1} className="t-title-1">
              {title ?? <span className="visually-hidden">Loading the job</span>}
            </h1>
            {data || cached ? (
              <p className="job-hero-meta">
                <span>{data?.job.client_name ?? cached?.client_name}</span>
                <span className="job-hero-place">
                  <MapPin size={15} strokeWidth={2.25} aria-hidden="true" />
                  {data ? `${data.job.address}, ${data.job.suburb}` : cached?.suburb}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {data ? (
          <>
            <MoneyPanel
              money={data.money}
              firstName={data.job.client_first_name}
              options={options}
            />
            <section className="section" aria-labelledby="variations-title">
              <div className="section-head">
                <h2 id="variations-title" className="t-title-2">
                  Variations
                </h2>
                {variations.length ? (
                  <span className="count-chip" aria-hidden="true">
                    {variations.length}
                  </span>
                ) : null}
              </div>
              {fresh.size > 1 ? (
                <Callout tone="neutral" title={`Nod split your note into ${fresh.size} changes`}>
                  <p>So {data.job.client_first_name} can say yes to one and not the other.</p>
                  {flash?.prepared ? <p>{builder.preparedDrafts}</p> : null}
                </Callout>
              ) : null}
              <VariationList
                variations={variations}
                firstName={data.job.client_first_name}
                options={options}
                jobPath={`/job/${id}`}
                fresh={fresh}
              />
            </section>
          </>
        ) : query.isError ? (
          <LoadError
            message="Nod couldn’t load this job."
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <JobSkeleton />
        )}
      </main>
      {data ? <JobSheet open={sheetOpen} onOpenChange={setSheetOpen} job={data.job} /> : null}
      {data ? (
        <ActionBar>
          <ButtonLink
            variant="primary"
            size={56}
            block
            className="record-btn"
            to={`/job/${id}/new`}
            state={backTo(`/job/${id}`)}
            icon={
              <span className="record-mic" aria-hidden="true">
                <Mic size={22} strokeWidth={2.25} />
              </span>
            }
            iconEnd={
              <span className="record-go" aria-hidden="true">
                <ArrowRight size={20} strokeWidth={2.25} />
              </span>
            }
          >
            Record a change
          </ButtonLink>
        </ActionBar>
      ) : null}
    </div>
  )
}

function JobSkeleton() {
  const shown = useDelayed()
  if (!shown) return null
  return (
    <>
      <MoneyPanelSkeleton />
      <div className="section" aria-hidden="true">
        <Skeleton height={22} width="34%" />
        <VariationListSkeleton />
      </div>
    </>
  )
}

/** The job isn't there: a mistyped link, or a demo reset gave every job a new id. */
export function JobMissing() {
  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader floating left={<BackLink to="/" label="Jobs" />} />
      <main className="page page-builder full-state">
        <span className="state-mark" aria-hidden="true">
          <MapPinOff size={30} strokeWidth={2} />
        </span>
        <h1 tabIndex={-1} className="t-title-1">
          This job isn’t here
        </h1>
        <p>The link may be old. Resetting the demo data replaces all three jobs.</p>
        <ButtonLink variant="primary" size={56} block to="/">
          Back to your jobs
        </ButtonLink>
      </main>
    </div>
  )
}
