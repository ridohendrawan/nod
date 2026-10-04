import type { Page } from '@playwright/test'

// Nod is browser-only (D91): each Playwright context starts with an empty IndexedDB, so the
// first page in a context seeds a fresh demo workspace. Pages in one context share it, like tabs.

/** What's on screen, never the screen reader's copy of it. The announcer sits outside #root (in
 *  index.html and o.html) and keeps the last thing it said, often a line that's also on screen, so
 *  a page-wide lookup finds two elements once it speaks, 120 ms later (ai-misses 32 and 40). */
export const onScreen = (page: Page) => page.locator('#root')

/** The kitchen job's card on the Jobs screen (the seed's first job). */
export const kitchenCard = (page: Page) =>
  page.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })

/** True when the page scrolls sideways (WCAG 1.4.10 reflow, D88). */
export const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
