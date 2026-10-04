// /v/:id (ux-spec 4 to 6): one change, as Review while it's a draft and as Status once sent.
// The Sent sheet lives here, above both, because a send turns the Review behind it into Status
// while the sheet is still open.
import { FileQuestion } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../lib/api.ts'
import { ButtonLink } from '../../ui/ButtonLink.tsx'
import { LoadError } from '../../ui/LoadError.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { useDelayed } from '../../ui/useDelayed.ts'
import { usePageTitle } from '../../ui/usePageTitle.ts'
import { AppHeader, BackLink } from '../AppHeader.tsx'
import { backTo, cameFrom } from '../nav.ts'
import { useVariation } from '../queries.ts'
import { ReviewScreen } from '../review/ReviewScreen.tsx'
import { SentSheet } from './SentSheet.tsx'
import { StatusScreen } from './StatusScreen.tsx'

/** A fresh screen for each change, so one draft's working copy never leaks into the next. */
export function VariationRoute() {
  const { id = '' } = useParams()
  return <VariationScreen key={id} id={id} />
}

function VariationScreen({ id }: { id: string }) {
  const query = useVariation(id)
  const navigate = useNavigate()
  const location = useLocation()
  const statusPath = `/v/${id}`
  // Editing a sent change lives in the address (/v/:id?edit), so Back leaves it.
  const editing = new URLSearchParams(location.search).has('edit')
  // The Sent sheet, opened by a send (Review is gone, so Done goes to Status's heading) or by
  // Share again (Done goes back to that button). What opened it outlasts the closing, which
  // reads it as the sheet goes.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openedBy, setOpenedBy] = useState<'send' | 'share'>('send')
  const openSheet = (by: 'send' | 'share') => {
    setOpenedBy(by)
    setSheetOpen(true)
  }
  // The version an update was just sent as: edit mode ends there, under the Sent sheet.
  const [sentAs, setSentAs] = useState<number | null>(null)
  const startEdit = () => void navigate(`${statusPath}?edit`, { state: backTo(statusPath) })
  const leaveEdit = () => {
    if (cameFrom(location.state, statusPath)) void navigate(-1)
    else void navigate(statusPath, { replace: true })
  }
  const statusHeading = useRef<HTMLHeadingElement>(null)
  // If focus was on the placeholder heading when the change arrived, hand it to the real one.
  const placeholderFocused = useRef(false)
  const data = query.data
  const missing = isApiError(query.error) && query.error.status === 404
  const variation = data?.variation
  const open = variation?.status === 'sent' || variation?.status === 'question'
  // Which screen this address shows: Review for a draft or an edit being made, Status otherwise.
  const showing = !variation
    ? null
    : variation.status === 'draft'
      ? 'draft'
      : editing && open && sentAs !== variation.version
        ? 'edit'
        : 'status'
  // A send turns Review into Status at the same address, so no navigation resets the scroll:
  // start the new screen at its top, where its heading and callout are, and where the Sent
  // sheet's Done puts focus. Otherwise Dan lands mid-page with focus out of view. A switch that
  // comes with a navigation (Edit, Back) is ScrollRestoration's, which also restores on Back.
  const last = useRef({ showing, key: location.key })
  useLayoutEffect(() => {
    const before = last.current
    last.current = { showing, key: location.key }
    if (before.showing && showing && before.showing !== showing && before.key === location.key)
      window.scrollTo(0, 0)
  }, [showing, location.key])

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      placeholderFocused.current = (e.target as HTMLElement | null)?.id === PLACEHOLDER_ID
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])
  useLayoutEffect(() => {
    if (!data || !placeholderFocused.current) return
    placeholderFocused.current = false
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
  }, [data])

  if (missing) return <VariationMissing />
  if (!data) {
    return (
      <VariationLoading
        failed={query.isError}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const v = data.variation
  // D77: she answered the version she had while Dan was editing; his edits weren't sent.
  const collision = editing && (v.status === 'approved' || v.status === 'declined')

  return (
    <>
      {showing === 'draft' ? (
        <ReviewScreen data={data} onSent={() => openSheet('send')} />
      ) : showing === 'edit' ? (
        <ReviewScreen
          key="update"
          data={data}
          mode="update"
          onSent={(res) => {
            setSentAs(res.variation.version)
            openSheet('send')
          }}
          onLeave={leaveEdit}
        />
      ) : (
        <StatusScreen
          data={data}
          onShare={() => openSheet('share')}
          onEdit={startEdit}
          collision={collision}
          headingRef={statusHeading}
        />
      )}
      {data.share ? (
        <SentSheet
          open={sheetOpen}
          onDone={() => {
            setSheetOpen(false)
            if (editing) void navigate(statusPath, { replace: true })
          }}
          data={data}
          share={data.share}
          finalFocus={openedBy === 'send' ? statusHeading : undefined}
        />
      ) : null}
    </>
  )
}

const PLACEHOLDER_ID = 'variation-loading-title'

function VariationLoading({
  failed,
  retrying,
  onRetry,
}: {
  failed: boolean
  retrying: boolean
  onRetry: () => void
}) {
  usePageTitle('Change: Nod')
  const shown = useDelayed()
  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader floating left={<BackLink to="/" label="Jobs" />} />
      <main className="page page-builder">
        <h1 id={PLACEHOLDER_ID} tabIndex={-1} className="visually-hidden">
          {failed ? 'This change didn’t load' : 'Loading the change'}
        </h1>
        {failed ? (
          <LoadError
            message="Nod couldn’t load this change."
            retrying={retrying}
            onRetry={onRetry}
          />
        ) : shown ? (
          <div className="variation-skeleton" aria-hidden="true">
            <Skeleton height={34} width="62%" />
            <Skeleton height={20} width="80%" />
            <Skeleton height={180} radius={24} />
            <Skeleton height={140} radius={24} />
          </div>
        ) : null}
      </main>
    </div>
  )
}

/** Deleted, or a reset gave every change a new id. */
function VariationMissing() {
  usePageTitle('Change not found: Nod')
  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader floating left={<BackLink to="/" label="Jobs" />} />
      <main className="page page-builder full-state">
        <span className="state-mark" aria-hidden="true">
          <FileQuestion size={30} strokeWidth={2} />
        </span>
        <h1 tabIndex={-1} className="t-title-1">
          This change isn’t here
        </h1>
        <p>It may have been deleted. Resetting the demo data also replaces every change.</p>
        <ButtonLink variant="primary" size={56} block to="/">
          Back to your jobs
        </ButtonLink>
      </main>
    </div>
  )
}
