// The one way the screens reach Nod's data. Nod is browser-only (decisions.md D91): these calls
// run against the local store in src/data, with the same names, shapes and errors the server
// API had. The only network call is the AI step inside `notes` (POST /api/notes on Vercel).
import * as service from '../data/service.ts'

export { ApiError, isApiError } from '../data/errors.ts'

export const api = {
  // M1
  session: service.session,
  jobs: service.jobs,
  job: service.job,
  events: service.events,
  resetDemo: service.resetDemo,
  setAiDown: service.setAiDown,
  // M2
  notes: service.notes,
  createDraft: service.createDraft,
  variation: service.variation,
  updateVariation: service.updateVariation,
  deleteVariation: service.deleteVariation,
  send: service.send,
  // M4
  reply: service.reply,
  withdraw: service.withdraw,
  revise: service.revise,
  discardEdits: service.discardEdits,
  updateJob: service.updateJob,
  putPhoto: service.putPhoto,
  deletePhoto: service.deletePhoto,
  photo: service.photo,
}
