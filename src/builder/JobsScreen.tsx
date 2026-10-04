// Jobs (/): Dan's week at a glance, and where the questions and waiting changes are (ux-spec 1).
// The hero carries one number (what's under contract), then what needs doing, in words and as a
// strip with one segment per job.
import { MapPin, Menu } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import type { VariationStatus } from '../../shared/copy.ts'
import { formatMoney, hasCents, type MoneyOptions } from '../../shared/money.ts'
import { STATE_NAME } from '../../shared/states.ts'
import { jobsSummaryLine } from '../../shared/summary.ts'
import { formatToday, partOfDay } from '../../shared/time.ts'
import type { JobSummary } from '../../shared/types.ts'
import { phoneTimeZone } from '../app/frame.ts'
import { useShell } from '../app/shell.ts'
import { Avatar } from '../ui/Avatar.tsx'
import { Callout } from '../ui/Callout.tsx'
import { JobPhoto } from '../ui/JobPhoto.tsx'
import { LoadError } from '../ui/LoadError.tsx'
import { jobPhoto } from '../ui/media.ts'
import { MoneyFigure } from '../ui/MoneyFigure.tsx'
import { Skeleton } from '../ui/Skeleton.tsx'
import { StateChip } from '../ui/StateChip.tsx'
import { TonePill } from '../ui/StatusPill.tsx'
import { useCountUp } from '../ui/useCountUp.ts'
import { useDelayed } from '../ui/useDelayed.ts'
import { usePageTitle } from '../ui/usePageTitle.ts'
import { AppHeader, Brand } from './AppHeader.tsx'
import { useFlashKey } from './liveFlash.ts'
import { MenuSheet } from './MenuSheet.tsx'
import { backTo } from './nav.ts'
import { useJobs } from './queries.ts'

export function JobsScreen() {
  usePageTitle('Jobs: Nod')
  const { session } = useShell()
  const jobs = useJobs()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  // The phone's time, read once when the screen opens (D10: greetings follow the phone, not the
  // site). On the demo stage that's the Brisbane clock drawn on Dan's phone.
  const [today] = useState(() => {
    const now = new Date()
    const timeZone = phoneTimeZone()
    return { part: partOfDay(hourIn(now, timeZone)), date: formatToday(now, timeZone) }
  })
  const name = session?.workspace.builder_name
  const list = jobs.data?.jobs

  return (
    <div className="screen screen-glow">
      <AppHeader
        left={<Brand />}
        right={
          <>
            {session?.workspace.ai_down ? <span className="chip-ai-off">AI off</span> : null}
            <button
              ref={menuButton}
              type="button"
              className="icon-btn"
              aria-label="Menu"
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </>
        }
      />
      <main className="page page-builder">
        <div className="hero">
          <div className="hero-hello">
            {name ? <Avatar name={name} /> : null}
            <div className="hero-hello-text">
              <p className="hero-date">{today.date}</p>
              <h1 tabIndex={-1}>
                {today.part}
                {name ? `, ${name}` : ''}
              </h1>
            </div>
          </div>
          {list ? <HeroSummary jobs={list} /> : <HeroSkeleton />}
        </div>

        {session?.created ? (
          <Callout
            tone="neutral"
            title="This phone is new to Nod, so your demo jobs are set up fresh."
          >
            These three jobs are demo data. Reset them any time from the menu.
          </Callout>
        ) : null}

        <section className="section" aria-labelledby="jobs-title">
          <div className="section-head">
            <h2 id="jobs-title" className="t-title-2">
              Jobs
            </h2>
            {list ? (
              <span className="count-chip" aria-hidden="true">
                {list.length}
              </span>
            ) : null}
          </div>
          {list ? (
            <ul className="job-list" aria-label="Your jobs">
              {list.map((job) => (
                <li key={job.id}>
                  <JobCard
                    job={job}
                    options={{ cents: hasCents(list.map((j) => j.total_cents)) }}
                  />
                </li>
              ))}
            </ul>
          ) : jobs.isError ? (
            <LoadError
              message="Nod couldn’t load your jobs."
              retrying={jobs.isFetching}
              onRetry={() => void jobs.refetch()}
            />
          ) : (
            <JobListSkeleton />
          )}
        </section>
      </main>
      <MenuSheet open={menuOpen} onOpenChange={setMenuOpen} trigger={menuButton} />
    </div>
  )
}

/** The hour, 0 to 23, on a clock in this zone (the device's own clock without one). */
function hourIn(at: Date, timeZone: string | undefined): number {
  if (!timeZone) return at.getHours()
  const hour = new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(at)
    .find((part) => part.type === 'hour')?.value
  return hour === undefined ? at.getHours() : Number(hour)
}

// ---- The hero ---------------------------------------------------------------------------------

type Kind = 'ask' | 'wait' | 'draft' | 'signed' | 'idle'

/** What a job needs most, in the order Dan should look (D27). */
function kindOf(job: JobSummary): Kind {
  if (job.counts.question > 0) return 'ask'
  if (job.counts.waiting > 0) return 'wait'
  if (job.counts.draft > 0) return 'draft'
  return job.status_line.tone === 'go' ? 'signed' : 'idle'
}

const KIND_ORDER: Kind[] = ['ask', 'wait', 'draft', 'signed', 'idle']

const KIND_WORDS: Record<Kind, (n: number) => string> = {
  ask: (n) => `${n} with a question`,
  wait: (n) => `${n} waiting`,
  draft: (n) => `${n} with a draft`,
  signed: (n) => `${n} signed`,
  idle: (n) => `${n} with no changes yet`,
}

function HeroSummary({ jobs }: { jobs: JobSummary[] }) {
  const total = jobs.reduce((sum, j) => sum + j.total_cents, 0)
  const options: MoneyOptions = { cents: hasCents(jobs.map((j) => j.total_cents)) }
  const shown = useCountUp(total)

  const statuses: VariationStatus[] = jobs.flatMap((j) => [
    ...Array<VariationStatus>(j.counts.question).fill('question'),
    ...Array<VariationStatus>(j.counts.waiting).fill('sent'),
    ...Array<VariationStatus>(j.counts.draft).fill('draft'),
  ])
  const summary = jobsSummaryLine(statuses)
  const kinds = jobs.map(kindOf).sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
  const counted = KIND_ORDER.map((k) => [k, kinds.filter((x) => x === k).length] as const).filter(
    ([, n]) => n > 0,
  )

  return (
    <>
      <MoneyFigure
        cents={total}
        shown={shown}
        options={options}
        className="hero-figure t-display"
      />
      <p className="hero-sub">
        under contract on {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
      </p>
      <p className={`hero-status tone-${summary.tone}`}>{summary.text}</p>
      <div className="job-strip" aria-hidden="true">
        {kinds.map((kind, i) => (
          <span key={i} className={`seg-${kind}`} />
        ))}
      </div>
      <ul className="strip-legend" aria-label="Your jobs by status">
        {counted.map(([kind, n]) => (
          <li key={kind}>
            <span className={`swatch swatch-${kind}`} aria-hidden="true" />
            {KIND_WORDS[kind](n)}
          </li>
        ))}
      </ul>
    </>
  )
}

function HeroSkeleton() {
  const shown = useDelayed()
  if (!shown) return null
  return (
    <div className="hero-skeleton" aria-hidden="true">
      <Skeleton height={52} width="62%" radius={12} />
      <Skeleton height={18} width="48%" />
      <Skeleton height={12} width="100%" radius={6} />
    </div>
  )
}

// ---- The cards --------------------------------------------------------------------------------

function JobCard({ job, options }: { job: JobSummary; options: MoneyOptions }) {
  const flash = useFlashKey(job.id)
  const total = formatMoney(job.total_cents, options)
  const photo = jobPhoto(job.title)
  const spoken = `${job.client_name}, ${job.title.toLowerCase()}, ${job.suburb}, ${STATE_NAME[job.state]}. ${job.status_line.text}. Contract total ${total}.`
  return (
    <Link
      to={`/job/${job.id}`}
      state={backTo('/')}
      className={photo ? 'card job-card has-media' : 'card job-card'}
      aria-label={spoken}
    >
      {flash ? <span key={flash} className="live-flash" aria-hidden="true" /> : null}
      {photo ? (
        <span className="job-card-media">
          <JobPhoto photo={photo} sizes="(max-width: 560px) 100vw, 520px" className="photo" />
          <StateChip state={job.state} spoken="none" />
        </span>
      ) : null}
      <span className="job-card-body">
        <span className="job-card-head">
          <Avatar name={job.client_name} ring={!!photo} />
          <span className="job-card-names">
            <span className="job-card-client">{job.client_name}</span>
            <span className="job-card-job">{job.title}</span>
            <span className="job-card-place">
              <MapPin size={15} strokeWidth={2.25} aria-hidden="true" />
              {job.suburb}
              {photo ? null : <StateChip state={job.state} spoken="none" />}
            </span>
          </span>
        </span>
        <span className="job-card-foot">
          <span className="job-card-total">
            <span className="label">Contract total</span>
            <MoneyFigure cents={job.total_cents} options={options} className="t-money-total" />
          </span>
          <TonePill tone={job.status_line.tone}>{job.status_line.text}</TonePill>
        </span>
      </span>
    </Link>
  )
}

function JobListSkeleton() {
  const shown = useDelayed()
  if (!shown) return null
  return (
    <ul className="job-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card job-card has-media is-skeleton">
          <span className="job-card-media" />
          <span className="job-card-body">
            <span className="job-card-head">
              <Skeleton height={48} width={48} radius={24} />
              <span className="job-card-names">
                <Skeleton height={18} width="55%" />
                <Skeleton height={16} width="75%" />
              </span>
            </span>
            <Skeleton height={28} width="45%" />
          </span>
        </li>
      ))}
    </ul>
  )
}
