// Dan's app on a computer: Nod is made for phones, so a wide screen gets the demo stage, Dan's
// phone and Sarah's side by side (Rido's call, 4 Oct; ux-spec 0.5 and 8). It replaced a single
// phone with Nod's story beside it. This file holds the small pieces both sides need: whether
// this page is the stage or a phone inside it, where Dan's phone starts, and whose clock a drawn
// phone shows.
import { STATE_ZONE } from '../../shared/states.ts'

/** A screen with room for the phones, driven by a mouse or trackpad (or, headless, by nothing).
 *  Touch screens (phones and tablets, in any orientation) get the app itself. */
const ROOM = '(min-width: 720px) and (min-height: 560px)'
export const DESKTOP_QUERY = `${ROOM} and (pointer: fine), ${ROOM} and (pointer: none)`

/** This page is inside a frame: a phone on the demo stage. */
export const inFrame = (): boolean => window.self !== window.top

/** A computer's own window, at any of Dan's addresses: it gets the stage (main.tsx keeps the
 *  preview links, /screens, out of it). */
export const wantsStage = (): boolean => !inFrame() && window.matchMedia(DESKTOP_QUERY).matches

/** Where Dan's phone starts on the stage: the address this computer opened, so a deep link keeps
 *  its screen, or Jobs for /demo. The flag tells Dan's app it's on the stage (onStage). */
export function stageStart(): string {
  const path = /^\/demo(\/|$)/.test(location.pathname) ? '/' : location.pathname
  const query = new URLSearchParams(location.search)
  query.set('stage', 'builder')
  return `${path}?${query.toString()}${location.hash}`
}

const STAGE_FRAME = 'nod-stage-builder'

/** Dan's phone on the demo stage (?stage=builder, ux-spec 8). The flag leaves the address at Dan's
 *  first move, so it's kept in the frame's own name, which survives moves and reloads inside that
 *  phone but belongs to it alone. (sessionStorage is shared by every frame in the tab: once, it let
 *  a phone opened later in the same tab think it was on the stage too.) */
export function onStage(): boolean {
  if (!inFrame()) return false
  if (new URLSearchParams(location.search).get('stage') === 'builder') window.name = STAGE_FRAME
  return window.name === STAGE_FRAME
}

/** Both phones on the demo stage keep Brisbane time, where Sarah's kitchen is (ux-spec 8). */
export const STAGE_TIME_ZONE = STATE_ZONE.QLD

/** The zone of the clock Dan's phone shows: the stage's, or (undefined) the device's own. Dan's
 *  greeting follows it, so it never says "Morning" under a status bar that reads 12:30. */
export const phoneTimeZone = (): string | undefined => (onStage() ? STAGE_TIME_ZONE : undefined)
