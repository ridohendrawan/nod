// What used to be the API routes (architecture.md 4), now running in the browser against the
// local store (decisions.md D91). Each function returns the same response shape the screens
// already use, so the UI doesn't know the server has gone.
import { MAX_NOTE_CHARS } from '../../shared/ai/limits.ts'
import type { NotesRequest } from '../../shared/ai/schema.ts'
import { evaluate } from '../../shared/rules/evaluate.ts'
import { jobStatusLine, moneySummary } from '../../shared/summary.ts'
import { todayIn } from '../../shared/time.ts'
import type {
  DemoResponse,
  EventsResponse,
  FeedEvent,
  JobPatch,
  JobResponse,
  JobsResponse,
  Job,
  NotesApiResponse,
  NotesResponse,
  SendResponse,
  SessionResponse,
  Variation,
  VariationPatch,
  VariationResponse,
  VariationRow,
} from '../../shared/types.ts'
import { AI_DAILY_LIMIT, postNotes } from './ai.ts'
import { clearStore, deleteValue, getValue, putValue } from './db.ts'
import { aiUnavailable, invalid, isApiError, notFound } from './errors.ts'
import { freshDoc, seedJobs } from './seed.ts'
import { addEvent, mutate, readDoc, type StateDoc } from './store.ts'
import {
  applyPatch,
  createAiDrafts,
  createManualDraft,
  deleteDraft,
  discardEditsWithPhoto,
  draftInputOf,
  findVariation,
  fullAddress,
  historyFor,
  ownerCardFor,
  reply as replyOp,
  revise as reviseOp,
  ruleContextFor,
  sendVariation,
  setPhoto,
  shareFor,
  toJob,
  toVariation,
  updateJob as updateJobOp,
  withdraw as withdrawOp,
} from './variations.ts'

const EVENTS_PAGE = 50

/** The document, creating it if this browser has none (first visit, or storage was wiped). */
async function current(): Promise<StateDoc> {
  return (await readDoc()) ?? (await mutate((doc) => doc, freshDoc)).result
}

const lastEventId = (doc: StateDoc) => doc.events.reduce((max, e) => Math.max(max, e.id), 0)

/** Get or create this browser's workspace. `created` drives the first-open callout. */
export async function session(): Promise<SessionResponse> {
  const existing = await readDoc()
  const { doc, created } = existing
    ? { doc: existing, created: false }
    : await mutate((d) => d, freshDoc).then(({ result, created }) => ({ doc: result, created }))
  return {
    workspace: {
      id: doc.workspace.id,
      builder_name: doc.workspace.builder_name,
      business_name: doc.workspace.business_name,
      ai_down: doc.workspace.ai_down,
    },
    cursor: lastEventId(doc),
    created,
  }
}

export async function jobs(): Promise<JobsResponse> {
  const doc = await current()
  const list = [...doc.jobs].sort((a, b) => a.sort - b.sort)
  return {
    jobs: list.map((job) => {
      const statuses = doc.variations.filter((v) => v.job_id === job.id).map((v) => v.status)
      const approved = doc.variations
        .filter((v) => v.job_id === job.id && v.status === 'approved')
        .reduce((sum, v) => sum + (v.price_cents ?? 0), 0)
      return {
        id: job.id,
        title: job.title,
        client_name: job.client_name,
        client_first_name: job.client_first_name,
        suburb: job.suburb,
        state: job.state,
        total_cents: job.contract_price_cents + approved,
        status_line: jobStatusLine(statuses, job.client_first_name),
        counts: {
          question: statuses.filter((s) => s === 'question').length,
          waiting: statuses.filter((s) => s === 'sent').length,
          draft: statuses.filter((s) => s === 'draft').length,
        },
      }
    }),
  }
}

export async function job(id: string): Promise<JobResponse> {
  const doc = await current()
  const found = doc.jobs.find((j) => j.id === id)
  if (!found) throw notFound('That job')
  const variations: VariationRow[] = doc.variations
    .filter((v) => v.job_id === id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((v) => ({
      id: v.id,
      number: v.number,
      status: v.status,
      title: v.title,
      price_cents: v.price_cents,
      delay_days: v.delay_days,
      requested_by: v.requested_by,
      payment_timing: v.payment_timing,
      updated_at: v.updated_at,
    }))
  return {
    job: toJob(found),
    money: moneySummary(found.contract_price_cents, variations),
    variations,
  }
}

/** What happened after `after`: toasts come from here, never from the poke itself (D9). */
export async function events(after: number): Promise<EventsResponse> {
  const doc = await current()
  const page = doc.events
    .filter((e) => e.id > after)
    .sort((a, b) => a.id - b.id)
    .slice(0, EVENTS_PAGE)
  const feed: FeedEvent[] = page.map((e) => {
    const v = e.variation_id ? doc.variations.find((x) => x.id === e.variation_id) : undefined
    const j = e.job_id ? doc.jobs.find((x) => x.id === e.job_id) : undefined
    return {
      id: e.id,
      type: e.type,
      actor: e.actor,
      at: e.at,
      job_id: e.job_id,
      variation_id: e.variation_id,
      number: v?.number ?? null,
      title: v?.title || null,
      client_first_name: j?.client_first_name ?? null,
    }
  })
  return { events: feed, cursor: feed.length ? feed[feed.length - 1].id : after }
}

/** The three jobs go back to how they started; links to old changes stop working. */
export async function resetDemo(): Promise<{ ok: true }> {
  await mutate(async (doc) => {
    await seedJobs(doc)
    // Logged last, so every open view gets a poke and the feed sees the reset (and skips the
    // reseeded history before it).
    addEvent(doc, { job_id: null, variation_id: null, type: 'reset', actor: 'builder' })
  }, freshDoc)
  // Photos belonged to the changes that are gone.
  await clearStore('photos')
  return { ok: true }
}

/** The "Pretend the AI is down" switch (D21). */
export async function setAiDown(aiDown: boolean): Promise<DemoResponse> {
  await mutate((doc) => {
    doc.workspace.ai_down = aiDown
  }, freshDoc)
  return { ai_down: aiDown }
}

// ---------------------------------------------------------------------------------------
// M2: notes, drafts, review and send
// ---------------------------------------------------------------------------------------

/** Where Sarah's links point: this site, whichever host it's on. */
const origin = () =>
  typeof location === 'undefined' ? 'https://nod-good.vercel.app' : location.origin

const builderOf = (doc: StateDoc) => ({
  name: doc.workspace.builder_name,
  business: doc.workspace.business_name,
  mobile: doc.workspace.builder_mobile,
})

/** The courtesy cap counts in Brisbane days (D15). */
const aiDay = () => todayIn('QLD', new Date())

function countAiCall(doc: StateDoc, day: string): void {
  if (doc.workspace.ai_day !== day) {
    doc.workspace.ai_day = day
    doc.workspace.ai_calls = 0
  }
  doc.workspace.ai_calls = (doc.workspace.ai_calls ?? 0) + 1
}

/**
 * Draft variations from Dan's note (ux-spec.md 3). Saves one draft per change the AI step found
 * and returns them; none means "Nothing to sign here". Pass `signal` to cancel while waiting:
 * the promise then rejects with an AbortError and nothing is saved.
 */
export async function notes(
  jobId: string,
  transcript: string,
  options: { signal?: AbortSignal } = {},
): Promise<NotesResponse> {
  const doc = await current()
  const job = doc.jobs.find((j) => j.id === jobId)
  if (!job) throw notFound('That job')
  const text = transcript.trim()
  if (!text) throw invalid('transcript', 'Say or type what’s changing first.')
  if (text.length > MAX_NOTE_CHARS)
    throw invalid('transcript', 'That note is too long for Nod to read. Split it into two notes.')
  if (doc.workspace.ai_down) throw aiUnavailable('down')
  const day = aiDay()
  if (doc.workspace.ai_day === day && (doc.workspace.ai_calls ?? 0) >= AI_DAILY_LIMIT)
    throw aiUnavailable('limit')

  const body: NotesRequest = {
    transcript: text,
    job: {
      title: job.title,
      client_name: job.client_name,
      client_first_name: job.client_first_name,
      address: fullAddress(job),
      state: job.state,
      contract_price_cents: job.contract_price_cents,
      variations: doc.variations
        .filter((v) => v.job_id === job.id)
        .map((v) => ({ number: v.number, title: v.title, status: v.status })),
    },
  }
  let reply: NotesApiResponse
  try {
    reply = await postNotes(body, options.signal)
  } catch (e) {
    // The function answered (even with an error), so the call counts against today's cap.
    if (isApiError(e) && e.status > 0) await mutate((d) => countAiCall(d, day), freshDoc)
    throw e
  }
  const { result } = await mutate((d) => {
    countAiCall(d, day)
    const drafts = createAiDrafts(d, jobId, text, reply, new Date())
    return {
      drafts: drafts.map((v) => ({ id: v.id, title: v.title })),
      site_note: reply.site_note,
      no_change_reason: reply.no_change_reason,
      prepared: reply.meta.mode === 'fixture',
    }
  }, freshDoc)
  return result
}

/** "Fill it in by hand": an empty draft with the note attached. */
export async function createDraft(
  jobId: string,
  transcript?: string,
): Promise<{ variation: Variation }> {
  const { result } = await mutate(
    (doc) => toVariation(createManualDraft(doc, jobId, transcript ?? null, new Date())),
    freshDoc,
  )
  return { variation: result }
}

/** Everything the Review and Status screens need for one variation. */
export async function variation(id: string): Promise<VariationResponse> {
  const doc = await current()
  const now = new Date()
  const { v, job } = findVariation(doc, id)
  const ctx = ruleContextFor(doc, job, v, now)
  return {
    variation: toVariation(v),
    job: toJob(job),
    builder: builderOf(doc),
    rule_context: ctx,
    checklist: evaluate(draftInputOf(v), ctx, job.client_first_name),
    money: moneySummary(
      job.contract_price_cents,
      doc.variations.filter((x) => x.job_id === job.id),
    ),
    owner_card: ownerCardFor(doc, job, v),
    history: historyFor(doc, v.id),
    share: shareFor(doc, job, v, origin()),
  }
}

/** Autosave: only the fields in the patch change. */
export async function updateVariation(
  id: string,
  patch: VariationPatch,
): Promise<{ variation: Variation }> {
  const { result } = await mutate(
    (doc) => toVariation(applyPatch(doc, id, patch, new Date())),
    freshDoc,
  )
  return { variation: result }
}

/** Drafts only. The screen waits 5 seconds for Undo before calling this (D72). */
export async function deleteVariation(id: string): Promise<void> {
  const { result } = await mutate((doc) => deleteDraft(doc, id), freshDoc)
  if (result.orphan) await deleteValue('photos', result.orphan)
}

/** Sign and send (D22): the rules run again here; 422 `incomplete` names what's missing. */
export async function send(id: string, expectedVersion: number): Promise<SendResponse> {
  const { result } = await mutate(async (doc) => {
    const v = await sendVariation(doc, id, expectedVersion, new Date())
    const { job } = findVariation(doc, id)
    const share = shareFor(doc, job, v, origin())
    if (!share) throw new Error('A sent variation has no link')
    return { variation: toVariation(v), share }
  }, freshDoc)
  return result
}

// ---------------------------------------------------------------------------------------
// M4: after sending, the job sheet and photos
// ---------------------------------------------------------------------------------------

const asVariation = async (op: (doc: StateDoc) => VariationRecordLike) => {
  const { result } = await mutate((doc) => toVariation(op(doc)), freshDoc)
  return { variation: result }
}
type VariationRecordLike = Parameters<typeof toVariation>[0]

/** Dan answers her question (D25). */
export const reply = (id: string, text: string) =>
  asVariation((doc) => replyOp(doc, id, text, new Date()))

/** Her link then says he withdrew it. */
export const withdraw = (id: string) => asVariation((doc) => withdrawOp(doc, id, new Date()))

/** After she said no: a new draft copied from what she was sent (D26). */
export const revise = (id: string) => asVariation((doc) => reviseOp(doc, id, new Date()))

/** Throw away edits made after sending. */
export async function discardEdits(id: string): Promise<{ variation: Variation }> {
  const { result } = await mutate((doc) => discardEditsWithPhoto(doc, id, new Date()), freshDoc)
  if (result.orphan) await deleteValue('photos', result.orphan)
  return { variation: toVariation(result.v) }
}

/** The job sheet: state, contract price, contract date (ux-spec.md 2). */
export async function updateJob(id: string, patch: JobPatch): Promise<{ job: Job }> {
  const { result } = await mutate((doc) => toJob(updateJobOp(doc, id, patch, new Date())), freshDoc)
  return { job: result }
}

const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/** Attach the photo prepared on the phone (D83): a JPEG of 2 MB or less, kept as a Blob. */
export async function putPhoto(id: string, photo: Blob): Promise<{ variation: Variation }> {
  if (photo.type !== 'image/jpeg') {
    throw invalid('photo', 'That file isn’t a photo. Choose a JPEG, PNG or HEIC photo.')
  }
  if (photo.size > PHOTO_MAX_BYTES) {
    throw invalid('photo', 'Nod couldn’t use that photo. Try taking it again.')
  }
  const photoId = crypto.randomUUID()
  await putValue('photos', photoId, photo)
  try {
    const { result } = await mutate((doc) => setPhoto(doc, id, photoId, new Date()), freshDoc)
    if (result.orphan) await deleteValue('photos', result.orphan)
    return { variation: toVariation(result.v) }
  } catch (e) {
    await deleteValue('photos', photoId)
    throw e
  }
}

export async function deletePhoto(id: string): Promise<{ variation: Variation }> {
  const { result } = await mutate((doc) => setPhoto(doc, id, null, new Date()), freshDoc)
  if (result.orphan) await deleteValue('photos', result.orphan)
  return { variation: toVariation(result.v) }
}

/** A photo as a Blob, for an object URL; undefined if it's gone. */
export const photo = (photoId: string) => getValue<Blob>('photos', photoId)
