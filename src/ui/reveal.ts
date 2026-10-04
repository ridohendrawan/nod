// Focus moved by script without scrolling must still be in sight. Base UI hands focus back that
// way when a sheet closes, and Back's focus does too, so a restored scroll position stays put.
// If the element ends up entirely off screen (a heading at the top while the page sits at its
// end), bring it in the least distance: the page's scroll padding keeps it clear of the floating
// header and the bottom bar. Anything already on screen stays put, so nothing visible jumps, a
// button in a sticky bar included.
export function revealIfOffScreen(el: Element | null): void {
  if (!(el instanceof HTMLElement) || el === document.body) return
  const box = el.getBoundingClientRect()
  if (box.bottom > 0 && box.top < window.innerHeight) return
  el.scrollIntoView({ block: 'nearest' })
}
