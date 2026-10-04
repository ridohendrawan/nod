// The one way Sarah's page reaches Nod's data (ux-spec.md 7). It imports nothing of Dan's
// screens, so her page's bundle stays small (D86).
import * as owner from '../data/ownerService.ts'

export { ApiError, isApiError } from '../data/errors.ts'
export { subscribeLive } from './live.ts'

export const ownerApi = {
  view: owner.view,
  seen: owner.seen,
  approve: owner.approve,
  question: owner.question,
  decline: owner.decline,
  photo: owner.photo,
}
