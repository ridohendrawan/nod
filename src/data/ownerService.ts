// Sarah's page's data calls (ux-spec.md 7), run against the browser's store under the same lock
// as Dan's. Her page never creates data: in a browser with no Nod data her link isn't for here,
// and she sees "This link isn't working" (D91).
import type { ApproveInput, DeclineInput, OwnerView } from '../../shared/types.ts'
import { getValue } from './db.ts'
import { isApiError, notFound } from './errors.ts'
import {
  approve as approveChange,
  askQuestion,
  decline as declineChange,
  markSeen,
  needsSeen,
  ownerViewOf,
} from './owner.ts'
import { mutate, readDoc, type StateDoc } from './store.ts'

const noData = (): Promise<StateDoc> => Promise.reject(notFound('That link'))
const userAgent = () => (typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent)

/** Everything her page shows. Reading never writes (D70). */
export async function view(token: string): Promise<OwnerView> {
  const doc = await readDoc()
  if (!doc) throw notFound('That link')
  return ownerViewOf(doc, token)
}

/** Call once her page has been visible for about a second: records "opened" once per version. */
export async function seen(token: string, version: number): Promise<void> {
  const doc = await readDoc()
  try {
    if (!doc || !needsSeen(doc, token, version)) return
  } catch (e) {
    if (isApiError(e)) return
    throw e
  }
  await mutate((d) => markSeen(d, token, version, new Date()), noData)
}

/** Approve: 409 `changed` if Dan updated it while she looked, `locked` if it's already answered. */
export async function approve(token: string, input: ApproveInput): Promise<OwnerView> {
  const { result } = await mutate((d) => {
    approveChange(d, token, input, userAgent(), new Date())
    return ownerViewOf(d, token)
  }, noData)
  return result
}

export async function question(token: string, text: string): Promise<OwnerView> {
  const { result } = await mutate((d) => {
    askQuestion(d, token, text, new Date())
    return ownerViewOf(d, token)
  }, noData)
  return result
}

export async function decline(token: string, input: DeclineInput): Promise<OwnerView> {
  const { result } = await mutate((d) => {
    declineChange(d, token, input, new Date())
    return ownerViewOf(d, token)
  }, noData)
  return result
}

/** A photo on her card, as a Blob for an object URL; undefined if it's gone. */
export async function photo(photoId: string): Promise<Blob | undefined> {
  return getValue<Blob>('photos', photoId)
}
