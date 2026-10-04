// Record (/job/:id/new; ux-spec 3): say or type the change in under a minute, on a noisy site,
// with one hand. The note is saved on this phone as Dan goes, so nothing he says is ever lost:
// not to a dropped call, a locked screen, a failed AI call or a closed tab. Then Nod drafts it:
// one change opens Review, several go back to the job, none says "Nothing to sign here".
import {
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  CloudCheck,
  FileX2,
  Lock,
  Mic,
  Sparkles,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router'
import { SAMPLE_NOTES, sampleNote, type SampleNoteId } from '../../../shared/ai/samples.ts'
import { builder } from '../../../shared/copy.ts'
import { STATE_NAME, type StateCode } from '../../../shared/states.ts'
import { formatShortTime } from '../../../shared/time.ts'
import type { AiUnavailableReason, NotesResponse } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { api, isApiError } from '../../lib/api.ts'
import { useOnline } from '../../lib/online.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Callout } from '../../ui/Callout.tsx'
import { cx } from '../../ui/cx.ts'
import { TextArea } from '../../ui/Field.tsx'
import { MicButton } from '../../ui/MicButton.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { useToasts } from '../../ui/toastContext.ts'
import { useDelayed } from '../../ui/useDelayed.ts'
import { usePageTitle } from '../../ui/usePageTitle.ts'
import { ActionBar, AppHeader } from '../AppHeader.tsx'
import { JobMissing } from '../JobScreen.tsx'
import { backTo, cameFrom } from '../nav.ts'
import { PreparedNote } from '../PreparedNote.tsx'
import { useCachedJobSummary, useJob } from '../queries.ts'
import { setJobFlash } from './jobFlash.ts'
import { forgetNote, readNote, writeNote } from './noteStore.ts'
import { inAppBrowser } from './speech.ts'
import { appendDictation } from './speechText.ts'
import { useSpeech } from './useSpeech.ts'
import { voiceLines } from './voiceCopy.ts'

type Failure = {
  message: string
  tone: 'neutral' | 'stop'
  /** "Try again" makes sense (not for the daily limit, the demo, or a note that's too long). */
  retry: boolean
  /** The demo drafts only the sample notes (D95): offer them in place of "Try again". */
  samples?: boolean
}

type Phase =
  | { kind: 'compose'; failure: Failure | null }
  | { kind: 'drafting' }
  | { kind: 'nothing'; reason: string | null; siteNote: string | null; prepared: boolean }

const EMPTY_REASON = 'Say or type what’s changing first.'
const OFFLINE_REASON =
  'No signal. Your note is saved on this phone. Try again when you’re back online.'
const DIDNT_GO = 'That didn’t go through. Your note is saved. Try again.'

function failureOf(e: unknown): Failure {
  if (isApiError(e)) {
    if (e.code === 'ai_unavailable') {
      const reason = (e.body?.reason ?? 'down') as AiUnavailableReason
      // Trying again can't help with the daily limit, or with a note the demo has no draft for.
      if (reason === 'demo')
        return { message: e.message, tone: 'neutral', retry: false, samples: true }
      return { message: e.message, tone: 'neutral', retry: reason !== 'limit' }
    }
    if (e.code === 'network') return { message: OFFLINE_REASON, tone: 'stop', retry: true }
    if (e.code === 'invalid') return { message: e.message, tone: 'stop', retry: false }
  }
  return { message: DIDNT_GO, tone: 'stop', retry: true }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function RecordScreen() {
  const { id: jobId = '' } = useParams()
  usePageTitle('Record a change: Nod')
  const query = useJob(jobId)
  const cached = useCachedJobSummary(jobId)
  const job = query.data?.job
  const first = job?.client_first_name ?? cached?.client_first_name ?? null
  const title = job?.title ?? cached?.title ?? null
  const state: StateCode | null = job?.state ?? cached?.state ?? null
  const jobPath = `/job/${jobId}`

  const navigate = useNavigate()
  const location = useLocation()
  const { show } = useToasts()
  const online = useOnline()

  // ---- The note, saved on this phone as Dan goes ----------------------------------------------
  const [restored] = useState(() => readNote(jobId))
  const [note, setNote] = useState(restored?.text ?? '')
  const [showRestored, setShowRestored] = useState(restored !== null)
  const [savedHere, setSavedHere] = useState(true)
  const noteRef = useRef(note)
  const noteField = useRef<HTMLTextAreaElement>(null)
  const noteHintId = useId()
  const changeNote = useCallback(
    (next: string) => {
      noteRef.current = next
      setNote(next)
      setSavedHere(writeNote(jobId, next))
    },
    [jobId],
  )

  const speech = useSpeech((chunk) => changeNote(appendDictation(noteRef.current, chunk)))
  const speaking = ['requesting', 'listening', 'stopping'].includes(speech.state.status)

  const [phase, setPhase] = useState<Phase>({ kind: 'compose', failure: null })
  const [handPending, setHandPending] = useState(false)
  const inflight = useRef<{ controller: AbortController; promise: Promise<NotesResponse> } | null>(
    null,
  )
  useEffect(() => () => inflight.current?.controller.abort(), [])

  const leaveToJob = useCallback(() => {
    if (cameFrom(location.state, jobPath)) void navigate(-1)
    else void navigate(jobPath, { replace: true })
  }, [location.state, jobPath, navigate])

  // ---- Where a reply goes (ux-spec 3, Results) ------------------------------------------------
  const route = useCallback(
    (res: NotesResponse) => {
      forgetNote(jobId)
      if (res.drafts.length === 1) {
        void navigate(`/v/${res.drafts[0].id}`, { replace: true, state: backTo(jobPath) })
      } else if (res.drafts.length > 1) {
        setJobFlash(jobId, { newDrafts: res.drafts.map((d) => d.id), prepared: res.prepared })
        announce(
          `Nod split your note into ${res.drafts.length} changes, so ${first ?? 'your client'} can say yes to one and not the other.${res.prepared ? ` ${builder.preparedDrafts}` : ''}`,
        )
        leaveToJob()
      } else {
        setPhase({
          kind: 'nothing',
          reason: res.no_change_reason,
          siteNote: res.site_note,
          prepared: res.prepared,
        })
      }
    },
    [jobId, jobPath, navigate, leaveToJob, first],
  )

  const draft = () => {
    speech.stop()
    const controller = new AbortController()
    const promise = api.notes(jobId, noteRef.current, { signal: controller.signal })
    inflight.current = { controller, promise }
    setPhase({ kind: 'drafting' })
    promise.then(
      (res) => {
        if (inflight.current?.promise !== promise) return
        inflight.current = null
        route(res)
      },
      (e: unknown) => {
        if (inflight.current?.promise !== promise) return
        inflight.current = null
        if (isAbort(e)) return
        setPhase({ kind: 'compose', failure: failureOf(e) })
      },
    )
  }

  /** "Fill it in by hand": an empty draft with the note attached. If the AI's draft lands
   *  first, that's used instead (D66). */
  const fillByHand = async () => {
    setHandPending(true)
    const running = inflight.current
    inflight.current = null
    if (running) {
      running.controller.abort()
      const landed = await running.promise.catch(() => null)
      if (landed && landed.drafts.length) return route(landed)
    }
    try {
      const { variation } = await api.createDraft(jobId, noteRef.current)
      forgetNote(jobId)
      void navigate(`/v/${variation.id}`, { replace: true, state: backTo(jobPath) })
    } catch {
      setHandPending(false)
      setPhase({ kind: 'compose', failure: { message: DIDNT_GO, tone: 'stop', retry: true } })
    }
  }

  // ---- Samples, and clearing a restored note (both undoable) ----------------------------------
  const [samplesOpen, setSamplesOpen] = useState(false)
  const samplesList = useRef<HTMLDivElement>(null)
  /** Open the samples with the whole list in view: it opens just above the dock, so it would
   *  otherwise open out of sight. The demo's way forward (D95) also moves to the first. */
  const openSamples = ({ focusFirst }: { focusFirst: boolean }) => {
    flushSync(() => setSamplesOpen(true))
    const list = samplesList.current
    if (!list) return
    if (focusFirst) list.querySelector('button')?.focus({ preventScroll: true })
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }

  const pickSample = (id: SampleNoteId) => {
    if (!first) return
    speech.stop()
    const previous = noteRef.current
    changeNote(sampleNote(id, first))
    setShowRestored(false)
    // A sample is what the demo's message asked for, so the message has done its job.
    setPhase((p) => (p.kind === 'compose' && p.failure?.samples ? { ...p, failure: null } : p))
    if (previous.trim())
      show('Sample note added.', {
        action: { label: 'Undo', onClick: () => changeNote(previous) },
      })
    else announce('Sample note added.')
  }

  const clearRestored = () => {
    const previous = noteRef.current
    changeNote('')
    setShowRestored(false)
    noteField.current?.focus()
    show('Note cleared.', { action: { label: 'Undo', onClick: () => changeNote(previous) } })
  }

  // ---- Focus follows the phase -----------------------------------------------------------------
  const failureRef = useRef<HTMLDivElement>(null)
  const phaseHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (phase.kind === 'compose') failureRef.current?.focus()
    else phaseHeading.current?.focus()
  }, [phase])

  if (isApiError(query.error) && query.error.status === 404) return <JobMissing />

  const empty = !note.trim()
  const blockedReason = empty ? EMPTY_REASON : !online ? OFFLINE_REASON : null

  return (
    <div className="screen screen-glow screen-glow-soft record">
      <AppHeader
        floating
        left={
          <div className="record-head">
            <IconButton
              className="header-round"
              label="Close"
              icon={<X size={24} strokeWidth={2.25} aria-hidden="true" />}
              onClick={leaveToJob}
            />
            <span className="record-head-text">
              <span className="record-head-title">Record a change</span>
              {first && title ? (
                <span className="record-head-sub">
                  {first}’s {title.toLowerCase()}
                </span>
              ) : null}
            </span>
          </div>
        }
      />
      <main className="page page-builder">
        {phase.kind === 'drafting' ? (
          <DraftingView
            headingRef={phaseHeading}
            firstName={first}
            state={state}
            onHand={() => void fillByHand()}
            handPending={handPending}
          />
        ) : phase.kind === 'nothing' ? (
          <NothingView
            headingRef={phaseHeading}
            reason={phase.reason}
            siteNote={phase.siteNote}
            prepared={phase.prepared}
            onHand={() => void fillByHand()}
            handPending={handPending}
            onBack={leaveToJob}
          />
        ) : (
          <>
            <div className="page-head">
              <h1 tabIndex={-1} className="t-title-1">
                What’s changing?
              </h1>
              <ul className="say-hints" aria-label="Try to cover">
                <li>
                  <ClipboardList size={14} strokeWidth={2.5} aria-hidden="true" />
                  What’s changing
                </li>
                <li>
                  <UsersRound size={14} strokeWidth={2.5} aria-hidden="true" />
                  Who asked and why
                </li>
                <li>
                  <CircleDollarSign size={14} strokeWidth={2.5} aria-hidden="true" />
                  Your price
                </li>
                <li>
                  <CalendarClock size={14} strokeWidth={2.5} aria-hidden="true" />
                  Any extra days
                </li>
              </ul>
            </div>

            {phase.failure ? (
              <div ref={failureRef} tabIndex={-1} className="record-failure">
                <Callout
                  tone={phase.failure.tone}
                  title={phase.failure.message}
                  action={
                    <div className="callout-buttons">
                      <Button
                        variant="primary"
                        size={48}
                        pending={handPending}
                        onClick={() => void fillByHand()}
                      >
                        Fill it in by hand
                      </Button>
                      {phase.failure.retry ? (
                        <Button
                          variant="outline"
                          size={48}
                          blocked={!online}
                          onBlockedPress={() => announce(OFFLINE_REASON)}
                          onClick={draft}
                        >
                          Try again
                        </Button>
                      ) : phase.failure.samples && first ? (
                        <Button
                          variant="outline"
                          size={48}
                          onClick={() => openSamples({ focusFirst: true })}
                        >
                          Show the sample notes
                        </Button>
                      ) : null}
                    </div>
                  }
                />
              </div>
            ) : null}

            {showRestored && restored && state ? (
              <Callout
                tone="neutral"
                action={
                  <Button variant="outline" size={48} onClick={clearRestored}>
                    Clear it
                  </Button>
                }
              >
                Your unsent note from {formatShortTime(new Date(restored.savedAt), state)} is back.
              </Callout>
            ) : null}

            <div className="note-field">
              <TextArea
                ref={noteField}
                label="Your note"
                aria-describedby={noteHintId}
                value={note}
                rows={5}
                spellCheck
                className="note-input"
                onBeforeInput={() => {
                  // Talk or type, one at a time: typing stops the mic (research/speech.md 2.6).
                  if (speaking) speech.stop()
                }}
                onChange={(e) => {
                  changeNote(e.target.value)
                  if (showRestored && !e.target.value.trim()) setShowRestored(false)
                }}
              />
              {speech.interim ? <p className="note-interim">{speech.interim}</p> : null}
              <p id={noteHintId} className="field-hint">
                Noisy site? Fix any words before Nod reads it.
              </p>
              {!empty && savedHere ? (
                <p className="note-saved">
                  <CloudCheck size={16} strokeWidth={2.5} aria-hidden="true" />
                  Saved on this phone
                </p>
              ) : null}
            </div>

            {first ? (
              <Samples
                open={samplesOpen}
                onToggle={() =>
                  samplesOpen ? setSamplesOpen(false) : openSamples({ focusFirst: false })
                }
                listRef={samplesList}
                onPick={pickSample}
              />
            ) : null}
          </>
        )}
      </main>

      {phase.kind === 'compose' ? (
        <ActionBar>
          <Dock
            speech={speech}
            speaking={speaking}
            empty={empty}
            online={online}
            quiet={phase.failure !== null}
            blockedReason={blockedReason}
            onDraft={draft}
            onBlocked={() => {
              if (empty) noteField.current?.focus()
              else announce(OFFLINE_REASON)
            }}
          />
        </ActionBar>
      ) : null}
    </div>
  )
}

// ---- The bottom area, adapting to the note (D49) -------------------------------------------------

function Dock({
  speech,
  speaking,
  empty,
  online,
  quiet,
  blockedReason,
  onDraft,
  onBlocked,
}: {
  speech: ReturnType<typeof useSpeech>
  speaking: boolean
  empty: boolean
  online: boolean
  /** A failure's own buttons are the way forward: Draft (its "Try again") steps back. */
  quiet: boolean
  blockedReason: string | null
  onDraft: () => void
  onBlocked: () => void
}) {
  const labelId = useId()
  const reasonId = useId()
  const { state, support } = speech
  const voice = state.status !== 'unsupported'
  const lines = voiceLines(state, {
    ios: support.ios,
    firstUse: speech.permission === 'prompt',
    offline: !online,
    inApp: inAppBrowser(),
    noSpeechAgain: speech.noSpeechAgain,
  })
  // A permission already refused: say so before the first tap (research/speech.md 2.7).
  const blockedMic = speech.permission === 'denied' && state.status === 'idle' && !state.note
  const shown = blockedMic
    ? voiceLines(
        { status: 'error', reason: 'not-allowed' },
        {
          ios: support.ios,
          firstUse: false,
          offline: !online,
          inApp: false,
          noSpeechAgain: false,
        },
      )
    : lines
  // With an empty note the mic is the one action (D49); Draft arrives with the first word. Where
  // voice can't work, there's no hero: Draft shows, blocked with its reason, from the start (D17).
  const hero = voice && !blockedMic && (empty || speaking)
  // "Tap to talk" is the mic's own label; other lines say what happened.
  const plainIdle = state.status === 'idle' && !state.note && !blockedMic

  const draftButton = (
    <Button
      variant={quiet ? 'outline' : 'primary'}
      size={56}
      block={!voice}
      className="record-draft"
      blocked={blockedReason !== null}
      aria-describedby={blockedReason ? reasonId : undefined}
      onBlockedPress={onBlocked}
      icon={
        blockedReason ? (
          <Lock size={20} strokeWidth={2.25} aria-hidden="true" />
        ) : (
          <WandSparkles size={20} strokeWidth={2.25} aria-hidden="true" />
        )
      }
      onClick={onDraft}
    >
      Draft the variation
    </Button>
  )

  if (hero) {
    return (
      <div className="record-dock is-hero">
        <div className="voice-stage">
          <MicButton
            listening={speaking}
            hearing={state.status === 'listening' && state.hearing}
            onPress={speech.toggle}
            labelledBy={labelId}
          />
          <p id={labelId} className="voice-label">
            {speaking ? 'Tap to stop' : 'Tap to talk'}
          </p>
          <VoiceStatus state={state} main={plainIdle ? null : shown.main} helper={shown.helper} />
        </div>
      </div>
    )
  }

  return (
    <div className="record-dock">
      {!plainIdle || !voice ? (
        <VoiceStatus state={state} main={shown.main} helper={shown.helper} />
      ) : null}
      {blockedReason ? (
        <p id={reasonId} className="send-bar-note is-blocked">
          {blockedReason}
        </p>
      ) : null}
      <div className="record-dock-row">
        {voice ? (
          <IconButton
            className="mic-small"
            label="Keep talking"
            icon={<Mic size={24} strokeWidth={2.25} aria-hidden="true" />}
            onClick={speech.toggle}
          />
        ) : null}
        {draftButton}
      </div>
    </div>
  )
}

/** The voice's state in words: "Listening 0:12", "Stopped after a quiet spell." */
function VoiceStatus({
  state,
  main,
  helper,
}: {
  state: ReturnType<typeof useSpeech>['state']
  main: string | null
  helper: string | null
}) {
  const listening = state.status === 'listening'
  if (!main && !helper) return null
  return (
    <div className={cx('voice-status', state.status === 'error' && 'is-error')}>
      {main ? (
        <p className="voice-main">
          {main}
          {listening ? <Elapsed /> : null}
        </p>
      ) : null}
      {state.status === 'requesting' ? (
        <StillWaiting />
      ) : helper ? (
        <p className="voice-helper">{helper}</p>
      ) : null}
    </div>
  )
}

/** "0:12": time since listening began. Visual only; nothing is announced while the mic is open. */
function Elapsed() {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const s = Math.floor((now - started) / 1000)
  return (
    <span className="voice-timer">
      {' '}
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

/** After 8 s of "Getting the mic ready": the permission prompt is probably waiting. */
function StillWaiting() {
  const [late, setLate] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  return late ? (
    <p className="voice-helper">Still waiting. Check for a prompt at the top of the screen.</p>
  ) : null
}

// ---- Samples ------------------------------------------------------------------------------------

function Samples({
  open,
  onToggle,
  listRef,
  onPick,
}: {
  open: boolean
  onToggle: () => void
  listRef: RefObject<HTMLDivElement | null>
  onPick: (id: SampleNoteId) => void
}) {
  const id = useId()
  return (
    <section className="samples">
      <button
        type="button"
        className="samples-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
        <span>Try a sample note</span>
        <ChevronDown className="samples-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div id={id} ref={listRef} className="samples-list" hidden={!open}>
        {SAMPLE_NOTES.map((s) => (
          <Button key={s.id} variant="outline" size={48} onClick={() => onPick(s.id)}>
            {s.label}
          </Button>
        ))}
      </div>
    </section>
  )
}

// ---- Drafting (D66) ------------------------------------------------------------------------------

function DraftingView({
  headingRef,
  firstName,
  state,
  onHand,
  handPending,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  firstName: string | null
  state: StateCode | null
  onHand: () => void
  handPending: boolean
}) {
  const lines = [
    'Reading your note…',
    'Pulling out the line items…',
    `Writing ${firstName ? `${firstName}’s` : 'your client’s'} version…`,
    `Checking the ${state ? STATE_NAME[state] : 'state'} rules…`,
  ]
  const [step, setStep] = useState(0)
  const [slow, setSlow] = useState(false)
  const shown = useDelayed()
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 3)), 1800)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlow(true)
      announce('This is taking longer than usual. Your note is saved.')
    }, 10_000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="drafting">
      <div className="page-head">
        <h1 ref={headingRef} tabIndex={-1} className="t-title-1">
          Drafting your variation
        </h1>
        <p className="lede">This can take a few seconds.</p>
      </div>
      <p className="drafting-step" key={step}>
        <span className="drafting-dot" aria-hidden="true" />
        {lines[step]}
      </p>
      {slow ? (
        <Callout
          tone="wait"
          title="This is taking longer than usual. Your note is saved."
          action={
            <Button variant="outline" size={48} pending={handPending} onClick={onHand}>
              Fill it in by hand
            </Button>
          }
        />
      ) : null}
      {shown ? (
        <div className="card drafting-card" aria-hidden="true">
          <Skeleton height={14} width="30%" />
          <Skeleton height={26} width="78%" />
          <Skeleton height={16} width="92%" />
          <Skeleton height={16} width="64%" />
          <div className="drafting-chips">
            <Skeleton height={36} width="30%" radius={999} />
            <Skeleton height={36} width="22%" radius={999} />
            <Skeleton height={36} width="38%" radius={999} />
          </div>
          <Skeleton height={56} radius={14} />
        </div>
      ) : null}
    </div>
  )
}

// ---- Nothing to sign (ux-spec 3, Results) ---------------------------------------------------------

function NothingView({
  headingRef,
  reason,
  siteNote,
  prepared,
  onHand,
  handPending,
  onBack,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  reason: string | null
  siteNote: string | null
  prepared: boolean
  onHand: () => void
  handPending: boolean
  onBack: () => void
}) {
  return (
    <div className="nothing">
      <div className="page-head">
        <span className="state-mark" aria-hidden="true">
          <FileX2 size={30} strokeWidth={2} />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="t-title-1">
          Nothing to sign here
        </h1>
        <p className="lede">{reason ?? 'Nod didn’t find a change to the job in your note.'}</p>
        {prepared ? <PreparedNote>{builder.preparedResult}</PreparedNote> : null}
      </div>
      {siteNote ? (
        <section className="card site-note" aria-labelledby="site-note-title">
          <h2 id="site-note-title" className="label-sm">
            Site note
          </h2>
          <p>{siteNote}</p>
        </section>
      ) : null}
      <div className="stack-actions">
        <Button variant="primary" size={56} block onClick={onBack}>
          Back to the job
        </Button>
        <Button variant="outline" size={56} block pending={handPending} onClick={onHand}>
          It is a change: fill it in by hand
        </Button>
      </div>
    </div>
  )
}
