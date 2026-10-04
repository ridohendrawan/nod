/** State for a link that goes one level down, so the page below can go Back instead of forward
 *  (see BackLink): the browser then restores the scroll and focus returns to the card. */
export const backTo = (path: string) => ({ backTo: path })

/** True when the current page was opened from `path` with `backTo(path)`. */
export const cameFrom = (state: unknown, path: string) =>
  (state as { backTo?: string } | null)?.backTo === path
