// For the preview links (src/app/preview/screens.ts): wait for a button or link by the name a
// person sees, then press it, the way a tap would. A screen whose state is a sheet (Menu, What
// Sarah sees, Approve) is reached this way, through the real buttons.

// innerText, not textContent: a label and its description in separate elements ("About Nod",
// then its hint) must not run together into one word.
const words = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function text(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText)
      .join(' ')
    if (words(label)) return words(label)
  }
  return words(el.innerText)
}

function find(name: string): HTMLElement | null {
  const all = [
    ...document.querySelectorAll<HTMLElement>('button, a[href], [role="button"]'),
  ].filter((el) => el.getClientRects().length > 0)
  // The exact name first ("Approve", not "Approve change"); then a name that begins with it,
  // for buttons that carry a description under their label ("About Nod").
  return (
    all.find((el) => el.getAttribute('aria-label') === name || text(el) === name) ??
    all.find((el) => text(el).startsWith(`${name} `)) ??
    null
  )
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Until what moves has stopped (a sheet sliding in ignores a press), at most a second. */
async function settle(): Promise<void> {
  const started = Date.now()
  await pause(100)
  while (
    document.getAnimations().some((a) => a.playState === 'running') &&
    Date.now() - started < 1000
  )
    await pause(50)
}

/** Press each named control in turn, waiting up to 8 seconds for each to appear. */
export async function clickByName(names: readonly string[]): Promise<boolean> {
  for (const name of names) {
    const started = Date.now()
    let el = find(name)
    while (!el && Date.now() - started < 8000) {
      await pause(50)
      el = find(name)
    }
    if (!el) return false
    await settle()
    el.click()
  }
  // A sheet puts focus on its heading, and a press by script shows the keyboard's focus ring.
  // A design capture shouldn't carry it.
  await settle()
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  return true
}
