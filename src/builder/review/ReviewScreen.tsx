// Review (/v/:id while it's a draft; ux-spec 4): check what Nod drafted, fill the gaps, see what
// Sarah will read, sign and send. Dan edits a working copy on the screen; it autosaves in small
// patches, and the checklist and Sarah's card run on it live. Every save pokes the app, so the
// data refetches, but the copy on screen is never reset under Dan's thumbs.
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CloudAlert,
  CloudCheck,
  Ellipsis,
  Eye,
  LoaderCircle,
  Lock,
  NotebookText,
  SendHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { builder } from '../../../shared/copy.ts'
import { formatMoney, hasCents } from '../../../shared/money.ts'
import { ownerCard } from '../../../shared/owner.ts'
import { evaluate } from '../../../shared/rules/evaluate.ts'
import type { Check, Evaluation, FieldId } from '../../../shared/rules/types.ts'
import type { SendResponse, VariationPatch, VariationResponse } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { api, isApiError } from '../../lib/api.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Callout } from '../../ui/Callout.tsx'
import { Checklist } from '../../ui/Checklist.tsx'
import { cx } from '../../ui/cx.ts'
import { MenuItem } from '../../ui/MenuItem.tsx'
import { ConfirmSheet, Sheet } from '../../ui/Sheet.tsx'
import { useToasts } from '../../ui/toastContext.ts'
import { usePhotoUrl } from '../../ui/usePhotoUrl.ts'
import { usePageTitle } from '../../ui/usePageTitle.ts'
import { ActionBar, AppHeader, BackLink } from '../AppHeader.tsx'
import { backTo, cameFrom } from '../nav.ts'
import { PreparedNote } from '../PreparedNote.tsx'
import { variationKey } from '../queries.ts'
import { commitDelete, holdDelete, undoDelete } from './pendingDelete.ts'
import {
  PaymentSection,
  PriceSection,
  TimeSection,
  VicSection,
  WhatSection,
  WhoWhySection,
} from './ReviewSections.tsx'
import { useAutosave, type SaveState } from './useAutosave.ts'
import { PhotoSection } from './PhotoSection.tsx'
import { WhatSarahSees, type PreviewMode } from './WhatSarahSees.tsx'
import {
  draftInputOf,
  hasCheck,
  ownerContentOf,
  savedItems,
  workingFrom,
  type Working,
} from './working.ts'

/** Which checklist field an edit touches (the same map the data layer uses, D64 and D65). */
const FIELD_OF: Partial<Record<keyof Working, FieldId>> = {
  title: 'description',
  items: 'description',
  requested_by: 'requested_by',
  reason: 'reason',
  price_cents: 'price',
  price_method: 'price_method',
  delay_days: 'delay',
  payment_timing: 'payment',
  date_requested: 'date_requested',
  permit_change: 'permit',
  work_effect: 'work_effect',
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ReviewScreen({
  data,
  onSent,
  mode = 'draft',
  onLeave,
}: {
  data: VariationResponse
  onSent: (res: SendResponse) => void
  /** `update`: editing a change Sarah already has (ux-spec 6, Edit after sending). */
  mode?: 'draft' | 'update'
  /** Update mode: back to the change's Status (after Discard, or a refused update). */
  onLeave?: () => void
}) {
  const { variation: v, job } = data
  const first = job.client_first_name
  const jobPath = `/job/${job.id}`
  const update = mode === 'update'
  const name = builder.variationName(v.number)
  usePageTitle(update ? `Edit ${name}: Nod` : 'Draft: Nod')

  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { show } = useToasts()

  const [w, setW] = useState<Working>(() => workingFrom(v))
  const [touched, setTouched] = useState<ReadonlySet<FieldId>>(() => new Set())
  const [attempted, setAttempted] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewMode | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const autosave = useAutosave(v.id, (error) => setSaveError(error.message))
  const queueSave = autosave.queue

  const evaluation = useMemo(
    () => evaluate(draftInputOf(w, v.photo_id), data.rule_context, first),
    [w, v.photo_id, data.rule_context, first],
  )

  const set = useCallback(
    (patch: Partial<Working>) => {
      setW((prev) => ({ ...prev, ...patch }))
      setTouched((prev) => {
        const next = new Set(prev)
        for (const key of Object.keys(patch) as (keyof Working)[]) {
          const field = FIELD_OF[key]
          if (field) next.add(field)
        }
        return next
      })
      const save: VariationPatch = { ...patch }
      if (patch.items) save.items = savedItems(patch.items)
      queueSave(save)
      setSendError(null)
    },
    [queueSave],
  )

  useReadyAnnouncement(evaluation)

  // ---- Moving Dan to a field (a checklist gap, a blocked Send, a refused send) ----------------
  const goTo = useCallback(
    (field: FieldId | null) => {
      if (!field) return
      const key = field === 'description' && w.title.trim() ? 'description-items' : field
      const box = document.querySelector(`[data-field="${key}"]`)
      const target = box?.querySelector<HTMLElement>('input, textarea, button')
      if (!target) return
      target.focus({ preventScroll: true })
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      box?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
    },
    [w.title],
  )

  // ---- The note it came from, with the words a source line points at (D64) ------------------
  const [noteOpen, setNoteOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const showQuote = useCallback((quote: string) => {
    setNoteOpen(true)
    setHighlight(quote)
    requestAnimationFrame(() => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      noteRef.current?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' })
      noteRef.current?.focus({ preventScroll: true })
    })
  }, [])

  // ---- Leaving: back to the job (a real Back when we came from it) --------------------------
  const leaveToJob = () => {
    if (cameFrom(location.state, jobPath)) void navigate(-1)
    else void navigate(jobPath, { replace: true })
  }

  const deleteDraft = () => {
    setMenuOpen(false)
    holdDelete(v.id)
    leaveToJob()
    show('Draft deleted.', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          undoDelete(v.id)
          const onJob = window.location.pathname === jobPath
          void navigate(`/v/${v.id}`, { state: onJob ? backTo(jobPath) : undefined })
        },
      },
      onEnd: (how) => {
        if (how !== 'action') void commitDelete(v.id)
      },
    })
  }

  // ---- Update mode: throw the edits away (Sarah keeps what she has) -------------------------------
  const [discarding, setDiscarding] = useState(false)
  const [discardPending, setDiscardPending] = useState(false)
  const discard = async () => {
    setDiscardPending(true)
    try {
      await autosave.flush()
      const { variation } = await api.discardEdits(v.id)
      queryClient.setQueryData<VariationResponse>(variationKey(v.id), (old) =>
        old ? { ...old, variation } : old,
      )
      setDiscarding(false)
      show(`Changes discarded. ${first} still has version ${v.version}.`)
      onLeave?.()
    } catch {
      setDiscardPending(false)
      announce('That didn’t go through. Your edits are still here. Try again.')
    }
  }

  // ---- Sending (never optimistic, D42) --------------------------------------------------------
  const failedToSend = `That didn’t send. ${first} hasn’t received anything. Try again.`
  const send = async () => {
    setSending(true)
    setSendError(null)
    try {
      // Sarah gets exactly what's on screen: everything typed is saved first.
      if (!(await autosave.flush())) throw new Error('unsaved')
      const res = await api.send(v.id, v.version)
      queryClient.setQueryData<VariationResponse>(variationKey(v.id), (old) =>
        old ? { ...old, variation: res.variation, share: res.share } : old,
      )
      onSent(res)
    } catch (e) {
      setSending(false)
      if (isApiError(e) && e.code === 'incomplete') {
        // The rules ran again on the saved copy and disagree: take Dan to what's missing.
        const gaps = (e.body?.gaps as Check[] | undefined) ?? []
        setAttempted(true)
        setSendError(e.message)
        goTo(gaps[0]?.field ?? evaluation.first_gap?.field ?? null)
        return
      }
      let message =
        isApiError(e) && (e.code === 'changed' || e.code === 'locked' || e.code === 'invalid')
          ? e.message
          : failedToSend
      if (update && isApiError(e) && e.code === 'locked') {
        // D77: she answered the old version while Dan was editing.
        message = `${first} answered version ${v.version} while you were editing. Your edits weren’t sent. Record a new change for anything else.`
      }
      setSendError(message)
      announce(message)
      if (isApiError(e)) void queryClient.invalidateQueries({ queryKey: variationKey(v.id) })
    }
  }

  // ---- Sarah's card, live -------------------------------------------------------------------
  const card = useMemo(
    () =>
      ownerCard({
        content: ownerContentOf(w, v.photo_id),
        number: data.owner_card.number,
        job: { title: job.title, client_first_name: first, state: job.state },
        builder: data.builder,
        total_before_cents: data.owner_card.totals.before_cents,
      }),
    [w, v.photo_id, data.owner_card, data.builder, job.title, job.state, first],
  )

  const photoUrl = usePhotoUrl(v.photo_id, api.photo)
  const firstLine = honestFirstLine(data)
  const spotted = !update && v.ai && !v.ai.explicit ? v.ai.detected_because : null
  // Update mode: an update with nothing new would be refused, so Send says so first.
  const nothingNew = update && !v.has_pending_edits
  const canSend = evaluation.can_send && !nothingNew
  const blockedReason = nothingNew
    ? 'Nothing has changed yet. Edit something, then send the update.'
    : evaluation.blocked_reason
  const props = {
    w,
    set,
    job,
    // Nod's notes and "From your note" tags belong to the first draft, not to an edit later.
    ai: update ? null : v.ai,
    touched,
    evaluation,
    attempted,
    onShowQuote: showQuote,
  }
  const reasonId = useId()

  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader
        floating
        left={
          update ? (
            <BackLink to={`/v/${v.id}`} label={name} />
          ) : (
            <BackLink to={jobPath} label={job.title} />
          )
        }
        right={
          <>
            <SaveStatus state={autosave.state} />
            <IconButton
              ref={menuButton}
              className="header-round"
              aria-haspopup="dialog"
              label={update ? 'Edit menu' : 'Draft menu'}
              icon={<Ellipsis size={24} strokeWidth={2.25} aria-hidden="true" />}
              onClick={() => setMenuOpen(true)}
            />
          </>
        }
      />
      <main className="page page-builder review">
        {update ? (
          <div className="page-head">
            <p className="kicker">
              {name}
              <span className="pill pill-wait">Editing</span>
            </p>
            <h1 tabIndex={-1} className="t-title-1">
              Edit {name}
            </h1>
          </div>
        ) : (
          <div className="page-head">
            <p className="kicker">
              <span className="pill pill-neutral">Draft</span>
            </p>
            <h1 tabIndex={-1} className="t-title-1">
              Check the draft
            </h1>
            <p className="lede">{firstLine}</p>
            {v.ai?.prepared ? <PreparedNote>{builder.preparedDraft}</PreparedNote> : null}
          </div>
        )}
        {update ? (
          <Callout tone="wait">
            Editing {name}. {first} still sees version {v.version} until you send the update.
          </Callout>
        ) : null}
        {!update && v.revises_id ? (
          <Callout tone="neutral">
            A new version of a change {first} said no to. When you send it, {first}’s page says it
            replaces the old one.
          </Callout>
        ) : null}

        {saveError ? (
          <Callout tone="stop" title="Not saved">
            {saveError}
          </Callout>
        ) : null}
        {spotted ? (
          <Callout
            tone="ask"
            action={
              <Button variant="outline" size={48} onClick={deleteDraft}>
                Delete draft
              </Button>
            }
          >
            Nod spotted this in your note: {lowerFirst(spotted.replace(/\.\s*$/, ''))}. If it isn’t
            a change, delete it.
          </Callout>
        ) : null}
        {!update && v.ai?.site_note ? (
          <Callout tone="neutral">Also in your note, not a change: {v.ai.site_note}</Callout>
        ) : null}

        {v.transcript ? (
          <NoteCard
            text={v.transcript}
            open={noteOpen}
            onToggle={() => {
              setNoteOpen((o) => !o)
              setHighlight(null)
            }}
            highlight={highlight}
            noteRef={noteRef}
          />
        ) : null}

        <WhatSection
          {...props}
          flag={
            v.owner_wording_stale ? (
              <Callout
                tone="wait"
                action={
                  <Button variant="outline" size={48} onClick={() => setPreview('edit')}>
                    Check {first}’s wording
                  </Button>
                }
              >
                You changed the trade wording. Check what {first} will read.
              </Callout>
            ) : null
          }
        />
        <WhoWhySection {...props} />
        <PriceSection {...props} />
        <TimeSection {...props} today={data.rule_context.today} />
        {hasCheck(evaluation, 'payment') ? <PaymentSection {...props} /> : null}
        {job.state === 'VIC' ? <VicSection {...props} /> : null}
        <PhotoSection
          variation={v}
          state={job.state}
          onChanged={(next) =>
            queryClient.setQueryData<VariationResponse>(variationKey(v.id), (old) =>
              old ? { ...old, variation: next } : old,
            )
          }
        />

        <Checklist evaluation={evaluation} onGoTo={goTo} />
        <Impact data={data} price={w.price_cents} firstName={first} />

        {update ? (
          <Button
            variant="text"
            size={48}
            className="delete-draft"
            icon={<Undo2 size={20} strokeWidth={2.25} aria-hidden="true" />}
            aria-haspopup="dialog"
            onClick={() => setDiscarding(true)}
          >
            Discard changes
          </Button>
        ) : (
          <Button
            variant="text"
            size={48}
            className="delete-draft"
            icon={<Trash2 size={20} strokeWidth={2.25} aria-hidden="true" />}
            onClick={deleteDraft}
          >
            Delete draft
          </Button>
        )}
      </main>

      <ActionBar>
        <div className="send-bar">
          {sendError ? (
            <p className="send-bar-error">
              <CircleAlert size={18} strokeWidth={2.5} aria-hidden="true" />
              <span>{sendError}</span>
            </p>
          ) : null}
          {canSend ? (
            <p id={reasonId} className="send-bar-note">
              Sending signs this for {data.builder.business}.
            </p>
          ) : (
            <p id={reasonId} className="send-bar-note is-blocked">
              {blockedReason}
            </p>
          )}
          <div className={cx('send-bar-actions', update && 'is-long')}>
            <Button
              variant="outline"
              size={56}
              className="send-bar-preview"
              icon={<Eye size={22} strokeWidth={2.25} aria-hidden="true" />}
              onClick={() => setPreview('view')}
            >
              What {first} sees
            </Button>
            <Button
              variant="primary"
              size={56}
              className="send-bar-send"
              blocked={!canSend}
              pending={sending}
              aria-describedby={reasonId}
              icon={
                canSend ? (
                  <SendHorizontal size={20} strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  <Lock size={20} strokeWidth={2.25} aria-hidden="true" />
                )
              }
              onBlockedPress={() => {
                if (nothingNew && evaluation.can_send) return goTo('description')
                setAttempted(true)
                goTo(evaluation.first_gap?.field ?? null)
              }}
              onClick={() => void send()}
            >
              {sending ? 'Sending' : update ? `Send update to ${first}` : `Send to ${first}`}
            </Button>
          </div>
        </div>
      </ActionBar>

      <WhatSarahSees
        mode={preview}
        onClose={() => setPreview(null)}
        onEdit={() => setPreview('edit')}
        onDone={() => {
          queueSave({ owner_wording_checked: true })
          setPreview('view')
        }}
        card={card}
        photoUrl={photoUrl}
        w={w}
        set={set}
        firstName={first}
      />

      <ConfirmSheet
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        consequence={`${first} keeps seeing version ${v.version}, and your edits since then are thrown away.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        pending={discardPending}
        onConfirm={() => void discard()}
      />

      <Sheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={update ? `Editing ${name}` : 'Draft'}
        finalFocus={menuButton}
      >
        <ul className="menu-list">
          <li>
            <MenuItem
              icon={<Eye size={20} strokeWidth={2.25} />}
              label={`What ${first} sees`}
              hint={`${first}’s card, exactly as it will look.`}
              onClick={() => {
                setMenuOpen(false)
                setPreview('view')
              }}
            />
          </li>
          <li>
            {update ? (
              <MenuItem
                danger
                icon={<Undo2 size={20} strokeWidth={2.25} />}
                label="Discard changes"
                hint={`${first} keeps version ${v.version}.`}
                onClick={() => {
                  setMenuOpen(false)
                  setDiscarding(true)
                }}
              />
            ) : (
              <MenuItem
                danger
                icon={<Trash2 size={20} strokeWidth={2.25} />}
                label="Delete draft"
                hint="You’ll have 5 seconds to undo."
                onClick={deleteDraft}
              />
            )}
          </li>
        </ul>
      </Sheet>
    </div>
  )
}

/** The honest first line (C8): what Nod did, or that Dan is filling it in himself. */
function honestFirstLine({ variation: v }: VariationResponse): string {
  if (v.source === 'manual' || !v.ai) return 'You’re filling this one in by hand.'
  const changes = plural(v.ai.found_changes, 'change', 'changes')
  return v.ai.site_note
    ? `Nod found ${changes} and a site note in your note.`
    : `Nod found ${changes} in your note.`
}

/** "Saved" · "Saving…" · "Not saved. Retrying" (the hook announces the last one, once). */
function SaveStatus({ state }: { state: SaveState }) {
  const failing = state === 'retrying' || state === 'failed'
  return (
    <span className={cx('save-status', failing && 'is-failing')}>
      {state === 'saving' ? (
        <LoaderCircle className="save-spin" size={16} strokeWidth={2.5} aria-hidden="true" />
      ) : failing ? (
        <CloudAlert size={16} strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <CloudCheck size={16} strokeWidth={2.5} aria-hidden="true" />
      )}
      <span className="save-words">
        {state === 'saving'
          ? 'Saving…'
          : state === 'retrying'
            ? 'Not saved. Retrying'
            : state === 'failed'
              ? 'Not saved'
              : 'Saved'}
      </span>
    </span>
  )
}

/** "If Sarah approves: $48,950 → $49,170" (the arrow is read as "to"). */
function Impact({
  data,
  price,
  firstName,
}: {
  data: VariationResponse
  price: number | null
  firstName: string
}) {
  const before = data.rule_context.total_now_cents
  if (price === null) {
    return (
      <section className="card impact" aria-label="If approved">
        <p className="impact-label">If {firstName} approves</p>
        <p className="impact-empty">Add a price to see the new total.</p>
      </section>
    )
  }
  const after = before + price
  const options = { cents: hasCents([before, after]) }
  return (
    <section className="card impact" aria-label="If approved">
      <p className="impact-label">If {firstName} approves</p>
      <p className="impact-figures">
        <span className="impact-before">{formatMoney(before, options)}</span>
        <ArrowRight className="impact-arrow" size={22} strokeWidth={2.25} aria-hidden="true" />
        <span className="visually-hidden"> to </span>
        <span className="impact-after">{formatMoney(after, options)}</span>
      </p>
    </section>
  )
}

/** Dan's note, folded away; a source line opens it with the quoted words marked (D64). */
function NoteCard({
  text,
  open,
  onToggle,
  highlight,
  noteRef,
}: {
  text: string
  open: boolean
  onToggle: () => void
  highlight: string | null
  noteRef: RefObject<HTMLDivElement | null>
}) {
  const id = useId()
  return (
    <section className="card note-card">
      <button
        type="button"
        className="note-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="note-toggle-icon" aria-hidden="true">
          <NotebookText size={20} strokeWidth={2.25} />
        </span>
        <span className="note-toggle-label">Your note</span>
        <ChevronDown className="note-chevron" size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open}>
        <div ref={noteRef} className="note-text" tabIndex={-1}>
          <Highlighted text={text} quote={highlight} />
        </div>
      </div>
    </section>
  )
}

function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  if (!quote) return <>{text}</>
  const at = text.toLowerCase().indexOf(quote.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + quote.length)}</mark>
      {text.slice(at + quote.length)}
    </>
  )
}

/**
 * "Ready to send" or "1 thing to do before you can send", announced about a second after it
 * changes (D17, D59), once, and never on arrival. The timer makes StrictMode's double effect
 * harmless: the first run's timer is cleared before it fires.
 */
function useReadyAnnouncement(evaluation: Evaluation) {
  const said = useRef(evaluation.summary)
  const summary = evaluation.summary
  useEffect(() => {
    if (said.current === summary) return
    const timer = setTimeout(() => {
      said.current = summary
      announce(summary)
    }, 1000)
    return () => clearTimeout(timer)
  }, [summary])
}
